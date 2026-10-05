import {createClient} from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import {Outbox,type QueueEntry,type Dataset,type Member,type Command,type SyncResult,type ShiftEvent,type Position,locationAllowed,shiftState} from '@canvass/core';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured=Boolean(url&&key);
const authStorage={getItem:(key:string)=>SecureStore.getItemAsync(key),setItem:(key:string,value:string)=>SecureStore.setItemAsync(key,value),removeItem:(key:string)=>SecureStore.deleteItemAsync(key)};
export const supabase=configured?createClient(url!,key!,{auth:{storage:authStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}}):null;
const empty:Dataset={members:[],territories:[],properties:[],visits:[],leads:[],events:[],locations:[],flags:[],corrections:[]};
export type LocalState={user:Member|null;data:Dataset;tracking_error:string|null;last_sync:string|null;downloaded_territory_ids:string[]};
let dbPromise:Promise<SQLite.SQLiteDatabase>|null=null;
export function database(){return dbPromise??=SQLite.openDatabaseAsync('fieldwork.db').then(async(db)=>{await db.execAsync('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);');return db;});}
async function read<T>(key:string,fallback:T):Promise<T>{const db=await database();const row=await db.getFirstAsync<{value:string}>('SELECT value FROM kv WHERE key=?',key);return row?JSON.parse(row.value):fallback;}
async function write(key:string,value:unknown){const db=await database();await db.runAsync('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
export const outbox=new Outbox({read:()=>read<QueueEntry[]>('outbox',[]),write:entries=>write('outbox',entries)});
export const loadState=()=>read<LocalState>('state',{user:null,data:empty,tracking_error:null,last_sync:null,downloaded_territory_ids:[]});
let stateChain:Promise<unknown>=Promise.resolve();
export function updateState(updater:(state:LocalState)=>LocalState){const run=stateChain.then(async()=>{const state=updater(await loadState());await write('state',state);return state;});stateChain=run.catch(()=>{});return run;}
export function latestEvents(state:LocalState){const last=state.data.events.filter(e=>e.user_id===state.user?.user_id).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at))[0];return state.data.events.filter(e=>e.shift_id===last?.shift_id);}
export function command(kind:Command['kind'],payload:Record<string,unknown>,occurred_at=new Date().toISOString()):Command{return {id:Crypto.randomUUID(),kind,payload,occurred_at};}
/** Journal first. Replaying the outbox on boot repairs an interrupted local projection. */
export async function submit(c:Command){await outbox.add(c);await project(c);}
export async function project(c:Command){return updateState(state=>{const data={...state.data},user=state.user;if(!user)return state;
 if(c.kind==='shift'&&!data.events.some(e=>e.id===c.id)){const p=c.payload;data.events=[...data.events,{id:c.id,user_id:user.user_id,shift_id:String(p.shift_id),action:p.action as ShiftEvent['action'],occurred_at:c.occurred_at}];}
 if(c.kind==='visit'&&!data.visits.some(v=>v.id===c.id)){const p=c.payload,property=p.property as Dataset['properties'][number],lead=p.lead as Dataset['leads'][number]|null;
 data.properties=[...data.properties.filter(v=>v.id!==property.id),{...property,company_id:user.company_id,created_by:property.created_by??user.user_id,do_not_knock:property.do_not_knock||p.outcome==='do_not_knock'}];
 data.visits=[...data.visits,{id:c.id,company_id:user.company_id,user_id:user.user_id,property_id:property.id,shift_id:String(p.shift_id),outcome:p.outcome as Dataset['visits'][number]['outcome'],notes:String(p.notes??''),occurred_at:c.occurred_at,gps:p.gps as Position|null,follow_up_at:p.follow_up_at?String(p.follow_up_at):null}];
 if(lead)data.leads=[...data.leads.filter(l=>l.id!==lead.id),{...lead,company_id:user.company_id,user_id:user.user_id,visit_id:c.id,property_id:property.id,sync_status:'pending',remote_contact_id:null,created_at:c.occurred_at}];
 }
 if(c.kind==='correction'&&!data.corrections.some(v=>v.id===c.id))data.corrections=[...data.corrections,{id:c.id,company_id:user.company_id,user_id:user.user_id,shift_id:String(c.payload.shift_id),requested_minutes:Number(c.payload.requested_minutes),reason:String(c.payload.reason),status:'pending',created_at:c.occurred_at}];
 return {...state,data};});}
export async function repairProjection(){for(const entry of await outbox.entries())await project(entry.command);}
export async function sync(){if(!supabase)return;await outbox.flush(async(commands)=>{const {data,error}=await supabase.functions.invoke('sync',{body:{commands}});if(error)throw Error('Sync unavailable. Work is saved on this phone.');if(data.error)throw Error(data.error);return data.results as SyncResult[];});await updateState(s=>({...s,last_sync:new Date().toISOString()}));}
export async function refresh(){if(!supabase)throw Error('Connect Supabase before signing in.');const {data:{user},error}=await supabase.auth.getUser();if(error||!user)throw Error('Sign in to your invited account.');
 const {data:member,error:memberError}=await supabase.from('memberships').select('*').eq('user_id',user.id).eq('active',true).single();if(memberError||!member||member.role!=='canvasser'){if(memberError?.code==='PGRST116')await updateState(s=>({...s,user:s.user?{...s.user,active:false}:null,tracking_error:'Account disabled. Contact your owner.'}));throw Error('An active canvasser account is required. Contact your owner.');}
 const previous=await loadState();if(previous.user&&previous.user.user_id!==member.user_id)throw Error('Sign out of the previous account before switching users.');
 const tables=[['territories','territories'],['properties','properties'],['visits','visits'],['events','shift_events'],['leads','leads'],['corrections','time_corrections']] as const;
 const values=await Promise.all(tables.map(async([name,table])=>{let offset=0;const rows:unknown[]=[];while(true){const {data,error}=await supabase!.from(table).select('*').order('id').range(offset,offset+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;offset+=1000;}return [name,rows];}));
 await updateState(s=>({...s,user:member,data:{...s.data,...Object.fromEntries(values),members:[member]}}));await repairProjection();return loadState();
}
export async function capture(position:Position){const state=await loadState(),events=latestEvents(state);if(!state.user?.active||shiftState(events)!=='active'||!locationAllowed(events,position.captured_at))return;const c=command('location',{shift_id:events[0].shift_id,latitude:position.latitude,longitude:position.longitude,accuracy:position.accuracy},position.captured_at);await outbox.add(c);await updateState(s=>({...s,data:{...s.data,locations:[...s.data.locations.slice(-99),{...position,id:c.id,company_id:state.user!.company_id,user_id:state.user!.user_id,shift_id:events[0].shift_id}]}}));try{await sync();}catch{/* Durable outbox retains the sample. */}}
export async function clearLocal(){const entries=await outbox.entries();if(entries.length)throw Error('Sync pending work before signing out.');const db=await database();await db.runAsync('DELETE FROM kv');await supabase?.auth.signOut();}
