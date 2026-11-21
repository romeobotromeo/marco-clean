const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
let telegram = null;
try {
  telegram = require('./telegram');
} catch (error) {
  console.warn('[Telegram] Relay disabled:', error.message || error);
  telegram = {
    TELEGRAM_PRIMARY_CHAT_ID: null,
    TELEGRAM_CHIEF_CHAT_ID: null,
    TELEGRAM_WEBHOOK_SECRET: null,
    extractMessage: () => null,
    formatSender: () => null,
    isChatAllowed: () => false,
    isConfigured: () => false,
    sendMessage: async () => {
      throw new Error('telegram_not_configured');
    },
  };
}

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const ALLOWED_ORIGINS = new Set([
  'https://textmarco.com',
  'https://www.textmarco.com',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;
const DEFAULT_GREETING = "Thanks for texting Marco. We just launched and are in beta, so response times may vary, but we're on it. Hours are Mon-Fri 7a-6p. Text URGENT for after-hours support. Send the property address, what's going on, how soon you need help, and any photos.";
const DEFAULT_RESET_MESSAGE = process.env.DEFAULT_RESET_MESSAGE || DEFAULT_GREETING;
const RUNNER_GREETING = "Hey, this is Marco. Interested in runner work? Reply with your city, neighborhood, car access, phone type, and when you're usually available.";
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUNNER_CALENDLY_URL = process.env.RUNNER_CALENDLY_URL || 'https://calendly.com/marco-runner/intro-call';
const RUNNER_SOURCE_TAG = process.env.RUNNER_SOURCE_TAG || 'runner-landing';
const RUNNER_LIST_TAG = process.env.RUNNER_LIST_TAG || 'runner-prospect';

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Marco] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Persistence will fail.');
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

const ROUTE_RATE_LIMIT = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(['/sms', '/sms-twilio'], ROUTE_RATE_LIMIT);

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (raw.startsWith('+')) return raw;
  return `+${digits}`;
}

function fingerprintAddress(input) {
  return crypto.createHash('sha1').update(input.toLowerCase().trim()).digest('hex');
}

