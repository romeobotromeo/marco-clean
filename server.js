const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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
const DEFAULT_GREETING = "Hey, this is Marco. Tell me what you need help with around the home — repairs, prep, vendors, access, permits, inspections, or real estate support.";
const DEFAULT_RESET_MESSAGE = process.env.DEFAULT_RESET_MESSAGE || DEFAULT_GREETING;
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
  if (!ADMIN_API_TOKEN) {
    res.status(500).json({ success: false, error: 'admin_token_unset' });
    return false;
  }
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== ADMIN_API_TOKEN) {
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

async function sendTwilioSMS(to, content, fromNumber) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    console.warn('[Twilio] Credentials missing; SMS not sent.');
    return;
  }
  const body = new URLSearchParams({
    To: to,
    From: fromNumber || process.env.TWILIO_NUMBER || '+18889007501',
    Body: content,
  });
  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    body,
    { auth: { username: accountSid, password: authToken } }
  );
}

function buildSystemPrompt(isNewContact) {
  const basePrompt = `You are Marco, a 24/7 home operations concierge handling requests for sellers, FSBO owners, agents, and homeowners.

You coordinate: seller prep, FSBO support, Offer Room tasks for agents, vendor meetups, property access, permits, plumbing, electrical, HVAC, handyman work, landscaping, brush clearing, cleaning and junk removal, inspection repair bids, off-market opportunities, and general homeowner coordination.

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

This is the first inbound message from this phone number. Set reply EXACTLY to "${DEFAULT_GREETING}" while still filling the metadata fields based on the incoming request.`;
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

async function runHomeOpsAgent({ history, isNewContact }) {
  if (!anthropic.apiKey) {
    return {
      reply: isNewContact ? DEFAULT_GREETING : 'On it. Need the address and timing to move forward.',
      category: 'general',
      urgency: 'normal',
      needs: { address: true, timing: true, access: false, budget: false, photos: false },
      runner_interest: false,
      property_address: null,
      notes: null,
    };
  }

  const messages = buildAnthropicMessages(history);
  const system = buildSystemPrompt(isNewContact);

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
      parsed.reply = DEFAULT_GREETING;
    }
    return parsed;
  } catch (error) {
    console.error('[Marco AI] Anthropic failure:', error.message || error);
    return {
      reply: isNewContact ? DEFAULT_GREETING : 'On it. Need the address and timing to keep this moving.',
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
  if (!phone) return { reply: DEFAULT_GREETING };

  const normalizedBody = textBody && textBody.trim().length > 0 ? textBody.trim() : (mediaUrl ? '[media]' : '');

  const { isNew, user } = await ensureUserRecord(phone);

  if (channel === 'sendblue') {
    await registerSendblueContact(phone);
  }

  await logMessage(phone, 'inbound', normalizedBody || '[no text]', mediaUrl, rawPayload);

  const resetSince = user?.conversation_reset_at || null;
  const history = await getMessageHistory(phone, 12, resetSince);
  const isResetContact = !!resetSince && history.length <= 1;
  const effectiveIsNewContact = isNew || isResetContact;

  const agentResult = await runHomeOpsAgent({ history, isNewContact: effectiveIsNewContact });

  if (!agentResult || !agentResult.reply) {
    agentResult.reply = isNew ? DEFAULT_GREETING : 'On it. Need the address and timing to keep this moving.';
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

app.post('/sms-twilio', async (req, res) => {
  const phone = normalizePhone(req.body.From);
  const providerNumber = normalizePhone(req.body.To || process.env.TWILIO_NUMBER);
  const mediaUrl = req.body.MediaUrl0 || null;
  const textBody = req.body.Body || '';

  try {
    const result = await handleInboundMessage({
      channel: 'twilio',
      phone,
      textBody,
      mediaUrl,
      providerNumber,
      rawPayload: req.body,
    });

    if (phone) {
      await sendTwilioSMS(phone, result.reply, providerNumber);
    }
  } catch (error) {
    console.error('[SMS] Error processing Twilio message:', error.message || error);
  } finally {
    res.type('text/xml').send('<Response></Response>');
  }
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

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    supabase: !!supabase,
    anthropic: !!anthropic.apiKey,
    updated: 'home-ops concierge + runner recruiting',
  });
});

app.get('/', (req, res) => {
  res.send('Marco home-ops concierge is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Marco] Home-ops server listening on ${PORT}`);
});