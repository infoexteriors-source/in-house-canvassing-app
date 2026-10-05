import {describe,it,expect} from 'vitest';
import {fieldMinutes,shiftState,locationAllowed,canTransition,knockFlags,validateLead,csv,Outbox,inPolygon,type ShiftEvent,type QueueEntry,type Command} from '../packages/core/src/index';
const event=(action:ShiftEvent['action'],time:string):ShiftEvent=>({id:time,shift_id:'s',user_id:'u',action,occurred_at:`2026-10-${time}`});
const events=[event('clock_in','04T23:00:00Z'),event('break_start','05T00:00:00Z'),event('break_end','05T00:15:00Z'),event('break_start','05T01:00:00Z'),event('break_end','05T01:10:00Z'),event('clock_out','05T02:00:00Z')];
describe('field time',()=>{
 it('excludes multiple breaks across midnight',()=>expect(fieldMinutes(events)).toBe(155));
 it('stops at clock-out and excludes exact break boundary',()=>{expect(locationAllowed(events,'2026-10-05T00:00:00Z')).toBe(false);expect(locationAllowed(events,'2026-10-05T00:15:00Z')).toBe(true);expect(locationAllowed(events,'2026-10-05T02:00:00Z')).toBe(false);});
 it('sorts delayed events, and rejects invalid transitions',()=>{expect(shiftState([...events].reverse())).toBe('ended');expect(canTransition('break','break_start')).toBe(false);expect(canTransition('break','clock_out')).toBe(true);expect(canTransition('ended','clock_in')).toBe(false);});
});
describe('accountability',()=>{
 it('includes polygon boundary',()=>expect(inPolygon({longitude:0,latitude:0},[[0,0],[1,0],[1,1],[0,1],[0,0]])).toBe(true));
 it('flags poor GPS and out-of-area records without dropping them',()=>{const flags=knockFlags({id:'p',company_id:'c',created_by:'u',territory_id:null,address:'1 Oak St',latitude:38,longitude:-78,do_not_knock:false,version:1},{latitude:39,longitude:-78,accuracy:100,captured_at:'2026-10-05T01:00:00Z'},'2026-10-05T01:05:00Z',[],'u');expect(flags).toEqual(['GPS unverified','Away from property','Outside assigned territory']);});
 it('requires a name and contact method',()=>{expect(validateLead({name:'Sam',phone:'',email:''})).toBeTruthy();expect(validateLead({name:'Sam',phone:'5551234567',email:''})).toBeNull();});
 it('escapes quotes and spreadsheet formulas in exports',()=>expect(csv([{name:'=CMD()',note:'a,"b"'}])).toContain('"\'=CMD()","a,""b"""'));
});
describe('durable offline queue',()=>{
 it('deduplicates and survives reconstruction',async()=>{let persisted:QueueEntry[]=[];const storage={read:async()=>structuredClone(persisted),write:async(v:QueueEntry[])=>{persisted=structuredClone(v);}};const box=new Outbox(storage);const command:Command={id:'1',kind:'shift',occurred_at:'2026-10-05',payload:{}};await Promise.all([box.add(command),box.add(command)]);expect((await new Outbox(storage).entries())).toHaveLength(1);});
 it('retains failures, accepts acknowledged records, and does not lose concurrent capture',async()=>{let entries:QueueEntry[]=[];const box=new Outbox({read:async()=>structuredClone(entries),write:async(v)=>{entries=v;}});const c=(id:string):Command=>({id,kind:'location',occurred_at:'2026-10-05',payload:{}});await box.add(c('1'));await Promise.all([box.flush(async()=>[{id:'1',status:'accepted'}]),box.add(c('2'))]);expect((await box.entries()).map(e=>e.command.id)).toEqual(['2']);await expect(box.flush(async()=>{throw Error('offline');})).rejects.toThrow('offline');expect(await box.entries()).toHaveLength(1);await box.flush(async()=>[{id:'2',status:'rejected',error:'Outside shift'}]);expect((await box.entries())[0].error).toBe('Outside shift');await box.retry('2');expect((await box.entries())[0].error).toBeUndefined();});
});

import {dayRange,minutesOnDay,routeSegments} from '../packages/core/src/index';
it('handles 23-hour and 25-hour company days at DST transitions',()=>{const spring=dayRange('2026-03-08'),fall=dayRange('2026-11-01');expect((spring[1]-spring[0])/3600000).toBe(23);expect((fall[1]-fall[0])/3600000).toBe(25);});
it('clips an overnight shift to the selected company day',()=>{const shift=[{...events[0],occurred_at:'2026-10-05T03:30:00Z'},{...events.at(-1)!,occurred_at:'2026-10-05T05:00:00Z'}];expect(minutesOnDay(shift,'2026-10-04')).toBe(30);expect(minutesOnDay(shift,'2026-10-05')).toBe(60);});
it('does not draw a route across missing location updates',()=>{const points=[0,30,300].map((n,i)=>({id:String(i),company_id:'c',user_id:'u',shift_id:'s',latitude:39,longitude:-78,accuracy:5,captured_at:new Date(Date.parse('2026-10-04T23:01:00Z')+n*1000).toISOString()}));expect(routeSegments(points,events).map(s=>s.length)).toEqual([2,1]);});

it('sends shift boundaries before a backlog of location readings',async()=>{let persisted:QueueEntry[]=[];const box=new Outbox({read:async()=>structuredClone(persisted),write:async(v)=>{persisted=v;}});for(let i=0;i<110;i++)await box.add({id:`point-${i}`,kind:'location',occurred_at:new Date(1791208800000+i*30000).toISOString(),payload:{}});await box.add({id:'end-shift',kind:'shift',occurred_at:'2026-10-05T14:00:00Z',payload:{action:'clock_out'}});let sent:Command[]=[];await box.flush(async(commands)=>{sent=commands;return commands.map(c=>({id:c.id,status:'accepted' as const}));});expect(sent[0].id).toBe('end-shift');expect(sent).toHaveLength(100);expect(await box.entries()).toHaveLength(11);});