function safeTrim(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function parseYesNo(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).toLowerCase();
  if (/(^|\b)(y|yes|yep|yeah|affirmative|absolutely|sure|i do|i have|own)/.test(text)) return true;
  if (/(^|\b)(n|no|nope|nah|negative|don\'t|do not|without)/.test(text)) return false;
  return null;
}

function normalizePhoneOS(value) {
  if (!value) return 'other';
  const text = String(value).toLowerCase();
  if (text.includes('iphone') || text.includes('ios') || text.includes('apple')) return 'iphone';
  if (text.includes('android') || text.includes('pixel') || text.includes('samsung') || text.includes('galaxy')) return 'android';
  return 'other';
}

function mergeArrayTags(existing, incoming) {
  const bag = new Set();
  (Array.isArray(existing) ? existing : []).forEach((tag) => {
    if (tag) bag.add(tag);
  });
  (Array.isArray(incoming) ? incoming : []).forEach((tag) => {
    if (tag) bag.add(tag);
  });
  return Array.from(bag);
}

function extractNeighborhoodTags(text) {
  if (!text) return [];
  return text
    .split(/[\/,|]| and | & |\n|;/gi)
    .map((part) => {
      const cleaned = safeTrim(part);
      return cleaned ? cleaned.toLowerCase() : null;
    })
    .filter(Boolean);
}

function requireAdmin(req, res) {
  const envToken = typeof ADMIN_API_TOKEN === 'string' ? ADMIN_API_TOKEN.trim() : '';
  if (!envToken) {
    res.status(500).json({ success: false, error: 'admin_token_unset' });
    return false;
  }
  // Accept either `Authorization: Bearer <token>` or the bare token, and
  // fall back to `x-admin-token` header for parity with other admin routes.
  const authHeader = (req.get('Authorization') || '').trim();
  let presented = '';
  if (/^bearer\s+/i.test(authHeader)) {
    presented = authHeader.replace(/^bearer\s+/i, '').trim();
  } else if (authHeader) {
    presented = authHeader;
  } else {
    const altHeader = (req.get('x-admin-token') || '').trim();
    if (altHeader) presented = altHeader;
  }
  if (!presented || presented !== envToken) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

async function supabaseQuery(fn, fallback = null) {
  if (!supabase) return fallback;
  const { data, error } = await fn;
  if (error) {
    console.error('[Supabase] Error:', error.message || error);
    return fallback;
  }
  return data ?? fallback;
}

async function ensureUserRecord(phone) {
  if (!supabase) return { isNew: true };
  const existing = await supabaseQuery(
    supabase
      .from('users')
      .select('phone, first_seen_at, role, last_category, conversation_reset_at')
      .eq('phone', phone)
      .maybeSingle(),
    null
  );

  const now = new Date().toISOString();
  await supabaseQuery(
    supabase.from('users').upsert({
      phone,
      first_seen_at: existing?.first_seen_at || now,
      last_active_at: now,
    }, { onConflict: 'phone' })
  );

  return { isNew: !existing, user: existing };
}

async function updateUserProfile(phone, analysis) {
  if (!supabase || !analysis) return;
  const payload = {
    phone,
    last_active_at: new Date().toISOString(),
    last_category: analysis.category || null,
    last_urgency: analysis.urgency || null,
  };
  if (analysis.runner_interest) {
    payload.role = 'runner';
  }
  await supabaseQuery(
    supabase.from('users').upsert(payload, { onConflict: 'phone' })
  );
}

async function logMessage(phone, direction, body, mediaUrl, rawPayload) {
  if (!supabase) return;
  const entry = {
    id: crypto.randomUUID(),
    user_phone: phone,
    direction,
    body,
    media_url: mediaUrl || null,
    raw_payload: rawPayload || null,
    created_at: new Date().toISOString(),
  };
  await supabaseQuery(supabase.from('messages').insert(entry));
}

async function upsertRunnerApplicant(data) {
  if (!supabase) return null;

  const now = new Date().toISOString();

  const payload = {
    id: crypto.randomUUID(),
    name: safeTrim(data.name),
    phone: normalizePhone(data.phone) || safeTrim(data.phone),
    email: safeTrim(data.email)?.toLowerCase(),
    city: safeTrim(data.city),
    neighborhood: safeTrim(data.neighborhood),
    has_car: parseYesNo(data.car_access === 'yes' ? 'yes' : data.car_access === 'no' ? 'no' : data.car_access),
    phone_os: normalizePhoneOS(data.phone_os),
    availability: safeTrim(data.availability),
    intro: safeTrim(data.intro),
    tags: mergeArrayTags(extractNeighborhoodTags(data.neighborhood), [RUNNER_SOURCE_TAG]),
    source: safeTrim(data.source) || RUNNER_SOURCE_TAG,
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from('runner_applicants')
    .select('id, tags, status')
    .eq('phone', payload.phone)
    .maybeSingle();

  const mergedTags = mergeArrayTags(existing?.tags || [], payload.tags);

  const upsertPayload = {
    ...payload,
    id: existing?.id || payload.id,
    tags: mergedTags,
    status: existing?.status || 'applied',
  };

  const { data: applicant, error } = await supabase
    .from('runner_applicants')
    .upsert(upsertPayload, { onConflict: 'phone' })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'runner_applicant_upsert_failed');
  }

  await supabase
    .from('runners')
    .upsert({
      id: crypto.randomUUID(),
      phone: upsertPayload.phone,
      status: 'applicant',
      last_contact_at: now,
      applicant_id: applicant.id,
    }, { onConflict: 'phone' });

  return applicant;
}

async function appendApplicantNote(applicantId, note, meta = {}) {
  if (!supabase || !applicantId || !note) return;
  const payload = {
    id: crypto.randomUUID(),
    applicant_id: applicantId,
    author: meta.author || 'system',
    body: note,
    created_at: new Date().toISOString(),
  };
  await supabase
    .from('runner_applicant_notes')
    .insert(payload);
}

function buildListTags(applicant) {
  const tags = new Set(mergeArrayTags(applicant?.tags || [], [RUNNER_LIST_TAG]));
  if (applicant?.city) tags.add(applicant.city.toLowerCase());
  extractNeighborhoodTags(applicant?.neighborhood).forEach((tag) => tags.add(tag));
  if (applicant?.availability) tags.add(applicant.availability.toLowerCase());
  return Array.from(tags).slice(0, 25);
}

async function upsertSendblueList(applicant) {
  if (!process.env.SENDBLUE_API_KEY || !process.env.SENDBLUE_API_SECRET || !applicant?.phone) return;
  const body = {
    number: applicant.phone,
    first_name: safeTrim(applicant.name) || undefined,
    lists: buildListTags(applicant),
    update_if_exists: true,
  };
  try {
    await axios.post('https://api.sendblue.co/api/v2/contacts', body, {
      headers: {
        'sb-api-key-id': process.env.SENDBLUE_API_KEY,
        'sb-api-secret-key': process.env.SENDBLUE_API_SECRET,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[Sendblue] runner list sync failed:', error.response?.data || error.message);
  }
}

async function scheduleIntroSMS(applicant) {
  if (!process.env.SENDBLUE_API_KEY || !process.env.SENDBLUE_API_SECRET || !applicant?.phone) return;
  const message = `On it. This is Marco Ops. Saw your runner application. What days and times are you usually open for dispatch?`;
  try {
    await sendSendblueSMS(applicant.phone, message);
    await appendApplicantNote(applicant.id, `Auto-qualification SMS sent: "${message}"`, { author: 'marco-auto' });
  } catch (error) {
    console.error('[Sendblue] auto SMS failed:', error.message || error);
  }
}

async function handleRunnerApplication(req, res) {
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'supabase_unavailable' });
  }

  const {
    name,
    phone,
    email,
    city,
    neighborhood,
    car_access,
    phone_os,
    availability,
    intro,
    source,
  } = req.body || {};

  if (!phone || !email || !name || !city || !availability || !intro) {
    return res.status(400).json({ success: false, error: 'missing_required_fields' });
  }

  try {
    const applicant = await upsertRunnerApplicant({
      name,
      phone,
      email,
      city,
      neighborhood,
      car_access,
      phone_os,
      availability,
      intro,
      source,
    });

    await appendApplicantNote(applicant.id, `Application captured via ${source || RUNNER_SOURCE_TAG}. Intro: ${intro}`, { author: 'landing-form' });

    await upsertSendblueList(applicant);
    await scheduleIntroSMS(applicant);

    res.json({
      success: true,
      applicant_id: applicant.id,
      calendly: RUNNER_CALENDLY_URL,
    });
  } catch (error) {
    console.error('[Runner] Application save failed:', error.message || error);
    res.status(500).json({ success: false, error: 'failed_to_save_applicant' });
  }
}

async function getMessageHistory(phone, limit = 12, since = null) {
  if (!supabase) return [];

  let query = supabase
    .from('messages')
    .select('direction, body, media_url, created_at')
    .eq('user_phone', phone)
    .is('archived_at', null);

  if (since) {
    query = query.gte('created_at', since);
  }

  query = query.order('created_at', { ascending: true }).limit(limit);

  return await supabaseQuery(query, []);
}

async function upsertProperty(phone, address) {
  if (!supabase || !address) return null;
  const trimmed = address.trim();
  if (!trimmed) return null;
  const fingerprint = fingerprintAddress(trimmed);
  const now = new Date().toISOString();
  const payload = {
    user_phone: phone,
    address: trimmed,
    address_fingerprint: fingerprint,
    last_seen_at: now,
  };
  const data = await supabaseQuery(
    supabase
      .from('properties')
      .upsert({ ...payload, id: crypto.randomUUID() }, { onConflict: 'address_fingerprint' })
      .select('id')
      .single(),
    null
  );
  return data?.id || null;
}

async function recordRequest(phone, analysis, originalMessage) {
  if (!supabase || !analysis) return;
  const propertyId = analysis.property_address
    ? await upsertProperty(phone, analysis.property_address)
    : null;

  const request = {
    id: crypto.randomUUID(),
    user_phone: phone,
    property_id: propertyId,
    category: analysis.category || 'unclassified',
    urgency: analysis.urgency || 'normal',
    summary: originalMessage?.slice(0, 255) || null,
    notes: analysis.notes || null,
    needs: analysis.needs || null,
    runner_interest: !!analysis.runner_interest,
    property_address: analysis.property_address || null,
    status: 'new',
    created_at: new Date().toISOString(),
  };

  await supabaseQuery(supabase.from('requests').insert(request));
}

async function recordRunnerInterest(phone, analysis) {
  if (!supabase || !analysis?.runner_interest) return;
  const payload = {
    phone,
    status: 'interested',
    last_contact_at: new Date().toISOString(),
  };
  await supabaseQuery(
    supabase.from('runners').upsert({ ...payload, id: crypto.randomUUID() }, { onConflict: 'phone' })
  );
}

async function markCampaignOptOut(phone) {
  if (!supabase || !phone) return;
  const now = new Date().toISOString();
  const richUpdate = await supabase.from('users').upsert({
    phone,
    opt_out: true,
    opt_out_at: now,
    last_active_at: now,
    engagement_status: 'opted_out',
  }, { onConflict: 'phone' });

  if (!richUpdate.error) return;

  await supabaseQuery(
    supabase.from('users').upsert({
      phone,
      last_active_at: now,
      last_category: 'opted_out',
    }, { onConflict: 'phone' })
  );
}

async function markCampaignInterested(phone) {
  if (!supabase || !phone) return;
  const now = new Date().toISOString();
  const richUpdate = await supabase.from('users').upsert({
    phone,
    engagement_status: 'campaign_interested',
    last_campaign: CAMPAIGN_TAG,
    last_active_at: now,
  }, { onConflict: 'phone' });

  if (!richUpdate.error) return;

  await supabaseQuery(
    supabase.from('users').upsert({
      phone,
      last_active_at: now,
      last_category: 'campaign_interested',
      last_urgency: 'normal',
    }, { onConflict: 'phone' })
  );
}

async function clearConversationReset(phone) {
  if (!supabase) return;
  await supabaseQuery(
    supabase.from('users').update({ conversation_reset_at: null }).eq('phone', phone)
  );
}

async function registerSendblueContact(phone) {
  if (!process.env.SENDBLUE_API_KEY || !process.env.SENDBLUE_API_SECRET) return;
  try {
    await axios.post('https://api.sendblue.co/api/v2/contacts', {
      number: phone,
      update_if_exists: true,
    }, {
      headers: {
        'sb-api-key-id': process.env.SENDBLUE_API_KEY,
        'sb-api-secret-key': process.env.SENDBLUE_API_SECRET,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[Sendblue] contact upsert failed:', error.response?.data || error.message);
  }
}

async function sendSendblueSMS(to, content, fromNumber) {
  if (!process.env.SENDBLUE_API_KEY || !process.env.SENDBLUE_API_SECRET) {
    console.warn('[Sendblue] API credentials missing; SMS not sent.');
    return;
  }
  const payload = {
    number: to,
    content,
    from_number: fromNumber || process.env.SENDBLUE_FROM_NUMBER || '+16452063407',
  };
  await axios.post('https://api.sendblue.co/api/send-message', payload, {
    headers: {
      'sb-api-key-id': process.env.SENDBLUE_API_KEY,
      'sb-api-secret-key': process.env.SENDBLUE_API_SECRET,
      'Content-Type': 'application/json',
    },
  });
}

async function sendTwilioSMS(to, content, fromNumber, mediaUrls) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    console.warn('[Twilio] Credentials missing; SMS not sent.');
    return null;
  }
  const body = new URLSearchParams({
    To: to,
    From: fromNumber || process.env.TWILIO_NUMBER || '+18889007501',
    Body: content,
  });
  // Optional MMS: pass mediaUrls as a string or array of public https URLs.
  // Twilio accepts repeated MediaUrl form fields (up to 10).
  if (mediaUrls) {
    const list = Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls];
    list
      .filter((url) => typeof url === 'string' && url.trim().length > 0)
      .slice(0, 10)
      .forEach((url) => body.append('MediaUrl', url.trim()));
  }
  const response = await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    body,
    { auth: { username: accountSid, password: authToken } }
  );
  return response?.data || null;
}

// POST /admin/outbound/twilio-mms
// Auth: Authorization: Bearer <ADMIN_API_TOKEN>
// Body: { to: "+1...", body: "...", mediaUrl?: string|string[], from?: "+1...", dryRun?: true }
// Default: dryRun=true. Set dryRun=false to actually send.
// Sends to ONE recipient only. Batch sending is a separate route to be added later.
app.post('/admin/outbound/twilio-mms', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const rawTo = req.body?.to;
  const messageBody = typeof req.body?.body === 'string' ? req.body.body : '';
  const mediaUrlInput = req.body?.mediaUrl;
  const fromOverride = req.body?.from || null;
  // Default to dry-run unless explicitly set to false.
  const dryRun = req.body?.dryRun === false ? false : true;

  const to = normalizePhone(rawTo);
  if (!to) {
    return res.status(400).json({ success: false, error: 'invalid_to' });
  }
  if (!messageBody.trim()) {
    return res.status(400).json({ success: false, error: 'missing_body' });
  }

  const mediaList = mediaUrlInput
    ? (Array.isArray(mediaUrlInput) ? mediaUrlInput : [mediaUrlInput])
        .filter((url) => typeof url === 'string' && /^https:\/\//i.test(url.trim()))
        .map((url) => url.trim())
    : [];

  const from = fromOverride || process.env.TWILIO_NUMBER || '+18889007501';

  const preview = {
    to,
    from,
    body: messageBody,
    body_length: messageBody.length,
    media_url: mediaList,
    media_count: mediaList.length,
    twilio_credentials_present: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
  };

  if (dryRun) {
    console.log(`[Outbound] DRY-RUN twilio-mms to=${to} from=${from} media=${mediaList.length}`);
    return res.json({ success: true, dryRun: true, preview });
  }

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return res.status(500).json({ success: false, error: 'twilio_credentials_missing', preview });
  }

  try {
    const result = await sendTwilioSMS(to, messageBody, from, mediaList);
    console.log(`[Outbound] LIVE twilio-mms sent to=${to} sid=${result?.sid || 'unknown'}`);
    // Log to messages table for audit. Direction = "outbound".
    try {
      await logMessage(to, 'outbound', messageBody, mediaList[0] || null, {
        provider: 'twilio',
        from,
        media_urls: mediaList,
        twilio_sid: result?.sid || null,
        twilio_status: result?.status || null,
        source: 'admin/outbound/twilio-mms',
      });
    } catch (logErr) {
      console.error('[Outbound] logMessage failed:', logErr.message || logErr);
    }
    return res.json({
      success: true,
      dryRun: false,
      preview,
      twilio: {
        sid: result?.sid || null,
        status: result?.status || null,
        date_created: result?.date_created || null,
      },
    });
  } catch (error) {
    const errBody = error.response?.data || { message: error.message };
    console.error('[Outbound] LIVE twilio-mms failed:', errBody);
    return res.status(502).json({
      success: false,
      error: 'twilio_send_failed',
      preview,
      details: errBody,
    });
  }
});

