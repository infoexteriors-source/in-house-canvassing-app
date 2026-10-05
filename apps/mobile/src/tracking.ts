import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {capture,loadState,latestEvents,updateState} from './runtime';
import {shiftState} from '@canvass/core';
export const TRACKING_TASK='fieldwork-active-location';
TaskManager.defineTask<{locations:Location.LocationObject[]}>(TRACKING_TASK,async({data,error})=>{
 if(error){await updateState(s=>({...s,tracking_error:error.message}));return;}
 const state=await loadState();if(!state.user?.active||shiftState(latestEvents(state))!=='active'){await stopTracking();return;}
 for(const location of data?.locations??[])await capture({latitude:location.coords.latitude,longitude:location.coords.longitude,accuracy:location.coords.accuracy??999,captured_at:new Date(location.timestamp).toISOString()});
});
export async function startTracking(requestPermissions=true){try{
 const foreground=await (requestPermissions?Location.requestForegroundPermissionsAsync():Location.getForegroundPermissionsAsync());if(foreground.status!=='granted')throw Error('Location permission is off. Your shift can continue, but GPS records will need review.');
 const background=await (requestPermissions?Location.requestBackgroundPermissionsAsync():Location.getBackgroundPermissionsAsync());if(background.status!=='granted')throw Error('Allow background location in Settings to track while your phone is locked.');
 await Location.startLocationUpdatesAsync(TRACKING_TASK,{accuracy:Location.Accuracy.High,timeInterval:30000,distanceInterval:0,deferredUpdatesInterval:30000,pausesUpdatesAutomatically:false,showsBackgroundLocationIndicator:true,foregroundService:{notificationTitle:'WE ROOF shift active',notificationBody:'Location is shared with your owner during field time. Pause or clock out to stop.',killServiceOnDestroy:true}});
 await updateState(s=>({...s,tracking_error:null}));
 }catch(e){await updateState(s=>({...s,tracking_error:e instanceof Error?e.message:'Tracking unavailable'}));}
}
export async function stopTracking(){if(await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK))await Location.stopLocationUpdatesAsync(TRACKING_TASK);}
export async function reconcileTracking(){const state=await loadState();if(state.user?.active&&shiftState(latestEvents(state))==='active')await startTracking(false);else await stopTracking();}
