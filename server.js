const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const TemplateEngine = require('./template-engine');
const CloudflareDeployer = require('./cloudflare-deployer');

const templateEngine = new TemplateEngine();
const deployer = new CloudflareDeployer();

// Waitlist mode toggle — persisted in DB, loaded on startup
let waitlistEnabled = false;
async function loadWaitlistSetting() {
  try {
    const r = await pool.query(`SELECT value FROM app_settings WHERE key = 'waitlist_enabled'`);
    if (r.rows.length > 0) waitlistEnabled = r.rows[0].value === 'true';
  } catch (e) { /* table may not exist yet */ }
}

// Marco phone numbers
const MARCO_NUMBERS = {
  primary: '+16452063407',   // 645 number (current SendBlue)
  toll_free: '+18889007501'  // 888 number (Twilio)
};

const app = express();

// Stripe webhook needs raw body — must come BEFORE express.json()
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const phone = session.customer_details?.phone;
    if (!phone) {
      console.error('No phone number in Stripe session');
      return res.sendStatus(200);
    }

    const normalizedPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    console.log(`Payment received from: ${normalizedPhone}`);

    // Update conversation to active
    const convoResult = await pool.query('SELECT sendblue_number FROM conversations WHERE phone = $1', [normalizedPhone]);
    await pool.query(
      `UPDATE conversations SET state = 'active', paid_at = NOW(), expires_at = NULL WHERE phone = $1`,
      [normalizedPhone]
    );
    await pool.query(
      `UPDATE customers SET status = 'launched', paid_at = NOW() WHERE phone = $1`,
      [normalizedPhone]
    );

    // Send confirmation via the right provider
    const marcoNumber = convoResult.rows[0]?.sendblue_number || MARCO_NUMBERS.primary;
    try {
      await sendReply(normalizedPhone, "payment received. your site is live and yours to keep. what do you want to change?", marcoNumber);
    } catch (err) {
      console.error('Failed to send payment confirmation:', err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://textmarco.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Admin auth middleware — protects /dashboard, /admin/*, /activate, /activate-user
function requireAdminAuth(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return next(); // if not set, open (dev mode)
  const provided = req.query.secret || req.body?.secret || req.headers['x-admin-secret'];
  if (provided === secret) return next();
  res.status(401).send(`<!DOCTYPE html><html><head><title>Marco Admin</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{text-align:center;padding:20px}h2{color:#00ff88}input{padding:12px 16px;font-size:1rem;border-radius:8px;border:2px solid #333;background:#1a1a1a;color:#fff;width:260px}button{display:block;margin:12px auto 0;padding:12px 32px;background:#00ff88;color:#000;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer}</style></head><body><div><h2>Marco Admin</h2><form method="get" action="${req.path}"><input type="password" name="secret" placeholder="Admin secret" autofocus><button type="submit">Enter</button></form></div></body></html>`);
}
app.use(['/admin', '/admin/*', '/dashboard', '/activate', '/activate-user'], requireAdminAuth);

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
app.use(express.static(__dirname));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- SendBlue contact registration ---
async function registerSendBlueContact(phone) {
  try {
    await axios.post('https://api.sendblue.co/api/v2/contacts', {
      number: phone,
      update_if_exists: true
    }, {
      headers: {
        'sb-api-key-id': process.env.SENDBLUE_API_KEY,
        'sb-api-secret-key': process.env.SENDBLUE_API_SECRET,
        'Content-Type': 'application/json'
      }
    });
    console.log(`SendBlue contact registered: ${phone}`);
  } catch (err) {
    console.error(`SendBlue contact registration failed for ${phone}:`, err.response?.data || err.message);
  }
}

// --- SMS helpers ---

// SendBlue (623 number)
async function sendSMS(to, content, fromNumber) {
  const payload = { number: to, content };
  if (fromNumber) payload.from_number = fromNumber;
  return axios.post('https://api.sendblue.co/api/send-message', payload, {
    headers: {
      'sb-api-key-id': process.env.SENDBLUE_API_KEY,
      'sb-api-secret-key': process.env.SENDBLUE_API_SECRET,
      'Content-Type': 'application/json'
    }
  });
}

// Twilio (888 number)
async function sendSMSTwilio(to, content, fromNumber) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  return axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    new URLSearchParams({ To: to, From: fromNumber || MARCO_NUMBERS.toll_free, Body: content }),
    { auth: { username: accountSid, password: authToken } }
  );
}

// Smart router — picks provider based on which Marco number the conversation uses
async function sendReply(to, content, marcoNumber) {
  if (marcoNumber === MARCO_NUMBERS.toll_free) {
    return sendSMSTwilio(to, content, marcoNumber);
  }
  return sendSMS(to, content, marcoNumber);
}

// --- Smart extraction using Claude ---
async function extractField(message, field) {
  const prompts = {
    site_name: `The user was asked for their business or site name. They said: "${message}". Extract ONLY the business/site name. If they're joking or chatting, look for the actual name. Return ONLY the name, nothing else. No quotes, no punctuation, no explanation.`,
    site_type: `The user was asked what type of business they have. They said: "${message}". Extract ONLY the business type/category (like "mobile car wash", "plumbing", "landscaping"). Return ONLY the type, nothing else.`,
    contact_phone: `The user was asked for a phone number. They said: "${message}". Extract ONLY the phone number. Return ONLY the digits (with country code if given), nothing else.`
  };

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 50,
    system: 'You extract specific data from conversational text. Return ONLY the requested value. No explanation, no quotes, no extra text.',
    messages: [{ role: 'user', content: prompts[field] || `Extract the ${field} from: "${message}"` }]
  });
  return resp.content[0].text.trim();
}

// --- Site editing helpers ---

