// Deployment System Test Script - Phase 3
// Tests the complete deployment pipeline locally

const CloudflareDeployer = require('./deployment/cloudflare-deployer');
const TemplateEngine = require('./templates/template-engine');

async function testDeploymentPipeline() {
  console.log('🚀 Testing Deployment Pipeline - Phase 3');
  console.log('=========================================\\n');
  
  try {
    // Initialize components
    const deployer = new CloudflareDeployer();
    const templateEngine = new TemplateEngine();
    
    // Test business
    const testBusiness = {
      businessName: "Marco Test Plumbing Co",
      services: ['emergency repairs', 'drain cleaning', 'water heater installation'],
      businessPhone: '(555) MARCO-01'
    };
    
    console.log('🏢 Test Business:', testBusiness);
    
    // Step 1: Generate subdomain
    const subdomain = templateEngine.generateSubdomain(testBusiness.businessName);
    console.log(`🌐 Generated subdomain: ${subdomain}.textmarco.com`);
    
    // Step 2: Generate website HTML
    console.log('\\n🎨 Generating website HTML...');
    const html = templateEngine.generateSiteHTML(testBusiness);
    console.log(`📄 HTML generated: ${(html.length / 1024).toFixed(1)}KB`);
    
    // Step 3: Test deployment
    console.log('\\n☁️ Testing deployment...');
    const deploymentResult = await deployer.deployWebsite(
      subdomain, 
      html, 
      testBusiness.businessName
    );
    
    console.log('\\n📊 Deployment Result:');
    console.log('======================');
    console.log(`Success: ${deploymentResult.success}`);
    console.log(`URL: ${deploymentResult.url}`);
    console.log(`Subdomain: ${deploymentResult.subdomain}`);
    console.log(`Deploy ID: ${deploymentResult.deployId}`);
    console.log(`Method: ${deploymentResult.method}`);
    
    if (deploymentResult.localPath) {
      console.log(`Local Path: ${deploymentResult.localPath}`);
    }
    
    if (deploymentResult.error) {
      console.log(`Error: ${deploymentResult.error}`);
    }
    
    // Step 4: Test status check (if deployment was successful)
    if (deploymentResult.success && !deployer.simulateMode) {
      console.log('\\n🔍 Testing deployment status...');
      try {
        const status = await deployer.getDeploymentStatus(subdomain, deploymentResult.deployId);
        console.log('Status:', status.status);
        console.log('Stage:', status.stage);
      } catch (error) {
        console.warn('Status check failed:', error.message);
      }
    }
    
    console.log('\\n✅ Deployment pipeline test completed!');
    
    if (deployer.simulateMode) {
      console.log('\\n💡 Note: Running in simulation mode');
      console.log('   Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars for real deployment');
    }
    
    return deploymentResult;
    
  } catch (error) {
    console.error('\\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testDeploymentPipeline()
    .then(result => {
      console.log('\\n🎉 Test successful!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\\n💥 Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testDeploymentPipeline;