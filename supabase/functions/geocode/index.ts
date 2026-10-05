import {authenticate,HttpError,respond,serve} from '../_shared/http.ts';
serve(async(req)=>{await authenticate(req);const {latitude,longitude}=await req.json();if(typeof latitude!=='number'||typeof longitude!=='number'||Math.abs(latitude)>90||Math.abs(longitude)>180)throw new HttpError('Valid coordinates required');
 const token=Deno.env.get('MAPBOX_SERVER_TOKEN');if(!token)throw new HttpError('Address lookup is not configured. Enter the address manually.',503);
 const url=new URL('https://api.mapbox.com/search/geocode/v6/reverse');url.searchParams.set('longitude',String(longitude));url.searchParams.set('latitude',String(latitude));url.searchParams.set('permanent','true');url.searchParams.set('types','address');url.searchParams.set('access_token',token);
 const result=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!result.ok)throw new HttpError('Address lookup unavailable. Enter the address manually.',502);const data=await result.json();return respond({address:data.features?.[0]?.properties?.full_address??'',latitude,longitude});
});