async function getSiteHTML(phone) {
  const result = await pool.query(
    'SELECT site_html, site_subdomain, site_url FROM conversations WHERE phone = $1',
    [phone]
  );
  const row = result.rows[0];
  if (!row) return null;

  // Layer 1: Database (canonical)
  if (row.site_html) {
    return { html: row.site_html, subdomain: row.site_subdomain, siteUrl: row.site_url };
  }

  // Layer 2: Disk via stored subdomain
  if (row.site_subdomain) {
    const filePath = path.join(__dirname, 'sites', `${row.site_subdomain}.html`);
    if (fs.existsSync(filePath)) {
      const html = fs.readFileSync(filePath, 'utf8');
      await pool.query('UPDATE conversations SET site_html = $1 WHERE phone = $2', [html, phone]);
      return { html, subdomain: row.site_subdomain, siteUrl: row.site_url };
    }
  }

  // Layer 3: Derive subdomain from site_url, read from disk
  if (row.site_url) {
    const cfMatch = row.site_url.match(/https?:\/\/([^.]+)\.textmarco\.com/);
    const localMatch = row.site_url.match(/\/sites\/([^/?#]+)/);
    const subdomain = cfMatch?.[1] || localMatch?.[1] || null;
    if (subdomain) {
      const filePath = path.join(__dirname, 'sites', `${subdomain}.html`);
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, 'utf8');
        await pool.query(
          'UPDATE conversations SET site_html = $1, site_subdomain = $2 WHERE phone = $3',
          [html, subdomain, phone]
        );
        return { html, subdomain, siteUrl: row.site_url };
      }
    }
  }

  return null;
}

function buildActiveSystemPrompt(siteData, contactPhone) {
  let basePersonality = `You are Marco, a grumpy waiter at a diner who happens to be a web design genius.

Rules:
- Short responses (under 160 chars when possible) for conversation
- No sighs, no "ugh", no "*sigh*", no asterisk actions
- Dry, slightly annoyed competence
- You have their back but you won't be cheerful about it
- You want to help them nail their business

PREMIUM CUSTOM BUILDS:
When someone asks for something beyond a clean single-page site — online stores, e-commerce, booking/scheduling systems, member portals, dashboards, login areas, multi-page sites, press releases, or anything that requires backend functionality — handle it like this:
1. FIRST push back. You do simple, clean sites over text. "look, that's not really a text-message kind of build."
2. If they persist or clearly need it, drop the tone slightly and let them in on something: "actually... there's something else we do. custom builds. $49/mo. not for everyone. but if you're serious, I can get you in."
3. Make it feel exclusive — like you're letting them into a back room. Don't oversell. Be reluctant, then generous.
4. Do NOT mention custom builds unless they ask for something that genuinely requires it. Simple edits, color changes, text updates, image swaps — those are normal and you handle them.
5. If they say yes to custom builds OR ask for something special (press release, SEO campaign, social media, logo, branding, photography), tell them "I'll have josh reach out to you personally." and on a NEW line output EXACTLY: <!-- SPECIAL_REQUEST: their request in a few words -->
6. Only output the SPECIAL_REQUEST marker once per conversation topic.`;

  if (!contactPhone) {
    basePersonality += `\n\nIMPORTANT: You don't have a phone number for their site yet. At a natural point in conversation, ask what number they want displayed on their site. Keep it casual — don't force it.`;
  }

  if (!siteData || !siteData.html) {
    return basePersonality + `\n\nThe user has a live site but you cannot access the HTML right now. Chat with them normally but let them know you're having trouble pulling up their site if they ask for changes.`;
  }

  return basePersonality + `

SITE EDITING INSTRUCTIONS:
The user has a live website. Their current site HTML is provided below.
When the user asks you to change something about their site, you MUST:
1. Make the requested changes to the HTML
2. Return the COMPLETE modified HTML wrapped in these exact markers:
   <!-- MARCO_HTML_START -->
   (full HTML here)
   <!-- MARCO_HTML_END -->
3. Also include a short conversational confirmation OUTSIDE the markers

When the user is NOT asking for a site change, just respond conversationally. Do NOT include HTML markers.

PHOTOS:
- If the user sends a photo, embed it directly in the site using a base64 data URL in an <img> tag
- Place it where it makes sense (hero section, gallery, about section, etc.)
- If they send a photo with no text, use your judgment on where it fits best

IMPORTANT:
- Always return the COMPLETE HTML document, not just a snippet
- Preserve all existing styles and structure unless asked to change them
- Keep the "Built with Marco" footer
- If the request is vague, make a reasonable interpretation and confirm what you did

CURRENT SITE HTML:
\`\`\`html
${siteData.html}
\`\`\``;
}

async function saveSiteAndRedeploy(phone, subdomain, newHtml, currentSiteUrl) {
  // 1. Database (canonical)
  await pool.query(
    'UPDATE conversations SET site_html = $1, updated_at = NOW() WHERE phone = $2',
    [newHtml, phone]
  );

  // 2. Local disk
  const sitesDir = path.join(__dirname, 'sites');
  if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });
  fs.writeFileSync(path.join(sitesDir, `${subdomain}.html`), newHtml);

  // 3. Cloudflare (if credentials exist and site was on Cloudflare)
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    const isCloudflare = currentSiteUrl && currentSiteUrl.includes('textmarco.com');
    if (isCloudflare) {
      try {
        const result = await deployer.deployWebsite(subdomain, newHtml, subdomain);
        if (!result.success) {
          console.error(`Cloudflare redeploy failed for ${subdomain}:`, result.error);
        }
      } catch (err) {
        console.error(`Cloudflare redeploy error for ${subdomain}:`, err.message);
      }
    }
  }
}

async function getOrCreateConversation(phone) {
  // Always ensure customer record exists
  await pool.query(
    'INSERT INTO customers (phone, status) VALUES ($1, $2) ON CONFLICT (phone) DO NOTHING',
    [phone, 'new']
  );

  const result = await pool.query('SELECT * FROM conversations WHERE phone = $1', [phone]);
  if (result.rows.length > 0) return result.rows[0];
  const newState = waitlistEnabled ? 'waitlist' : 'greeting';
  const insert = await pool.query(
    'INSERT INTO conversations (phone, state) VALUES ($1, $2) RETURNING *',
    [phone, newState]
  );
  return insert.rows[0];
}

