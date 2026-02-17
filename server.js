const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

app.get('/', (req, res) => res.send('Marco is alive'));

// Serve landing page for 3718 Dellvale Pl
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
  const from = req.body.From || '';
  const body = req.body.Body || '';
  
  console.log(`SMS from ${from}: ${body}`);
  
  try {
    await pool.query(
      'INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)',
      [from, 'inbound', body]
    );

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `You are Marco, a grumpy but talented web designer who builds websites via text. Keep responses short (under 160 chars when possible). Be helpful but with attitude.`,
      messages: [{ role: 'user', content: body }]
    });

    const marcoReply = response.content[0].text;

    await pool.query(
      'INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)',
      [from, 'outbound', marcoReply]
    );

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(marcoReply);
    res.type('text/xml').send(twiml.toString());

  } catch (err) {
    console.error('Error:', err);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("Marco here. Give me a sec, something's weird on my end.");
    res.type('text/xml').send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Marco running on port ${PORT}`));