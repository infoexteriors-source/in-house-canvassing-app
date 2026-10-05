if(!process.env.SUPABASE_URL||!process.env.CRM_WORKER_KEY)throw Error('Set SUPABASE_URL and CRM_WORKER_KEY.');
const response=await fetch(`${process.env.SUPABASE_URL}/functions/v1/jobnimbus-worker`,{method:'POST',headers:{Authorization:`Bearer ${process.env.CRM_WORKER_KEY}`,'Content-Type':'application/json'},body:'{}'});
if(!response.ok)throw Error(`Worker returned ${response.status}: ${await response.text()}`);
console.log(await response.text());