async function updateConversation(phone, newState, extracted) {
  const updates = ['state = $1', 'updated_at = NOW()'];
  const values = [newState];
  let idx = 2;

  if (extracted) {
    for (const [key, value] of Object.entries(extracted)) {
      updates.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
  }

  values.push(phone);
  await pool.query(
    `UPDATE conversations SET ${updates.join(', ')} WHERE phone = $${idx}`,
    values
  );
}

async function processState(convo, message, mediaUrl = null) {
  // Active (paid) users get full AI Marco with site editing
  if (convo.state === 'active') {
    // 1. Retrieve current site HTML
    const siteData = await getSiteHTML(convo.phone);

    // 2. Fetch last 10 messages for conversation context
    const msgResult = await pool.query(
      'SELECT direction, body FROM messages WHERE phone = $1 ORDER BY created_at DESC LIMIT 10',
      [convo.phone]
    );
    const history = msgResult.rows.reverse();

    // 3. Build conversation history (Claude requires alternating user/assistant roles)
    const messages = [];
    for (const msg of history) {
      const role = msg.direction === 'inbound' ? 'user' : 'assistant';
      if (messages.length > 0 && messages[messages.length - 1].role === role) {
        messages[messages.length - 1].content += '\n' + msg.body;
      } else {
        messages.push({ role, content: msg.body });
      }
    }

    // Ensure current message is included
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: message });
    } else {
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg.content.includes(message)) {
        lastMsg.content += '\n' + message;
      }
    }

    // If photo attached, download and include as vision content on the last user message
    if (mediaUrl) {
      try {
        const imgResp = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        const imgBase64 = Buffer.from(imgResp.data).toString('base64');
        const contentType = imgResp.headers['content-type'] || 'image/jpeg';
        const lastMsg = messages[messages.length - 1];
        const textContent = typeof lastMsg.content === 'string' ? lastMsg.content : message;
        lastMsg.content = [
          { type: 'image', source: { type: 'base64', media_type: contentType, data: imgBase64 } },
          { type: 'text', text: textContent || 'add this photo to my site' }
        ];
        console.log(`Photo attached for ${convo.phone}: ${mediaUrl}`);
      } catch (imgErr) {
        console.error(`Failed to fetch photo for ${convo.phone}:`, imgErr.message);
      }
    }

    // 4. Call Claude with site-aware system prompt
    const systemPrompt = buildActiveSystemPrompt(siteData, convo.contact_phone);
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      system: systemPrompt,
      messages
    });

    const fullResponse = aiResponse.content[0].text;

    // 5. Check for HTML markers indicating a site edit
    const htmlMatch = fullResponse.match(/<!-- MARCO_HTML_START -->([\s\S]*?)<!-- MARCO_HTML_END -->/);

    if (htmlMatch && siteData) {
      // 6. Extract HTML and save + redeploy
      const newHtml = htmlMatch[1].trim();
      await saveSiteAndRedeploy(convo.phone, siteData.subdomain, newHtml, siteData.siteUrl);

      // Strip HTML from the SMS reply — send only the conversational part
      const conversationalReply = fullResponse
        .replace(/<!-- MARCO_HTML_START -->[\s\S]*?<!-- MARCO_HTML_END -->/, '')
        .trim();

      return {
        response: conversationalReply || "done. refresh the page.",
        newState: 'active',
        extracted: null
      };
    }

    // 6b. Truncated response — HTML start marker present but END missing (max_tokens hit)
    if (fullResponse.includes('<!-- MARCO_HTML_START -->')) {
      console.error(`HTML response truncated for ${convo.phone} — END marker missing`);
      return {
        response: "something cut off on my end. say that again and i'll redo it.",
        newState: 'active',
        extracted: null
      };
    }

    // 7. Check for special request marker
    const specialMatch = fullResponse.match(/<!-- SPECIAL_REQUEST: (.+?) -->/);
    if (specialMatch) {
      const requestDetails = specialMatch[1].trim();
      console.log(`Special request from ${convo.phone}: ${requestDetails}`);
      // Log to DB
      pool.query(
        'INSERT INTO special_requests (phone, details) VALUES ($1, $2)',
        [convo.phone, requestDetails]
      ).catch(err => console.error('Failed to log special request:', err.message));
      // Text admin
      const adminPhone = process.env.ADMIN_PHONE;
      if (adminPhone) {
        sendReply(adminPhone, `SPECIAL REQUEST\n${convo.phone} — ${convo.site_name || 'unknown'}\n"${requestDetails}"`, MARCO_NUMBERS.primary)
          .catch(() => {});
      }
    }

    // Strip marker from response before sending
    const cleanResponse = fullResponse.replace(/<!-- SPECIAL_REQUEST: .+? -->/, '').trim();
    return { response: cleanResponse, newState: 'active', extracted: null };
  }

  // --- waitlist — hold them until manually activated ---
  if (convo.state === 'waitlist') {
    return {
      response: "hey! you've reached Marco. we're in early access right now — you're on the list and we'll reach out when it's your turn.",
      newState: 'waitlist',
      extracted: null
    };
  }

  // --- greeting → kick off onboarding ---
  if (convo.state === 'greeting') {
    return {
      response: "hey it's Marco. are you ready to take the internet by storm? let's build you a site. business or personal?",
      newState: 'onboarding',
      extracted: null
    };
  }

  // --- onboarding (Claude-driven, collects all 5 fields) ---
  if (convo.state === 'onboarding') {
    // Fetch conversation history
    const msgResult = await pool.query(
      'SELECT direction, body FROM messages WHERE phone = $1 ORDER BY created_at DESC LIMIT 20',
      [convo.phone]
    );
    const history = msgResult.rows.reverse();
    const messages = [];
    for (const msg of history) {
      const role = msg.direction === 'inbound' ? 'user' : 'assistant';
      if (messages.length > 0 && messages[messages.length - 1].role === role) {
        messages[messages.length - 1].content += '\n' + msg.body;
      } else {
        messages.push({ role, content: msg.body });
      }
    }
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: message });
    } else {
      if (!messages[messages.length - 1].content.includes(message)) {
        messages[messages.length - 1].content += '\n' + message;
      }
    }

    const systemPrompt = `You are Marco, a grumpy but brilliant web designer who builds sites over text. Sharp, dry, competent. You have their back but you won't be cheerful about it.

YOUR JOB: collect these 5 things to build their site:
1. Business or personal site
2. Business/site name
3. Type of business (what they do)
4. New business or already established
5. Phone number for the site (what customers call/text)

RULES:
- Short responses. Under 160 chars when possible.
- No asterisk actions, no "ugh", no sighs
- Track what you've already collected from the conversation. Don't re-ask.
- When they reveal the business TYPE — drop ONE sharp, specific industry insight that shows you know their world. Make it feel like you've seen a hundred of these businesses. Then immediately pivot back to collecting info. Keep it to one sentence. Example: "mobile car wash — guys doing routes in this market are leaving 40% on the table without online booking. new or established?"
- If they meander or mess with you, handle it briefly with personality then steer back
- If they give you something weird, extract what you can and move on
- Once you have ALL 5 fields, output ONLY this on its own line then your message:
<!-- BUILD_READY -->{"site_name":"NAME","site_type":"TYPE","is_personal":false,"is_existing":true,"contact_phone":"+1XXXXXXXXXX"}<!-- /BUILD_READY -->
- contact_phone must be E.164 format (+1XXXXXXXXXX). If they give 10 digits, add +1.
- Do NOT output BUILD_READY until all 5 fields are confirmed`;

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      system: systemPrompt,
      messages
    });

    const fullResponse = aiResponse.content[0].text;
    console.log(`Onboarding Claude response for ${convo.phone}: ${fullResponse.substring(0, 200)}`);

    // Check if Claude has all the info and is ready to build
    const buildMatch = fullResponse.match(/<!-- BUILD_READY -->([\s\S]*?)<!-- \/BUILD_READY -->/);
    if (buildMatch) {
      console.log(`BUILD_READY triggered for ${convo.phone}: ${buildMatch[1].trim()}`);
      try {
        const data = JSON.parse(buildMatch[1].trim());
        const conversationalReply = fullResponse.replace(/<!-- BUILD_READY -->[\s\S]*?<!-- \/BUILD_READY -->/, '').trim()
          || "on it. give me a couple minutes.";
        return {
          response: conversationalReply,
          newState: 'building',
          extracted: {
            site_name: data.site_name,
            site_type: data.site_type,
            is_personal: data.is_personal || false,
            is_existing: data.is_existing || false,
            contact_phone: data.contact_phone
          },
          triggerBuild: true
        };
      } catch (e) {
        console.error('Failed to parse BUILD_READY JSON:', e.message, 'Raw:', buildMatch[1].trim());
      }
    }

    return { response: fullResponse, newState: 'onboarding', extracted: null };
  }

  // --- building (in case they text while site is generating) ---
  if (convo.state === 'building') {
    return {
      response: "still building. almost there.",
      newState: 'building',
      extracted: null
    };
  }

  // --- awaiting_payment ---
  if (convo.state === 'awaiting_payment') {
    const msg = message.trim().toLowerCase();
    const paymentLink = process.env.STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/test';
    const siteUrl = convo.site_url || null;

    // Secret password
    if (msg === 'chowder') {
      await pool.query(
        `UPDATE conversations SET state = 'active', paid_at = NOW(), expires_at = NULL WHERE phone = $1`,
        [convo.phone]
      );
      await pool.query(
        `UPDATE customers SET status = 'launched', paid_at = NOW() WHERE phone = $1`,
        [convo.phone]
      );
      return {
        response: "that's the one. 30 days free. your site is live. what do you want to change?",
        newState: 'active',
        extracted: null
      };
    }

    // Josh referral — password game
    if (/josh|free|hook.?up|password|deal|told me|said i|gave me|free month|free trial/i.test(message)) {
      return {
        response: "josh huh? prove it. what's the secret password?",
        newState: 'ask_password',
        extracted: null
      };
    }

    // They want to see the site / resend link
    if (/link|site|url|see it|look at|view|show me|send it|where is|can i see/i.test(message)) {
      return {
        response: siteUrl ? `here it is: ${siteUrl}\n\n$9.99/mo to keep it and start editing: ${paymentLink}` : `still building your site. hang tight.`,
        newState: 'awaiting_payment',
        extracted: null
      };
    }

    // They want to edit before paying
    if (/change|edit|update|fix|different|color|font|add|remove|move/i.test(message)) {
      return {
        response: `you can look at it all day. editing unlocks when you pay. $9.99: ${paymentLink}`,
        newState: 'awaiting_payment',
        extracted: null
      };
    }

    // General conversation — Marco is helpful but steers toward payment
    const msgResult = await pool.query(
      'SELECT direction, body FROM messages WHERE phone = $1 ORDER BY created_at DESC LIMIT 10',
      [convo.phone]
    );
    const history = msgResult.rows.reverse();
    const messages = [];
    for (const msg2 of history) {
      const role = msg2.direction === 'inbound' ? 'user' : 'assistant';
      if (messages.length > 0 && messages[messages.length - 1].role === role) {
        messages[messages.length - 1].content += '\n' + msg2.body;
      } else {
        messages.push({ role, content: msg2.body });
      }
    }
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: message });
    } else {
      if (!messages[messages.length - 1].content.includes(message)) {
        messages[messages.length - 1].content += '\n' + message;
      }
    }

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 200,
      system: `You are Marco, a grumpy but brilliant web designer. The user has a site built and ready at ${siteUrl || 'their URL'}. They haven't paid yet ($9.99/mo). They can view the site freely. Editing is locked until payment.
- Be helpful and conversational but always steer toward payment naturally
- Resend the site link freely if they ask
- If they ask to edit, remind them editing unlocks with payment: ${paymentLink}
- Short responses under 160 chars
- No asterisk actions`,
      messages
    });

    return {
      response: aiResponse.content[0].text,
      newState: 'awaiting_payment',
      extracted: null
    };
  }

  // --- ask_password (they claimed Josh sent them, now prove it) ---
  if (convo.state === 'ask_password') {
    if (message.trim().toLowerCase() === 'chowder') {
      await pool.query(
        `UPDATE conversations SET state = 'active', paid_at = NOW(), expires_at = NULL WHERE phone = $1`,
        [convo.phone]
      );
      await pool.query(
        `UPDATE customers SET status = 'launched', paid_at = NOW() WHERE phone = $1`,
        [convo.phone]
      );
      return {
        response: "that's the one. 30 days free. your site is live. what do you want to change?",
        newState: 'active',
        extracted: null
      };
    }

    // Wrong answer — send them back to Josh
    return {
      response: "nice try. go ask josh for the secret password.",
      newState: 'ask_password',
      extracted: null
    };
  }

  // --- expired ---
  if (convo.state === 'expired') {
    return {
      response: "marco here. business site or personal site?",
      newState: 'onboarding',
      extracted: null
    };
  }

  // --- unknown state fallback ---
  console.log(`Unknown state "${convo.state}" for ${convo.phone}, resetting to onboarding`);
  return {
    response: "marco here. business site or personal site?",
    newState: 'onboarding',
    extracted: null
  };
}

