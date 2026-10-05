import {JobNimbus} from '../_shared/jobnimbus.ts';
import {authenticate,HttpError,respond,serve,uuid} from '../_shared/http.ts';
serve(async(req)=>{const {db,user,member}=await authenticate(req,true);const input=await req.json();
 if(input.action==='invite'){
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100||typeof input.email!=='string'||!/^\S+@\S+\.\S+$/.test(input.email))throw new HttpError('Valid name and email required');
  const {data,error}=await db.auth.admin.inviteUserByEmail(input.email,{redirectTo:Deno.env.get('INVITE_REDIRECT_URL')||undefined});if(error)throw new HttpError(error.message);
  const {error:saveError}=await db.from('memberships').insert({user_id:data.user.id,company_id:member.company_id,name:input.name.trim(),email:input.email,role:'canvasser'});
  if(saveError){await db.auth.admin.deleteUser(data.user.id);throw new HttpError('Could not enroll invited canvasser');}
  await db.from('audit_log').insert({company_id:member.company_id,actor_id:user.id,action:'invite',record_id:data.user.id});return respond({ok:true});
 }
 const allowed=['member_active','territory_save','resolve_flag','clear_dnk','correction_review','crm_retry','crm_reconcile'];if(!allowed.includes(input.action))throw new HttpError('Unknown owner action');
 if(input.action==='crm_reconcile'){
  const {data:job}=await db.from('crm_sync_jobs').select('*').eq('lead_id',input.id).eq('company_id',member.company_id).eq('status','review').single();if(!job)throw new HttpError('No CRM review job found');
  const key=Deno.env.get('JOBNIMBUS_API_KEY');if(!key)throw new HttpError('JobNimbus is not configured',503);
  const crm=new JobNimbus(key);const contact=await crm.call(`contacts/${encodeURIComponent(String(input.remote_contact_id))}`);if(String(contact.jnid)!==String(input.remote_contact_id))throw new HttpError('Contact ID could not be verified');
  const {data:inspection}=await db.from('inspection_requests').select('id').eq('lead_id',job.lead_id).maybeSingle();
  if(input.remote_task_id){const task=await crm.call(`tasks/${encodeURIComponent(String(input.remote_task_id))}`);const related=task.related as {id:string}[]|undefined;if(String(task.jnid)!==String(input.remote_task_id)||!related?.some(r=>r.id===String(input.remote_contact_id)))throw new HttpError('Task is not related to this verified contact');}
  else if(inspection&&!input.verified_no_task)throw new HttpError('Enter the existing task ID or verify that no inspection task exists');
 }
 const {data,error}=await db.rpc('apply_owner_action',{p_owner:user.id,input});if(error)throw new HttpError(error.message);return respond(data);
});
