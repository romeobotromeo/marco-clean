'use strict';
function createOpenAI({apiKey=process.env.OPENAI_API_KEY,fetchImpl=fetch}={}){
 async function request({system,messages,model=process.env.OPENAI_MODEL||'gpt-5.4-mini',schema}){
  if(!apiKey)throw Error('OpenAI key not configured');
  const body={model,instructions:system,input:messages,store:false,max_output_tokens:1500,reasoning:{effort:'low'}};
  if(schema)body.text={format:{type:'json_schema',name:'marco_reply',strict:true,schema}};
  let r;try{r=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw Error('OpenAI connection unavailable');}
  if(!r.ok)throw Error('OpenAI request failed (HTTP '+r.status+')');
  const data=await r.json();if(data.status!=='completed')throw Error('OpenAI response incomplete');
  const content=(data.output||[]).flatMap(x=>x.content||[]);
  if(content.some(x=>x.type==='refusal'))throw Error('OpenAI declined response');
  const text=content.filter(x=>x.type==='output_text').map(x=>x.text).join('');if(!text)throw Error('OpenAI returned no text');return text;
 }
 return {configured:!!apiKey,text:request,structured:async args=>JSON.parse(await request(args))};
}
module.exports={createOpenAI};
