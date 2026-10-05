import {service,respond,HttpError,serve} from '../_shared/http.ts';
import {JobNimbus,CRMError,contactPayload,taskPayload} from '../_shared/jobnimbus.ts';
serve(async(req)=>{
 const workerKey=Deno.env.get('CRM_WORKER_KEY');if(!workerKey||req.headers.get('Authorization')!==`Bearer ${workerKey}`)throw new HttpError('Worker authentication required',401);
 const key=Deno.env.get('JOBNIMBUS_API_KEY'),workflow=Deno.env.get('JOBNIMBUS_CONTACT_WORKFLOW'),status=Deno.env.get('JOBNIMBUS_CONTACT_STATUS'),taskType=Deno.env.get('JOBNIMBUS_TASK_TYPE'),assignee=Deno.env.get('JOBNIMBUS_OFFICE_ASSIGNEE');
 if(!key||!workflow||!status||!taskType||!assignee)throw new HttpError('JobNimbus credentials and workflow/task mappings required',503);
 const db=service(),crm=new JobNimbus(key);const {data:jobs,error}=await db.rpc('claim_crm_jobs');if(error)throw error;const results=[];
 for(const job of jobs??[]){try{
  const {data:lead,error:leadError}=await db.from('leads').select('*').eq('id',job.lead_id).single();if(leadError)throw leadError;
  const [{data:property,error:propertyError},{data:rep}]=await Promise.all([db.from('properties').select('*').eq('id',lead.property_id).single(),db.from('memberships').select('name').eq('user_id',lead.user_id).single()]);if(propertyError)throw propertyError;
  let contactId=job.remote_contact_id??lead.remote_contact_id;
  if(!contactId){contactId=await crm.findContact(`fieldwork-property:${property.id}`);if(!contactId)contactId=await crm.createContact(contactPayload(lead,property,rep?.name??'Canvasser',workflow,status));
   const {error:saveError}=await db.from('crm_sync_jobs').update({remote_contact_id:contactId,step:'task',updated_at:new Date().toISOString()}).eq('id',job.id);if(saveError)throw new CRMError('Remote contact saved; local ID persistence failed',true);
   const {error:updateError}=await db.from('leads').update({remote_contact_id:contactId}).eq('id',lead.id);if(updateError)throw new CRMError('Remote contact ID needs reconciliation',true);
  }
  const {data:inspection}=await db.from('inspection_requests').select('id').eq('lead_id',lead.id).maybeSingle();
  if(inspection&&!job.remote_task_id&&job.step!=='complete'){const taskId=await crm.createTask(taskPayload(lead,contactId,rep?.name??'Canvasser',taskType,assignee));const {error:saveError}=await db.from('crm_sync_jobs').update({remote_task_id:taskId,step:'complete'}).eq('id',job.id);if(saveError)throw new CRMError('Remote task saved; local ID persistence failed',true);}
  const {error:finishError}=await db.from('crm_sync_jobs').update({status:'synced',step:'complete',last_error:null,updated_at:new Date().toISOString()}).eq('id',job.id);if(finishError)throw new CRMError('Delivery completion needs reconciliation',true);
  await db.from('leads').update({sync_status:'synced',remote_contact_id:contactId}).eq('id',lead.id);results.push({id:job.id,status:'synced'});
 }catch(e){const uncertain=e instanceof CRMError&&e.uncertain,newStatus=uncertain?'review':'failed',message=e instanceof Error?e.message:'Delivery failed';await db.from('crm_sync_jobs').update({status:newStatus,last_error:message,updated_at:new Date().toISOString()}).eq('id',job.id);await db.from('leads').update({sync_status:newStatus}).eq('id',job.lead_id);results.push({id:job.id,status:newStatus});}}
 return respond({results});
});
