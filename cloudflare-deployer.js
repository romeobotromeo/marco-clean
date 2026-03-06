// Cloudflare Pages Direct Upload Deployer
// Deploys single-page HTML sites to subdomain.textmarco.com

const axios = require('axios');
const crypto = require('crypto');

class CloudflareDeployer {
  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}`;

    if (!this.accountId || !this.apiToken) {
      console.warn('Cloudflare credentials not configured - deployment will be simulated');
      this.simulateMode = true;
    } else {
      this.simulateMode = false;
      console.log('Cloudflare deployer initialized');
    }
  }

  async deployWebsite(subdomain, htmlContent, businessName) {
    console.log(`Deploying: ${subdomain}.textmarco.com`);

    try {
      if (this.simulateMode) {
        return this.simulateDeployment(subdomain, htmlContent);
      }

      // Step 1: Ensure project exists
      await this.ensureProject(subdomain);

      // Step 2: Get upload token
      const uploadToken = await this.getUploadToken(subdomain);

      // Step 3: Hash the file and upload it
      const fileHash = crypto.createHash('md5')
        .update(Buffer.from(htmlContent))
        .digest('hex');

      await this.uploadFiles(uploadToken, htmlContent, fileHash);

      // Step 4: Create deployment with manifest
      const deployment = await this.createDeployment(subdomain, fileHash);

      // Step 5: Add custom domain (idempotent — safe to call multiple times)
      await this.addCustomDomain(subdomain);

      const url = `https://${subdomain}.textmarco.com`;
      console.log(`Deployment successful: ${url}`);

      return {
        success: true,
        url,
        deployId: deployment.id,
        subdomain,
        method: 'cloudflare'
      };

    } catch (error) {
      const errorDetail = error.response?.data || error.message;
      console.error(`Deployment failed for ${subdomain}:`, JSON.stringify(errorDetail));

      return {
        success: false,
        error: typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail,
        subdomain,
        method: 'cloudflare'
      };
    }
  }

  async ensureProject(subdomain) {
    try {
      await axios.get(
        `${this.baseUrl}/pages/projects/${subdomain}`,
        { headers: { 'Authorization': `Bearer ${this.apiToken}` } }
      );
      console.log(`Using existing project: ${subdomain}`);
    } catch (error) {
      if (error.response?.status === 404) {
        // Create new project
        await axios.post(
          `${this.baseUrl}/pages/projects`,
          {
            name: subdomain,
            production_branch: 'main'
          },
          { headers: { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' } }
        );
        console.log(`Created new project: ${subdomain}`);
      } else {
        throw error;
      }
    }
  }

  async getUploadToken(subdomain) {
    const resp = await axios.get(
      `${this.baseUrl}/pages/projects/${subdomain}/upload-token`,
      { headers: { 'Authorization': `Bearer ${this.apiToken}` } }
    );
    return resp.data.result.jwt;
  }

  async uploadFiles(uploadToken, htmlContent, fileHash) {
    const fileBase64 = Buffer.from(htmlContent).toString('base64');

    await axios.post(
      `https://api.cloudflare.com/client/v4/pages/assets/upload?base64=true`,
      [
        {
          key: fileHash,
          value: fileBase64,
          metadata: { contentType: 'text/html' },
          base64: true
        }
      ],
      {
        headers: {
          'Authorization': `Bearer ${uploadToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`File uploaded: hash=${fileHash}`);
  }

  async createDeployment(subdomain, fileHash) {
    // Manifest maps URL paths to file hashes
    const manifest = JSON.stringify({
      '/index.html': fileHash
    });

    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('manifest', manifest);

    const resp = await axios.post(
      `${this.baseUrl}/pages/projects/${subdomain}/deployments`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          ...formData.getHeaders()
        }
      }
    );

    console.log(`Deployment created: ${resp.data.result.id}`);
    return resp.data.result;
  }

  async getZoneId() {
    if (this._zoneId) return this._zoneId;
    const resp = await axios.get(
      'https://api.cloudflare.com/client/v4/zones?name=textmarco.com',
      { headers: { 'Authorization': `Bearer ${this.apiToken}` } }
    );
    this._zoneId = resp.data.result[0]?.id;
    return this._zoneId;
  }

  async addCustomDomain(subdomain) {
    const domain = `${subdomain}.textmarco.com`;

    // Step A: Add domain to Pages project
    try {
      await axios.post(
        `${this.baseUrl}/pages/projects/${subdomain}/domains`,
        { name: domain },
        { headers: { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' } }
      );
      console.log(`Custom domain added to Pages project: ${domain}`);
    } catch (error) {
      if (error.response?.status === 409) {
        console.log(`Custom domain already on Pages project: ${domain}`);
      } else {
        console.error(`Failed to add domain to Pages project:`, error.response?.data || error.message);
      }
    }

    // Step B: Create CNAME DNS record in textmarco.com zone
    try {
      const zoneId = await this.getZoneId();
      if (!zoneId) { console.error('Could not find textmarco.com zone'); return; }

      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
        {
          type: 'CNAME',
          name: subdomain,
          content: `${subdomain}.pages.dev`,
          proxied: true
        },
        { headers: { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' } }
      );
      console.log(`DNS CNAME created: ${domain} → ${subdomain}.pages.dev`);
    } catch (error) {
      if (error.response?.status === 400 && JSON.stringify(error.response?.data).includes('already exists')) {
        console.log(`DNS record already exists: ${domain}`);
      } else {
        console.error(`Failed to create DNS record:`, error.response?.data || error.message);
      }
    }
  }

  async simulateDeployment(subdomain, htmlContent) {
    console.log(`Simulating deployment for: ${subdomain}`);
    return {
      success: true,
      url: `https://${subdomain}.textmarco.com`,
      deployId: `sim-${Date.now()}`,
      subdomain,
      method: 'simulation'
    };
  }

  async listProjects() {
    if (this.simulateMode) return [];
    const response = await axios.get(
      `${this.baseUrl}/pages/projects`,
      { headers: { 'Authorization': `Bearer ${this.apiToken}` } }
    );
    return response.data.result;
  }

  async deleteProject(projectName) {
    if (this.simulateMode) return { success: true };
    await axios.delete(
      `${this.baseUrl}/pages/projects/${projectName}`,
      { headers: { 'Authorization': `Bearer ${this.apiToken}` } }
    );
    console.log(`Deleted project: ${projectName}`);
    return { success: true };
  }
}

module.exports = CloudflareDeployer;
