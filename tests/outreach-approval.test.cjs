const {test}=require('node:test');const assert=require('node:assert/strict');
const {assertApproved,assertFileApproved,contentVersion,BUSINESS_PHONE}=require('../outreach/approval-gate.cjs');
const now=Date.parse('2026-11-21T18:30:00Z'),version=contentVersion('body','photo');
const opts={campaign:'angus',version,kind:'bulk',now};
function record(){return {campaign:'angus',contentVersion:version,paused:false,bulk:{confirmedBy:'Josh',evidence:'explicit launch instruction',confirmedAt:'2026-11-21T18:29:00Z',expiresAt:'2026-11-21T19:00:00Z'},testReview:{reviewedBy:'Josh',result:'passed',contentVersion:version,evidence:'owner test review',reviewedAt:'2026-11-21T18:28:00Z'}};}
test('schedule alone cannot authorize sends, including test',()=>{for(const kind of ['bulk','test'])assert.throws(()=>assertApproved({paused:true},{...opts,kind,to:BUSINESS_PHONE}));});
test('bulk requires separate owner approval after matching test review',()=>{assert.equal(assertApproved(record(),opts),true);for(const mutate of [r=>delete r.testReview,r=>delete r.bulk,r=>r.testReview.reviewedAt='2026-11-21T18:30:00Z',r=>r.testReview.contentVersion='old',r=>r.bulk.confirmedBy='automation',r=>r.bulk.expiresAt='2026-11-21T18:00:00Z',r=>r.paused=true]){const r=record();mutate(r);assert.throws(()=>assertApproved(r,opts));}});
test('changed content invalidates approval',()=>assert.throws(()=>assertApproved(record(),{...opts,version:contentVersion('new','photo')})));
test('test approval only authorizes business phone, never bulk',()=>{const r=record();r.test=r.bulk;delete r.bulk;assert.equal(assertApproved(r,{...opts,kind:'test',to:BUSINESS_PHONE}),true);assert.throws(()=>assertApproved(r,{...opts,kind:'test',to:'+15555550123'}));assert.throws(()=>assertApproved(r,opts));});
test('missing approval fails closed',async()=>assert.rejects(assertFileApproved('/nonexistent-marco-approval',opts)));