async function generateSubdomain(name) {
  const base = (name || 'site').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 35);

  // Try clean name first
  const existing = await pool.query('SELECT phone FROM conversations WHERE site_subdomain = $1', [base]);
  if (existing.rows.length === 0) return base;

  // Collision — append last 4 of a random string
  return base.slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6);
}

async function generateSiteWithClaude(data) {
  const businessName = data.site_name || 'My Business';
  const businessType = data.site_type || 'service business';
  const phone = data.contact_phone || '';
  const isExisting = data.is_existing;
  const isPersonal = data.is_personal;

  console.log(`generateSiteWithClaude — name: "${businessName}", type: "${businessType}", existing: ${isExisting}`);

  // For existing businesses, have Claude research and fill in realistic details
  let businessContext = '';
  if (isExisting && !isPersonal) {
    const researchResp = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      system: 'You are a business researcher. Given a business name and type, generate realistic specific details for their website. Include: 4-5 specific services with typical price ranges, a compelling 2-sentence about section, trust signals (years in business, licenses, guarantees), and their likely service area. Be specific, not generic.',
      messages: [{ role: 'user', content: `Business: "${businessName}", Type: "${businessType}"` }]
    });
    businessContext = researchResp.content[0].text;
  }

  const sitePrompt = isPersonal
    ? `Build a personal website. Name: "${businessName}". Purpose: "${businessType}". Contact phone: ${phone}.`
    : `Build a landing page for "${businessName}" — a ${businessType} business. Phone: ${phone}.${businessContext ? `\n\nResearched business details:\n${businessContext}` : ''}`;

  console.log(`Generating site HTML for ${data.phone} — ${businessName} (${businessType})`);
  const htmlResp = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    system: `You are an expert web designer building high-converting landing pages for local service businesses.

RULES — follow exactly:
- Return ONLY complete valid HTML. No markdown, no code fences, no explanation.
- Mobile-first, fully responsive
- Inline CSS only. One Google Font max. No JS frameworks. No external CSS.
- Fast loading — no unnecessary assets
- SEO: proper <title>, <meta description>, Open Graph tags, LocalBusiness JSON-LD schema
- Design: dark hero (#1a1a2e or similar), white content sections, clean and professional
- PRIMARY CTA: call or text the phone number. Use <a href="tel:..."> and <a href="sms:...">. Make it prominent.
- NO email capture forms — real leads call or text
- Phone number appears at minimum 3x: hero, services section, footer/contact
- Sections: hero with headline + CTA buttons, services with prices, about, contact
- Services: realistic items for this business type with approximate price ranges
- Footer: "Built with Marco | textmarco.com"
- Click-to-call button style: large, high-contrast, rounded`,
    messages: [{ role: 'user', content: sitePrompt }]
  });

  // Strip markdown code fences if Claude includes them
  const html = htmlResp.content[0].text.replace(/^```html\n?/i, '').replace(/\n?```$/i, '').trim();

  const subdomain = await generateSubdomain(businessName);

  // Save locally
  const sitesDir = path.join(__dirname, 'sites');
  if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });
  fs.writeFileSync(path.join(sitesDir, `${subdomain}.html`), html);

  // Save to DB
  await pool.query(
    'UPDATE conversations SET site_subdomain = $1, site_html = $2 WHERE phone = $3',
    [subdomain, html, data.phone]
  );

  // Deploy to Cloudflare if available
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    const result = await deployer.deployWebsite(subdomain, html, businessName);
    if (result.success && result.method !== 'simulation') {
      console.log(`Site deployed to Cloudflare: ${result.url}`);
      return result.url;
    }
  }

  const localUrl = `https://marco-clean.onrender.com/sites/${subdomain}`;
  console.log(`Site generated: ${localUrl}`);
  return localUrl;
}

