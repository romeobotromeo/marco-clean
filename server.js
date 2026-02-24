const express = require('express');
const twilio = require('twilio');
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

// PHASE 1: Database Enhancement Function
async function ensureDatabaseSchema() {
  try {
    // Add conversation system fields to customers table
    await pool.query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS services TEXT[],
      ADD COLUMN IF NOT EXISTS conversation_state VARCHAR(50) DEFAULT 'greeting',
      ADD COLUMN IF NOT EXISTS style_preference TEXT,
      ADD COLUMN IF NOT EXISTS business_phone VARCHAR(20),
      ADD COLUMN IF NOT EXISTS site_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
    `);
    
    console.log('✅ Database schema enhanced for Phase 1');
  } catch (error) {
    console.log('ℹ️  Database schema already enhanced or error:', error.message);
  }
}

// PHASE 1: Conversation System Functions
function buildSystemPromptForState(state, customer) {
  const basePersonality = "You are Marco, a grumpy but talented web designer who builds websites via text. Keep responses short (under 160 chars when possible). Be helpful but with attitude.";
  
  switch(state) {
    case 'greeting':
      return `${basePersonality} This is a new customer. Welcome them and ask what kind of business they have.`;
    
    case 'collecting_name':
      return `${basePersonality} They mentioned their business type. Now ask for their business name specifically. Don't repeat what they already told you.`;
    
    case 'collecting_services':
      return `${basePersonality} Business name: "${customer.business_name}". Ask what specific services they offer. Be natural about it.`;
    
    case 'collecting_style':
      return `${basePersonality} Business: "${customer.business_name}", Services: "${customer.services?.join(', ')}". Ask about their style preference or show them examples.`;
    
    default:
      return basePersonality;
  }
}

function extractDataFromMessage(userMessage, currentState) {
  const extracted = {};
  const message = userMessage.toLowerCase();
  
  switch(currentState) {
    case 'collecting_name':
      // Simple extraction - look for business-like patterns
      const businessPatterns = [
        /(?:my business is |business is |it's |called |named? |name's )([^.!?]*)/i,
        /([a-zA-Z0-9\s&'-]+(?:llc|inc|corp|company|co\.|plumbing|landscaping|cleaning|handyman|electric|construction|roofing))/i
      ];
      
      for (const pattern of businessPatterns) {
        const match = userMessage.match(pattern);
        if (match && match[1] && match[1].trim().length > 2) {
          extracted.business_name = match[1].trim();
          break;
        }
      }
      break;
      
    case 'collecting_services':
      // Extract services - simple keyword matching
      const services = [];
      const serviceKeywords = {
        'plumbing': ['plumb', 'pipe', 'leak', 'drain', 'water', 'toilet', 'faucet'],
        'landscaping': ['landscap', 'lawn', 'garden', 'yard', 'grass', 'tree', 'plant'],
        'cleaning': ['clean', 'janitor', 'housekeep', 'maid'],
        'handyman': ['handyman', 'repair', 'fix', 'maintenance', 'odd job'],
        'electrical': ['electric', 'wiring', 'outlet', 'light', 'panel']
      };
      
      for (const [service, keywords] of Object.entries(serviceKeywords)) {
        if (keywords.some(keyword => message.includes(keyword))) {
          services.push(service);
        }
      }
      
      // Also extract literal services mentioned
      const serviceMatches = userMessage.match(/(?:we do |offer |provide )([^.!?]*)/i);
      if (serviceMatches) {
        services.push(serviceMatches[1].trim());
      }
      
      if (services.length > 0) {
        extracted.services = services;
      }
      break;
  }
  
  return extracted;
}

function determineNextState(currentState, extractedData) {
  switch(currentState) {
    case 'greeting':
      return 'collecting_name';
    
    case 'collecting_name':
      return extractedData.business_name ? 'collecting_services' : 'collecting_name';
    
    case 'collecting_services':
      return extractedData.services ? 'collecting_style' : 'collecting_services';
    
    case 'collecting_style':
      return 'ready_to_build';
    
    default:
      return currentState;
  }
}

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
  const from = req.body.From || '';
  const body = req.body.Body || '';
  console.log(`SMS from ${from}: ${body}`);
  
  try {
    // PHASE 1: Get or create customer with conversation state
    let customerResult = await pool.query(
      'SELECT * FROM customers WHERE phone = $1', 
      [from]
    );
    
    let customer;
    if (customerResult.rows.length === 0) {
      // Create new customer with default conversation state
      const insertResult = await pool.query(
        'INSERT INTO customers (phone, status, conversation_state, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
        [from, 'new', 'greeting']
      );
      customer = insertResult.rows[0];
      console.log(`🆕 New customer created: ${from}`);
    } else {
      customer = customerResult.rows[0];
      console.log(`📞 Existing customer: ${from}, state: ${customer.conversation_state}`);
    }
    
    // PHASE 1: Log inbound message
    await pool.query(
      'INSERT INTO messages (phone, direction, body, created_at) VALUES ($1, $2, $3, NOW())', 
      [from, 'inbound', body]
    );
    
    // PHASE 1: Extract data from user message
    const extractedData = extractDataFromMessage(body, customer.conversation_state);
    console.log(`🔍 Extracted data:`, extractedData);
    
    // PHASE 1: Build context-aware system prompt
    const systemPrompt = buildSystemPromptForState(customer.conversation_state, customer);
    console.log(`🤖 State: ${customer.conversation_state}, Prompt ready`);
    
    // PHASE 1: Enhanced Claude call with conversation context
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: body }]
    });
    
    const marcoReply = response.content[0].text;
    console.log(`💬 Marco reply: ${marcoReply}`);
    
    // PHASE 1: Update customer with extracted data and new state
    const updateFields = [];
    const updateValues = [];
    let valueIndex = 1;
    
    if (extractedData.business_name) {
      updateFields.push(`business_name = $${valueIndex++}`);
      updateValues.push(extractedData.business_name);
    }
    
    if (extractedData.services) {
      updateFields.push(`services = $${valueIndex++}`);
      updateValues.push(extractedData.services);
    }
    
    // Determine next conversation state
    const nextState = determineNextState(customer.conversation_state, extractedData);
    updateFields.push(`conversation_state = $${valueIndex++}`);
    updateValues.push(nextState);
    
    updateFields.push(`updated_at = NOW()`);
    
    if (updateFields.length > 1) { // More than just updated_at
      updateValues.push(customer.id);
      const updateQuery = `UPDATE customers SET ${updateFields.join(', ')} WHERE id = $${valueIndex}`;
      await pool.query(updateQuery, updateValues);
      console.log(`📊 Customer updated: ${customer.conversation_state} → ${nextState}`);
    }
    
    // PHASE 1: Log outbound message  
    await pool.query(
      'INSERT INTO messages (phone, direction, body, created_at) VALUES ($1, $2, $3, NOW())', 
      [from, 'outbound', marcoReply]
    );
    
    // Send SMS response
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(marcoReply);
    res.type('text/xml').send(twiml.toString());
    
  } catch (err) {
    console.error('❌ SMS Error:', err);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("Marco here. Give me a sec, something's weird on my end.");
    res.type('text/xml').send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;

// PHASE 1: Initialize database schema and start server
async function startServer() {
  try {
    console.log('🔧 Initializing MARCO CLEAN Phase 1...');
    
    // Ensure database schema is ready
    await ensureDatabaseSchema();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Marco CLEAN v1.1 running on port ${PORT}`);
      console.log('✨ Phase 1: Sophisticated conversation system ACTIVE');
      console.log('📊 Features: State tracking, data extraction, smart prompts');
    });
    
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

startServer();
