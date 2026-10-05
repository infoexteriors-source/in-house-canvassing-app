import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
export const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
export const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
export const service=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
export async function authenticate(req:Request,owner=false){
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)throw new HttpError('Sign in required',401);
 const db=service();const {data:{user},error}=await db.auth.getUser(token);if(error||!user)throw new HttpError('Invalid session',401);
 const {data:member}=await db.from('memberships').select('*').eq('user_id',user.id).eq('active',true).single();
 if(!member)throw new HttpError('Account deactivated or not enrolled',403);if(owner&&member.role!=='owner')throw new HttpError('Owner access required',403);
 return {db,user,member};
}
export class HttpError extends Error{constructor(message:string,public status=400){super(message);}}
export function serve(handler:(req:Request)=>Promise<Response>){Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return respond({error:'Method not allowed'},405);try{return await handler(req);}catch(e){console.error(e instanceof Error?e.message:'Request failed');return respond({error:e instanceof Error?e.message:'Request failed'},e instanceof HttpError?e.status:500);}});}
export const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