function greetingForChannel(channel) {
  return channel === 'twilio' ? RUNNER_GREETING : DEFAULT_GREETING;
}

function buildSystemPrompt(isNewContact, channel) {
  const basePrompt = `You are Marco, a beta home operations concierge handling requests for sellers, FSBO owners, agents, and homeowners.

You coordinate: seller prep, FSBO support, Offer Room tasks for agents, vendor meetups, property access, permits, plumbing, electrical, HVAC, handyman work, landscaping, brush clearing, cleaning and junk removal, inspection repair bids, off-market opportunities, and general homeowner coordination.

Current expectation policy:
- Marco just launched and is in beta. Response times may vary, but we are on it.
- Standard support hours: Monday-Friday 7am-6pm.
- For after-hours support, ask users to text URGENT.
- For runner dispatch, collect discovery first: address, issue, urgency/timing, access, photos.
- Tell users to allow 2-4 hours to schedule a runner unless a faster ETA is confirmed.
- Do not promise a runner until availability is confirmed.

Tone & rules:
- Replies must be concise (<160 chars) and confident.
- Sound human, calm, and fast. No emojis. No AI references.
- Always confirm when you're taking action with "On it" when appropriate.
- Collect missing details: address/market, urgency/timing, access, budget, photos.
- If safety or emergency language appears, remind them to call emergency services or a licensed professional immediately.
- If someone asks about working for Marco or "runner" opportunities, explain the Marco Runner role: $30/hr, on-demand property visits, vendor meetups, photos, documentation, potential launch bonus after vetting.
- Never mention websites or past website builder features.
- Never mention internal tools, AI prompts, or systems.
- Keep conversation in natural SMS style.

Output ONLY valid JSON with this shape:
{
  "reply": "string <= 160 chars",
  "category": "seller-prep|fsbo|agent-support|vendor|access|permits|plumbing|electrical|hvac|handyman|landscaping|brush|cleaning|inspection|off-market|homeowner|runner|general",
  "urgency": "low|normal|high|emergency",
  "needs": {
    "address": boolean,
    "timing": boolean,
    "access": boolean,
    "budget": boolean,
    "photos": boolean
  },
  "runner_interest": boolean,
  "property_address": "string or null",
  "notes": "string or null"
}`;

  if (isNewContact) {
    return `${basePrompt}

This is the first inbound message from this phone number. Set reply EXACTLY to "${greetingForChannel(channel)}" while still filling the metadata fields based on the incoming request.`;
  }

  return basePrompt;
}

