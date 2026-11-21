const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const BUSINESS_PHONE = '+13102951136';
function contentVersion(body, media) {
  return crypto.createHash('sha256').update(JSON.stringify({body, media})).digest('hex');
}
function assertApproved(record, {kind, campaign, version, to, now=Date.now()}) {
  if (!record || record.paused !== false) throw Error('MARCO Outreach: sending is held for Josh');
  if (!['test','bulk'].includes(kind)) throw Error('Unknown send purpose');
  if (record.campaign !== campaign || record.contentVersion !== version) throw Error('Approval does not match campaign content');
  const approval=record[kind];
  if (!approval || approval.confirmedBy !== 'Josh' || !approval.evidence || !approval.confirmedAt) throw Error('Josh must explicitly confirm '+kind+' sending');
  const confirmed=Date.parse(approval.confirmedAt), expires=Date.parse(approval.expiresAt);
  if (!Number.isFinite(confirmed) || !Number.isFinite(expires) || confirmed>now || expires<=now) throw Error('Send approval missing or expired');
  if (kind==='test' && to!==(record.test?.to||BUSINESS_PHONE)) throw Error('Test destination must be the approved business line');
  if (kind==='bulk') {
    const review=record.testReview;
    if (!review || review.reviewedBy!=='Josh' || review.result!=='passed' || review.contentVersion!==version || !review.evidence) throw Error('Josh must review and pass the conversational test first');
    const reviewed=Date.parse(review.reviewedAt);
    if (!Number.isFinite(reviewed) || reviewed>confirmed) throw Error('Bulk approval must follow the test review');
  }
  return true;
}
async function assertFileApproved(file, options) {
  let record; try { record=JSON.parse(await fs.readFile(file,'utf8')); }
  catch { throw Error('MARCO Outreach: missing or unreadable approval; no sending'); }
  return assertApproved(record,options);
}
module.exports={BUSINESS_PHONE,contentVersion,assertApproved,assertFileApproved};
