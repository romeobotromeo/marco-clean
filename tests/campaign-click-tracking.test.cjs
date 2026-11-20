const test = require('node:test'); const assert = require('node:assert/strict');
const { installCampaignClickTracking, classifyRequest, summarize } = require('../campaign-click-tracking.js');
function fixture() {
 const objects=new Map(),routes=new Map();let unavailable=false;
 const bucket={async upload(p,b,opt){if(unavailable)return {error:{statusCode:'503',message:'offline'}};if(objects.has(p)&&!opt.upsert)return {error:{statusCode:'409',message:'exists'}};objects.set(p,Buffer.from(b).toString());return {data:{path:p}};},async download(p){if(unavailable)return {error:{statusCode:'503',message:'offline'}};return objects.has(p)?{data:new Blob([objects.get(p)])}:{error:{statusCode:'404',message:'not found'}};},async list(prefix,opt){if(unavailable)return {error:{statusCode:'503'}};return {data:[...objects.keys()].filter(p=>p.startsWith(prefix+'/')).sort().slice(opt.offset,opt.offset+opt.limit).map(p=>({id:p,name:p.slice(prefix.length+1)}))};}};
 const app={get(p,h){routes.set('GET '+p,h)},post(p,h){routes.set('POST '+p,h)}};
 installCampaignClickTracking(app,{supabase:{storage:{from:()=>bucket}},secret:'test-only-secret',requireAdmin:(req,res)=>{if(!req.admin){res.status(401).json({error:'unauthorized'});return false;}return true;}});
 async function call(route,{method='GET',params={},body={},query={},headers={},admin=true}={}){const req={method,params,body,query,headers,admin,get:k=>headers[k]};const res={statusCode:200,set(){return this},status(s){this.statusCode=s;return this},json(v){this.body=v;return this},send(v){this.body=v;return this},redirect(s,v){this.statusCode=s;this.location=v;return this}};await routes.get(route)(req,res);return res;}
 return {call,objects,fail(){unavailable=true}};
}
test('classifies explicit previews and leaves ambiguous clients unknown',()=>{assert.equal(classifyRequest('facebookexternalhit/1.1'),'preview');assert.equal(classifyRequest('Mozilla/5.0',{purpose:'prefetch'}),'preview');assert.equal(classifyRequest(''),'unknown');assert.equal(classifyRequest('Mozilla/5.0 Safari/1'),'browser');});
test('unique counts require sent registration and exclude preview-only recipients',()=>{const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);const s=summarize([a+'_browser_1',a+'_browser_2',b+'_preview_3',c+'_browser_4'],[a+'.json',b+'.json']);assert.equal(s.uniqueRecipientsWithBrowserClicks,1);assert.equal(s.recipientsSentTrackedLinks,2);assert.equal(s.browserClickRequests,2);assert.equal(s.browserClickRate,.5);});
test('authorized registration, repeat links, real redirects, HEAD exclusion, isolation and error handling',async()=>{const f=fixture();let r=await f.call('POST /admin/campaigns/angus/links',{body:{to:'+15555550123',mode:'qa'},admin:false});assert.equal(r.statusCode,401);assert.equal(f.objects.size,0);
 r=await f.call('POST /admin/campaigns/angus/links',{body:{to:'+15555550123',mode:'qa'}});const token=r.body.token;assert(!r.body.url.includes('555555'));assert(![...f.objects.values()].join('').includes('+15555550123'));
 const repeat=await f.call('POST /admin/campaigns/angus/links',{body:{to:'+15555550123',mode:'qa'}});assert.equal(repeat.body.token,token);
 const click={params:{token},headers:{'user-agent':'Mozilla/5.0 Safari/1'}};
 r=await f.call('GET /a/:token',{...click,method:'HEAD'});assert.equal(r.statusCode,302);assert.equal([...f.objects.keys()].filter(x=>x.startsWith('events/')).length,0);
 for(let i=0;i<2;i++){r=await f.call('GET /a/:token',click);assert.equal(r.statusCode,302);assert(r.location.startsWith('https://www.redfin.com/CA/Los-Angeles/2961-Angus-St'));}
 await f.call('GET /a/:token',{params:{token},headers:{'user-agent':'facebookexternalhit/1.1'}});
 await f.call('POST /admin/campaigns/angus/links/:token/sent',{params:{token},body:{messageSid:'MM'+'0'.repeat(32)}});
 r=await f.call('GET /admin/campaigns/angus/clicks',{query:{mode:'qa'}});assert.equal(r.body.uniqueRecipientsWithBrowserClicks,1);assert.equal(r.body.browserClickRequests,2);assert.equal(r.body.suspectedPreviewRequests,1);
 r=await f.call('GET /admin/campaigns/angus/clicks');assert.equal(r.body.recipientsSentTrackedLinks,0);assert.equal(r.body.uniqueRecipientsWithBrowserClicks,0);
 r=await f.call('GET /a/:token',{params:{token:'not-a-token'}});assert.equal(r.statusCode,404);
 f.fail();r=await f.call('GET /admin/campaigns/angus/clicks');assert.equal(r.statusCode,503);
});