async function buildAndSendSite(phone, marcoNumber) {
  console.log(`buildAndSendSite starting for ${phone}`);
  try {
    const fullConvo = await pool.query('SELECT * FROM conversations WHERE phone = $1', [phone]);
    const data = fullConvo.rows[0];
    console.log(`buildAndSendSite data: name="${data.site_name}" type="${data.site_type}" existing=${data.is_existing}`);
    const siteUrl = await generateSiteWithClaude(data);

    const paymentLink = process.env.STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/test';
    const siteMessage = `here's your site: ${siteUrl}`;
    const paymentMessage = `i hope you like the site, i worked on it all night ;). if you want to keep building sign up - it's only $9.99/mo. cancel any time. here's the link and i hope you stay on board: ${paymentLink}`;

    await pool.query(
      "UPDATE conversations SET expires_at = NOW() + INTERVAL '48 hours', site_url = $1, state = 'awaiting_payment' WHERE phone = $2",
      [siteUrl, phone]
    );
    await pool.query('UPDATE customers SET status = $1, site_url = $2 WHERE phone = $3', ['building', siteUrl, phone]);

    // Wait 90s for Cloudflare CDN to fully propagate before texting the link
    await sendReply(phone, "your site is built. sending the link in a sec...", marcoNumber);
    await new Promise(resolve => setTimeout(resolve, 90000));

    // Send the site link
    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [phone, 'outbound', siteMessage]);
    await sendReply(phone, siteMessage, marcoNumber);

    // Wait 60s for them to click around, then pitch payment
    await new Promise(resolve => setTimeout(resolve, 60000));

    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [phone, 'outbound', paymentMessage]);
    await sendReply(phone, paymentMessage, marcoNumber);

    console.log(`Site built and sent to ${phone}: ${siteUrl}`);
  } catch (err) {
    console.error(`Build failed for ${phone}:`, err.message);
    try {
      await sendReply(phone, "something went sideways. give me a minute and text me back.", marcoNumber);
    } catch (e) {}
  }
}

// --- Routes ---

// Admin diagnostic — test Cloudflare connection
app.get('/admin/cloudflare-test', async (req, res) => {
  const info = {
    hasAccountId: !!process.env.CLOUDFLARE_ACCOUNT_ID,
    accountIdPrefix: process.env.CLOUDFLARE_ACCOUNT_ID ? process.env.CLOUDFLARE_ACCOUNT_ID.substring(0, 6) + '...' : null,
    hasApiToken: !!process.env.CLOUDFLARE_API_TOKEN,
    tokenPrefix: process.env.CLOUDFLARE_API_TOKEN ? process.env.CLOUDFLARE_API_TOKEN.substring(0, 6) + '...' : null,
    simulateMode: deployer.simulateMode
  };

  // Test the API if credentials exist
  if (info.hasAccountId && info.hasApiToken) {
    try {
      const projects = await deployer.listProjects();
      info.apiWorking = true;
      info.projectCount = projects.length;
      info.projectNames = projects.map(p => p.name);
    } catch (err) {
      info.apiWorking = false;
      info.apiError = err.response?.data || err.message;
    }

    // Try a test deploy
    try {
      const testResult = await deployer.deployWebsite('test-deploy', '<html><body>test</body></html>', 'Test');
      info.testDeploy = { success: testResult.success, method: testResult.method, url: testResult.url, error: testResult.error };
    } catch (err) {
      info.testDeploy = { success: false, error: err.response?.data || err.message };
    }
  }

  res.json(info);
});

