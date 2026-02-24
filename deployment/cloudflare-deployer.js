// MARCO CLEAN Cloudflare Pages Deployment System - Phase 3
// Deploys generated websites to live URLs via Cloudflare Pages API

const axios = require('axios');
const FormData = require('form-data');

class CloudflareDeployer {
  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}`;
    
    if (!this.accountId || !this.apiToken) {
      console.warn('⚠️  Cloudflare credentials not configured - deployment will be simulated');
      this.simulateMode = true;
    } else {
      this.simulateMode = false;
      console.log('☁️  Cloudflare deployer initialized');
    }
  }

  // Deploy a website to Cloudflare Pages
  async deployWebsite(subdomain, htmlContent, businessName) {
    console.log(`🚀 Starting deployment: ${subdomain}.textmarco.com`);
    
    try {
      if (this.simulateMode) {
        return this.simulateDeployment(subdomain, htmlContent, businessName);
      }
      
      // Real Cloudflare Pages deployment
      const deploymentResult = await this.createPagesProject(subdomain, htmlContent, businessName);
      
      console.log(`✅ Deployment successful: https://${subdomain}.textmarco.com`);
      
      return {
        success: true,
        url: `https://${subdomain}.textmarco.com`,
        deployId: deploymentResult.id,
        subdomain: subdomain,
        method: 'cloudflare'
      };
      
    } catch (error) {
      console.error(`❌ Deployment failed for ${subdomain}:`, error.message);
      
      return {
        success: false,
        error: error.message,
        subdomain: subdomain,
        method: 'cloudflare'
      };
    }
  }

  // Create Cloudflare Pages project and deploy
  async createPagesProject(subdomain, htmlContent, businessName) {
    // Step 1: Create or update Pages project
    const projectData = {
      name: subdomain,
      subdomain: subdomain,
      domains: [`${subdomain}.textmarco.com`],
      source: {
        type: 'direct_upload'
      },
      deployment_configs: {
        production: {
          build_command: '',
          destination_dir: '/',
          root_dir: '/',
          web_analytics_tag: null,
          web_analytics_token: null
        }
      }
    };

    // Check if project exists
    let project;
    try {
      const existingProject = await axios.get(
        `${this.baseUrl}/pages/projects/${subdomain}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      project = existingProject.data.result;
      console.log(`📦 Using existing project: ${subdomain}`);
    } catch (error) {
      // Project doesn't exist, create it
      if (error.response?.status === 404) {
        const newProject = await axios.post(
          `${this.baseUrl}/pages/projects`,
          projectData,
          {
            headers: {
              'Authorization': `Bearer ${this.apiToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        project = newProject.data.result;
        console.log(`📦 Created new project: ${subdomain}`);
      } else {
        throw error;
      }
    }

    // Step 2: Upload files and create deployment
    const formData = new FormData();
    
    // Create the file structure
    const files = {
      'index.html': htmlContent
    };
    
    // Add files to form data
    Object.entries(files).forEach(([filename, content]) => {
      formData.append('files', content, {
        filename: filename,
        contentType: 'text/html'
      });
    });
    
    // Add manifest
    const manifest = {
      '/': { 
        file: 'index.html',
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      }
    };
    
    formData.append('manifest', JSON.stringify(manifest));

    // Create deployment
    const deployment = await axios.post(
      `${this.baseUrl}/pages/projects/${project.name}/deployments`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          ...formData.getHeaders()
        }
      }
    );

    console.log(`🌐 Deployment created: ${deployment.data.result.id}`);
    
    return {
      id: deployment.data.result.id,
      url: deployment.data.result.url,
      project: project
    };
  }

  // Simulate deployment for testing/development
  async simulateDeployment(subdomain, htmlContent, businessName) {
    console.log(`🎭 Simulating deployment for: ${subdomain}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Save to local file system for testing
    const fs = require('fs');
    const path = require('path');
    
    const deployDir = path.join(__dirname, '../deployed-sites');
    if (!fs.existsSync(deployDir)) {
      fs.mkdirSync(deployDir, { recursive: true });
    }
    
    const filePath = path.join(deployDir, `${subdomain}.html`);
    fs.writeFileSync(filePath, htmlContent);
    
    console.log(`📁 Simulated deployment saved: ${filePath}`);
    
    return {
      success: true,
      url: `https://${subdomain}.textmarco.com`, // Simulated URL
      deployId: `sim-${Date.now()}`,
      subdomain: subdomain,
      method: 'simulation',
      localPath: filePath
    };
  }

  // Get deployment status
  async getDeploymentStatus(projectName, deploymentId) {
    if (this.simulateMode) {
      return {
        status: 'success',
        stage: 'deploy',
        deployment_trigger: {
          metadata: {
            branch: 'main',
            commit_hash: 'simulated'
          }
        }
      };
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/pages/projects/${projectName}/deployments/${deploymentId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.result;
    } catch (error) {
      console.error('Failed to get deployment status:', error.message);
      throw error;
    }
  }

  // List all projects (for debugging)
  async listProjects() {
    if (this.simulateMode) {
      console.log('🎭 Simulation mode - no real projects to list');
      return [];
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/pages/projects`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.result;
    } catch (error) {
      console.error('Failed to list projects:', error.message);
      throw error;
    }
  }

  // Delete a project (for cleanup)
  async deleteProject(projectName) {
    if (this.simulateMode) {
      console.log(`🎭 Would delete project: ${projectName}`);
      return { success: true };
    }

    try {
      await axios.delete(
        `${this.baseUrl}/pages/projects/${projectName}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`🗑️  Deleted project: ${projectName}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to delete project ${projectName}:`, error.message);
      throw error;
    }
  }
}

module.exports = CloudflareDeployer;