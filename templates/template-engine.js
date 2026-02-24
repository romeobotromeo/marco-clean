// MARCO CLEAN Template Engine - Phase 2
// Professional website generation with dynamic content substitution

const fs = require('fs');
const path = require('path');

class TemplateEngine {
  constructor() {
    this.templates = new Map();
    this.loadTemplates();
  }

  // Load all available templates
  loadTemplates() {
    console.log('🎨 Loading website templates...');
    
    // Template definitions - based on our marco-site examples
    this.templates.set('handyman', {
      name: 'Joe\'s Handyman Style',
      description: 'Clean, professional handyman/repair service template',
      color: '#f59e0b',
      emoji: '🔧',
      keywords: ['handyman', 'repair', 'fix', 'maintenance', 'odd job', 'home repair']
    });
    
    this.templates.set('plumbing', {
      name: 'Northwestern Plumbing Style', 
      description: 'Established, professional plumbing service template',
      color: '#1e56a0',
      emoji: '🔧',
      keywords: ['plumb', 'pipe', 'leak', 'drain', 'water', 'toilet', 'faucet']
    });
    
    this.templates.set('landscaping', {
      name: 'Green Thumb Gardens Style',
      description: 'Natural, organic landscaping and garden template', 
      color: '#00a67e',
      emoji: '🌱',
      keywords: ['landscap', 'lawn', 'garden', 'yard', 'grass', 'tree', 'plant']
    });
    
    this.templates.set('cleaning', {
      name: 'Professional Cleaning Style',
      description: 'Clean, fresh professional cleaning service template',
      color: '#0ea5e9', 
      emoji: '✨',
      keywords: ['clean', 'janitor', 'housekeep', 'maid', 'office clean']
    });
    
    this.templates.set('general', {
      name: 'General Business Style',
      description: 'Versatile template for any professional service',
      color: '#6366f1',
      emoji: '💼',
      keywords: []
    });
    
    console.log(`✅ Loaded ${this.templates.size} templates`);
  }

  // Select best template based on business services
  selectTemplate(services) {
    if (!services || services.length === 0) {
      console.log('🎯 No services provided, using general template');
      return 'general';
    }
    
    const serviceText = services.join(' ').toLowerCase();
    console.log(`🎯 Analyzing services: "${serviceText}"`);
    
    // Score each template based on keyword matches
    let bestTemplate = 'general';
    let highestScore = 0;
    
    for (const [templateId, template] of this.templates) {
      let score = 0;
      
      for (const keyword of template.keywords) {
        if (serviceText.includes(keyword)) {
          score += 1;
        }
      }
      
      if (score > highestScore) {
        highestScore = score;
        bestTemplate = templateId;
      }
    }
    
    console.log(`🎯 Selected template: ${bestTemplate} (score: ${highestScore})`);
    return bestTemplate;
  }

  // Generate HTML for a business
  generateSiteHTML(config) {
    const template = config.template || this.selectTemplate(config.services);
    const templateInfo = this.templates.get(template);
    
    console.log(`🏗️  Generating ${template} website for: ${config.businessName}`);
    
    // Generate site based on template type
    switch (template) {
      case 'handyman':
        return this.generateHandymanSite(config, templateInfo);
      case 'plumbing':
        return this.generatePlumbingSite(config, templateInfo);
      case 'landscaping':
        return this.generateLandscapingSite(config, templateInfo);
      case 'cleaning':
        return this.generateCleaningSite(config, templateInfo);
      default:
        return this.generateGeneralSite(config, templateInfo);
    }
  }

