const crypto=require('node:crypto');
const {assertApproved,BUSINESS_PHONE}=require('./approval-gate.cjs');
const {generateReply,stopIntent,PROPERTY,privacy}=require('./personality.cjs');
const CAMPAIGN='campaign:2961-angus-open-house-2026-11';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function approved(c,kind,to,now=Date.now()){assertApproved(c,{kind,campaign:CAMPAIGN,version:c.contentVersion,to,now});}
function canReply(c,to,now=Date.now()){try{if(!c||c.repliesPaused||c.replyMode==='off')return false;if(c.replyMode==='test'){approved(c,'test',to,now);return to===(c.test?.to||BUSINESS_PHONE);}if(c.replyMode==='live'){approved({...c,paused:false},'bulk',to,now);return true;}return false;}catch{return false;}}
function deliveryStatus(events,fallback='accepted'){const statuses=new Set(events.map(x=>x.status));for(const s of ['read','delivered','undelivered','failed','canceled','sent','sending','queued','accepted'])if(statuses.has(s))return s;return fallback;}
class Engine{
 constructor({store,provider,contacts,openai,tracking,clock=()=>Date.now()}){Object.assign(this,{store,provider,contacts,openai,tracking,clock});this.inflight=0;this.busy=false;this.heartbeat=null;this.lastError=null;this.manifest=null;this.seen=new Set();this.incomingSeen=new Set();}
 async config(){const c=await this.store.read('config');if(!c)throw Error('Outreach configuration not initialized');return c;}
 async hold(reason){const at=new Date(this.clock()).toISOString();await this.store.create('holds/'+this.clock()+'-'+crypto.randomUUID(),{reason,at});this.lastError=reason;}
 async holds(){const names=await this.store.list('holds');const clears=new Set(await this.store.list('cleared-holds'));return names.filter(n=>!clears.has(n));}
 async ensureReady(c,job){if((await this.holds()).length)throw Error('Worker held for review');approved(c,job.kind,job.to,this.clock());if(job.kind==='bulk'&&(this.clock()<Date.parse(c.startAt)||this.clock()>=Date.parse(c.cutoffAt)))throw Error('Outside approved bulk window');if(await this.contacts.suppressed(job.to))throw Error('suppressed');if(job.kind==='reply'&&!canReply(c,job.to,this.clock()))throw Error('Replies not approved');}
 async send(job){
  const id=job.id;if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid job ID');
  if(!privacy(job.body))throw Error('Private contact blocked');
  let c=await this.config();
  const check=async()=>{c=await this.config();if((await this.holds()).length)throw Error('Worker held for review');if(job.kind==='reply'){if(!canReply(c,job.to,this.clock()))throw Error('Replies not approved');const convo=await this.store.read('conversations/'+hash(job.to));if(convo?.takeover||convo?.held)throw Error('Conversation held');}else{approved(c,job.kind,job.to,this.clock());if(job.kind==='bulk'&&(!Number.isFinite(Date.parse(c.cutoffAt))||this.clock()<Date.parse(c.startAt)||this.clock()>=Date.parse(c.cutoffAt)))throw Error('Outside approved bulk window');}if(await this.contacts.suppressed(job.to))throw Error('suppressed');};
  try{await check();}catch(e){if(e.message==='suppressed'){await this.store.create('results/'+id,{id,state:'suppressed',at:new Date(this.clock()).toISOString()});return 'suppressed';}throw e;}
  if(job.kind==='bulk'&&await this.contacts.prior(job.to)){await this.store.create('results/'+id,{id,state:'skipped_prior_campaign',at:new Date(this.clock()).toISOString()});return 'skipped';}
  await this.tracking?.prepare?.(job);
  // Shared two-per-second slots across rolling deploys. No sleep or local-only limiter.
  if(!await this.store.create('rate/'+Math.floor(this.clock()/500),{at:new Date(this.clock()).toISOString()}))return 'rate_limited';
  if(!await this.store.create('claims/'+id,{id,to:job.to,kind:job.kind,at:new Date(this.clock()).toISOString()}))return 'claimed';
  try{
   await check();
   if(!await this.store.create('intents/'+id,{id,at:new Date(this.clock()).toISOString()}))return 'claimed';
   let result;try{result=await this.provider.send(job);}catch(e){await this.store.write('results/'+id,{id,state:e.definite?'rejected':'uncertain',errorCode:e.code||null,at:new Date(this.clock()).toISOString()});if(e.code===21610)await this.contacts.suppress(job.to);if(![21610,21614].includes(e.code))await this.hold('Provider submission requires review: '+(e.code||'unknown outcome'));return 'held';}
   const record={id,to:job.to,kind:job.kind,state:'accepted',sid:result.sid,deliveryStatus:result.status,at:new Date(this.clock()).toISOString()};
   await this.store.write('results/'+id,record);
   try{await this.contacts.log(job,result);await this.tracking?.sent(job,result);await this.store.create('bookkeeping/'+id,{at:new Date(this.clock()).toISOString()});}catch{await this.hold('Message accepted; bookkeeping needs reconciliation. Do not resend.');}
   return 'accepted';
  }catch(e){await this.hold('Claimed message requires review; never automatically retry.');throw e;}
 }
 async receive(event){const c=await this.config();if(!canReply(c,event.to,this.clock()))return false;
  if(!/^(?:SM|MM)[a-f0-9]{32}$/i.test(event.sid))throw Error('Invalid inbound SID');
  await this.store.create('incoming/'+event.sid,{...event,at:new Date(this.clock()).toISOString()});
  if(stopIntent(event.body)){await this.contacts.suppress(event.to);await this.store.write('conversations/'+hash(event.to),{held:true,reason:'opted_out'});}
  return true;
 }
 async processIncoming(sid){
  if(await this.store.read('processed/'+sid))return;
  const event=await this.store.read('incoming/'+sid);if(!event)return;
  const c=await this.config();if(!canReply(c,event.to,this.clock()))return;
  if(!await this.store.create('inbound-claims/'+sid,{at:new Date(this.clock()).toISOString()})){const claim=await this.store.read('inbound-claims/'+sid);if(claim&&this.clock()-Date.parse(claim.at)>60000)await this.store.create('holds/orphan-inbound-'+sid,{reason:'Interrupted inbound processing requires review',at:new Date(this.clock()).toISOString()});return;}
  const key='conversations/'+hash(event.to);let convo=await this.store.read(key)||{history:[],replyTimes:[],takeover:false};
  try{
   await this.contacts.logInbound(event);
   if(stopIntent(event.body)||await this.contacts.suppressed(event.to)){await this.contacts.suppress(event.to);await this.store.write('processed/'+sid,{action:'opt_out'});return;}
   if(convo.takeover||convo.held){await this.store.write('processed/'+sid,{action:'human_takeover'});return;}
   const times=(convo.replyTimes||[]).filter(t=>t>this.clock()-86400000);
   if(times.length>=20||times.filter(t=>t>this.clock()-600000).length>=6||(convo.history||[]).filter(m=>m.direction==='inbound'&&m.body===event.body).length>=2){await this.store.write(key,{...convo,held:true,reason:'reply_limit_or_loop'});await this.store.write('processed/'+sid,{action:'hold'});return;}
   let reply;try{reply=await generateReply({openai:this.openai,body:event.body,history:convo.history,now:new Date(this.clock())});}catch{reply={action:'handoff',text:'I’ll need Josh to help with that. You can reach him at 310-295-1136.',factIds:['identity']};}
   convo.history=[...(convo.history||[]),{direction:'inbound',body:event.body,at:event.at}].slice(-30);
   if(reply.action==='opt_out'){await this.contacts.suppress(event.to);convo.held=true;convo.reason='opted_out';}
   else if(reply.action!=='no_reply'&&reply.text){
    const job={id:hash('reply:'+sid),kind:'reply',to:event.to,body:reply.text};
    // A missed slot leaves a reviewable reply; it never blindly retries a claimed send.
    let outcome=await this.send(job);if(outcome==='rate_limited'){await new Promise(r=>setTimeout(r,550));outcome=await this.send(job);}
    if(outcome==='accepted'){convo.history.push({direction:'outbound',body:reply.text,at:new Date(this.clock()).toISOString()});times.push(this.clock());}
    else if(outcome!=='suppressed'){convo.held=true;convo.reason='reply_not_sent_review';}
    if(reply.action==='handoff'){convo.takeover=true;convo.reason='needs_josh';}
   }
   // Never overwrite a takeover which arrived while the model or provider was working.
   const latest=await this.store.read(key);if(latest?.takeover||latest?.held)convo={...convo,takeover:latest.takeover||convo.takeover,held:latest.held||convo.held,reason:latest.reason};
   convo.replyTimes=times;convo.updatedAt=new Date(this.clock()).toISOString();await this.store.write(key,convo);await this.store.write('processed/'+sid,{action:reply.action,knowledgeVersion:PROPERTY.version,at:convo.updatedAt});
  }catch{await this.hold('Inbound conversation requires review');}
 }
 async monitor(){
  if(this.lastMonitor&&this.clock()-this.lastMonitor<30000)return;this.lastMonitor=this.clock();
  const names=await this.store.list('results');const rows=[];for(let i=0;i<names.length;i+=12){rows.push(...await Promise.all(names.slice(i,i+12).map(n=>this.store.read('results/'+n))));}
  const recent=rows.filter(x=>x?.kind==='bulk'&&x.state==='accepted').sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,100);if(!recent.length)return;
  const namesOfEvents=await this.store.list('delivery');const events=[];for(let i=0;i<namesOfEvents.length;i+=12)events.push(...await Promise.all(namesOfEvents.slice(i,i+12).map(n=>this.store.read('delivery/'+n))));
  let failed=0,stale=0,optedOut=0;for(const row of recent){const status=deliveryStatus(events.filter(e=>e?.id===row.id),row.deliveryStatus);if(['failed','undelivered','canceled'].includes(status))failed++;if(['accepted','queued','sending'].includes(status)&&this.clock()-Date.parse(row.at)>120000)stale++;if(await this.contacts.suppressed(row.to))optedOut++;}
  if(failed>=Math.max(5,Math.ceil(recent.length*.1)))await this.hold('Delivery failures reached review threshold');
  else if(optedOut>=Math.max(3,Math.ceil(recent.length*.05)))await this.hold('Opt-outs reached review threshold');
  else if(stale>=20)await this.hold('Provider backlog or missing delivery callbacks requires review');
 }
 async tick(){if(this.busy||this.nextPoll>this.clock())return;this.busy=true;this.heartbeat=new Date(this.clock()).toISOString();try{
  const c=await this.config();this.nextPoll=this.clock()+(c.paused?5000:500);if((await this.holds()).length)return;
  if(c.replyMode!=='off'&&!c.repliesPaused){for(const sid of await this.store.list('incoming')){if(this.incomingSeen.has(sid))continue;await this.processIncoming(sid);if(await this.store.read('processed/'+sid))this.incomingSeen.add(sid);}}
  if(c.paused||!c.bulk)return;
  await this.monitor();if((await this.holds()).length)return;
  this.manifest=this.manifest||await this.store.read('manifest');
  for(const job of this.manifest?.jobs||[]){if(this.inflight>=4)break;if(job.state!=='not_sent'||this.seen.has(job.id))continue;this.seen.add(job.id);this.inflight++;this.send({...job,kind:'bulk'}).then(outcome=>{if(outcome==='rate_limited')this.seen.delete(job.id);}).catch(e=>{this.lastError=e.message;this.seen.delete(job.id);}).finally(()=>this.inflight--);}
 }catch(e){this.lastError=e.message;}finally{this.busy=false;}}
 start(){this.timer=setInterval(()=>this.tick(),500);this.timer.unref();this.tick();}
}
module.exports={Engine,CAMPAIGN,hash,canReply,deliveryStatus};