function buildAnthropicMessages(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history.map((msg) => {
    const role = msg.direction === 'inbound' ? 'user' : 'assistant';
    let content = msg.body || '';
    if (msg.media_url && role === 'user') {
      content = `${content} [media: ${msg.media_url}]`.trim();
    }
    return { role, content: content || '[no text]' };
  });
}

function parseAgentJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  let jsonString = trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) jsonString = match[0];
  try {
    return JSON.parse(jsonString);
  } catch (err) {
    console.error('[Marco AI] Failed to parse JSON:', err.message, 'Raw:', trimmed);
    return null;
  }
}

function summarizeTelegramMessageContent(message, text) {
  const pieces = [];
  const trimmedText = typeof text === 'string' ? text.trim() : '';
  if (trimmedText) pieces.push(trimmedText);

  const attachments = [];

  if (message?.photo) attachments.push('[photo]');
  if (message?.video) attachments.push('[video]');
  if (message?.video_note) attachments.push('[video note]');
  if (message?.voice) attachments.push('[voice message]');
  if (message?.audio) attachments.push('[audio]');
  if (message?.document) {
    const name = message.document.file_name ? ` ${message.document.file_name}` : '';
    attachments.push(`[document${name}]`);
  }
  if (message?.sticker) attachments.push(`[sticker ${message.sticker.emoji || ''}]`.trim());
  if (message?.contact) attachments.push('[contact]');
  if (message?.location) {
    const { latitude, longitude } = message.location;
    const lat = typeof latitude === 'number' ? latitude.toFixed(4) : latitude;
    const lon = typeof longitude === 'number' ? longitude.toFixed(4) : longitude;
    attachments.push(`[location ${lat},${lon}]`);
  }
  if (message?.poll) attachments.push('[poll]');
  if (message?.dice) attachments.push(`[dice ${message.dice.emoji || ''}]`.trim());
  if (message?.venue) attachments.push('[venue]');

  if (!pieces.length && attachments.length) {
    return attachments.join(' ');
  }

  if (attachments.length) {
    pieces.push(attachments.join(' '));
  }

  return pieces.length ? pieces.join('\n') : '[no text]';
}

