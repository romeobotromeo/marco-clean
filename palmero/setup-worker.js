/**
 * Deploys a Cloudflare Worker that proxies 4175palmero.textmarco.com
 * to marco-clean.onrender.com/palmero/*
 *
 * Cloudflare Error 1000 occurs because Render uses Cloudflare's network,
 * so a CNAME to *.onrender.com is prohibited. A Worker bypasses this.
 *
 * Run via: GET /admin/palmero-worker
 */

const axios = require('axios');

const SUBDOMAIN   = '4175palmero';
const ZONE_DOMAIN = 'textmarco.com';
const WORKER_NAME = 'palmero-proxy';
const TARGET_ORIGIN = 'https://marco-clean.onrender.com';

// Worker script: rewrites path and fixes redirect Location headers
const WORKER_SCRIPT = `
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetPath = '/palmero' + url.pathname;
    const target = '${TARGET_ORIGIN}' + targetPath + url.search;

    const init = {
      method: request.method,
      headers: request.headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const response = await fetch(target, init);

    // Rewrite Location headers so redirects stay on the right domain
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location') || '';
      let fixed = location
        .replace(/^https?:\\/\\/marco-clean\\.onrender\\.com\\/palmero/, 'https://${SUBDOMAIN}.${ZONE_DOMAIN}')
        .replace(/^https?:\\/\\/marco-clean\\.onrender\\.com/, 'https://${SUBDOMAIN}.${ZONE_DOMAIN}');
      const newHeaders = new Headers(response.headers);
      if (fixed) newHeaders.set('Location', fixed);
      return new Response(response.body, { status: response.status, headers: newHeaders });
    }

    return response;
  }
};
`.trim();

async function run() {
  const token     = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token)     throw new Error('CLOUDFLARE_API_TOKEN not set');
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID not set');

  const headers = { Authorization: `Bearer ${token}` };

  // 1. Get zone ID
  const zoneRes = await axios.get(
    `https://api.cloudflare.com/client/v4/zones?name=${ZONE_DOMAIN}`,
    { headers }
  );
  const zone = zoneRes.data.result?.[0];
  if (!zone) throw new Error(`Zone not found for ${ZONE_DOMAIN}`);
  const zoneId = zone.id;

  // 2. Ensure a proxied DNS record exists (Workers need one — actual IP never used)
  const dnsRes = await axios.get(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${SUBDOMAIN}.${ZONE_DOMAIN}`,
    { headers }
  );
  const existing = (dnsRes.data.result || [])[0];

  if (existing) {
    // Update to proxied A record (placeholder IP, never contacted — Worker intercepts)
    await axios.put(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existing.id}`,
      { type: 'A', name: SUBDOMAIN, content: '192.0.2.1', proxied: true, ttl: 1, comment: 'Worker placeholder' },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    console.log('[PALMERO] DNS updated to proxied A record (Worker placeholder)');
  } else {
    await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      { type: 'A', name: SUBDOMAIN, content: '192.0.2.1', proxied: true, ttl: 1, comment: 'Worker placeholder' },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    console.log('[PALMERO] DNS created proxied A record (Worker placeholder)');
  }

  // 3. Upload Worker script (ES module format)
  const formData = new (require('form-data'))();
  formData.append('metadata', JSON.stringify({ main_module: 'worker.js', compatibility_date: '2024-01-01' }), { contentType: 'application/json', filename: 'blob' });
  formData.append('worker.js', Buffer.from(WORKER_SCRIPT), { contentType: 'application/javascript+module', filename: 'worker.js' });

  const uploadRes = await axios.put(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${WORKER_NAME}`,
    formData,
    { headers: { ...headers, ...formData.getHeaders() } }
  );
  if (!uploadRes.data.success) throw new Error('Worker upload failed: ' + JSON.stringify(uploadRes.data.errors));
  console.log(`[PALMERO] Worker uploaded: ${WORKER_NAME}`);

  // 4. Add Worker route (replace any existing)
  const routePattern = `${SUBDOMAIN}.${ZONE_DOMAIN}/*`;
  const routesRes = await axios.get(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
    { headers }
  );
  const existingRoute = (routesRes.data.result || []).find(r => r.pattern === routePattern);

  if (existingRoute) {
    await axios.put(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes/${existingRoute.id}`,
      { pattern: routePattern, script: WORKER_NAME },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    console.log(`[PALMERO] Worker route updated: ${routePattern}`);
  } else {
    await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
      { pattern: routePattern, script: WORKER_NAME },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    console.log(`[PALMERO] Worker route created: ${routePattern}`);
  }

  return { status: 'ok', url: `https://${SUBDOMAIN}.${ZONE_DOMAIN}`, worker: WORKER_NAME };
}

module.exports = { run };

if (require.main === module) {
  run().then(r => console.log(r)).catch(err => {
    console.error('Error:', err.response?.data || err.message);
    process.exit(1);
  });
}
