const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

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
    const html = `<!DOCTYPE html><html><head><title>Marco Dashboard</title><style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;padding:40px}h1{color:#00ff88}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:12px;text-align:left;border-bottom:1px solid #333}th{color:#00ff88}.status{padding:4px 12px;border-radius:20px;font-size:12px}.waitlist{background:#333}.building{background:#f59e0b;color:#000}.launched{background:#00ff88;color:#000}.count{display:inline-block;margin-right:20px;padding:20px;background:#1a1a1a;border-radius:8px}.count-num{font-size:36px;color:#00ff88}.count-label{font-size:14px;color:#888}</style></head><body><h1>Marco Dashboard</h1><div><div class="count"><div class="count-num">${customers.filter(c=>c.status==='waitlist').length}</div><div class="count-label">Waitlist</div></div><div class="count"><div class="count-num">${customers.filter(c=>c.status==='building').length}</div><div class="count-label">Building</div></div><div class="count"><div class="count-num">${customers.filter(c=>c.status==='launched').length}</div><div class="count-label">Launched</div></div></div><table><tr><th>Phone</th><th>Business</th><th>Status</th><th>Site URL</th><th>Signed Up</th></tr>${customers.map(c=>`<tr><td>${c.phone}</td><td>${c.business_name||'-'}</td><td><span class="status ${c.status}">${c.status}</span></td><td>${c.site_url?`<a href="${c.site_url}" style="color:#00ff88">${c.site_url}</a>`:'-'}</td><td>${new Date(c.created_at).toLocaleDateString()}</td></tr>`).join('')}</table></body></html>`;
    res.send(html);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Dashboard error');
  }
});

app.get('/dellvale', (req, res) => {
  try {
    const landingPagePath = path.join(__dirname, 'landing-page.html');
    const landingPageContent = fs.readFileSync(landingPagePath, 'utf8');
    res.type('text/html').send(landingPageContent);
  } catch (err) {
    console.error('Error serving landing page:', err);
    res.status(500).send('Landing page temporarily unavailable');
  }
});

app.post('/sms', async (req, res) => {
  // SendBlue webhook format
  const from = req.body.from_number || '';
  const body = req.body.content || '';
  const sendblueNumber = req.body.sendblue_number || req.body.to_number || '';
  console.log(`SMS from ${from} to ${sendblueNumber}: ${body}`);
  console.log('Full webhook payload:', JSON.stringify(req.body));
  try {
    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [from, 'inbound', body]);
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `You are Marco, a grumpy but talented web designer who builds websites via text. Keep responses short (under 160 chars when possible). Be helpful but with attitude.`,
      messages: [{ role: 'user', content: body }]
    });
    const marcoReply = response.content[0].text;
    await pool.query('INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)', [from, 'outbound', marcoReply]);

    // Reply via SendBlue
    await axios.post('https://api.sendblue.co/api/send-message', {
      number: from,
      content: marcoReply,
      from_number: sendblueNumber
    }, {
      headers: {
        'sb-api-key-id': process.env.SENDBLUE_API_KEY,
        'sb-api-secret-key': process.env.SENDBLUE_API_SECRET,
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error:', err.response?.data || err.message || err);
    try {
      await axios.post('https://api.sendblue.co/api/send-message', {
        number: from,
        content: "Marco here. Give me a sec, something's weird on my end.",
        from_number: sendblueNumber
      }, {
        headers: {
          'sb-api-key-id': process.env.SENDBLUE_API_KEY,
          'sb-api-secret-key': process.env.SENDBLUE_API_SECRET,
          'Content-Type': 'application/json'
        }
      });
    } catch (sendErr) {
      console.error('Failed to send error reply:', sendErr.response?.data || sendErr.message);
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Marco running on port ${PORT}`));