async function handleTelegramUpdate(update) {
  const parsed = telegram.extractMessage(update);
  if (!parsed) return;

  const { chatId, text, from, message } = parsed;
  if (!chatId) return;
  if (from?.is_bot) return;

  if (!telegram.isChatAllowed(chatId)) {
    console.warn(`[Telegram] Ignoring message from unauthorized chat ${chatId}`);
    return;
  }

  const chatIdStr = String(chatId);
  const normalizedText = typeof text === 'string' ? text.trim() : '';

  if (normalizedText === '/start') {
    let startMessage = 'Connected. Messages you send here will be relayed.';
    if (telegram.TELEGRAM_PRIMARY_CHAT_ID && chatIdStr === telegram.TELEGRAM_PRIMARY_CHAT_ID) {
      startMessage = 'Connected. Anything you type here forwards to your Chief of Staff.';
    } else if (telegram.TELEGRAM_CHIEF_CHAT_ID && chatIdStr === telegram.TELEGRAM_CHIEF_CHAT_ID) {
      startMessage = 'Connected. Messages here forward directly to Romeo.';
    }
    await telegram.sendMessage({ chatId, text: startMessage });
    return;
  }

  if (!telegram.TELEGRAM_PRIMARY_CHAT_ID || !telegram.TELEGRAM_CHIEF_CHAT_ID) {
    console.warn('[Telegram] Missing primary or chief chat ID; cannot relay message.');
    return;
  }

  let targetChatId = null;
  let defaultSourceLabel = null;

  if (chatIdStr === telegram.TELEGRAM_PRIMARY_CHAT_ID) {
    targetChatId = telegram.TELEGRAM_CHIEF_CHAT_ID;
    defaultSourceLabel = 'Romeo';
  } else if (chatIdStr === telegram.TELEGRAM_CHIEF_CHAT_ID) {
    targetChatId = telegram.TELEGRAM_PRIMARY_CHAT_ID;
    defaultSourceLabel = 'Chief of Staff';
  } else {
    targetChatId = telegram.TELEGRAM_PRIMARY_CHAT_ID;
    defaultSourceLabel = telegram.TELEGRAM_PRIMARY_CHAT_ID === chatIdStr ? 'Romeo' : 'Forwarded';
  }

  if (!targetChatId) {
    console.warn(`[Telegram] No target chat mapping for chat ${chatIdStr}`);
    return;
  }

  const body = summarizeTelegramMessageContent(message, text);
  const senderLabel = telegram.formatSender(from) || defaultSourceLabel || 'Unknown';
  const outgoing = `From ${senderLabel}:\n${body}`;

  try {
    await telegram.sendMessage({ chatId: targetChatId, text: outgoing });
  } catch (error) {
    console.error('[Telegram] Failed to forward message:', error.message || error);
  }
}

async function runHomeOpsAgent({ history, isNewContact, channel }) {
  if (!anthropic.apiKey) {
    return {
      reply: isNewContact ? greetingForChannel(channel) : 'On it. Need the address and timing to move forward.',
      category: 'general',
      urgency: 'normal',
      needs: { address: true, timing: true, access: false, budget: false, photos: false },
      runner_interest: false,
      property_address: null,
      notes: null,
    };
  }

  const messages = buildAnthropicMessages(history);
  const system = buildSystemPrompt(isNewContact, channel);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 380,
      temperature: 0.2,
      system,
      messages: messages.length > 0 ? messages : [{ role: 'user', content: 'Hi Marco' }],
    });
    const aiText = response?.content?.[0]?.text;
    const parsed = parseAgentJson(aiText);
    if (parsed?.reply) {
      parsed.reply = parsed.reply.length > 160 ? `${parsed.reply.slice(0, 157)}...` : parsed.reply;
    }
if (isNewContact) {
  parsed.reply = greetingForChannel(channel);
}
    return parsed;
  } catch (error) {
    console.error('[Marco AI] Anthropic failure:', error.message || error);
    return {
      reply: isNewContact ? greetingForChannel(channel) : 'On it. Need the address and timing to keep this moving.',
      category: 'general',
      urgency: 'normal',
      needs: { address: true, timing: true, access: false, budget: false, photos: false },
      runner_interest: false,
      property_address: null,
      notes: null,
    };
  }
}

async function handleInboundMessage({ channel, phone, textBody, mediaUrl, providerNumber, rawPayload }) {
  if (!phone) return { reply: greetingForChannel(channel) };

  const normalizedBody = textBody && textBody.trim().length > 0 ? textBody.trim() : (mediaUrl ? '[media]' : '');

  const { isNew, user } = await ensureUserRecord(phone);

  if (channel === 'sendblue') {
    await registerSendblueContact(phone);
  }

  await logMessage(phone, 'inbound', normalizedBody || '[no text]', mediaUrl, rawPayload);

  if (channel === 'twilio') {
    const isStop = STOP_KEYWORDS.has(normalizedBody.toLowerCase());
    console.log(`[InboundBranch] route=handleInboundMessage channel=twilio phone=${phone} stop=${isStop}`);
    if (isStop) {
      await markCampaignOptOut(phone);
      console.log(`[SMS] STOP received from ${phone}; no runner flow triggered.`);
      return { reply: null, analysis: { category: 'opted_out' }, providerNumber };
    }

    if (!(await hasCurrentCampaignOutbound(phone))) return { reply: null, providerNumber };
    if (!(await claimCampaignAcknowledgment(phone))) return { reply: null, providerNumber };
    await markCampaignInterested(phone);
    await logMessage(phone, 'outbound', CAMPAIGN_ACK_REPLY, null, {
      provider: 'twilio',
      from: providerNumber,
      to: phone,
      campaign: CAMPAIGN_TAG,
      source: 'twilio fallback auto-reply',
    });

    return {
      reply: CAMPAIGN_ACK_REPLY,
      analysis: {
        category: 'campaign_interested',
        urgency: 'normal',
        runner_interest: false,
      },
      providerNumber,
    };
  }

// Add to waitlist
await supabase.from('waitlist').insert({ phone, created_at: new Date().toISOString() });

// Send auto-response
await sendMessage(phone, "Thank you for reaching out. We're currently onboarding runners and you've been added to the waitlist. We'll reach out shortly with the next steps.");

  const resetSince = user?.conversation_reset_at || null;
  const history = await getMessageHistory(phone, 12, resetSince);
  const isResetContact = !!resetSince && history.length <= 1;
  const effectiveIsNewContact = isNew || isResetContact;

  const agentResult = await runHomeOpsAgent({ history, isNewContact: effectiveIsNewContact, channel });

  if (!agentResult || !agentResult.reply) {
    agentResult.reply = isNew ? greetingForChannel(channel) : 'On it. Need the address and timing to keep this moving.';
  }

  await updateUserProfile(phone, agentResult);
  await recordRequest(phone, agentResult, normalizedBody);
  await recordRunnerInterest(phone, agentResult);

  await logMessage(phone, 'outbound', agentResult.reply, null, null);

  if (resetSince) {
    await clearConversationReset(phone);
  }

  return { reply: agentResult.reply, analysis: agentResult, providerNumber };
}

