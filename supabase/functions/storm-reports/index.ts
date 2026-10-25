import {authenticate,HttpError,respond,serve} from '../_shared/http.ts';
import {boundsOf,parseSpcHail,spcHailUrl,within,type HailReport} from '../_shared/hail.ts';
// Hail layer for territory maps. HAIL_PROVIDER=spc (default) reads NOAA SPC daily reports; 'none' disables the layer.
// A paid swath provider can be added here behind the same response shape.
serve(async(req)=>{const {db,member}=await authenticate(req);const input=await req.json().catch(()=>({}));
 const days=Number.isInteger(input.days)?Math.min(Math.max(input.days,1),14):7;
 const provider=Deno.env.get('HAIL_PROVIDER')??'spc';if(provider==='none')return respond({provider,reports:[]});
 if(provider!=='spc')throw new HttpError('Unsupported hail provider',503);
 const {data:territories,error}=await db.from('territories').select('boundary').eq('company_id',member.company_id).eq('archived',false);if(error)throw new HttpError('Could not load territories',500);
 const bounds=boundsOf((territories??[]).map(t=>t.boundary.coordinates[0]),25);if(!bounds)return respond({provider,reports:[]});
 // SPC report days end at 12:00 UTC; the newest complete file is yesterday's.
 const dates=Array.from({length:days},(_,i)=>new Date(Date.now()-(i+1)*86400000).toISOString().slice(0,10));
 const batches=await Promise.all(dates.map(async(day)=>{try{const res=await fetch(spcHailUrl(day),{signal:AbortSignal.timeout(8000)});if(!res.ok)return [] as HailReport[];return parseSpcHail(await res.text(),day);}catch{return [] as HailReport[];}}));
 const reports=batches.flat().filter(r=>within(r,bounds)).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at));
 return respond({provider,days,reports,attribution:'NOAA Storm Prediction Center preliminary storm reports'});
});
