import {createClient} from '@supabase/supabase-js';
const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,OWNER_EMAIL,OWNER_PASSWORD,COMPANY_NAME}=process.env;
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!OWNER_EMAIL||!OWNER_PASSWORD||!COMPANY_NAME)throw Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_NAME, OWNER_EMAIL and OWNER_PASSWORD.');
if(OWNER_PASSWORD.length<12)throw Error('Use at least 12 characters for the owner password.');
const db=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:existing,error:lookupError}=await db.from('companies').select('id').eq('name',COMPANY_NAME).maybeSingle();if(lookupError)throw lookupError;
let company=existing;
if(!company){const {data,error}=await db.from('companies').insert({name:COMPANY_NAME,timezone:'America/New_York'}).select('id').single();if(error)throw error;company=data;}
const {data,error}=await db.auth.admin.createUser({email:OWNER_EMAIL,password:OWNER_PASSWORD,email_confirm:true});if(error)throw error;
const {error:saveError}=await db.from('memberships').insert({user_id:data.user.id,company_id:company.id,name:process.env.OWNER_NAME||'Company Owner',email:OWNER_EMAIL,role:'owner'});
if(saveError){await db.auth.admin.deleteUser(data.user.id);throw saveError;}
console.log('Owner account created. Sign in to the dashboard with the owner email and password.');
