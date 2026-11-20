const crypto = require('crypto');
const BUCKET = 'angus-click-tracking';
const CAMPAIGN = 'angus-open-house-2026-11';
const DESTINATION = 'https://www.redfin.com/CA/Los-Angeles/2961-Angus-St-90039/home/7063996';
const BASE = 'https://marco-clean.onrender.com';
const BRANDED_BASE = 'https://go.jwgre.com';
const VALID_TOKEN = /^(?:[a-f0-9]{32}|[a-f0-9]{10})$/;
const MODES = new Set(['live', 'test', 'qa']);
function classifyRequest(ua, headers = {}) {
  const purpose = `${headers.purpose || ''} ${headers['sec-purpose'] || ''}`;
  if (/prefetch|preview/i.test(purpose) || /bot|crawler|spider|preview|facebookexternalhit|facebot|slack|discord|telegram|whatsapp|linkpresentation|google-inspection|urlscan|proofpoint|safelinks/i.test(ua)) return 'preview';
  if (/Mozilla\/|AppleWebKit\/|Chrome\/|Safari\/|Firefox\//i.test(ua)) return 'browser';
  return 'unknown';
}
function summarize(eventNames, sentNames) {
  const sent = new Set(sentNames.filter(n => /^[a-f0-9]{64}\.json$/.test(n)).map(n => n.slice(0, 64)));
  const any = new Set(), browser = new Set();
  let browserRequests = 0, suspectedPreviewRequests = 0, unknownRequests = 0;
  for (const name of eventNames) {
    const m = name.match(/^([a-f0-9]{64})_(browser|preview|unknown)_/);
    if (!m || !sent.has(m[1])) continue;
    any.add(m[1]);
    if (m[2] === 'browser') { browser.add(m[1]); browserRequests++; }
    else if (m[2] === 'preview') suspectedPreviewRequests++;
    else unknownRequests++;
  }
  return { recipientsSentTrackedLinks: sent.size, uniqueRecipientsWithBrowserClicks: browser.size,
    uniqueRecipientsWithAnyLinkRequest: any.size, browserClickRequests: browserRequests,
    suspectedPreviewRequests, unknownRequests,
    browserClickRate: sent.size ? browser.size / sent.size : null,
    limitation: 'Browser clicks are an estimate, not verified humans. Previews can resemble browsers; forwarded links remain attributed to the original recipient. Rate uses sent recipients, not confirmed deliveries.' };
}
function installCampaignClickTracking(app, { supabase, requireAdmin, secret }) {
  const storage = () => { if (!supabase || !secret) throw Error('Tracking not configured'); return supabase.storage.from(BUCKET); };
  async function readLink(token) {
    const r = await storage().download(`links/${token}.json`);
    if (r.error) { if (['404', '400'].includes(String(r.error.statusCode)) && /not found|does not exist/i.test(r.error.message || '')) return null; throw Error('Tracking lookup unavailable'); }
    return JSON.parse(await r.data.text());
  }
  async function list(prefix) {
    const names = [];
    for (let offset = 0; ; offset += 1000) {
      const r = await storage().list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (r.error) throw Error('Tracking report unavailable');
      names.push(...r.data.filter(x => x.id).map(x => x.name));
      if (r.data.length < 1000) return names;
    }
  }
  app.post('/admin/campaigns/angus/links', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { to, mode, branded = true } = req.body || {};
    if (!/^\+1\d{10}$/.test(to || '') || !MODES.has(mode) || typeof branded !== 'boolean') return res.status(400).json({ error: 'Valid recipient and explicit live/test/qa mode required' });
    try {
      const recipientKey = crypto.createHash('sha256').update(`${CAMPAIGN}:${to}`).digest('hex');
      const token = crypto.createHmac('sha256', secret).update(`${CAMPAIGN}:${mode}:${to}`).digest('hex').slice(0, branded ? 10 : 32);
      const link = { campaign: CAMPAIGN, mode, recipientKey, createdAt: new Date().toISOString() };
      const r = await storage().upload(`links/${token}.json`, Buffer.from(JSON.stringify(link)), { contentType: 'application/json', upsert: false });
      if (r.error && !['409', '400'].includes(String(r.error.statusCode))) throw Error('Link registration failed');
      if (r.error) { const existing = await readLink(token); if (!existing || existing.recipientKey !== recipientKey || existing.mode !== mode) throw Error('Link registration conflict'); }
      res.json({ campaign: CAMPAIGN, mode, token, url: branded ? `${BRANDED_BASE}/angus/${token}` : `${BASE}/a/${token}` });
    } catch { res.status(503).json({ error: 'Link registration unavailable' }); }
  });
  app.post('/admin/campaigns/angus/links/:token/sent', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!VALID_TOKEN.test(req.params.token) || !/^[MS]M[a-f0-9]{32}$/.test(req.body?.messageSid || '')) return res.status(400).json({ error: 'Valid token and Twilio message SID required' });
    try {
      const link = await readLink(req.params.token);
      if (!link || !MODES.has(link.mode)) return res.status(404).json({ error: 'Unknown link' });
      const r = await storage().upload(`sent/${link.mode}/${link.recipientKey}.json`, Buffer.from(JSON.stringify({ ...link, messageSid: req.body.messageSid, sentAt: new Date().toISOString() })), { contentType: 'application/json', upsert: true });
      if (r.error) throw Error('Send registration unavailable');
      res.json({ success: true });
    } catch { res.status(503).json({ error: 'Send registration unavailable' }); }
  });
  const redirectToListing = async (req, res) => {
    res.set('Cache-Control', 'no-store, private'); res.set('Referrer-Policy', 'no-referrer');
    if (!VALID_TOKEN.test(req.params.token)) return res.status(404).send('Link not found');
    try {
      const link = await readLink(req.params.token);
      if (!link || link.campaign !== CAMPAIGN || !MODES.has(link.mode)) return res.status(404).send('Link not found');
      if (req.method !== 'HEAD') {
        const kind = classifyRequest(String(req.get('user-agent') || ''), req.headers);
        const now = Date.now();
        const event = { campaign: CAMPAIGN, mode: link.mode, recipientKey: link.recipientKey, kind, at: new Date(now).toISOString() };
        const result = await storage().upload(`events/${link.mode}/${link.recipientKey}_${kind}_${now}_${crypto.randomUUID()}.json`, Buffer.from(JSON.stringify(event)), { contentType: 'application/json', upsert: false });
        if (result.error) console.error('[AngusTracking] click log unavailable');
      }
      return res.redirect(302, DESTINATION);
    } catch { return res.status(503).send('This listing link is temporarily unavailable. Please try again shortly.'); }
  };
  app.get('/a/:token', redirectToListing);
  app.get('/angus/:token', redirectToListing);
  app.get('/admin/campaigns/angus/clicks', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const mode = req.query.mode || 'live';
    if (!MODES.has(mode)) return res.status(400).json({ error: 'Invalid mode' });
    try {
      const [events, sent] = await Promise.all([list(`events/${mode}`), list(`sent/${mode}`)]);
      res.set('Cache-Control', 'no-store');
      res.json({ campaign: CAMPAIGN, mode, checkedAt: new Date().toISOString(), ...summarize(events, sent) });
    } catch { res.status(503).json({ error: 'Tracking report unavailable; counts are not zero' }); }
  });
}
module.exports = { installCampaignClickTracking, classifyRequest, summarize };
