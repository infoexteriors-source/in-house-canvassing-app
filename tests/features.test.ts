import {describe,it,expect} from 'vitest';
import {leaderboard,weekRange,dayRange,goalProgress,hailLabel,type Dataset} from '../packages/core/src/index';
import {parseSpcHail,boundsOf,within,spcHailUrl} from '../supabase/functions/_shared/hail';

const member=(id:string,name:string,extra:Partial<Dataset['members'][number]>={})=>({user_id:id,company_id:'c',name,email:`${id}@x.test`,role:'canvasser' as const,active:true,...extra});
const visit=(id:string,user:string,at:string,outcome:Dataset['visits'][number]['outcome']='no_answer')=>({id,company_id:'c',property_id:`p${id}`,user_id:user,shift_id:'s',outcome,notes:'',occurred_at:at,gps:null,follow_up_at:null});

describe('leaderboard',()=>{
 const data={
  members:[member('a','Alex'),member('b','Blair'),member('o','Owner',{role:'owner'}),member('x','Gone',{active:false})],
  visits:[visit('1','a','2026-10-05T14:00:00Z'),visit('2','b','2026-10-05T15:00:00Z','inspection_requested'),visit('3','b','2026-10-05T16:00:00Z','interested'),visit('4','a','2026-10-04T15:00:00Z'),visit('5','x','2026-10-05T15:00:00Z')],
  leads:[{id:'l1',company_id:'c',visit_id:'2',property_id:'p2',user_id:'b',name:'H',phone:'1',email:'',concerns:'',notes:'',preferred_window:'',sync_status:'pending' as const,remote_contact_id:null,created_at:'2026-10-05T15:00:00Z'}],
 };
 it('ranks active canvassers by doors, then leads, counting only the period',()=>{
  const rows=leaderboard(data,dayRange('2026-10-05'));
  expect(rows.map(r=>[r.name,r.doors,r.leads,r.inspections])).toEqual([['Blair',2,1,1],['Alex',1,0,0]]);
 });
 it('excludes owners and deactivated reps',()=>expect(leaderboard(data,dayRange('2026-10-05')).some(r=>r.user_id==='o'||r.user_id==='x')).toBe(false));
 it('uses Monday-start weeks in the company timezone',()=>{const [from,to]=weekRange('2026-10-08');expect(new Date(from).toISOString()).toBe('2026-10-05T04:00:00.000Z');expect(new Date(to).toISOString()).toBe('2026-10-12T04:00:00.000Z');expect(leaderboard(data,[from,to]).find(r=>r.name==='Alex')?.doors).toBe(1);});
 it('caps goal progress and handles a zero goal',()=>{expect(goalProgress(50,40)).toBe(1);expect(goalProgress(10,40)).toBe(.25);expect(goalProgress(0,0)).toBe(0);});
});

describe('SPC hail reports',()=>{
 const sample=['Time,Size,Location,County,State,Lat,Lon,Comments','1745,175,2 N Winchester,Frederick,VA,39.21,-78.16,"Golf ball hail, minor roof damage. (LWX)"','0230,100,Stephens City,Frederick,VA,39.08,-78.22,(LWX)','bad,row','1800,0,Nowhere,X,VA,39,-78,zero size'].join('\n');
 it('parses size, location and the 12Z report-day rollover',()=>{
  const [a,b]=parseSpcHail(sample,'2026-10-20');
  expect(a).toMatchObject({size_in:1.75,occurred_at:'2026-10-20T17:45:00Z',county:'Frederick',state:'VA',comments:'Golf ball hail, minor roof damage. (LWX)'});
  expect(b.occurred_at).toBe('2026-10-21T02:30:00Z');
 });
 it('skips malformed and zero-size rows, and files without the hail header',()=>{expect(parseSpcHail(sample,'2026-10-20')).toHaveLength(2);expect(parseSpcHail('Time,F_Scale,Location\n1200,EF1,X','2026-10-20')).toEqual([]);});
 it('builds the dated SPC file URL',()=>expect(spcHailUrl('2026-10-20')).toBe('https://www.spc.noaa.gov/climo/reports/261020_rpts_hail.csv'));
 it('filters to territories with a buffer',()=>{const b=boundsOf([[[-78.18,39.16],[-78.13,39.16],[-78.13,39.19],[-78.18,39.19]]],25)!;expect(within({latitude:39.21,longitude:-78.16},b)).toBe(true);expect(within({latitude:40.5,longitude:-78.16},b)).toBe(false);});
 it('labels sizes the way homeowners describe them',()=>{expect(hailLabel(1.75)).toBe('1.75″ · golf ball');expect(hailLabel(0.5)).toBe('0.50″');});
});