app.post('/sms', async (req, res) => {
  const phone = normalizePhone(req.body.from_number);
  const providerNumber = normalizePhone(req.body.sendblue_number || req.body.to_number || process.env.SENDBLUE_FROM_NUMBER);
  const mediaUrl = req.body.media_url && req.body.media_url.trim() !== '' ? req.body.media_url.trim() : null;
  const textBody = req.body.content || '';

  try {
    const { reply } = await handleInboundMessage({
      channel: 'sendblue',
      phone,
      textBody,
      mediaUrl,
      providerNumber,
      rawPayload: req.body,
    });

    if (phone) {
      await sendSendblueSMS(phone, reply, providerNumber);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[SMS] Error processing Sendblue message:', error.message || error);
    res.status(200).json({ success: false });
  }
});

// Campaign-aware inbound for the Angus open-house campaign.
// Behavior:
// 1. STOP/UNSUBSCRIBE/CANCEL/END/QUIT  -> log inbound, mark users.opt_out=true,
//    do NOT send any auto-reply (Twilio handles the STOP confirmation itself).
// 2. Anything else  -> log inbound, mark users as engaged/campaign_interested,
//    send the owner-approved fixed acknowledgment.
// We deliberately do NOT call upsertRunnerApplicant for this campaign window.
const STOP_KEYWORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'opt out', 'optout']);
const CAMPAIGN_ACK_REPLY = "See you this weekend.";
const CAMPAIGN_TAG = 'campaign:2961-angus-open-house-2026-11';
const claimCampaignAcknowledgment = require('./campaign-ack-gate').createCampaignAckGate({
  supabase, campaign: CAMPAIGN_TAG, reply: CAMPAIGN_ACK_REPLY,
});

// Reply only to people who received this campaign. Old campaigns and runner
// conversations must not trigger a new open-house message. Fail closed.
async function hasCurrentCampaignOutbound(phone) {
  if (!supabase || !phone) return false;
  const user = await supabase.from('users').select('last_category').eq('phone', phone).maybeSingle();
  if (user.error || user.data?.last_category === 'opted_out') return false;
  const result = await supabase.from('messages').select('id')
    .eq('user_phone', phone).eq('direction', 'outbound')
    .eq('raw_payload->>campaign', CAMPAIGN_TAG).limit(1);
  return !result.error && Array.isArray(result.data) && result.data.length > 0;
} 

app.post('/sms-twilio', async (req, res) => {
  const phone = normalizePhone(req.body.From);
  const providerNumber = normalizePhone(req.body.To || process.env.TWILIO_NUMBER);
  const textBody = req.body.Body || '';
  const normalizedBody = textBody.trim();
  const lowerBody = normalizedBody.toLowerCase();
  const isStop = STOP_KEYWORDS.has(lowerBody);

  try {
    console.log(`[InboundBranch] route=/sms-twilio phone=${phone || 'unknown'} stop=${isStop}`);
    // Always log the inbound first, regardless of intent.
    if (phone) {
      try {
        await ensureUserRecord(phone);
        await logMessage(phone, 'inbound', normalizedBody || '[no text]', null, {
          provider: 'twilio',
          from: phone,
          to: providerNumber,
          campaign: CAMPAIGN_TAG,
          is_stop: isStop,
          source: '/sms-twilio',
          raw: req.body,
        });
      } catch (logErr) {
        console.error('[SMS] Inbound log failed:', logErr.message || logErr);
      }
    }

    if (isStop) {
      // Mark contact as opted out in our DB. Twilio enforces the actual block
      // and sends its own confirmation message; we do NOT send anything back.
      try {
        await markCampaignOptOut(phone);
      } catch (optErr) {
        console.error('[SMS] STOP opt-out flag failed:', optErr.message || optErr);
      }
      console.log(`[SMS] STOP received from ${phone}; Twilio will handle confirmation.`);
      return res.type('text/xml').send('<Response></Response>');
    }

    // Only acknowledge recipients of the current campaign.
    if (!(await hasCurrentCampaignOutbound(phone))) return;
    if (!(await claimCampaignAcknowledgment(phone))) return;

    // Non-STOP reply: mark as engaged on the Angus campaign and ack.
    try {
      await markCampaignInterested(phone);
    } catch (engErr) {
      console.error('[SMS] Engagement flag failed:', engErr.message || engErr);
    }

    if (phone) {
      await sendTwilioSMS(phone, CAMPAIGN_ACK_REPLY, providerNumber);
      try {
        await logMessage(phone, 'outbound', CAMPAIGN_ACK_REPLY, null, {
          provider: 'twilio',
          from: providerNumber,
          to: phone,
          campaign: CAMPAIGN_TAG,
          source: '/sms-twilio auto-reply',
        });
      } catch (outLogErr) {
        console.error('[SMS] Outbound ack log failed:', outLogErr.message || outLogErr);
      }
    }
  } catch (error) {
    console.error('[SMS] Error processing Twilio message:', error.message || error);
  } finally {
    if (!res.headersSent) res.type('text/xml').send('<Response></Response>');
  }
});

