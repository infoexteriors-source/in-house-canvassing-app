export const outcomes = ['no_answer', 'not_interested', 'follow_up', 'interested', 'inspection_requested', 'existing_customer', 'do_not_knock'] as const;
export type Outcome = typeof outcomes[number];
export const outcomeLabels: Record<Outcome, string> = { no_answer: 'No answer', not_interested: 'Not interested', follow_up: 'Follow-up', interested: 'Interested', inspection_requested: 'Inspection requested', existing_customer: 'Existing customer', do_not_knock: 'Do not knock' };
export const outcomeColors: Record<Outcome, string> = { no_answer: '#64748b', not_interested: '#a36547', follow_up: '#b27708', interested: '#147b70', inspection_requested: '#345bd6', existing_customer: '#7b52aa', do_not_knock: '#bd3e3e' };
export type Position = { latitude: number; longitude: number; accuracy: number; captured_at: string };
export type ShiftAction = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';
export type ShiftEvent = { id: string; shift_id: string; user_id: string; action: ShiftAction; occurred_at: string };
export type ShiftState = 'off' | 'active' | 'break' | 'ended';
export type Member = { user_id: string; company_id: string; name: string; email: string; role: 'owner' | 'canvasser'; active: boolean };
export type Territory = { id: string; company_id: string; name: string; color: string; boundary: { type: 'Polygon'; coordinates: number[][][] }; assigned_user_ids: string[]; archived: boolean };
export type Property = { id: string; company_id: string; territory_id: string | null; created_by: string; address: string; latitude: number; longitude: number; do_not_knock: boolean; version: number };
export type Visit = { id: string; company_id: string; property_id: string; user_id: string; shift_id: string; outcome: Outcome; notes: string; occurred_at: string; gps: Position | null; follow_up_at: string | null };
export type Lead = { id: string; company_id: string; visit_id: string; property_id: string; user_id: string; name: string; phone: string; email: string; concerns: string; notes: string; preferred_window: string; sync_status: 'pending' | 'synced' | 'failed' | 'review'; remote_contact_id: string | null; created_at: string };
export type ReviewFlag = { id: string; company_id: string; visit_id: string | null; user_id: string; reason: string; resolved_at: string | null; detail: string; created_at: string };
export type Correction = { id: string; company_id: string; shift_id: string; user_id: string; requested_minutes: number; reason: string; status: 'pending' | 'approved' | 'rejected'; created_at: string };
export type LocationSample = Position & { id: string; company_id: string; user_id: string; shift_id: string };
export type Dataset = { members: Member[]; territories: Territory[]; properties: Property[]; visits: Visit[]; leads: Lead[]; events: ShiftEvent[]; locations: LocationSample[]; flags: ReviewFlag[]; corrections: Correction[] };
export type Command = { id: string; kind: 'shift' | 'visit' | 'location' | 'correction'; occurred_at: string; payload: Record<string, unknown> };
export type SyncResult = { id: string; status: 'accepted' | 'rejected'; error?: string };
export function orderedEvents(events: ShiftEvent[]) { return [...events].sort((a,b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id)); }
export function shiftState(events: ShiftEvent[]): ShiftState {
  const last = orderedEvents(events).at(-1)?.action;
  return last === 'clock_in' || last === 'break_end' ? 'active' : last === 'break_start' ? 'break' : last === 'clock_out' ? 'ended' : 'off';
}
export function canTransition(state: ShiftState, action: ShiftAction) {
  return action === 'clock_in' ? state === 'off' : action === 'break_start' ? state === 'active' : action === 'break_end' ? state === 'break' : state === 'active' || state === 'break';
}
export function activeIntervals(events: ShiftEvent[], until = new Date().toISOString()): [number, number][] {
  let start: number | null = null; const intervals: [number,number][] = [];
  for (const event of orderedEvents(events)) {
    const at = Date.parse(event.occurred_at);
    if ((event.action === 'clock_in' || event.action === 'break_end') && start === null) start = at;
    if ((event.action === 'break_start' || event.action === 'clock_out') && start !== null) { intervals.push([start, at]); start = null; }
  }
  if (start !== null) intervals.push([start, Date.parse(until)]);
  return intervals;
}
export function fieldMinutes(events: ShiftEvent[], until?: string) { return activeIntervals(events, until).reduce((n,[a,b]) => n + Math.max(0,b-a)/60000,0); }
export function locationAllowed(events: ShiftEvent[], capturedAt: string) { const t=Date.parse(capturedAt); return activeIntervals(events).some(([a,b]) => t >= a && t < b); }
export function isStale(position: Position | undefined, now = Date.now()) { return !position || now - Date.parse(position.captured_at) > 120000; }
export function distanceMetres(a: {latitude:number;longitude:number}, b:{latitude:number;longitude:number}) {
  const rad=(d:number)=>d*Math.PI/180, dlat=rad(b.latitude-a.latitude), dlon=rad(b.longitude-a.longitude);
  const h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
export function inPolygon(position:{latitude:number;longitude:number}, ring:number[][]) {
  const x=position.longitude,y=position.latitude; let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) { const [xi,yi]=ring[i],[xj,yj]=ring[j];
    const cross=(x-xi)*(yj-yi)-(y-yi)*(xj-xi);
    if(Math.abs(cross)<1e-10 && x>=Math.min(xi,xj) && x<=Math.max(xi,xj) && y>=Math.min(yi,yj) && y<=Math.max(yi,yj)) return true;
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  } return inside;
}
export function knockFlags(property:Property, gps:Position|null, occurredAt:string, territories:Territory[], userId:string) {
  const flags:string[]=[];
  if(!gps || Math.abs(Date.parse(occurredAt)-Date.parse(gps.captured_at))>120000 || gps.accuracy>50) flags.push('GPS unverified');
  if(gps && distanceMetres(property,gps)>75) flags.push('Away from property');
  if(!territories.some(t=>!t.archived && t.assigned_user_ids.includes(userId) && inPolygon(property,t.boundary.coordinates[0]))) flags.push('Outside assigned territory');
  return flags;
}
export function validateLead(lead: Pick<Lead,'name'|'phone'|'email'>) {
  if(!lead.name.trim()) return 'Enter the homeowner’s name.';
  if(!lead.phone.trim() && !lead.email.trim()) return 'Enter a phone number or email.';
  if(lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return 'Enter a valid email.';
  return null;
}
export function latestVisit(visits:Visit[], propertyId:string) { return visits.filter(v=>v.property_id===propertyId).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at))[0]; }
export function csv(rows: Record<string, unknown>[]) {
  if(!rows.length) return ''; const columns=Object.keys(rows[0]);
  const escape=(v:unknown)=>{let s=String(v??''); if(/^[=+@\-\t\r]/.test(s))s="'"+s; return '"'+s.replaceAll('"','""')+'"';};
  return [columns.map(escape).join(','),...rows.map(row=>columns.map(c=>escape(row[c])).join(','))].join('\r\n');
}
export type QueueEntry = { command: Command; error?: string; attempts: number };
export type QueueStorage = { read():Promise<QueueEntry[]>; write(entries:QueueEntry[]):Promise<void> };
/** A single serialized writer protects background capture and foreground sync from lost updates. */
export class Outbox {
  private chain:Promise<unknown>=Promise.resolve();
  constructor(private storage:QueueStorage) {}
  private serial<T>(fn:()=>Promise<T>):Promise<T> {const result=this.chain.then(fn,fn);this.chain=result.catch(()=>{});return result;}
  entries() {return this.serial(()=>this.storage.read());}
  add(command:Command) {return this.serial(async()=>{const entries=await this.storage.read();if(!entries.some(e=>e.command.id===command.id)){entries.push({command,attempts:0});await this.storage.write(entries);}});}
  flush(send:(commands:Command[])=>Promise<SyncResult[]>) {return this.serial(async()=>{
    const entries=await this.storage.read();const priority=(kind:Command['kind'])=>kind==='shift'?0:kind==='location'?2:1;const pending=entries.filter(e=>!e.error).sort((a,b)=>priority(a.command.kind)-priority(b.command.kind)||a.command.occurred_at.localeCompare(b.command.occurred_at)).slice(0,100);if(!pending.length)return;
    const results=await send(pending.map(e=>e.command));const accepted=new Set(results.filter(r=>r.status==='accepted').map(r=>r.id));
    const errors=new Map(results.filter(r=>r.status==='rejected').map(r=>[r.id,r.error||'Needs review']));
    await this.storage.write(entries.filter(e=>!accepted.has(e.command.id)).map(e=>({...e,attempts:e.attempts+(pending.includes(e)?1:0),error:errors.get(e.command.id)||e.error})));
  });}
  retry(id:string){return this.serial(async()=>this.storage.write((await this.storage.read()).map(e=>e.command.id===id?{...e,error:undefined}:e)));}
}
export function dayKey(at:string|number|Date,timezone='America/New_York') {return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));}
export function dayRange(day:string,timezone='America/New_York'):[number,number] {
 const midnight=(d:string)=>{const wanted=Date.parse(`${d}T00:00:00Z`);let value=wanted;for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value);const get=(key:string)=>parts.find(p=>p.type===key)!.value;const observed=Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);value+=wanted-observed;}return value;};
 const tomorrow=new Date(Date.parse(`${day}T12:00:00Z`)+86400000).toISOString().slice(0,10);return [midnight(day),midnight(tomorrow)];
}
export function minutesOnDay(events:ShiftEvent[],day:string,until?:string) {const [start,end]=dayRange(day);return activeIntervals(events,until).reduce((n,[a,b])=>n+Math.max(0,Math.min(b,end)-Math.max(a,start))/60000,0);}
export function routeSegments(samples:LocationSample[],events:ShiftEvent[]) {const sorted=[...samples].sort((a,b)=>a.captured_at.localeCompare(b.captured_at));const segments:LocationSample[][]=[];for(const p of sorted){if(!locationAllowed(events.filter(e=>e.shift_id===p.shift_id),p.captured_at))continue;const last=segments.at(-1)?.at(-1);if(!last||last.shift_id!==p.shift_id||Date.parse(p.captured_at)-Date.parse(last.captured_at)>120000)segments.push([p]);else segments.at(-1)!.push(p);}return segments;}
