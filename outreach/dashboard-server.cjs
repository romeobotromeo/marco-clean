const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const CAMPAIGN='campaign:2961-angus-open-house-2026-11';
const DIR=process.env.MARCO_CAMPAIGN_DIR || '/Users/romeomain/jwgre/ops/properties/angus/marketing/sms-campaign-2026-11-20';
const PORT=Number(process.env.MARCO_DASHBOARD_PORT || 4317);
const TOKEN=crypto.randomBytes(32).toString('hex');
const redact=s=>String(s||'').replace(/(?:\+?1[ .-]?)?\(?323\)?[ .-]?496[ .-]?1451/g,'[private contact hidden]');
let cloud={updatedAt:null,error:'Connecting to campaign records…',messages:[],clicks:null}, busy=false;
async function json(url,headers){const r=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Source returned HTTP '+r.status);return r.json();}
async function refresh(){if(busy)return;busy=true;try{
 if(!process.env.RENDER_API_KEY)throw Error('Cloud connection is not configured');
 const rows=await json('https://api.render.com/v1/services/srv-d6a7c7h5pdvs738ta420/env-vars?limit=100',{Authorization:'Bearer '+process.env.RENDER_API_KEY});
 const env={};for(const x of rows){const v=x.envVar||x;env[v.key]=v.value;}
 const u=new URL(env.SUPABASE_URL+'/rest/v1/messages');u.search=new URLSearchParams({select:'user_phone,direction,body,created_at', 'raw_payload->>campaign':'eq.'+CAMPAIGN,order:'created_at.desc',limit:'200'});
 const results=await Promise.allSettled([
 json(u,{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}),
 json('https://marco-clean.onrender.com/admin/campaigns/angus/clicks?mode=live',{Authorization:'Bearer '+env.ADMIN_API_TOKEN})]);
 const errors=[];
 if(results[0].status==='fulfilled'){cloud.messages=results[0].value.map(m=>({contact:'Contact ending '+m.user_phone.slice(-4),key:crypto.createHash('sha256').update(m.user_phone).digest('hex').slice(0,16),direction:m.direction,body:redact(m.body),at:m.created_at}));cloud.messagesAt=new Date().toISOString();}else errors.push('Reply history unavailable');
 if(results[1].status==='fulfilled'){cloud.clicks=results[1].value;cloud.clicksAt=new Date().toISOString();}else errors.push('Click report unavailable');
 cloud.updatedAt=new Date().toISOString();cloud.error=errors.join('; ')||null;
 }catch(e){cloud.error=e.message;}finally{busy=false;}}
function summarize(state){
 const counts={},delivery={};const accepted=[];
 for(const r of state.recipients){counts[r.state]=(counts[r.state]||0)+1;if(r.state==='accepted'){accepted.push(r);delivery[r.deliveryStatus||'unknown']=(delivery[r.deliveryStatus||'unknown']||0)+1;}}
 const times=accepted.map(r=>Date.parse(r.at)).filter(Number.isFinite).sort((a,b)=>a-b).slice(-500);
 const rate=times.length>1 && times.at(-1)>times[0]?(times.length-1)/((times.at(-1)-times[0])/60000):null;
 return {status:state.status,updatedAt:state.updatedAt,total:state.recipients.length,counts,delivery,lastCheck:state.lastCheck||null,historicalRate:rate,lastSubmission:times.length?new Date(times.at(-1)).toISOString():null};
}
async function snapshot(){const state=JSON.parse(await fs.readFile(path.join(DIR,'bulk-send-state.json'),'utf8'));const approval=JSON.parse(await fs.readFile(path.join(DIR,'outreach-approval.json'),'utf8'));return {system:'MARCO Outreach',property:'2961 Angus St',now:new Date().toISOString(),campaign:summarize(state),approval:{paused:approval.paused,testConfirmed:!!approval.test,testReviewed:approval.testReview?.result==='passed',bulkConfirmed:!!approval.bulk},cloud};}
function authorized(req){const supplied=req.headers['x-marco-token']||'';return supplied.length===TOKEN.length && crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(TOKEN));}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
 if(!['127.0.0.1:'+PORT,'localhost:'+PORT].includes(req.headers.host)){res.writeHead(403).end();return;}
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 const route=new URL(req.url,'http://localhost').pathname;
 try{
 if(route==='/api/status'){if(!authorized(req)){res.writeHead(401).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await snapshot()));return;}
 const file={'/':'dashboard.html','/dashboard.js':'dashboard.js','/dashboard.css':'dashboard.css'}[route];if(!file){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript');res.end(await fs.readFile(path.join(__dirname,file)));
 }catch{res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Campaign records unavailable; sending remains held.'}));}
});
if(require.main===module){server.listen(PORT,'127.0.0.1',async()=>{const url='http://127.0.0.1:'+PORT+'/#'+TOKEN;await fs.writeFile('/Users/romeomain/.bb/thread-storage/thr_my4k4zey4k/marco-dashboard-url.txt',url,{mode:0o600});console.log('MARCO Outreach dashboard listening on local port '+PORT+'; private access link saved in thread storage.');refresh();setInterval(refresh,30000).unref();});}
module.exports={summarize,redact};
