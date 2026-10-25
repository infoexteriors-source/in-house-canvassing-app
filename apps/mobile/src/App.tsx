import {useCallback,useEffect,useState,type ReactNode} from 'react';
import {View,Text,Pressable,ScrollView,StyleSheet,Alert as NativeAlert,Linking,AppState,ActivityIndicator,Platform,KeyboardAvoidingView} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import * as Crypto from 'expo-crypto';
import {outcomes,outcomeLabels,outcomeColors,latestVisit,shiftState,fieldMinutes,validateLead,dayKey,type Outcome,type Property,type Position,type ShiftAction,type QueueEntry} from '@canvass/core';
import {configured,supabase,loadState,refresh,latestEvents,command,submit,sync,outbox,updateState,clearLocal,repairProjection,type LocalState} from './runtime';
import {reconcileTracking,stopTracking,startTracking} from './tracking';
import {Alert,Badge,Button,Card,Field,SectionLabel,Tabs,Title,c,ui} from './ui';
const mapToken=process.env.EXPO_PUBLIC_MAPBOX_TOKEN;if(mapToken)Mapbox.setAccessToken(mapToken);
const fmt=(minutes:number)=>`${Math.floor(minutes/60)}h ${Math.floor(minutes%60)}m`;
/* Tinted backgrounds for the selected door outcome; the outcome colour itself comes from @canvass/core. */
const outcomeTints:Record<Outcome,string>={no_answer:'#f0f2f5',not_interested:'#f6eee9',follow_up:'#fcf3e1',interested:'#e4f3f0',inspection_requested:'#edf1fc',existing_customer:'#f2edf8',do_not_knock:'#fbecec'};
function Brand({inverse=false}:{inverse?:boolean}){return <View style={s.brand}><View style={s.brandMark}><Text style={s.brandMarkText}>⌂</Text></View><Text style={[s.wordmark,inverse?{color:'#ffffff'}:null]}>WE ROOF</Text></View>;}
export default function App(){return <SafeAreaProvider><FieldApp/></SafeAreaProvider>;}
function FieldApp(){
 const [state,setState]=useState<LocalState|null>(null),[entries,setEntries]=useState<QueueEntry[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[screen,setScreen]=useState<'map'|'doors'|'time'|'sync'>('map'),[selected,setSelected]=useState<Property|null>(null),[offline,setOffline]=useState(false),[newPassword,setNewPassword]=useState(false);
 const viewRefresh=useCallback(async()=>{setState(await loadState());setEntries(await outbox.entries());},[]);
 const connect=useCallback(async()=>{let failure='';try{await sync();}catch(e){failure=e instanceof Error?e.message:'Work saved on your phone.';}try{await refresh();}catch(e){failure=e instanceof Error?e.message:failure;}const current=await loadState();if(current.user&&!current.user.active)await stopTracking();setMessage(failure);await viewRefresh();},[viewRefresh]);
 useEffect(()=>{let alive=true;void(async()=>{await repairProjection();if(alive)await viewRefresh();if(configured){try{await refresh();await reconcileTracking();}catch{}if(alive)await viewRefresh();}})();const timer=setInterval(()=>{void Network.getNetworkStateAsync().then(n=>{setOffline(n.isInternetReachable===false);if(n.isInternetReachable!==false)void connect();else void viewRefresh();});},30000);const app=AppState.addEventListener('change',status=>{if(status==='active'){supabase?.auth.startAutoRefresh();void(async()=>{await connect();await reconcileTracking();await viewRefresh();})();}else supabase?.auth.stopAutoRefresh();});return()=>{alive=false;clearInterval(timer);app.remove();};},[connect,viewRefresh]);
 useEffect(()=>{async function handle(url:string){const hash=url.split('#')[1]??url.split('?')[1]??'';const params=new URLSearchParams(hash);const access_token=params.get('access_token'),refresh_token=params.get('refresh_token');if(access_token&&refresh_token){await supabase?.auth.setSession({access_token,refresh_token});setNewPassword(true);}}void Linking.getInitialURL().then(url=>{if(url)void handle(url);});const subscription=Linking.addEventListener('url',e=>void handle(e.url));return()=>subscription.remove();},[]);
 async function run(fn:()=>Promise<void>){setBusy(true);try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{await viewRefresh();setBusy(false);}}
 if(!state)return <SafeAreaView style={[s.root,s.center]}><ActivityIndicator color={c.primary}/></SafeAreaView>;
 if(!configured)return <AuthShell title="Ready for your field team." subtitle="Connect the company’s Supabase and Mapbox credentials, then install a development build to start your pilot."><Alert tone="info" title="Setup required">Setup instructions are included in docs/SETUP.md in the project.</Alert></AuthShell>;
 if(newPassword)return <PasswordSetup onDone={()=>{setNewPassword(false);void connect();}}/>;
 if(!state.user)return <Login busy={busy} message={message} onLogin={(email,password)=>void run(async()=>{const {error}=await supabase!.auth.signInWithPassword({email,password});if(error)throw error;await refresh();})}/>;
 const events=latestEvents(state),status=shiftState(events),active=status==='active'&&state.user.active;
 async function shift(action:ShiftAction){const id=action==='clock_in'?Crypto.randomUUID():events[0]?.shift_id;if(!id)return;await submit(command('shift',{action,shift_id:id}));if(action==='clock_in'||action==='break_end')await startTracking();else await stopTracking();try{await sync();}catch{};}
 async function addDoor(lon?:number,lat?:number){if(!active){setMessage('Clock in or end your break to record a door.');return;}if(lon===undefined||lat===undefined){const permission=await Location.getForegroundPermissionsAsync();if(permission.granted){const p=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});lon=p.coords.longitude;lat=p.coords.latitude;}else {const center=state!.data.territories[0]?.boundary.coordinates[0][0];if(!center)throw Error('Choose a house on the map or enable location.');[lon,lat]=center;}}
 let address='';try{const {data}=await supabase!.functions.invoke('geocode',{body:{longitude:lon,latitude:lat}});address=data?.address??'';}catch{}
 const existing=state!.data.properties.find(p=>Math.abs(p.longitude-lon!)<.00003&&Math.abs(p.latitude-lat!)<.00003);
 setSelected(existing??{id:Crypto.randomUUID(),company_id:state!.user!.company_id,created_by:state!.user!.user_id,territory_id:null,address,latitude:lat!,longitude:lon!,do_not_knock:false,version:1});}
 async function download(){if(!mapToken)throw Error('Mapbox is not configured.');for(const t of state!.data.territories.filter(t=>!t.archived)){const ring=t.boundary.coordinates[0],lons=ring.map(p=>p[0]),lats=ring.map(p=>p[1]);const name=`territory-${t.id}`;const pack=await Mapbox.offlineManager.getPack(name);if(pack)await Mapbox.offlineManager.deletePack(name);
 await new Promise<void>((resolve,reject)=>{void Mapbox.offlineManager.createPack({name,styleURL:Mapbox.StyleURL.Street,minZoom:10,maxZoom:18,bounds:[[Math.max(...lons),Math.max(...lats)],[Math.min(...lons),Math.min(...lats)]]},(_region,progress)=>{if(progress.percentage>=100)resolve();},(_region,error)=>reject(Error(String(error)))).catch(reject);});await updateState(st=>({...st,downloaded_territory_ids:[...new Set([...st.downloaded_territory_ids,t.id])]}));}setMessage('Assigned maps downloaded. Door history is saved on this phone.');}
 if(selected)return <DoorForm state={state} property={selected} busy={busy} cancel={()=>setSelected(null)} save={(payload)=>void run(async()=>{await submit(command('visit',{...payload,shift_id:events[0].shift_id}));setSelected(null);setMessage('Door recorded.');try{await sync();}catch{};})}/>;
 const syncLabel=offline?'Offline':entries.length?`${entries.length} pending`:'Saved';
 const statusLabel=!state.user.active?'ACCOUNT DEACTIVATED':active?'IN THE FIELD':status==='break'?'ON BREAK':'OFF SHIFT';
 const statusColor=active?'#86d4ae':status==='break'?'#f2be5c':'#cfc9bf';
 const territoryName=state.data.territories.find(t=>!t.archived)?.name;
 return <SafeAreaView style={s.root} edges={['top','left','right','bottom']}>
  <View style={s.shiftHeader}>
   <View style={s.rowBetween}><Brand inverse/><Pressable accessibilityRole="button" accessibilityLabel={`Sync status: ${syncLabel}`} onPress={()=>setScreen('sync')} style={[s.syncChip,offline?{backgroundColor:'rgba(242,190,92,0.15)',borderColor:'rgba(242,190,92,0.35)'}:null]}><View style={[s.dot,{backgroundColor:offline?'#f2be5c':entries.length?'#f2be5c':'#4cbf8a'}]}/><Text style={[s.syncChipText,offline?{color:'#f2be5c'}:null]}>{syncLabel}</Text></Pressable></View>
   <View style={s.rowBetween}>
    <View style={{flexShrink:1}}><View style={s.row}><View style={[s.dot,{backgroundColor:statusColor}]}/><Text style={[s.statusLabel,{color:statusColor}]}>{statusLabel}</Text></View><Text style={s.timer}>{fmt(fieldMinutes(events))}</Text><Text style={s.timerHint}>{state.user.name} · breaks excluded</Text></View>
    <View style={s.headerActions}>{!state.user.active?null:status==='active'||status==='break'?<><Button title={active?'Take break':'End break'} disabled={busy} variant={active?'inverse':'default'} onPress={()=>void run(()=>shift(active?'break_start':'break_end'))}/><Button title="Clock out" disabled={busy} variant="inverse" onPress={()=>NativeAlert.alert('End your shift?','Field time and location tracking will stop.',[{text:'Keep working',style:'cancel'},{text:'Clock out',onPress:()=>void run(()=>shift('clock_out'))}])}/></>:<Button title="Clock in" size="lg" disabled={busy} onPress={()=>void run(()=>shift('clock_in'))}/>}</View>
   </View>
  </View>
  {status==='break'?<View style={s.banner}><Text style={s.bannerText}>Location tracking is paused. Break time isn’t counted.</Text></View>:null}
  {state.tracking_error&&active||message?<View style={s.notices}>
   {state.tracking_error&&active?<Alert tone="warning" title="Location tracking needs attention" onPress={()=>void Linking.openSettings()}>{`${state.tracking_error} Tap to open Settings.`}</Alert>:null}
   {message?<Alert tone="neutral" onPress={()=>setMessage('')}>{`${message}  ·  Tap to dismiss`}</Alert>:null}
  </View>:null}

  {screen==='map'?<View style={s.flex}>
   <View style={s.mapHeading}><View style={{flexShrink:1}}><Text style={s.h2}>{territoryName??'Your assigned territory'}</Text><Text style={s.muted}>Tap a house to record a door.</Text></View>{territoryName?<Badge label="Assigned" tone="success"/>:null}</View>
   {mapToken?<Mapbox.MapView style={s.flex} styleURL={Mapbox.StyleURL.Street} onPress={e=>{if(e.geometry.type==='Point')void run(()=>addDoor(e.geometry.coordinates[0],e.geometry.coordinates[1]));}}><Mapbox.Camera zoomLevel={14} centerCoordinate={state.data.territories[0]?.boundary.coordinates[0][0]??[-78.166,39.174]}/>{active?<Mapbox.LocationPuck/>:null}<Mapbox.ShapeSource id="territories" shape={{type:'FeatureCollection',features:state.data.territories.filter(t=>!t.archived).map(t=>({type:'Feature',properties:{color:t.color},geometry:t.boundary}))}}><Mapbox.FillLayer id="areas" style={{fillColor:['get','color'],fillOpacity:.1}}/><Mapbox.LineLayer id="boundaries" style={{lineColor:['get','color'],lineWidth:2,lineDasharray:[3,2]}}/></Mapbox.ShapeSource><Mapbox.ShapeSource id="doors" shape={{type:'FeatureCollection',features:state.data.properties.map(p=>{const v=latestVisit(state.data.visits,p.id),o=p.do_not_knock?'do_not_knock':v?.outcome;return {type:'Feature',id:p.id,properties:{id:p.id,color:o?outcomeColors[o]:'#64748b',label:o?outcomeLabels[o]:'No visits',symbol:o==='do_not_knock'?'×':o==='inspection_requested'?'✓':''},geometry:{type:'Point',coordinates:[p.longitude,p.latitude]}};})}} onPress={e=>{const p=state.data.properties.find(p=>p.id===e.features[0]?.properties?.id);if(p&&active)setSelected(p);}}><Mapbox.CircleLayer id="door-pins" style={{circleRadius:8,circleColor:['get','color'],circleStrokeWidth:2.5,circleStrokeColor:'#ffffff'}}/><Mapbox.SymbolLayer id="door-labels" minZoomLevel={16} style={{textField:['get','label'],textSize:11,textOffset:[0,1.4],textColor:c.foreground,textHaloColor:'#ffffff',textHaloWidth:2}}/><Mapbox.SymbolLayer id="door-symbols" style={{textField:['get','symbol'],textSize:12,textColor:'#ffffff',textAllowOverlap:true}}/></Mapbox.ShapeSource></Mapbox.MapView>:<View style={[s.flex,s.center,s.pad]}><Card style={{alignItems:'center'}}><Text style={s.h2}>Map setup required</Text><Text style={[s.muted,{textAlign:'center'}]}>Add the company’s Mapbox token to show streets and house pins.</Text></Card></View>}
   <View style={s.mapActions}>
    <View style={s.legend}>{(['no_answer','interested','follow_up','inspection_requested','do_not_knock'] as const).map(o=><View key={o} style={s.row}><View style={[s.legendDot,{backgroundColor:outcomeColors[o]}]}/><Text style={s.legendText}>{outcomeLabels[o]}</Text></View>)}</View>
    <Button title="Record a door at my location" size="lg" disabled={busy||!active} onPress={()=>void run(()=>addDoor())}/>
    <Button title={busy?'Downloading…':'Download assigned maps'} variant="outline" disabled={busy||offline} onPress={()=>void run(download)}/>
   </View>
  </View>:null}

  {screen==='doors'?<ScrollView style={s.flex} contentContainerStyle={s.scroll}><Title>Doors</Title><Text style={s.muted}>Visit history and follow-ups in your assigned areas.</Text>
   {[...state.data.properties].sort((a,b)=>Number(b.do_not_knock)-Number(a.do_not_knock)).map(p=>{const visits=state.data.visits.filter(v=>v.property_id===p.id).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)),v=visits[0],o=p.do_not_knock?'do_not_knock':v?.outcome;return <Card key={p.id}>
    <View style={s.rowBetween}><Text style={[s.rowTitle,{flexShrink:1}]}>{p.address}</Text></View>
    <Badge label={o?outcomeLabels[o]:'No visits'} tone={p.do_not_knock?'danger':'neutral'} dot={o?outcomeColors[o]:'#64748b'}/>
    {visits.slice(0,3).map(v=><Text key={v.id} style={s.historyLine}>{dayKey(v.occurred_at)} · {outcomeLabels[v.outcome]}{v.notes?` · ${v.notes}`:''}{v.follow_up_at?` · Follow-up ${dayKey(v.follow_up_at)}`:''}</Text>)}
    <View style={s.buttonRow}><Button title="Record visit" size="sm" disabled={!active} style={s.flex} onPress={()=>setSelected(p)}/><Button title="Directions" size="sm" variant="outline" style={s.flex} onPress={()=>void Linking.openURL(Platform.OS==='ios'?`http://maps.apple.com/?daddr=${p.latitude},${p.longitude}`:`google.navigation:q=${p.latitude},${p.longitude}`)}/></View>
   </Card>;})}
   {!state.data.properties.length?<Card><Text style={s.rowTitle}>No doors yet</Text><Text style={s.muted}>Your first recorded house will appear here.</Text></Card>:null}
  </ScrollView>:null}

  {screen==='time'?<TimeScreen state={state} busy={busy} onCorrection={(id,minutes,reason)=>void run(async()=>{await submit(command('correction',{shift_id:id,requested_minutes:minutes,reason}));setMessage('Correction request saved for your owner.');try{await sync();}catch{};})}/>:null}

  {screen==='sync'?<ScrollView style={s.flex} contentContainerStyle={s.scroll}><Title>Sync</Title><Text style={s.muted}>Everything saves on your phone first.</Text>
   <View style={[s.syncBanner,offline?s.syncBannerOffline:s.syncBannerOnline]}><Text style={[s.syncBannerTitle,{color:offline?'#fcefd6':c.success}]}>{offline?'No signal':entries.length?`${entries.length} waiting to send`:'All work sent'}</Text><Text style={[s.syncBannerText,{color:offline?'#fcefd6':'#133d2e'}]}>{offline?`${entries.length} records are saved on your phone. Keep working; they send when you reconnect.`:`Your work stays here until the server confirms it. Last sync: ${state.last_sync?new Date(state.last_sync).toLocaleString():'not yet synced'}.`}</Text></View>
   <Button title={busy?'Syncing…':'Sync now'} size="lg" disabled={busy} onPress={()=>void run(connect)}/>
   {entries.filter(e=>e.error).map(entry=><Card key={entry.command.id} style={{borderColor:'#ebc2b5'}}><View style={s.rowBetween}><Text style={[s.rowTitle,{textTransform:'capitalize'}]}>{entry.command.kind}</Text><Badge label="Needs attention" tone="danger"/></View><Text style={[s.muted,{color:c.danger}]}>{entry.error}</Text><Button title="Retry this record" size="sm" variant="outline" onPress={()=>void run(async()=>{await outbox.retry(entry.command.id);await connect();})}/></Card>)}
   <Card><SectionLabel>Offline maps</SectionLabel><Text style={s.rowTitle}>{state.downloaded_territory_ids.length} {state.downloaded_territory_ids.length===1?'territory':'territories'} downloaded</Text><Text style={s.muted}>Offline, type addresses by hand. Automatic address lookup needs signal.</Text></Card>
   <View style={s.rowBetween}><Text style={s.muted}>Signed in as {state.user.name}</Text><Button title="Sign out" variant="ghost" size="sm" disabled={busy} onPress={()=>void run(async()=>{if(active||status==='break')throw Error('Clock out before signing out.');await sync();await stopTracking();await clearLocal();})}/></View>
  </ScrollView>:null}

  <Tabs value={screen} onChange={setScreen} items={[{value:'map',label:'Map'},{value:'doors',label:'Doors'},{value:'time',label:'Hours'},{value:'sync',label:'Sync',badge:entries.length}]}/>
 </SafeAreaView>;
}
function AuthShell({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}){return <SafeAreaView style={[s.root,{backgroundColor:c.sidebar}]} edges={['top','left','right']}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={{flexGrow:1}} keyboardShouldPersistTaps="handled"><View style={s.authHero}><Brand inverse/><Text style={s.authTitle}>{title}</Text><Text style={s.authSubtitle}>{subtitle}</Text></View><View style={s.authSheet}>{children}</View></ScrollView></KeyboardAvoidingView></SafeAreaView>;}
function Login({busy,message,onLogin}:{busy:boolean;message:string;onLogin:(email:string,password:string)=>void}){const [email,setEmail]=useState(''),[password,setPassword]=useState('');return <AuthShell title={'Your territory.\nDoor by door.'} subtitle="Sign in with the account your company owner invited."><Field label="Work email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email"/><Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password"/>{message?<Alert tone="danger">{message}</Alert>:null}<Button title={busy?'Signing in…':'Sign in'} size="lg" disabled={busy||!email||!password} onPress={()=>onLogin(email,password)}/><Text style={[s.muted,{textAlign:'center'}]}>Forgot your password? Ask your owner to resend your invite.</Text><Card style={{marginTop:'auto'}}><Text style={s.rowTitle}>Location is only used while you’re clocked in.</Text><Text style={s.muted}>Tracking stops on breaks and when you clock out.</Text></Card></AuthShell>;}
function PasswordSetup({onDone}:{onDone:()=>void}){const [password,setPassword]=useState(''),[error,setError]=useState('');return <AuthShell title="Set your password" subtitle="Choose a password for your WE ROOF account."><Field label="New password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters."/>{error?<Alert tone="danger">{error}</Alert>:null}<Button title="Save password" size="lg" disabled={password.length<8} onPress={()=>void supabase!.auth.updateUser({password}).then(({error})=>error?setError(error.message):onDone())}/></AuthShell>;}
function DoorForm({state,property,busy,cancel,save}:{state:LocalState;property:Property;busy:boolean;cancel:()=>void;save:(payload:Record<string,unknown>)=>void}){const [address,setAddress]=useState(property.address),[outcome,setOutcome]=useState<Outcome>('no_answer'),[notes,setNotes]=useState(''),[name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[concerns,setConcerns]=useState(''),[preferred,setPreferred]=useState(''),[followUp,setFollowUp]=useState(''),[ack,setAck]=useState(false),[gps,setGps]=useState<Position|null>(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;void Location.getForegroundPermissionsAsync().then(async(permission)=>{if(!permission.granted)return;const p=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});if(alive)setGps({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy??999,captured_at:new Date(p.timestamp).toISOString()});}).catch(()=>{});return()=>{alive=false;};},[]);
 const needsLead=outcome==='interested'||outcome==='inspection_requested';
 function finish(){if(!address.trim()){setError('Enter the property address.');return;}if(needsLead){const err=validateLead({name,phone,email});if(err){setError(err);return;}}if(property.do_not_knock&&!ack){setError('Acknowledge the do-not-knock warning before recording.');return;}if(outcome==='follow_up'&&(!/^\d{4}-\d{2}-\d{2}$/.test(followUp)||!Number.isFinite(Date.parse(followUp)))){setError('Enter a follow-up date as YYYY-MM-DD.');return;}
 save({property:{...property,address:address.trim()},outcome,notes,gps,acknowledge_dnk:ack,follow_up_at:outcome==='follow_up'?new Date(`${followUp}T12:00:00-04:00`).toISOString():null,lead:needsLead?{id:Crypto.randomUUID(),name:name.trim(),phone:phone.trim(),email:email.trim(),concerns,preferred_window:preferred}:null});}
 return <SafeAreaView style={s.root} edges={['top','left','right','bottom']}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={s.formHeader}><View style={{flexShrink:1}}><Text style={[ui.sectionLabel,{color:c.primary}]}>RECORD A DOOR</Text><Text style={s.formTitle} numberOfLines={2}>{address||'New house'}</Text></View><Button title="Cancel" variant="secondary" size="sm" onPress={cancel}/></View>
  {property.do_not_knock?<View style={s.dnk}><Text style={s.dnkKicker}>STOP</Text><Text style={s.dnkTitle}>DO NOT KNOCK</Text><Text style={s.dnkText}>This house is marked company-wide. Only your owner can clear it.</Text><Button title={ack?'Warning acknowledged':'Acknowledge warning'} variant={ack?'inverse':'outline'} onPress={()=>setAck(true)}/></View>:null}
  <ScrollView style={s.flex} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
   <Field label="Property address" value={address} onChangeText={setAddress}/>
   <Badge label={gps?`GPS accuracy ±${Math.round(gps.accuracy)} m`:'GPS unavailable · flagged for owner review'} tone={gps?'success':'warning'}/>
   <View style={{gap:10}}><Text style={ui.label}>What happened at the door?</Text><View style={s.outcomes} accessibilityRole="radiogroup">{outcomes.map(o=>{const on=outcome===o;return <Pressable accessibilityRole="radio" accessibilityState={{selected:on}} key={o} onPress={()=>setOutcome(o)} style={[s.outcome,o==='do_not_knock'?{width:'100%'}:null,on?{borderColor:outcomeColors[o],borderWidth:2,backgroundColor:outcomeTints[o]}:null]}><View style={[s.outcomeSwatch,{backgroundColor:outcomeColors[o]}]}><Text style={s.outcomeMark}>{on?'✓':o==='do_not_knock'?'×':''}</Text></View><Text style={[s.outcomeText,on?{fontWeight:'700'}:null]}>{outcomeLabels[o]}</Text></Pressable>;})}</View></View>
   {outcome==='follow_up'?<Field label="Follow-up date" placeholder="YYYY-MM-DD" value={followUp} onChangeText={setFollowUp}/>:null}
   {needsLead?<Card style={outcome==='inspection_requested'?{borderColor:c.info,borderWidth:2}:null}><SectionLabel>Homeowner details</SectionLabel><Field label="Homeowner name" value={name} onChangeText={setName} autoComplete="name"/><Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel"/><Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" hint="A phone number or email is required so the office can follow up."/><Field label="Roofing concerns" value={concerns} onChangeText={setConcerns}/>{outcome==='inspection_requested'?<Field label="Preferred inspection window" value={preferred} onChangeText={setPreferred} placeholder="e.g. Tue morning" hint="Your office will confirm the appointment."/>:null}</Card>:null}
   <Field label="Field notes" multiline value={notes} onChangeText={setNotes} placeholder="Roof condition, best time, who answered"/>
   {error?<Alert tone="danger">{error}</Alert>:null}
  </ScrollView>
  <View style={s.footer}><Button title={busy?'Saving…':'Save door record'} size="lg" disabled={busy} onPress={finish}/><Text style={[s.muted,{textAlign:'center',fontSize:12}]}>Saves on your phone first. Sends when you have signal.</Text></View>
 </KeyboardAvoidingView></SafeAreaView>;
}
function TimeScreen({state,busy,onCorrection}:{state:LocalState;busy:boolean;onCorrection:(shiftId:string,minutes:number,reason:string)=>void}){const [selected,setSelected]=useState<string|null>(null),[minutes,setMinutes]=useState(''),[reason,setReason]=useState('');const ids=[...new Set(state.data.events.filter(e=>e.user_id===state.user?.user_id).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)).map(e=>e.shift_id))];
 return <ScrollView style={s.flex} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled"><Title>My field hours</Title><Text style={s.muted}>Breaks pause field time. Approved corrections preserve your original shift.</Text>
  {ids.map(id=>{const events=state.data.events.filter(e=>e.shift_id===id),start=events.find(e=>e.action==='clock_in');return <Card key={id}>
   <View style={s.rowBetween}><SectionLabel>{start?dayKey(start.occurred_at):'Shift'}</SectionLabel><Text style={s.shiftTotal}>{fmt(fieldMinutes(events))}</Text></View>
   {events.map(e=><View key={e.id} style={s.eventRow}><View style={[s.dot,{backgroundColor:e.action.startsWith('break')?'#c98a12':c.success}]}/><Text style={[s.eventText,{textTransform:'capitalize'}]}>{e.action.replaceAll('_',' ')}</Text><Text style={s.eventTime}>{new Date(e.occurred_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</Text></View>)}
   {state.data.corrections.filter(c=>c.shift_id===id).map(cor=><Badge key={cor.id} label={`${cor.requested_minutes>0?'+':''}${cor.requested_minutes} min correction · ${cor.status}`} tone={cor.status==='approved'?'success':cor.status==='rejected'?'danger':'warning'}/>)}
   <Button title="Request time correction" size="sm" variant="outline" onPress={()=>{setSelected(id);setReason('');setMinutes('');}}/>
  </Card>;})}
  {!ids.length?<Card><Text style={s.rowTitle}>No shifts yet</Text><Text style={s.muted}>Clock in from the Map tab to start your first shift.</Text></Card>:null}
  {selected?<Card style={{borderColor:c.foreground,borderWidth:2}}><Text style={s.h2}>Request a correction</Text><Field label="Minutes to add or subtract" value={minutes} onChangeText={setMinutes} keyboardType="numbers-and-punctuation" placeholder="15 or -15"/><Field label="Reason" value={reason} onChangeText={setReason}/><View style={s.buttonRow}><Button title="Cancel" variant="outline" style={s.flex} onPress={()=>setSelected(null)}/><Button title="Send to owner" style={{flex:2}} disabled={busy||!reason.trim()||!minutes||!Number.isInteger(Number(minutes))||Math.abs(Number(minutes))>1440} onPress={()=>{onCorrection(selected,Number(minutes),reason);setSelected(null);}}/></View></Card>:null}
 </ScrollView>;}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:c.background},flex:{flex:1},center:{alignItems:'center',justifyContent:'center'},pad:{padding:20},
 row:{flexDirection:'row',alignItems:'center',gap:6},rowBetween:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
 dot:{width:8,height:8,borderRadius:4},
 brand:{flexDirection:'row',alignItems:'center',gap:10},brandMark:{width:36,height:36,borderRadius:8,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},brandMarkText:{color:'#ffffff',fontSize:20,fontWeight:'700',marginTop:-2},
 wordmark:{fontSize:24,fontWeight:'800',letterSpacing:.5,color:c.foreground},
 shiftHeader:{backgroundColor:c.sidebar,paddingHorizontal:18,paddingTop:10,paddingBottom:18,gap:16},
 syncChip:{flexDirection:'row',alignItems:'center',gap:7,minHeight:36,paddingHorizontal:12,borderRadius:18,backgroundColor:'rgba(76,191,138,0.12)',borderWidth:1,borderColor:'rgba(76,191,138,0.3)'},
 syncChipText:{fontSize:13,fontWeight:'600',color:'#86d4ae'},
 statusLabel:{fontSize:12,fontWeight:'700',letterSpacing:1.3},
 timer:{fontSize:44,fontWeight:'800',color:'#ffffff',letterSpacing:-.5,marginTop:2,fontVariant:['tabular-nums']},
 timerHint:{fontSize:13,color:'#cfc9bf'},
 headerActions:{gap:8,alignItems:'stretch'},
 banner:{backgroundColor:c.warningSoft,borderBottomWidth:1,borderBottomColor:'#e8c786',paddingHorizontal:18,paddingVertical:12},bannerText:{color:'#4a2b00',fontSize:14,fontWeight:'600'},
 notices:{paddingHorizontal:14,paddingTop:12,gap:8},
 h2:{fontSize:20,fontWeight:'700',color:c.foreground},
 muted:{fontSize:14,color:c.mutedForeground,lineHeight:20},
 rowTitle:{fontSize:16,fontWeight:'700',color:c.foreground,lineHeight:22},
 historyLine:{fontSize:13,color:c.mutedForeground,lineHeight:19},
 buttonRow:{flexDirection:'row',gap:8},
 mapHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingHorizontal:18,paddingVertical:12,backgroundColor:c.card,borderBottomWidth:1,borderBottomColor:c.border},
 mapActions:{backgroundColor:c.card,borderTopWidth:1,borderTopColor:c.border,padding:12,gap:8},
 legend:{flexDirection:'row',flexWrap:'wrap',columnGap:12,rowGap:6,paddingHorizontal:4,paddingBottom:4},legendDot:{width:11,height:11,borderRadius:6,borderWidth:2,borderColor:'#ffffff'},legendText:{fontSize:12,fontWeight:'600',color:'#36322d'},
 scroll:{padding:16,gap:12,paddingBottom:32},
 syncBanner:{borderRadius:12,padding:16,gap:4,borderWidth:1},syncBannerOffline:{backgroundColor:'#2a2116',borderColor:'#4a3a22'},syncBannerOnline:{backgroundColor:c.successSoft,borderColor:'#b8d6c5'},syncBannerTitle:{fontSize:22,fontWeight:'800'},syncBannerText:{fontSize:14,lineHeight:20},
 authHero:{padding:28,paddingTop:36,gap:14},authTitle:{fontSize:44,lineHeight:44,fontWeight:'800',color:'#ffffff',textTransform:'uppercase',letterSpacing:-.5,marginTop:24},authSubtitle:{fontSize:16,lineHeight:24,color:'#d2ccc3'},
 authSheet:{flexGrow:1,backgroundColor:c.background,borderTopLeftRadius:24,borderTopRightRadius:24,padding:24,gap:16},
 formHeader:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:12,paddingHorizontal:18,paddingVertical:14,backgroundColor:c.card,borderBottomWidth:1,borderBottomColor:c.border},
 formTitle:{fontSize:28,fontWeight:'800',color:c.foreground,marginTop:4},
 dnk:{backgroundColor:'#9e2419',padding:18,gap:8},dnkKicker:{color:'#ffd9d1',fontSize:12,fontWeight:'800',letterSpacing:2},dnkTitle:{color:'#ffffff',fontSize:30,fontWeight:'800'},dnkText:{color:'#ffe8e3',fontSize:15,lineHeight:22,marginBottom:4},
 outcomes:{flexDirection:'row',flexWrap:'wrap',gap:8},
 outcome:{width:'48.5%',flexDirection:'row',gap:10,alignItems:'center',minHeight:56,paddingHorizontal:12,borderWidth:1,borderColor:c.input,borderRadius:12,backgroundColor:c.card},
 outcomeSwatch:{width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center'},outcomeMark:{color:'#ffffff',fontSize:13,fontWeight:'800'},
 outcomeText:{fontSize:15,fontWeight:'600',color:c.foreground,flexShrink:1},
 footer:{backgroundColor:c.card,borderTopWidth:1,borderTopColor:c.border,padding:16,gap:6},
 shiftTotal:{fontSize:24,fontWeight:'800',color:c.foreground,fontVariant:['tabular-nums']},
 eventRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:4},eventText:{flex:1,fontSize:15,fontWeight:'600',color:c.foreground},eventTime:{fontSize:14,color:'#36322d',fontVariant:['tabular-nums']},
});
