/**
 * One-time DNS setup for 4175palmero.textmarco.com
 * Creates a proxied CNAME record pointing to marco-clean.onrender.com
 *
 * Run once: node palmero/setup-dns.js
 */

const axios = require('axios');

const SUBDOMAIN   = '4175palmero';
const TARGET      = 'marco-clean.onrender.com';
const ZONE_DOMAIN = 'textmarco.com';

async function run() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN not set');

  console.log(`[PALMERO DNS] Setting up: ${SUBDOMAIN}.${ZONE_DOMAIN} → ${TARGET}`);

  // Get zone ID
  const zoneRes = await axios.get(
    `https://api.cloudflare.com/client/v4/zones?name=${ZONE_DOMAIN}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const zone = zoneRes.data.result?.[0];
  if (!zone) throw new Error(`Zone not found for ${ZONE_DOMAIN}`);
  const zoneId = zone.id;

  // Check if record already exists
  const existing = await axios.get(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${SUBDOMAIN}.${ZONE_DOMAIN}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if ((existing.data.result || []).length > 0) {
    const r = existing.data.result[0];
    console.log(`[PALMERO DNS] Record already exists: ${r.type} → ${r.content}`);
    return { status: 'exists', record: r };
  }

  // Create CNAME
  const res = await axios.post(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    { type: 'CNAME', name: SUBDOMAIN, content: TARGET, proxied: true, ttl: 1 },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (!res.data.success) throw new Error(JSON.stringify(res.data.errors));
  console.log(`[PALMERO DNS] Created: ${SUBDOMAIN}.${ZONE_DOMAIN} → ${TARGET} (proxied)`);
  return { status: 'created', url: `https://${SUBDOMAIN}.${ZONE_DOMAIN}` };
}

module.exports = { run };

// CLI entry point
if (require.main === module) {
  run().then(r => console.log(r)).catch(err => {
    console.error('Error:', err.response?.data || err.message);
    process.exit(1);
  });
}
