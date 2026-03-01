const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const TemplateEngine = require('./template-engine');
const CloudflareDeployer = require('./cloudflare-deployer');

const templateEngine = new TemplateEngine();
const deployer = new CloudflareDeployer();

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

// --- Smart extraction using Claude ---
async function extractField(message, field) {
  const prompts = {
    site_name: `The user was asked for their business or site name. They said: "${message}". Extract ONLY the business/site name. If they're joking or chatting, look for the actual name. Return ONLY the name, nothing else. No quotes, no punctuation, no explanation.`,
    site_type: `The user was asked what type of business they have. They said: "${message}". Extract ONLY the business type/category (like "mobile car wash", "plumbing", "landscaping"). Return ONLY the type, nothing else.`,
    contact_phone: `The user was asked for a phone number. They said: "${message}". Extract ONLY the phone number. Return ONLY the digits (with country code if given), nothing else.`
  };

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
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

function buildActiveSystemPrompt(siteData) {
  const basePersonality = `You are Marco, a grumpy waiter at a diner who happens to be a web design genius.

Rules:
- Short responses (under 160 chars when possible) for conversation
- No sighs, no "ugh", no "*sigh*", no asterisk actions
- Dry, slightly annoyed competence
- You have their back but you won't be cheerful about it
- You want to help them nail their business`;

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

// --- State Machine ---
const STATES = {
  'greeting': {
    response: "your new website is a few texts away. business or personal?",
    nextState: "ask_type"
  },
  'ask_type': {
    validation: (msg) => /business|personal|biz|company|myself|me/i.test(msg),
    fallback: "business or personal?",
    nextState: (msg) => /business|biz|company/i.test(msg) ? "ask_biz_name" : "ask_personal_name",
    extraction: (msg) => ({ is_personal: /personal|myself|me/i.test(msg) })
  },
  'ask_biz_name': {
    response: "what's the business called?",
    nextState: "ask_biz_category",
    smartExtract: "site_name"
  },
  'ask_biz_category': {
    response: "what type of business?",
    nextState: "ask_phone",
    smartExtract: "site_type"
  },
  'ask_personal_name': {
    response: "what should we name your site?",
    nextState: "ask_personal_purpose",
    smartExtract: "site_name"
  },
  'ask_personal_purpose': {
    response: "what's it for?",
    nextState: "ask_phone",
    smartExtract: "site_type"
  },
  'ask_phone': {
    response: "what's the best phone number for the site?",
    nextState: "building",
    smartExtract: "contact_phone"
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

    // Ensure current message is included (it may already be in messages table from webhook)
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: message });
    } else {
      // Current message is the last inbound, make sure it's there
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg.content.includes(message)) {
        lastMsg.content += '\n' + message;
      }
    }

    // 4. Call Claude with site-aware system prompt
    const systemPrompt = buildActiveSystemPrompt(siteData);
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
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

    // 7. No HTML edit — return conversational response as-is
    return { response: fullResponse, newState: 'active', extracted: null };
  }

  const state = STATES[convo.state];
  if (!state) {
    return { response: "your new website is a few texts away. business or personal?", newState: "ask_type", extracted: null };
  }

  // Validate if needed
  if (state.validation && !state.validation(message)) {
    return { response: state.fallback || "sorry, didn't catch that", newState: convo.state, extracted: null };
  }

  // Extract data — use Claude for smart extraction if configured
  let extracted = null;
  if (state.smartExtract) {
    const value = await extractField(message, state.smartExtract);
    extracted = { [state.smartExtract]: value };
  } else if (state.extraction) {
    extracted = state.extraction(message);
  }

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
  const subdomain = templateEngine.generateSubdomain(data.site_name || 'site');

  // Build config for template engine
  const config = {
    businessName: data.site_name || 'My Business',
    businessPhone: data.contact_phone || '',
    services: data.site_type ? [data.site_type] : [],
    template: null // auto-detect from services
  };

  // Generate HTML
  const html = templateEngine.generateSiteHTML(config);

  // Save site locally (always works)
  const sitesDir = path.join(__dirname, 'sites');
  if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });
  fs.writeFileSync(path.join(sitesDir, `${subdomain}.html`), html);

  // Save subdomain and HTML to database for active-mode editing
  await pool.query(
    'UPDATE conversations SET site_subdomain = $1, site_html = $2 WHERE phone = $3',
    [subdomain, html, data.phone]
  );

  // Try Cloudflare Pages if credentials exist
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    const result = await deployer.deployWebsite(subdomain, html, config.businessName);
    if (result.success && result.method !== 'simulation') {
      console.log(`Site deployed to Cloudflare: ${result.url}`);
      return result.url;
    }
  }

  // Serve from Express
  const localUrl = `https://marco-clean.onrender.com/sites/${subdomain}`;
  console.log(`Site generated: ${localUrl}`);
  return localUrl;
}

// --- Routes ---

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
