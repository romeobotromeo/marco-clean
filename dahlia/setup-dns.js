/**
 * One-time DNS + Worker setup for 5142dahlia.textmarco.com
 * Run via: GET /admin/dahlia-worker
 */

const axios = require('axios');

const SUBDOMAIN   = '5142dahlia';
const TARGET      = 'marco-clean.onrender.com';
const ZONE_DOMAIN = 'textmarco.com';
const WORKER_NAME = 'dahlia-proxy';
const ZONE_ID     = 'ccba72e0ea529a52dbb962e63dda35b0';
const ACCOUNT_ID  = 'c721c342753e40e0a93122e2fe1da628';

const WORKER_SCRIPT = `
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = 'https://marco-clean.onrender.com/dahlia' + url.pathname + url.search;

    const init = {
      method: request.method,
      headers: request.headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const response = await fetch(target, init);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location') || '';
      const fixed = location
        .replace(/^https?:\\/\\/marco-clean\\.onrender\\.com\\/dahlia/, 'https://${SUBDOMAIN}.textmarco.com')
        .replace(/^https?:\\/\\/marco-clean\\.onrender\\.com/, 'https://${SUBDOMAIN}.textmarco.com');
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
  const workerToken = process.env.CLOUDFLARE_WORKERS_TOKEN || token;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN not set');

  const headers = { Authorization: `Bearer ${token}` };

  // 1. Ensure proxied A record (Worker placeholder)
  const dnsRes = await axios.get(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?name=${SUBDOMAIN}.${ZONE_DOMAIN}`,
    { headers }
  );
  const existing = (dnsRes.data.result || [])[0];

  if (existing) {
    await axios.put(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${existing.id}`,
      { type: 'A', name: SUBDOMAIN, content: '192.0.2.1', proxied: true, ttl: 1, comment: 'Worker placeholder' },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  } else {
    await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`,
      { type: 'A', name: SUBDOMAIN, content: '192.0.2.1', proxied: true, ttl: 1, comment: 'Worker placeholder' },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
  console.log('[DAHLIA] DNS set to proxied A record');

  // 2. Upload Worker
  const wHeaders = { Authorization: `Bearer ${workerToken}` };
  const FormData = require('form-data');
  const formData = new FormData();
  formData.append('metadata', JSON.stringify({ main_module: 'worker.js', compatibility_date: '2024-01-01' }), { contentType: 'application/json', filename: 'blob' });
  formData.append('worker.js', Buffer.from(WORKER_SCRIPT), { contentType: 'application/javascript+module', filename: 'worker.js' });

  const uploadRes = await axios.put(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`,
    formData,
    { headers: { ...wHeaders, ...formData.getHeaders() } }
  );
  if (!uploadRes.data.success) throw new Error('Worker upload failed: ' + JSON.stringify(uploadRes.data.errors));
  console.log(`[DAHLIA] Worker uploaded: ${WORKER_NAME}`);

  // 3. Add Worker route
  const routePattern = `${SUBDOMAIN}.${ZONE_DOMAIN}/*`;
  const routesRes = await axios.get(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes`,
    { headers }
  );
  const existingRoute = (routesRes.data.result || []).find(r => r.pattern === routePattern);

  if (existingRoute) {
    await axios.put(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes/${existingRoute.id}`,
      { pattern: routePattern, script: WORKER_NAME },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  } else {
    await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes`,
      { pattern: routePattern, script: WORKER_NAME },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
  console.log(`[DAHLIA] Worker route set: ${routePattern}`);

  return { status: 'ok', url: `https://${SUBDOMAIN}.${ZONE_DOMAIN}`, worker: WORKER_NAME };
}

module.exports = { run };

if (require.main === module) {
  run().then(r => console.log(r)).catch(err => {
    console.error('Error:', err.response?.data || err.message);
    process.exit(1);
  });
}
