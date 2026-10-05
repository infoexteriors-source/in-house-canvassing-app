import {useEffect,useState,useCallback} from 'react';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {dayRange,type Dataset,type Member} from '@canvass/core';
import {makeDemo} from './demo';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const client:SupabaseClient|null=url&&key?createClient(url,key):null;
const demoKey='fieldwork.demo.v1';
const empty:Dataset={members:[],territories:[],properties:[],visits:[],leads:[],events:[],locations:[],flags:[],corrections:[]};
export type AdminAction={action:string;[key:string]:unknown};
function storedDemo(){try{const stored=localStorage.getItem(demoKey);if(stored)return JSON.parse(stored) as Dataset;}catch{}return makeDemo();}
export function useWorkspace(mode:'demo'|'live',day:string) {
 const [data,setData]=useState<Dataset>(()=>mode==='demo'?storedDemo():empty),[loading,setLoading]=useState(mode==='live'),[error,setError]=useState(''),[me,setMe]=useState<Member|null>(null);
 const reload=useCallback(async()=>{
  if(mode==='demo')return;
  if(!client)return;
  setError('');
  try{
   const tables=[['members','memberships'],['territories','territories'],['properties','properties'],['visits','visits'],['leads','leads'],['events','shift_events'],['locations','location_samples'],['flags','review_flags'],['corrections','time_corrections']] as const;
   const values=await Promise.all(tables.map(async([name,table])=>{const rows:unknown[]=[];let offset=0;while(true){let query=client!.from(table).select('*').order(name==='members'?'user_id':'id').range(offset,offset+999);if(name==='locations')query=query.gte('captured_at',new Date(dayRange(day)[0]).toISOString()).lt('captured_at',new Date(dayRange(day)[1]).toISOString());const {data:part,error}=await query;if(error)throw error;rows.push(...part);if(part.length<1000)break;offset+=1000;}return [name,rows];}));
   const next=Object.fromEntries(values) as Dataset;const {data:auth}=await client.auth.getUser();const member=next.members.find(m=>m.user_id===auth.user?.id);if(!member?.active||member.role!=='owner')throw Error('An active owner account is required for this dashboard.');setData(next);setMe(member);
  }catch(e){setError(e instanceof Error?e.message:'Could not load the workspace.');}finally{setLoading(false);}
 },[mode,day]);
 useEffect(()=>{void reload();if(mode!=='live'||!client)return;let timer:ReturnType<typeof setTimeout>;const channel=client.channel('owner-workspace').on('postgres_changes',{event:'*',schema:'public'},()=>{clearTimeout(timer);timer=setTimeout(()=>void reload(),400);}).subscribe();return()=>{clearTimeout(timer);void client.removeChannel(channel);};},[reload,mode]);
 useEffect(()=>{if(mode==='demo'){localStorage.setItem(demoKey,JSON.stringify(data));setMe(data.members.find(m=>m.role==='owner')??null);}},[data,mode]);
 async function mutate(input:AdminAction){
  if(mode==='live'){const {data:result,error}=await client!.functions.invoke('owner-admin',{body:input});if(error)throw error;if(result?.error)throw Error(result.error);await reload();return;}
  setData(previous=>{const d=structuredClone(previous);const at=new Date().toISOString();
   if(input.action==='invite')d.members.push({user_id:crypto.randomUUID(),company_id:d.members[0].company_id,name:String(input.name),email:String(input.email),role:'canvasser',active:true});
   if(input.action==='member_active')d.members=d.members.map(m=>m.user_id===input.user_id?{...m,active:Boolean(input.active)}:m);
   if(input.action==='territory_save'){const territory=input.territory as Dataset['territories'][number];d.territories=[...d.territories.filter(t=>t.id!==territory.id),territory];}
   if(input.action==='resolve_flag')d.flags=d.flags.map(f=>f.id===input.id?{...f,resolved_at:at}:f);
   if(input.action==='clear_dnk')d.properties=d.properties.map(p=>p.id===input.id?{...p,do_not_knock:false,version:p.version+1}:p);
   if(input.action==='correction_review')d.corrections=d.corrections.map(c=>c.id===input.id?{...c,status:input.approved?'approved':'rejected'}:c);
   if(input.action==='crm_reconcile')d.leads=d.leads.map(l=>l.id===input.id?{...l,sync_status:'pending',remote_contact_id:String(input.remote_contact_id)}:l);
   if(input.action==='crm_retry')d.leads=d.leads.map(l=>l.id===input.id?{...l,sync_status:'pending'}:l);
   return d;
  });
 }
 return {data,me,loading,error,reload,mutate,resetDemo:()=>setData(makeDemo())};
}
