// Template Engine Test Script - Phase 2
// Tests template generation locally before integration

const TemplateEngine = require('./templates/template-engine');
const fs = require('fs');
const path = require('path');

// Test data for different business types
const testBusinesses = [
  {
    businessName: "Mike's Plumbing Co",
    services: ['plumbing repairs', 'drain cleaning', 'water heaters'],
    businessPhone: '(555) 123-4567',
    template: null // Let engine auto-select
  },
  {
    businessName: "Joe's Handyman Service", 
    services: ['home repairs', 'odd jobs', 'maintenance'],
    businessPhone: '(555) 987-6543',
    template: null
  },
  {
    businessName: "Green Thumb Landscaping",
    services: ['landscaping', 'lawn care', 'garden design'],
    businessPhone: '(555) 456-7890', 
    template: null
  },
  {
    businessName: "Pro Consulting LLC",
    services: ['business consulting', 'strategy'],
    businessPhone: '(555) 111-2222',
    template: null
  }
];

async function testTemplateEngine() {
  console.log('🧪 Testing Template Engine - Phase 2');
  console.log('=====================================\\n');
  
  const engine = new TemplateEngine();
  
  // Create test output directory
  const testDir = path.join(__dirname, 'test-output');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
    console.log('📁 Created test-output directory');
  }
  
  // Test each business type
  for (const business of testBusinesses) {
    console.log(`🏢 Testing: ${business.businessName}`);
    
    try {
      // Generate the website HTML
      const html = engine.generateSiteHTML(business);
      
      // Create filename from business name
      const filename = engine.generateSubdomain(business.businessName) + '.html';
      const filepath = path.join(testDir, filename);
      
      // Write to file
      fs.writeFileSync(filepath, html);
      
      console.log(`  ✅ Generated: ${filename}`);
      console.log(`  📄 Size: ${(html.length / 1024).toFixed(1)}KB`);
      console.log(`  🔗 File: ${filepath}`);
      
      // Test subdomain generation
      const subdomain = engine.generateSubdomain(business.businessName);
      console.log(`  🌐 Subdomain: ${subdomain}.textmarco.com`);
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    console.log(''); // Empty line for readability
  }
  
  console.log('🎯 Template Engine Test Summary:');
  console.log(`  Templates loaded: ${engine.templates.size}`);
  console.log(`  Businesses tested: ${testBusinesses.length}`);
  console.log(`  Output directory: ${testDir}`);
  console.log('\\n✅ Template engine test completed!');
  console.log('\\n💡 Next: Open the HTML files in your browser to verify the websites look good');
}

// Run the test
testTemplateEngine().catch(console.error);