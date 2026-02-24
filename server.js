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

// PHASE 2: Template Engine Integration
const TemplateEngine = require('./templates/template-engine');
const templateEngine = new TemplateEngine();

// PHASE 3: Real Deployment System
const CloudflareDeployer = require('./deployment/cloudflare-deployer');
const deployer = new CloudflareDeployer();

// Twilio client for sending messages
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// PHASE 1 & 3: Database Enhancement Function
async function ensureDatabaseSchema() {
  try {
    // Phase 1: Add conversation system fields to customers table
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
    
    // Phase 3: Add deployment tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deployments (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        subdomain VARCHAR(100) NOT NULL,
        site_url VARCHAR(500) NOT NULL,
        deploy_id VARCHAR(255),
        deployment_method VARCHAR(50) DEFAULT 'cloudflare',
        status VARCHAR(50) DEFAULT 'deploying',
        error_message TEXT,
        deployed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Add deployment tracking index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deployments_customer 
      ON deployments(customer_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deployments_subdomain 
      ON deployments(subdomain)
    `);
    
    console.log('✅ Database schema enhanced for Phase 1 & 3');
  } catch (error) {
    console.log('ℹ️  Database schema already enhanced or error:', error.message);
  }
}

// PHASE 1: Conversation System Functions
function buildSystemPromptForState(state, customer) {
  const basePersonality = "You are Marco, a grumpy but talented web designer who builds websites via text. Keep responses short (under 160 chars when possible). Be helpful but with attitude.";
  
  switch(state) {
    case 'greeting':
      return `${basePersonality} This is a new customer. Welcome them warmly and ask what kind of business they have. Be excited to help them get a website!`;
    
    case 'collecting_name':
      return `${basePersonality} They mentioned their business type. Now ask for their business name specifically. Don't repeat what they already told you.`;
    
    case 'collecting_services':
      return `${basePersonality} Business name: "${customer.business_name}". Ask what specific services they offer. Be natural about it - you need this info to build their website.`;
    
    case 'collecting_style':
      return `${basePersonality} Business: "${customer.business_name}", Services: "${customer.services?.join(', ')}". Ask if they want a simple, professional website or have any style preferences. You're almost ready to build their site!`;
      
    case 'ready_to_build':
      return `${basePersonality} You have everything you need. Tell them you're building their website now! Business: "${customer.business_name}", Services: "${customer.services?.join(', ')}"`;
    
    case 'site_building':
      return `${basePersonality} You're currently building and deploying their website. If they ask about progress, tell them it'll be ready in just a few minutes.`;
    
    case 'site_live':
      return `${basePersonality} Their website is live at ${customer.site_url}! Answer any questions they have about their site. Be proud of your work but still grumpy.`;
      
    case 'build_error':
      return `${basePersonality} Something went wrong with their website build. Apologize briefly and tell them you're fixing it. Stay in character but be helpful.`;
    
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
    
    case 'ready_to_build':
      return 'site_building';
    
    default:
      return currentState;
  }
}

// PHASE 2: Website Generation System
async function generateWebsiteForCustomer(customerId) {
  try {
    console.log(`🏗️  Starting website generation for customer: ${customerId}`);
    
    // Get customer data
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (customerResult.rows.length === 0) {
      throw new Error('Customer not found');
    }
    
    const customer = customerResult.rows[0];
    
    // Validate we have enough data
    if (!customer.business_name) {
      throw new Error('Missing business name - cannot generate website');
    }
    
    console.log(`📊 Customer data: ${customer.business_name}, Services: ${customer.services ? customer.services.join(', ') : 'none'}`);
    
    // Prepare template configuration
    const templateConfig = {
      businessName: customer.business_name,
      services: customer.services || [],
      businessPhone: customer.business_phone || customer.phone,
      stylePreference: customer.style_preference
    };
    
    // Generate subdomain
    const subdomain = templateEngine.generateSubdomain(customer.business_name);
    const siteUrl = `https://${subdomain}.textmarco.com`;
    
    console.log(`🌐 Generated subdomain: ${subdomain}`);
    
    // Generate website HTML
    const siteHTML = templateEngine.generateSiteHTML(templateConfig);
    console.log(`📄 Generated HTML: ${(siteHTML.length / 1024).toFixed(1)}KB`);
    
    // PHASE 3: Create deployment record
    const deploymentRecord = await pool.query(`
      INSERT INTO deployments (customer_id, subdomain, site_url, deployment_method, status, created_at)
      VALUES ($1, $2, $3, 'cloudflare', 'deploying', NOW())
      RETURNING id
    `, [customerId, subdomain, siteUrl]);
    
    const deploymentId = deploymentRecord.rows[0].id;
    console.log(`📋 Created deployment record: ${deploymentId}`);
    
    // PHASE 3: Deploy to Cloudflare Pages (or simulate if no credentials)
    console.log(`🌐 Deploying to Cloudflare Pages...`);
    const deploymentResult = await deployer.deployWebsite(subdomain, siteHTML, customer.business_name);
    
    if (deploymentResult.success) {
      console.log(`✅ Website deployed successfully: ${deploymentResult.url}`);
      
      // Update deployment record with success
      await pool.query(`
        UPDATE deployments 
        SET status = 'deployed', deploy_id = $1, deployed_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [deploymentResult.deployId, deploymentId]);
      
      // Update customer record with successful deployment
      await pool.query(
        'UPDATE customers SET site_url = $1, status = $2, conversation_state = $3, updated_at = NOW() WHERE id = $4',
        [deploymentResult.url, 'launched', 'site_live', customerId]
      );
      
      console.log(`📊 Customer status updated: launched`);
      
      return {
        success: true,
        siteUrl: deploymentResult.url,
        subdomain: subdomain,
        deployId: deploymentResult.deployId,
        method: deploymentResult.method,
        deploymentRecordId: deploymentId
      };
      
    } else {
      console.error(`❌ Deployment failed: ${deploymentResult.error}`);
      
      // Update deployment record with failure
      await pool.query(`
        UPDATE deployments 
        SET status = 'failed', error_message = $1, updated_at = NOW()
        WHERE id = $2
      `, [deploymentResult.error, deploymentId]);
      
      // Update customer record with deployment failure
      await pool.query(
        'UPDATE customers SET status = $1, conversation_state = $2, updated_at = NOW() WHERE id = $3',
        ['deploy_failed', 'build_error', customerId]
      );
      
      throw new Error(`Deployment failed: ${deploymentResult.error}`);
    }
    
  } catch (error) {
    console.error(`❌ Website generation failed:`, error);
    
    // Update customer status to indicate failure
    await pool.query(
      'UPDATE customers SET status = $1, updated_at = NOW() WHERE id = $2',
      ['build_failed', customerId]
    );
    
    throw error;
  }
}

app.get('/', (req, res) => res.send('Marco is alive'));

// PHASE 2: Template Engine Test Endpoint
app.get('/test-template', async (req, res) => {
  try {
    const testConfig = {
      businessName: "Test Handyman Co",
      services: ['repairs', 'maintenance', 'odd jobs'],
      businessPhone: '(555) 123-4567'
    };
    
    const html = templateEngine.generateSiteHTML(testConfig);
    res.type('text/html').send(html);
    
  } catch (error) {
    res.status(500).json({
      error: 'Template generation failed',
      message: error.message
    });
  }
});

// PHASE 3: Deployment Test Endpoint
app.get('/test-deploy', async (req, res) => {
  try {
    console.log('🧪 Testing deployment system...');
    
    const testConfig = {
      businessName: "Test Deployment Co",
      services: ['testing', 'deployment', 'verification'],
      businessPhone: '(555) TEST-123'
    };
    
    const html = templateEngine.generateSiteHTML(testConfig);
    const subdomain = templateEngine.generateSubdomain(testConfig.businessName);
    
    const deploymentResult = await deployer.deployWebsite(subdomain, html, testConfig.businessName);
    
    res.json({
      success: true,
      deployment: deploymentResult,
      config: testConfig,
      subdomain: subdomain
    });
    
  } catch (error) {
    console.error('Deployment test failed:', error);
    res.status(500).json({
      error: 'Deployment test failed',
      message: error.message
    });
  }
});

// PHASE 3: List Deployments Endpoint  
app.get('/admin/deployments', async (req, res) => {
  try {
    // Check basic auth (simple protection)
    const auth = req.headers.authorization;
    if (!auth || auth !== 'Bearer marco-admin-2026') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get all customers with deployed sites
    const result = await pool.query(`
      SELECT 
        id,
        phone,
        business_name,
        services,
        site_url,
        status,
        conversation_state,
        created_at,
        updated_at
      FROM customers 
      WHERE site_url IS NOT NULL OR status IN ('building', 'launched', 'deploy_failed')
      ORDER BY updated_at DESC
    `);
    
    const deployments = result.rows.map(customer => ({
      id: customer.id,
      phone: customer.phone,
      business_name: customer.business_name,
      services: customer.services,
      site_url: customer.site_url,
      status: customer.status,
      conversation_state: customer.conversation_state,
      created_at: customer.created_at,
      updated_at: customer.updated_at
    }));
    
    // Get Cloudflare projects list (if not in simulation mode)
    let cloudflareProjects = [];
    try {
      cloudflareProjects = await deployer.listProjects();
    } catch (error) {
      console.warn('Failed to list Cloudflare projects:', error.message);
    }
    
    res.json({
      success: true,
      deployments: deployments,
      cloudflare_projects: cloudflareProjects,
      simulation_mode: deployer.simulateMode,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Admin deployments error:', error);
    res.status(500).json({
      error: 'Failed to list deployments',
      message: error.message
    });
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
    
    // PHASE 2: Trigger website generation if customer is ready
    if (nextState === 'ready_to_build' && customer.business_name && customer.services) {
      console.log(`🚀 Customer ready for website generation: ${customer.business_name}`);
      
      // Update state to building (optimistic)
      await pool.query(
        'UPDATE customers SET conversation_state = $1, status = $2, updated_at = NOW() WHERE id = $3',
        ['site_building', 'building', customer.id]
      );
      
      // Trigger website generation asynchronously
      setImmediate(async () => {
        try {
          const result = await generateWebsiteForCustomer(customer.id);
          console.log(`✅ Website built successfully: ${result.siteUrl}`);
          
          // Send success message to customer
          const twiml = new twilio.twiml.MessagingResponse();
          const successMessage = `🎉 Done! Your website is ready at: ${result.siteUrl} - check it out and let me know what you think!`;
          
          await twilioClient.messages.create({
            from: process.env.TWILIO_PHONE_NUMBER || '+14158436766',
            to: from,
            body: successMessage
          });
          
          // Log the success message
          await pool.query(
            'INSERT INTO messages (phone, direction, body, created_at) VALUES ($1, $2, $3, NOW())', 
            [from, 'outbound', successMessage]
          );
          
        } catch (buildError) {
          console.error(`❌ Website generation failed for ${customer.business_name}:`, buildError);
          
          // Send failure message to customer
          const failMessage = "Oops! Hit a snag building your site. Give me a few minutes to fix this and I'll try again!";
          
          await twilioClient.messages.create({
            from: process.env.TWILIO_PHONE_NUMBER || '+14158436766',
            to: from,
            body: failMessage
          });
          
          // Log the fail message
          await pool.query(
            'INSERT INTO messages (phone, direction, body, created_at) VALUES ($1, $2, $3, NOW())', 
            [from, 'outbound', failMessage]
          );
        }
      });
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