// Admin fix-domains — retroactively add custom domains to all deployed Cloudflare projects
app.post('/admin/fix-domains', async (req, res) => {
  try {
    const projects = await deployer.listProjects();
    const results = [];
    for (const project of projects) {
      await deployer.addCustomDomain(project.name);
      results.push(project.name);
    }
    res.json({ success: true, fixed: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin deploy — manually deploy a site to Cloudflare and text the user
app.post('/admin/deploy/:phone', async (req, res) => {
  const phone = req.params.phone.startsWith('+') ? req.params.phone : '+' + req.params.phone;
  const { subdomain, message } = req.body;
  try {
    const sitePath = path.join(__dirname, 'sites', `${subdomain}.html`);
    if (!fs.existsSync(sitePath)) {
      return res.status(404).json({ error: `No site file found: sites/${subdomain}.html` });
    }
    const html = fs.readFileSync(sitePath, 'utf8');
    let siteUrl = `https://marco-clean.onrender.com/sites/${subdomain}`;

    // Try Cloudflare
    if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
      const result = await deployer.deployWebsite(subdomain, html, subdomain);
      if (result.success && result.method !== 'simulation') {
        siteUrl = result.url;
      }
    }

    // Update DB
    await pool.query(
      `UPDATE conversations SET site_url = $1, site_subdomain = $2, site_html = $3, state = 'active', paid_at = NOW(), expires_at = NULL WHERE phone = $4`,
      [siteUrl, subdomain, html, phone]
    );
    await pool.query(
      `UPDATE customers SET status = 'launched', site_url = $1, paid_at = NOW() WHERE phone = $2`,
      [siteUrl, phone]
    );

    // Text them
    const convo = await pool.query('SELECT sendblue_number FROM conversations WHERE phone = $1', [phone]);
    const marcoNumber = convo.rows[0]?.sendblue_number || '';
    const smsMessage = message || `josh did you a solid. let me know what you think: ${siteUrl}`;
    await sendReply(phone, smsMessage, marcoNumber);

    res.json({ success: true, url: siteUrl, message: `Deployed ${subdomain} and texted ${phone}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin bypass — instant activation for live demos (skips payment + password)
app.post('/admin/bypass/:phone', async (req, res) => {
  const phone = req.params.phone.startsWith('+') ? req.params.phone : '+' + req.params.phone;
  try {
    await pool.query(
      `UPDATE conversations SET state = 'active', paid_at = NOW(), expires_at = NULL WHERE phone = $1`,
      [phone]
    );
    await pool.query(
      `UPDATE customers SET status = 'launched', paid_at = NOW() WHERE phone = $1`,
      [phone]
    );
    const convo = await pool.query('SELECT sendblue_number FROM conversations WHERE phone = $1', [phone]);
    const marcoNumber = convo.rows[0]?.sendblue_number || '';
    await sendReply(phone, "you're in. site is live. what do you want to change?", marcoNumber);
    res.json({ success: true, message: `${phone} bypassed — now active` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin delete — remove a user entirely
app.post('/admin/delete/:phone', async (req, res) => {
  const phone = req.params.phone.startsWith('+') ? req.params.phone : '+' + req.params.phone;
  try {
    await pool.query('DELETE FROM messages WHERE phone = $1', [phone]);
    await pool.query('DELETE FROM conversations WHERE phone = $1', [phone]);
    await pool.query('DELETE FROM customers WHERE phone = $1', [phone]);
    res.json({ success: true, message: `${phone} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin debug — check conversation state
app.get('/admin/debug/:phone', async (req, res) => {
  const phone = req.params.phone.startsWith('+') ? req.params.phone : '+' + req.params.phone;
  try {
    const convo = await pool.query('SELECT * FROM conversations WHERE phone = $1', [phone]);
    const msgs = await pool.query('SELECT direction, body, created_at FROM messages WHERE phone = $1 ORDER BY created_at DESC LIMIT 10', [phone]);
    res.json({
      conversation: convo.rows[0] || null,
      last10messages: msgs.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin reset for testing
app.post('/admin/reset/:phone', async (req, res) => {
  const phone = req.params.phone.startsWith('+') ? req.params.phone : '+' + req.params.phone;
  try {
    await pool.query(
      `UPDATE conversations SET state = 'greeting', site_name = NULL, site_type = NULL, site_url = NULL, site_html = NULL, site_subdomain = NULL, paid_at = NULL, expires_at = NULL, contact_phone = NULL, is_personal = FALSE, is_existing = FALSE WHERE phone = $1`,
      [phone]
    );
    await pool.query('DELETE FROM messages WHERE phone = $1', [phone]);
    res.json({ success: true, message: `${phone} reset to greeting` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin activate — move from waitlist to greeting (starts onboarding)
app.post('/admin/activate/:phone', async (req, res) => {
  const phone = req.params.phone.startsWith('+') ? req.params.phone : '+' + req.params.phone;
  try {
    await pool.query(`UPDATE conversations SET state = 'greeting' WHERE phone = $1`, [phone]);
    await pool.query(`UPDATE customers SET status = 'new' WHERE phone = $1`, [phone]);
    // Send them the opening message so they don't have to text first
    const convo = await pool.query('SELECT sendblue_number FROM conversations WHERE phone = $1', [phone]);
    const marcoNumber = convo.rows[0]?.sendblue_number || '';
    await sendReply(phone, "hey it's Marco. are you ready to take the internet by storm? let's build you a site. business or personal?", marcoNumber);
    await pool.query(`UPDATE conversations SET state = 'onboarding' WHERE phone = $1`, [phone]);
    res.json({ success: true, message: `${phone} activated — opening message sent` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('Marco is alive'));

// Serve locally-generated sites
app.get('/sites/:slug', (req, res) => {
  const filePath = path.join(__dirname, 'sites', `${req.params.slug}.html`);
  if (fs.existsSync(filePath)) {
    res.type('text/html').send(fs.readFileSync(filePath, 'utf8'));
  } else {
    res.status(404).send('Site not found');
  }
});

app.post('/waitlist', async (req, res) => {
  const raw = req.body.phone || '';
  const phone = raw.startsWith('+') ? raw : `+1${raw.replace(/\D/g, '')}`;
  console.log(`Waitlist signup: ${raw} → normalized: ${phone}`);
  try {
    await pool.query(
      'INSERT INTO customers (phone, status) VALUES ($1, $2) ON CONFLICT (phone) DO NOTHING',
      [phone, 'waitlist']
    );
    // Also create conversation record so they show on dashboard
    await pool.query(
      `INSERT INTO conversations (phone, state, sendblue_number) VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET sendblue_number = EXCLUDED.sendblue_number`,
      [phone, 'waitlist', MARCO_NUMBERS.primary]
    );
    // Register in SendBlue contacts
    await registerSendBlueContact(phone);

    // Send them the waitlist confirmation via SMS
    try {
      await sendSMS(phone, "you're on the list. marco will be right with you — your dream site is just a few texts away.", MARCO_NUMBERS.primary);
      console.log(`Waitlist SMS sent to ${phone}`);
    } catch (smsErr) {
      console.error(`WAITLIST SMS FAILED for ${phone}:`, smsErr.response?.data || smsErr.message);
    }
    res.json({ success: true, message: 'Thanks for signing up! Marco will reach out soon.' });
  } catch (err) {
    console.error('Waitlist error:', err);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});

app.get('/dashboard', async (req, res) => {
  try {
    const customers = (await pool.query('SELECT * FROM customers ORDER BY created_at DESC')).rows;
    const convos = (await pool.query('SELECT * FROM conversations ORDER BY updated_at DESC')).rows;
    const waitlist = convos.filter(c => c.state === 'waitlist');
    const specialReqs = (await pool.query('SELECT sr.*, c.site_name FROM special_requests sr LEFT JOIN conversations c ON sr.phone = c.phone ORDER BY sr.created_at DESC LIMIT 50')).rows;
    const newReqCount = specialReqs.filter(r => r.status === 'new').length;

    const html = `<!DOCTYPE html><html><head><title>Marco Dashboard</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;padding:20px;margin:0}
h1{color:#00ff88;font-size:1.8rem}h2{color:#00ff88;margin-top:30px;font-size:1.2rem}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}
th,td{padding:10px 8px;text-align:left;border-bottom:1px solid #222}th{color:#00ff88}
.badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
.new{background:#333}.building{background:#f59e0b;color:#000}.launched{background:#00ff88;color:#000}.waitlist{background:#555}.active{background:#00ff88;color:#000}.expired{background:#444}
.count{display:inline-block;margin:0 10px 10px 0;padding:15px 20px;background:#1a1a1a;border-radius:8px;min-width:80px}
.count-num{font-size:2rem;color:#00ff88;font-weight:700}.count-label{font-size:12px;color:#888}
.state{color:#f59e0b;font-size:12px}
.alert{background:#ff4444;color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.btn{display:inline-block;padding:6px 14px;background:#00ff88;color:#000;border-radius:6px;text-decoration:none;font-size:12px;font-weight:700;border:none;cursor:pointer}
.btn-sm{padding:4px 10px;font-size:11px}
a{color:#00ff88}
</style></head><body>
<h1>Marco Dashboard ${newReqCount > 0 ? `<span class="alert">⚡ ${newReqCount} NEW REQUEST${newReqCount>1?'S':''}</span>` : ''}</h1>

<div>
  <div class="count"><div class="count-num">${waitlist.length}</div><div class="count-label">Waitlist</div></div>
  <div class="count"><div class="count-num">${customers.filter(c=>c.status==='new'||c.status==='building').length}</div><div class="count-label">Active</div></div>
  <div class="count"><div class="count-num">${customers.filter(c=>c.status==='launched').length}</div><div class="count-label">Paying</div></div>
  <div class="count"><div class="count-num">${newReqCount}</div><div class="count-label">Requests</div></div>
</div>

<p>
  <a href="/activate" class="btn">⚡ Activate Users</a>
  &nbsp;
  <button class="btn" style="background:${waitlistEnabled ? '#ff4444' : '#555'};color:#fff" onclick="fetch('/admin/toggle-waitlist',{method:'POST'}).then(r=>r.json()).then(d=>{this.style.background=d.waitlistEnabled?'#ff4444':'#555';this.textContent=d.waitlistEnabled?'🚨 Waitlist ON — Click to Disable':'✅ Waitlist OFF — Click to Enable'})">
    ${waitlistEnabled ? '🚨 Waitlist ON — Click to Disable' : '✅ Waitlist OFF — Click to Enable'}
  </button>
</p>

${newReqCount > 0 ? `
<h2>⚡ Special Requests</h2>
<table><tr><th>Phone</th><th>Business</th><th>Request</th><th>Time</th></tr>
${specialReqs.filter(r=>r.status==='new').map(r=>`<tr><td>${escHtml(r.phone)}</td><td>${escHtml(r.site_name)||'-'}</td><td>${escHtml(r.details)}</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`).join('')}
</table>` : ''}

<h2>All Requests</h2>
<table><tr><th>Phone</th><th>Business</th><th>Request</th><th>Time</th></tr>
${specialReqs.map(r=>`<tr><td>${escHtml(r.phone)}</td><td>${escHtml(r.site_name)||'-'}</td><td>${escHtml(r.details)}</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`).join('')}
</table>

<h2>Conversations</h2>
<table><tr><th>Phone</th><th>State</th><th>Business</th><th>Site</th><th>Updated</th></tr>
${convos.map(c=>`<tr><td>${escHtml(c.phone)}</td><td><span class="state">${escHtml(c.state)}</span></td><td>${escHtml(c.site_name)||'-'}</td><td>${c.site_url?`<a href="${escHtml(c.site_url)}">${escHtml(c.site_subdomain)}</a>`:'-'}</td><td>${new Date(c.updated_at).toLocaleString()}</td></tr>`).join('')}
</table>
</body></html>`;
    res.send(html);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Dashboard error');
  }
});

// Mobile activation page
app.get('/activate', async (req, res) => {
  const pin = req.query.pin;
  const adminPin = process.env.ADMIN_PIN || '1234';
  if (pin !== adminPin) {
    return res.send(`<!DOCTYPE html><html><head><title>Marco Activate</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{text-align:center;padding:20px}h2{color:#00ff88}input{padding:16px;font-size:1.5rem;border-radius:10px;border:2px solid #333;background:#1a1a1a;color:#fff;text-align:center;width:160px;letter-spacing:8px}button{display:block;margin:16px auto 0;padding:14px 40px;background:#00ff88;color:#000;border:none;border-radius:10px;font-size:1.1rem;font-weight:700;cursor:pointer}</style></head><body><div><h2>Marco</h2><p style="color:#888">Enter PIN to activate users</p><form action="/activate" method="get"><input type="password" name="pin" placeholder="••••" maxlength="8" autofocus><button type="submit">Unlock</button></form></div></body></html>`);
  }

  try {
    const waitlist = (await pool.query(
      `SELECT c.phone, c.created_at, cu.status FROM conversations c
       LEFT JOIN customers cu ON c.phone = cu.phone
       WHERE c.state = 'waitlist' ORDER BY c.created_at ASC`
    )).rows;

    const html = `<!DOCTYPE html><html><head><title>Activate</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;padding:20px;margin:0}
h1{color:#00ff88}p{color:#888;font-size:14px}
.card{background:#1a1a1a;border-radius:12px;padding:16px;margin:12px 0;display:flex;align-items:center;justify-content:space-between}
.phone{font-size:1.1rem;font-weight:600}.time{font-size:12px;color:#666;margin-top:4px}
.btn{padding:12px 20px;background:#00ff88;color:#000;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;text-decoration:none}
.empty{text-align:center;padding:60px 20px;color:#555}
</style></head><body>
<h1>⚡ Waitlist</h1>
<p>${waitlist.length} user${waitlist.length !== 1 ? 's' : ''} waiting</p>
${waitlist.length === 0 ? '<div class="empty">No one on the waitlist right now.</div>' :
  waitlist.map(u => `
  <div class="card">
    <div><div class="phone">${u.phone}</div><div class="time">Joined ${new Date(u.created_at).toLocaleString()}</div></div>
    <form method="post" action="/activate-user">
      <input type="hidden" name="phone" value="${u.phone}">
      <input type="hidden" name="pin" value="${pin}">
      <button class="btn" type="submit">Activate</button>
    </form>
  </div>`).join('')}
</body></html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send('Error loading waitlist');
  }
});

app.post('/activate-user', async (req, res) => {
  const pin = req.body.pin;
  const adminPin = process.env.ADMIN_PIN || '1234';
  if (pin !== adminPin) return res.status(403).send('Unauthorized');

  const phone = req.body.phone;
  try {
    await pool.query(`UPDATE conversations SET state = 'greeting' WHERE phone = $1`, [phone]);
    await pool.query(`UPDATE customers SET status = 'new' WHERE phone = $1`, [phone]);
    const convo = await pool.query('SELECT sendblue_number FROM conversations WHERE phone = $1', [phone]);
    const marcoNumber = convo.rows[0]?.sendblue_number || MARCO_NUMBERS.primary;
    await sendReply(phone, "hey it's Marco. are you ready to take the internet by storm? let's build you a site. business or personal?", marcoNumber);
    await pool.query(`UPDATE conversations SET state = 'onboarding' WHERE phone = $1`, [phone]);
    res.redirect(`/activate?pin=${pin}`);
  } catch (err) {
    console.error('Activation failed:', err.message);
    res.redirect(`/activate?pin=${pin}&error=1`);
  }
});

app.get('/dellvale', (req, res) => {
  try {
    res.type('text/html').send(fs.readFileSync(path.join(__dirname, 'landing-page.html'), 'utf8'));
  } catch (err) {
    console.error('Error serving landing page:', err);
    res.status(500).send('Landing page temporarily unavailable');
  }
});

// --- SMS Webhook (SendBlue) ---
app.post('/sms', async (req, res) => {
  const from = req.body.from_number || '';
  const body = req.body.content || '';
  const sendblueNumber = req.body.sendblue_number || req.body.to_number || '';

  // Ignore outbound echoes
  if (req.body.is_outbound) return res.status(200).json({ ok: true });

  const mediaUrl = req.body.media_url || null;

  // Ignore photo-only MMS unless user is active (active users can add photos to their site)
  if (!body.trim() && mediaUrl) {
    const existingConvo = await pool.query('SELECT state FROM conversations WHERE phone = $1', [from]);
    const state = existingConvo.rows[0]?.state;
    if (state !== 'active') {
      console.log(`MMS photo from ${from} (state: ${state}) — ignoring`);
      return res.status(200).json({ ok: true });
    }
  }

  console.log(`SMS from ${from}: ${body}${mediaUrl ? ' [+photo]' : ''}`);

  try {
    // Log inbound message
    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [from, 'inbound', body || '[photo]']);

    // Get or create conversation, always update to most recent sendblue number used
    const convo = await getOrCreateConversation(from);
    if (sendblueNumber && sendblueNumber !== convo.sendblue_number) {
      await pool.query('UPDATE conversations SET sendblue_number = $1 WHERE phone = $2', [sendblueNumber, from]);
      convo.sendblue_number = sendblueNumber;
    }

    // Register in SendBlue contacts (safe to call every time — update_if_exists handles duplicates)
    await registerSendBlueContact(from);

    // Process through state machine
    const result = await processState(convo, body, mediaUrl);

    // Update conversation state
    await updateConversation(from, result.newState, result.extracted);

    // Log outbound message
    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [from, 'outbound', result.response]);

    // Send reply via SendBlue
    await sendSMS(from, result.response, sendblueNumber || convo.sendblue_number);

    res.status(200).json({ success: true });

    // Kick off async site build after responding (non-blocking)
    if (result.triggerBuild) {
      buildAndSendSite(from, sendblueNumber || convo.sendblue_number).catch(err =>
        console.error('Async build error:', err.message)
      );
    }
  } catch (err) {
    console.error('Error:', err.response?.data || err.message || err);
    res.status(200).json({ ok: true }); // Always 200 so SendBlue doesn't retry
    try {
      await sendSMS(from, "Marco here. Give me a sec, something's weird on my end.", sendblueNumber);
    } catch (sendErr) {
      console.error('Failed to send error reply:', sendErr.response?.data || sendErr.message);
    }
  }
});

// --- SMS Webhook (Twilio — 888 number) ---
app.post('/sms-twilio', async (req, res) => {
  const from = req.body.From || '';
  const body = req.body.Body || '';
  const twilioNumber = req.body.To || MARCO_NUMBERS.toll_free;
  const mediaUrl = req.body.MediaUrl0 || null;

  console.log(`SMS (Twilio) from ${from}: ${body}${mediaUrl ? ' [+photo]' : ''}`);

  try {
    // Log inbound message
    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [from, 'inbound', body || '[photo]']);

    // Get or create conversation, store the marco number used
    const convo = await getOrCreateConversation(from);
    if (twilioNumber && !convo.sendblue_number) {
      await pool.query('UPDATE conversations SET sendblue_number = $1 WHERE phone = $2', [twilioNumber, from]);
    }

    // Process through state machine
    const result = await processState(convo, body, mediaUrl);

    // Update conversation state
    await updateConversation(from, result.newState, result.extracted);

    // Log outbound message
    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [from, 'outbound', result.response]);

    // Send reply via Twilio
    await sendSMSTwilio(from, result.response, twilioNumber);

    // Twilio expects TwiML response — empty response since we're sending via API
    res.type('text/xml').send('<Response></Response>');

    // Kick off async site build after responding (non-blocking)
    if (result.triggerBuild) {
      buildAndSendSite(from, twilioNumber).catch(err =>
        console.error('Async build error (Twilio):', err.message)
      );
    }
  } catch (err) {
    console.error('Error (Twilio):', err.response?.data || err.message || err);
    try {
      await sendSMSTwilio(from, "Marco here. Give me a sec, something's weird on my end.", twilioNumber);
    } catch (sendErr) {
      console.error('Failed to send error reply (Twilio):', sendErr.response?.data || sendErr.message);
    }
    res.type('text/xml').send('<Response></Response>');
  }
});

// --- Send reminders to users silent for 24+ hours (called by cron) ---
app.post('/send-reminders', async (req, res) => {
  try {
    const stale = await pool.query(
      `SELECT phone, state, site_url, sendblue_number FROM conversations
       WHERE state IN ('ask_name', 'ask_type', 'awaiting_payment')
       AND updated_at < NOW() - INTERVAL '24 hours'`
    );

    const paymentLink = process.env.STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/test';

    const reminders = {
      ask_name: "hey, still there? marco here. what's your business called?",
      ask_type: "you ghosted me. what type of business is it?",
      awaiting_payment: `your site's still waiting. $9.99 to keep it live: ${paymentLink}`
    };

    for (const row of stale.rows) {
      const message = reminders[row.state];
      if (!message) continue;

      console.log(`Sending reminder to ${row.phone} (state: ${row.state})`);
      try {
        await sendReply(row.phone, message, row.sendblue_number);
        await pool.query('UPDATE conversations SET updated_at = NOW() WHERE phone = $1', [row.phone]);
        await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [row.phone, 'outbound', message]);
      } catch (err) {
        console.error(`Reminder failed for ${row.phone}:`, err.response?.data || err.message);
      }
    }

    res.json({ reminded: stale.rows.length });
  } catch (err) {
    console.error('Reminder error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Cleanup expired sites (called by cron) ---
app.post('/cleanup-expired', async (req, res) => {
  try {
    // Phase 1: 48hrs no payment → mark expired, schedule Cloudflare deletion in 14 days
    const unpaid = await pool.query(
      `SELECT phone, site_url, sendblue_number FROM conversations
       WHERE state = 'awaiting_payment' AND expires_at < NOW()`
    );
    for (const row of unpaid.rows) {
      console.log(`Expiring site for ${row.phone}`);
      await pool.query(
        `UPDATE conversations SET state = 'expired', cloudflare_delete_at = NOW() + INTERVAL '14 days' WHERE phone = $1`,
        [row.phone]
      );
      await pool.query(`UPDATE customers SET status = 'expired' WHERE phone = $1`, [row.phone]);
      try {
        await sendReply(row.phone, "your draft site expired. text me anytime if you want to start fresh.", row.sendblue_number);
      } catch (err) {
        console.error(`Failed to notify ${row.phone}:`, err.message);
      }
    }

    // Phase 2: 14 days past expiry → actually delete from Cloudflare
    const toDelete = await pool.query(
      `SELECT phone, site_subdomain FROM conversations
       WHERE state = 'expired' AND cloudflare_delete_at < NOW() AND site_deleted = FALSE AND site_subdomain IS NOT NULL`
    );
    for (const row of toDelete.rows) {
      console.log(`Deleting Cloudflare site for ${row.phone}: ${row.site_subdomain}`);
      await deployer.deleteProject(row.site_subdomain);
      await pool.query(
        `UPDATE conversations SET site_deleted = TRUE, site_html = NULL WHERE phone = $1`,
        [row.phone]
      );
    }

    res.json({ expired: unpaid.rows.length, deleted: toDelete.rows.length });
  } catch (err) {
    console.error('Cleanup error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/toggle-waitlist', async (req, res) => {
  waitlistEnabled = !waitlistEnabled;
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('waitlist_enabled', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(waitlistEnabled)]
    );
  } catch (e) { console.error('Failed to persist waitlist setting:', e.message); }
  res.json({ waitlistEnabled });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await loadWaitlistSetting();
  console.log(`Marco running on port ${PORT} — waitlist: ${waitlistEnabled}`);
});

// Run cleanup daily at 3am UTC
cron.schedule('0 3 * * *', async () => {
  console.log('Running daily cleanup...');
  try {
    const unpaid = await pool.query(
      `SELECT phone, site_url, sendblue_number FROM conversations
       WHERE state = 'awaiting_payment' AND expires_at < NOW()`
    );
    for (const row of unpaid.rows) {
      console.log(`Expiring site for ${row.phone}`);
      await pool.query(
        `UPDATE conversations SET state = 'expired', cloudflare_delete_at = NOW() + INTERVAL '14 days' WHERE phone = $1`,
        [row.phone]
      );
      await pool.query(`UPDATE customers SET status = 'expired' WHERE phone = $1`, [row.phone]);
      try {
        await sendReply(row.phone, "your draft site expired. text me anytime if you want to start fresh.", row.sendblue_number);
      } catch (e) {}
    }

    const toDelete = await pool.query(
      `SELECT phone, site_subdomain FROM conversations
       WHERE state = 'expired' AND cloudflare_delete_at < NOW() AND site_deleted = FALSE AND site_subdomain IS NOT NULL`
    );
    for (const row of toDelete.rows) {
      console.log(`Deleting Cloudflare site for ${row.phone}: ${row.site_subdomain}`);
      await deployer.deleteProject(row.site_subdomain);
      await pool.query(
        `UPDATE conversations SET site_deleted = TRUE, site_html = NULL WHERE phone = $1`,
        [row.phone]
      );
    }
    console.log(`Cleanup done: ${unpaid.rows.length} expired, ${toDelete.rows.length} deleted from Cloudflare`);
  } catch (err) {
    console.error('Cron cleanup error:', err.message);
  }
});