app.post('/telegram/webhook', async (req, res) => {
  if (!telegram.isConfigured()) {
    return res.json({ ok: false, error: 'telegram_not_configured' });
  }

  if (telegram.TELEGRAM_WEBHOOK_SECRET) {
    const headerToken = req.get('x-telegram-bot-api-secret-token');
    if (headerToken !== telegram.TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  try {
    await handleTelegramUpdate(req.body || {});
  } catch (error) {
    console.error('[Telegram] Update processing failed:', error.message || error);
  }

  res.json({ ok: true });
});

app.post('/offer-room-waitlist', async (req, res) => {
  const { name, email, phone, brokerage, market, source } = req.body || {};
  if (!email || !phone) {
    return res.status(400).json({ success: false, error: 'email_and_phone_required' });
  }
  if (!supabase) {
    console.error('[OfferRoom] Supabase unavailable');
    return res.status(500).json({ success: false, error: 'persistence_unavailable' });
  }

  const normalizedPhone = normalizePhone(phone) || phone.trim();
  const entry = {
    id: crypto.randomUUID(),
    name: name?.trim() || null,
    email: email.trim().toLowerCase(),
    phone: normalizedPhone,
    brokerage: brokerage?.trim() || null,
    market: market?.trim() || null,
    source: (source || 'offer-room-site').trim(),
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('offer_room_waitlist')
    .insert(entry);

  if (error) {
    console.error('[OfferRoom] Failed to store waitlist entry:', error.message);
    return res.status(500).json({ success: false, error: 'failed_to_save' });
  }

  res.json({ success: true });
});

app.post('/runner/apply', handleRunnerApplication);

app.post('/admin/reset/:phone', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'supabase_unavailable' });
  }

  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    return res.status(400).json({ success: false, error: 'invalid_phone' });
  }

  const { clear_history = true } = req.body || {};
  const now = new Date().toISOString();

  const userUpdate = await supabaseQuery(
    supabase
      .from('users')
      .update({
        conversation_reset_at: now,
        last_category: null,
        last_urgency: null,
      })
      .eq('phone', phone)
      .select('phone')
      .maybeSingle(),
    null
  );

  if (!userUpdate) {
    return res.status(404).json({ success: false, error: 'user_not_found' });
  }

  if (clear_history) {
    await supabaseQuery(
      supabase
        .from('messages')
        .update({ archived_at: now })
        .eq('user_phone', phone)
        .is('archived_at', null)
    );

    await supabaseQuery(
      supabase
        .from('requests')
        .update({ archived_at: now })
        .eq('user_phone', phone)
        .is('archived_at', null)
    );
  }

  if (clear_history) {
    try {
      await sendSendblueSMS(phone, DEFAULT_RESET_MESSAGE, null);
    } catch (err) {
      console.error('[Admin] Failed to send reset SMS:', err.message || err);
    }
  }

  console.log(`[Admin] Conversation reset for ${phone} (clear_history=${!!clear_history})`);
  res.json({ success: true, phone, cleared: !!clear_history, reset_message_sent: !!clear_history });
});

require('./campaign-click-tracking').installCampaignClickTracking(app, {
  supabase, requireAdmin, secret: ADMIN_API_TOKEN,
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    supabase: !!supabase,
    anthropic: !!anthropic.apiKey,
    updated: 'home-ops concierge + runner recruiting',
    commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null,
    service: process.env.RENDER_SERVICE_NAME || null,
  });
});

app.get('/', (req, res) => {
  res.send('Marco home-ops concierge is running.');
});

function coreAdmin(req, res, next) {
  if (!requireAdmin(req, res)) return;
  next();
}

const CORE_ENGINE_RESOURCES = {
  signals: {
    table: 'marco_signals',
    order: 'created_at',
    defaults: { status: 'new' },
  },
  'demand-clusters': {
    table: 'demand_clusters',
    order: 'updated_at',
    defaults: { status: 'candidate' },
  },
  'build-queue': {
    table: 'marco_build_queue',
    order: 'updated_at',
    defaults: { status: 'queued', priority: 'normal', approval_required: true, dry_run_status: 'not_started' },
  },
  'outreach-queue': {
    table: 'outreach_queue',
    order: 'updated_at',
    defaults: { status: 'draft', dry_run: true, approval_status: 'pending' },
  },
  'gc-contacts': {
    table: 'gc_contacts',
    order: 'updated_at',
    defaults: { state: 'CA', outreach_status: 'not_queued', sms_opt_out: false, call_opt_out: false },
  },
  'runner-video-interviews': {
    table: 'runner_video_interviews',
    order: 'created_at',
    defaults: { consent_captured: false, reviewer_status: 'not_reviewed' },
  },
  economics: {
    table: 'economics_estimates',
    order: 'created_at',
    defaults: { approval_needed: true },
  },
};

function getCoreResource(name) {
  return CORE_ENGINE_RESOURCES[name] || null;
}

function withCoreDefaults(resource, payload) {
  return {
    ...resource.defaults,
    ...(payload && typeof payload === 'object' ? payload : {}),
  };
}

app.get('/admin/core/:resource', coreAdmin, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'supabase_unavailable' });
  }

  const resource = getCoreResource(req.params.resource);
  if (!resource) {
    return res.status(404).json({ success: false, error: 'unknown_resource' });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 250);
  let query = supabase
    .from(resource.table)
    .select('*')
    .order(resource.order, { ascending: false })
    .limit(limit);

  ['status', 'approval_status', 'audience_type', 'actor_type', 'ask_category', 'category', 'city', 'state'].forEach((field) => {
    if (req.query[field]) {
      query = query.eq(field, req.query[field]);
    }
  });

  const data = await supabaseQuery(query, []);
  return res.json({ success: true, resource: req.params.resource, data });
});

app.post('/admin/core/:resource', coreAdmin, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'supabase_unavailable' });
  }

  const resource = getCoreResource(req.params.resource);
  if (!resource) {
    return res.status(404).json({ success: false, error: 'unknown_resource' });
  }

  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const payload = rows.map((row) => withCoreDefaults(resource, row));

  const { data, error } = await supabase
    .from(resource.table)
    .insert(payload)
    .select('*');

  if (error) {
    console.error('[Core Engine] Insert failed:', error.message || error);
    return res.status(400).json({ success: false, error: error.message || 'insert_failed' });
  }

  return res.status(201).json({ success: true, resource: req.params.resource, data });
});

