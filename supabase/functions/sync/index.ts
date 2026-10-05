import {authenticate,HttpError,respond,serve,uuid} from '../_shared/http.ts';
serve(async(req)=>{
 const {db,user,member}=await authenticate(req);if(member.role!=='canvasser')throw new HttpError('Canvasser account required',403);
 const body=await req.json();if(!Array.isArray(body.commands)||body.commands.length>100)throw new HttpError('Send up to 100 commands');
 // Shift boundaries are committed before delayed locations, even if upload order differs.
 const commands=[...body.commands].sort((a,b)=>(a.kind==='shift'?0:1)-(b.kind==='shift'?0:1)||String(a.occurred_at).localeCompare(String(b.occurred_at)));
 const results=[];
 for(const command of commands){if(!uuid(command.id)||!command.payload||!Number.isFinite(Date.parse(command.occurred_at))){results.push({id:command.id,status:'rejected',error:'Malformed command'});continue;}
 const {data,error}=await db.rpc('apply_field_command',{p_user:user.id,command});results.push(error?{id:command.id,status:'rejected',error:error.message}:data);}
 return respond({results});
});
