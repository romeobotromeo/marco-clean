const BUCKET='marco-outreach';
class Storage {
 constructor(supabase){this.client=supabase;this.bucket=supabase.storage.from(BUCKET);}
 async read(key){const r=await this.bucket.download(key+'.json');if(r.error){if(/not found|does not exist/i.test(r.error.message||''))return null;throw Error('Durable storage read unavailable');}return JSON.parse(await r.data.text());}
 async create(key,value){const r=await this.bucket.upload(key+'.json',Buffer.from(JSON.stringify(value)),{contentType:'application/json',upsert:false});if(r.error){if(/already exists|duplicate/i.test(r.error.message||'')||String(r.error.statusCode)==='409')return false;throw Error('Durable storage claim unavailable');}return true;}
 async write(key,value){const r=await this.bucket.upload(key+'.json',Buffer.from(JSON.stringify(value)),{contentType:'application/json',upsert:true});if(r.error)throw Error('Durable storage write unavailable');}
 async list(prefix){const names=[];for(let offset=0;;offset+=1000){const r=await this.bucket.list(prefix,{limit:1000,offset,sortBy:{column:'name',order:'asc'}});if(r.error)throw Error('Durable storage list unavailable');names.push(...r.data.filter(x=>x.id&&x.name.endsWith('.json')).map(x=>x.name.slice(0,-5)));if(r.data.length<1000)return names;}}
}
module.exports={Storage,BUCKET};
