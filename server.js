const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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

    // Send confirmation via SendBlue
    const sbNumber = convoResult.rows[0]?.sendblue_number || '';
    try {
      await sendSMS(normalizedPhone, "payment received. your site is live and yours to keep. what do you want to change?", sbNumber);
    } catch (err) {
      console.error('Failed to send payment confirmation:', err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- SendBlue helper ---
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

// --- State Machine ---
const STATES = {
  'greeting': {
    response: "new phone who dis",
    nextState: "ask_type"
  },
  'ask_type': {
    response: "business or personal?",
    validation: (msg) => /business|personal/i.test(msg),
    fallback: "just tell me - business or personal?",
    nextState: (msg) => /business/i.test(msg) ? "ask_biz_name" : "ask_personal_name",
    extraction: (msg) => ({ is_personal: /personal/i.test(msg) })
  },
  'ask_biz_name': {
    response: "what's the business called?",
    nextState: "ask_biz_category",
    extraction: (msg) => ({ site_name: msg.trim() })
  },
  'ask_biz_category': {
    response: "what type of business?",
    nextState: "ask_phone",
    extraction: (msg) => ({ site_type: msg.trim() })
  },
  'ask_personal_name': {
    response: "what should we name your site?",
    nextState: "ask_personal_purpose",
    extraction: (msg) => ({ site_name: msg.trim() })
  },
  'ask_personal_purpose': {
    response: "what's it for?",
    nextState: "ask_phone",
    extraction: (msg) => ({ site_type: msg.trim() })
  },
  'ask_phone': {
    response: "what's the best phone number for the site? texts and calls only - no email",
    nextState: "building",
    extraction: (msg) => ({ contact_phone: msg.trim() })
  },
  'building': {
    response: "ok I think I have what I need. give me 2 min",
    action: "generateSite",
    nextState: "awaiting_payment"
  },
  'awaiting_payment': {
    response: "still waiting on that payment. $9.99 to keep your site live.",
    nextState: "awaiting_payment"
  },
  'expired': {
    response: "your draft expired. text me if you want to start over",
    nextState: "greeting"
  },
  'active': {
    // Full AI mode — handled separately in processState
  }
};

async function getOrCreateConversation(phone) {
  const result = await pool.query('SELECT * FROM conversations WHERE phone = $1', [phone]);
  if (result.rows.length > 0) return result.rows[0];
  const insert = await pool.query(
    'INSERT INTO conversations (phone, state) VALUES ($1, $2) RETURNING *',
    [phone, 'greeting']
  );
  // Also ensure customer record exists
  await pool.query(
    'INSERT INTO customers (phone, status) VALUES ($1, $2) ON CONFLICT (phone) DO NOTHING',
    [phone, 'new']
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

async function processState(convo, message) {
  // Active (paid) users get full AI Marco
  if (convo.state === 'active') {
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `You are Marco, a grumpy waiter at a diner who happens to be a web design genius.

Rules:
- Short responses (under 160 chars when possible)
- No sighs, no "ugh", no "*sigh*", no asterisk actions
- Dry, slightly annoyed competence
- You have their back but you won't be cheerful about it
- You want to help them nail their business
- When they ask for changes, just do it and confirm

Example tone:
- "done. refresh the page."
- "what else."
- "yeah I can do that. give me a sec."
- "that's gonna look weird but ok. done."`,
      messages: [{ role: 'user', content: message }]
    });
    return { response: aiResponse.content[0].text, newState: 'active', extracted: null };
  }

  const state = STATES[convo.state];
  if (!state) {
    return { response: "new phone who dis", newState: "ask_type", extracted: null };
  }

  // Validate if needed
  if (state.validation && !state.validation(message)) {
    return { response: state.fallback || "sorry, didn't catch that", newState: convo.state, extracted: null };
  }

  // Extract data
  const extracted = state.extraction ? state.extraction(message) : null;

  // Determine next state
  let nextState = typeof state.nextState === 'function'
    ? state.nextState(message)
    : state.nextState;

  // Handle site generation
  if (state.action === 'generateSite') {
    const fullConvo = await pool.query('SELECT * FROM conversations WHERE phone = $1', [convo.phone]);
    const data = fullConvo.rows[0];
    const siteUrl = await generateSite(data);

    await pool.query(
      "UPDATE conversations SET expires_at = NOW() + INTERVAL '48 hours', site_url = $1 WHERE phone = $2",
      [siteUrl, convo.phone]
    );
    await pool.query(
      'UPDATE customers SET status = $1, site_url = $2 WHERE phone = $3',
      ['building', siteUrl, convo.phone]
    );

    const paymentLink = process.env.STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/test';
    return {
      response: `here's your first draft: ${siteUrl}\n\nlike it? pay $9.99 to keep it live: ${paymentLink}\n\nsite disappears in 48 hours if you don't`,
      newState: 'awaiting_payment',
      extracted: { site_url: siteUrl }
    };
  }

  return { response: state.response, newState: nextState, extracted };
}

async function generateSite(data) {
  const subdomain = (data.site_name || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // TODO: Generate actual site HTML and deploy to subdomain
  // For now, return placeholder URL
  return `${subdomain}.textmarco.com`;
}

// --- Routes ---

app.get('/', (req, res) => res.send('Marco is alive'));

app.post('/waitlist', async (req, res) => {
  const phone = req.body.phone || '';
  console.log(`Waitlist signup: ${phone}`);
  try {
    await pool.query(
      'INSERT INTO customers (phone, status) VALUES ($1, $2) ON CONFLICT (phone) DO NOTHING',
      [phone, 'waitlist']
    );
    res.json({ success: true, message: 'Thanks for signing up! Marco will reach out soon.' });
  } catch (err) {
    console.error('Waitlist error:', err);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});

app.get('/dashboard', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    const customers = result.rows;
    const convos = await pool.query('SELECT * FROM conversations ORDER BY updated_at DESC');
    const html = `<!DOCTYPE html><html><head><title>Marco Dashboard</title><style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;padding:40px}h1{color:#00ff88}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:12px;text-align:left;border-bottom:1px solid #333}th{color:#00ff88}.status{padding:4px 12px;border-radius:20px;font-size:12px}.new{background:#333}.building{background:#f59e0b;color:#000}.launched{background:#00ff88;color:#000}.waitlist{background:#555}.count{display:inline-block;margin-right:20px;padding:20px;background:#1a1a1a;border-radius:8px}.count-num{font-size:36px;color:#00ff88}.count-label{font-size:14px;color:#888}h2{color:#00ff88;margin-top:40px}.state{color:#f59e0b}</style></head><body><h1>Marco Dashboard</h1><div><div class="count"><div class="count-num">${customers.filter(c=>c.status==='new').length}</div><div class="count-label">New</div></div><div class="count"><div class="count-num">${customers.filter(c=>c.status==='building').length}</div><div class="count-label">Building</div></div><div class="count"><div class="count-num">${customers.filter(c=>c.status==='launched').length}</div><div class="count-label">Launched</div></div></div><h2>Customers</h2><table><tr><th>Phone</th><th>Business</th><th>Status</th><th>Site URL</th><th>Signed Up</th></tr>${customers.map(c=>`<tr><td>${c.phone}</td><td>${c.business_name||'-'}</td><td><span class="status ${c.status}">${c.status}</span></td><td>${c.site_url?`<a href="${c.site_url}" style="color:#00ff88">${c.site_url}</a>`:'-'}</td><td>${new Date(c.created_at).toLocaleDateString()}</td></tr>`).join('')}</table><h2>Conversations</h2><table><tr><th>Phone</th><th>State</th><th>Site Name</th><th>Type</th><th>Updated</th></tr>${convos.rows.map(c=>`<tr><td>${c.phone}</td><td><span class="state">${c.state}</span></td><td>${c.site_name||'-'}</td><td>${c.site_type||'-'}</td><td>${new Date(c.updated_at).toLocaleString()}</td></tr>`).join('')}</table></body></html>`;
    res.send(html);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Dashboard error');
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

  console.log(`SMS from ${from}: ${body}`);

  try {
    // Log inbound message
    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [from, 'inbound', body]);

    // Get or create conversation, store sendblue number
    const convo = await getOrCreateConversation(from);
    if (sendblueNumber && !convo.sendblue_number) {
      await pool.query('UPDATE conversations SET sendblue_number = $1 WHERE phone = $2', [sendblueNumber, from]);
    }

    // Process through state machine
    const result = await processState(convo, body);

    // Update conversation state
    await updateConversation(from, result.newState, result.extracted);

    // Log outbound message
    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [from, 'outbound', result.response]);

    // Send reply via SendBlue
    await sendSMS(from, result.response, sendblueNumber || convo.sendblue_number);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error:', err.response?.data || err.message || err);
    try {
      await sendSMS(from, "Marco here. Give me a sec, something's weird on my end.", sendblueNumber);
    } catch (sendErr) {
      console.error('Failed to send error reply:', sendErr.response?.data || sendErr.message);
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Cleanup expired sites (called by cron) ---
app.post('/cleanup-expired', async (req, res) => {
  try {
    const expired = await pool.query(
      `SELECT phone, site_url, sendblue_number FROM conversations
       WHERE state = 'awaiting_payment' AND expires_at < NOW() AND site_deleted = FALSE`
    );

    for (const row of expired.rows) {
      console.log(`Expiring site for ${row.phone}: ${row.site_url}`);
      await pool.query(
        `UPDATE conversations SET state = 'expired', site_deleted = TRUE WHERE phone = $1`,
        [row.phone]
      );
      await pool.query(
        `UPDATE customers SET status = 'expired' WHERE phone = $1`,
        [row.phone]
      );
      try {
        await sendSMS(row.phone, "your draft site expired. text me anytime if you want to start fresh.", row.sendblue_number);
      } catch (err) {
        console.error(`Failed to notify ${row.phone}:`, err.message);
      }
    }

    res.json({ cleaned: expired.rows.length });
  } catch (err) {
    console.error('Cleanup error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Marco running on port ${PORT}`));