  // Generate handyman template
  generateHandymanSite(config, templateInfo) {
    const servicesHtml = config.services 
      ? config.services.map(service => `<li>${this.capitalize(service)}</li>`).join('')
      : '<li>General Handyman Services</li>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.businessName} | Professional Handyman Services</title>
    <meta name="description" content="${config.businessName} - Professional handyman services. ${config.services ? config.services.join(', ') : 'Home repairs, maintenance, and odd jobs'}. Call ${config.businessPhone || 'us'} for a quote!">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        :root {
            --bg: #1a1510;
            --text: #ffffff;
            --accent: ${templateInfo.color};
            --muted: #a89080;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            min-height: 100vh;
        }
        
        .hero {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 40px 20px;
            background: linear-gradient(180deg, var(--bg) 0%, #0f0d08 100%);
        }
        
        .hero-emoji {
            font-size: 80px;
            margin-bottom: 20px;
        }
        
        h1 {
            font-size: clamp(36px, 8vw, 64px);
            font-weight: 800;
            margin-bottom: 15px;
            letter-spacing: -1px;
        }
        
        .tagline {
            font-size: clamp(18px, 4vw, 24px);
            color: var(--muted);
            margin-bottom: 20px;
            max-width: 500px;
        }
        
        .subline {
            font-size: 16px;
            color: var(--accent);
            margin-bottom: 40px;
        }
        
        .cta-button {
            display: inline-block;
            background: var(--accent);
            color: #000;
            padding: 20px 56px;
            font-size: 20px;
            font-weight: 700;
            text-decoration: none;
            border-radius: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-bottom: 60px;
        }
        
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 40px rgba(245, 158, 11, 0.3);
        }
        
        .services {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 30px;
            max-width: 600px;
            margin: 0 auto;
        }
        
        .services h2 {
            color: var(--accent);
            margin-bottom: 20px;
            font-size: 24px;
        }
        
        .services ul {
            list-style: none;
            display: grid;
            gap: 10px;
        }
        
        .services li {
            padding: 12px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 16px;
        }
        
        .services li:last-child {
            border-bottom: none;
        }
        
        .footer {
            margin-top: 60px;
            color: var(--muted);
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="hero">
        <div class="hero-emoji">${templateInfo.emoji}</div>
        <h1>${config.businessName}</h1>
        <div class="tagline">Professional handyman services you can trust</div>
        <div class="subline">${config.businessPhone ? `Call ${config.businessPhone}` : 'Call for a free quote!'}</div>
        
        ${config.businessPhone ? `<a href="tel:${config.businessPhone}" class="cta-button">Call Now</a>` : '<div class="cta-button">Get Started</div>'}
        
        <div class="services">
            <h2>Our Services</h2>
            <ul>
                ${servicesHtml}
            </ul>
        </div>
        
        <div class="footer">
            <p>Built with Marco • Text to website in minutes</p>
        </div>
    </div>
</body>
</html>`;
  }

  // Generate general business template
  generateGeneralSite(config, templateInfo) {
    const servicesHtml = config.services 
      ? config.services.map(service => `<li>${this.capitalize(service)}</li>`).join('')
      : '<li>Professional Services</li>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.businessName} | Professional Services</title>
    <meta name="description" content="${config.businessName} - ${config.services ? config.services.join(', ') : 'Professional services'}. Contact ${config.businessPhone || 'us'} today!">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        :root {
            --bg: #0f172a;
            --text: #ffffff;
            --accent: ${templateInfo.color};
            --muted: #94a3b8;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            min-height: 100vh;
        }
        
        .hero {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 40px 20px;
        }
        
        .hero-emoji {
            font-size: 80px;
            margin-bottom: 20px;
        }
        
        h1 {
            font-size: clamp(36px, 8vw, 64px);
            font-weight: 800;
            margin-bottom: 15px;
            letter-spacing: -1px;
        }
        
        .tagline {
            font-size: clamp(18px, 4vw, 24px);
            color: var(--muted);
            margin-bottom: 40px;
            max-width: 500px;
        }
        
        .cta-button {
            display: inline-block;
            background: var(--accent);
            color: #fff;
            padding: 20px 56px;
            font-size: 20px;
            font-weight: 700;
            text-decoration: none;
            border-radius: 8px;
            transition: transform 0.2s;
            margin-bottom: 60px;
        }
        
        .cta-button:hover {
            transform: translateY(-2px);
        }
        
        .services {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 30px;
            max-width: 600px;
            margin: 0 auto;
        }
        
        .services h2 {
            color: var(--accent);
            margin-bottom: 20px;
            font-size: 24px;
        }
        
        .services ul {
            list-style: none;
            display: grid;
            gap: 10px;
        }
        
        .services li {
            padding: 12px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .services li:last-child {
            border-bottom: none;
        }
        
        .footer {
            margin-top: 60px;
            color: var(--muted);
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="hero">
        <div class="hero-emoji">${templateInfo.emoji}</div>
        <h1>${config.businessName}</h1>
        <div class="tagline">Professional services you can trust</div>
        
        ${config.businessPhone ? `<a href="tel:${config.businessPhone}" class="cta-button">Call ${config.businessPhone}</a>` : '<div class="cta-button">Get Started</div>'}
        
        <div class="services">
            <h2>Our Services</h2>
            <ul>
                ${servicesHtml}
            </ul>
        </div>
        
        <div class="footer">
            <p>Built with Marco • Text to website in minutes</p>
        </div>
    </div>
</body>
</html>`;
  }

  // Other template generators (plumbing, landscaping, cleaning) would follow similar patterns
  generatePlumbingSite(config, templateInfo) {
    // For now, use general template with plumbing-specific styling
    return this.generateGeneralSite(config, templateInfo);
  }
  
  generateLandscapingSite(config, templateInfo) {
    return this.generateGeneralSite(config, templateInfo);
  }
  
  generateCleaningSite(config, templateInfo) {
    return this.generateGeneralSite(config, templateInfo);
  }

  // Helper function to capitalize first letter
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  
  // Generate a subdomain from business name
  generateSubdomain(businessName) {
    return businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .substring(0, 50) // Limit length
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }
}

module.exports = TemplateEngine;