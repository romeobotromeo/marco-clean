const crypto = require('crypto');
// Reserve durably BEFORE sending. Never release ambiguous/failed reservations:
// preventing reply loops takes priority over retrying an acknowledgment.
function createCampaignAckGate({supabase, campaign, reply}) {
 return async function claim(phone) {
  if (!supabase || !phone) return false;
  try {
   const prior = await supabase.from('messages').select('id')
    .eq('user_phone', phone).eq('direction', 'outbound')
    .eq('raw_payload->>campaign', campaign).eq('body', reply).limit(1);
   if (prior.error || !Array.isArray(prior.data) || prior.data.length) return false;
   const key = crypto.createHash('sha256').update(`${campaign}:${phone}`).digest('hex');
   const result = await supabase.storage.from('angus-click-tracking').upload(
    `acknowledgments/${key}.json`,
    Buffer.from(JSON.stringify({campaign, reservedAt:new Date().toISOString()})),
    {contentType:'application/json', upsert:false}
   );
   return !result.error;
  } catch { return false; }
 };
}
module.exports = {createCampaignAckGate};