app.patch('/admin/core/:resource/:id', coreAdmin, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'supabase_unavailable' });
  }

  const resource = getCoreResource(req.params.resource);
  if (!resource) {
    return res.status(404).json({ success: false, error: 'unknown_resource' });
  }

  const payload = {
    ...(req.body && typeof req.body === 'object' ? req.body : {}),
  };
  if (['demand_clusters', 'marco_build_queue', 'outreach_queue', 'gc_contacts'].includes(resource.table)) {
    payload.updated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from(resource.table)
    .update(payload)
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[Core Engine] Update failed:', error.message || error);
    return res.status(400).json({ success: false, error: error.message || 'update_failed' });
  }

  return res.json({ success: true, resource: req.params.resource, data });
});

app.post('/admin/core/outreach-queue/:id/approve', coreAdmin, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'supabase_unavailable' });
  }

  const { data, error } = await supabase
    .from('outreach_queue')
    .update({
      approval_status: 'approved',
      status: 'approved_for_launch',
      dry_run: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[Core Engine] Outreach approval failed:', error.message || error);
    return res.status(400).json({ success: false, error: error.message || 'approval_failed' });
  }

  return res.json({
    success: true,
    data,
    note: 'Approved for launch review only. This endpoint does not send calls, texts, posts, recordings, or spend.',
  });
});

// New Admin Endpoints

// Middleware to check admin token
function checkAdminToken(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_API_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// GET /admin/vendors/search
app.get('/admin/vendors/search', checkAdminToken, async (req, res) => {
  const { category, area, status, limit = 10 } = req.query;
  try {
    const result = await pool.query(
      `SELECT * FROM vendors WHERE 
      ($1::text IS NULL OR $1 = ANY(trade_categories)) AND
      ($2::text IS NULL OR $2 = ANY(service_areas)) AND
      ($3::text IS NULL OR status = $3)
      ORDER BY reliability_score DESC, responsiveness_score DESC
      LIMIT $4`,
      [category, area, status, limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/vendors
app.post('/admin/vendors', checkAdminToken, async (req, res) => {
  const { name, phone, website, categories, service_areas, source } = req.body;
  try {
    await pool.query(
      `INSERT INTO vendors (name, primary_phone, website, trade_categories, service_areas, source_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (primary_phone) DO UPDATE SET
      name = EXCLUDED.name,
      website = EXCLUDED.website,
      trade_categories = EXCLUDED.trade_categories,
      service_areas = EXCLUDED.service_areas,
      source_name = EXCLUDED.source_name`,
      [name, phone, website, categories, service_areas, source]
    );
    res.status(201).json({ message: 'Vendor upserted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/vendors/import
app.post('/admin/vendors/import', checkAdminToken, async (req, res) => {
  const vendors = req.body;
  try {
    const queryText = `INSERT INTO vendors (name, primary_phone, primary_email, website, source_url, source_name, trade_categories, service_areas, license_number, rating, review_count, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (primary_phone) DO UPDATE SET
    name = EXCLUDED.name,
    primary_email = EXCLUDED.primary_email,
    website = EXCLUDED.website,
    source_url = EXCLUDED.source_url,
    source_name = EXCLUDED.source_name,
    trade_categories = EXCLUDED.trade_categories,
    service_areas = EXCLUDED.service_areas,
    license_number = EXCLUDED.license_number,
    rating = EXCLUDED.rating,
    review_count = EXCLUDED.review_count,
    notes = EXCLUDED.notes`;

    const promises = vendors.map(vendor => {
      const values = [
        vendor.name,
        vendor.primary_phone,
        vendor.primary_email,
        vendor.website,
        vendor.source_url,
        vendor.source_name,
        vendor.trade_categories,
        vendor.service_areas,
        vendor.license_number,
        vendor.rating,
        vendor.review_count,
        vendor.notes
      ];
      return pool.query(queryText, values);
    });

    await Promise.all(promises);
    res.status(201).json({ message: 'Vendors imported successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/requests/:id/vendor-candidates
app.get('/admin/requests/:id/vendor-candidates', checkAdminToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT v.* FROM vendor_outreach_queue q
      JOIN vendors v ON q.vendor_id = v.id
      WHERE q.request_id = $1
      ORDER BY q.rank ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/requests/:id/create-vendor-queue
app.post('/admin/requests/:id/create-vendor-queue', checkAdminToken, async (req, res) => {
  const { id } = req.params;
  try {
    // Logic to create vendor outreach queue
    // Placeholder for actual implementation
    res.status(201).json({ message: 'Vendor outreach queue created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/vendor-contact-events
app.post('/admin/vendor-contact-events', checkAdminToken, async (req, res) => {
  const { vendor_id, request_id, channel, direction, status, summary, raw_payload } = req.body;
  try {
    await pool.query(
      `INSERT INTO vendor_contact_events (vendor_id, request_id, channel, direction, status, summary, raw_payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [vendor_id, request_id, channel, direction, status, summary, raw_payload]
    );
    res.status(201).json({ message: 'Contact event logged' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/vendor-outreach-queue
app.get('/admin/vendor-outreach-queue', checkAdminToken, async (req, res) => {
  const { status, category, area } = req.query;
  try {
    const result = await pool.query(
      `SELECT q.*, v.name, v.trade_categories, v.service_areas FROM vendor_outreach_queue q
      JOIN vendors v ON q.vendor_id = v.id
      WHERE ($1::text IS NULL OR q.status = $1) AND
      ($2::text IS NULL OR $2 = ANY(v.trade_categories)) AND
      ($3::text IS NULL OR $3 = ANY(v.service_areas))
      ORDER BY q.created_at DESC`,
      [status, category, area]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/request-summary
app.get('/admin/request-summary', checkAdminToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour') AS last_1h,
        COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h,
        COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS last_7d
      FROM requests`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
