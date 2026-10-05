import {useEffect,useRef} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {latestVisit,outcomeColors,outcomeLabels,routeSegments} from '@canvass/core';
import type {MapProps} from './Map';
export default function LiveMap(props:MapProps&{token:string}) {
 const container=useRef<HTMLDivElement>(null),map=useRef<mapboxgl.Map|null>(null),latest=useRef(props);latest.current=props;
 useEffect(()=>{const m=new mapboxgl.Map({container:container.current!,accessToken:props.token,style:'mapbox://styles/mapbox/streets-v12',center:[-78.166,39.174],zoom:13});map.current=m;m.addControl(new mapboxgl.NavigationControl(),'bottom-right');m.on('click',e=>{if(latest.current.drawPoints!==null)latest.current.onDrawPoint([e.lngLat.lng,e.lngLat.lat]);});return()=>{m.remove();map.current=null;};},[props.token]);
 useEffect(()=>{const m=map.current;if(!m)return;const markers:mapboxgl.Marker[]=[];
 const update=()=>{
  const territories=props.data.territories.filter(t=>!t.archived&&(props.selectedTerritory==='all'||t.id===props.selectedTerritory));
  const source={type:'FeatureCollection' as const,features:territories.map(t=>({type:'Feature' as const,properties:{name:t.name,color:t.color},geometry:t.boundary}))};
  if(m.getSource('territories'))(m.getSource('territories') as mapboxgl.GeoJSONSource).setData(source);else {m.addSource('territories',{type:'geojson',data:source});m.addLayer({id:'territory-fill',type:'fill',source:'territories',paint:{'fill-color':['get','color'],'fill-opacity':.12}});m.addLayer({id:'territory-line',type:'line',source:'territories',paint:{'line-color':['get','color'],'line-width':2,'line-dasharray':[3,2]}});}
  const routes={type:'FeatureCollection' as const,features:props.showRoutes?props.data.members.filter(r=>!props.focusedRep||r.user_id===props.focusedRep).flatMap(r=>routeSegments(props.data.locations.filter(p=>p.user_id===r.user_id),props.data.events).filter(s=>s.length>1).map(s=>({type:'Feature' as const,properties:{},geometry:{type:'LineString' as const,coordinates:s.map(p=>[p.longitude,p.latitude])}}))):[]};
  if(m.getSource('routes'))(m.getSource('routes') as mapboxgl.GeoJSONSource).setData(routes);else{m.addSource('routes',{type:'geojson',data:routes});m.addLayer({id:'route-line',type:'line',source:'routes',paint:{'line-color':'#147b70','line-width':3}});}
  const draw={type:'FeatureCollection' as const,features:props.drawPoints&&props.drawPoints.length>1?[{type:'Feature' as const,properties:{},geometry:{type:'LineString' as const,coordinates:props.drawPoints}}]:[]};
  if(m.getSource('drawing'))(m.getSource('drawing') as mapboxgl.GeoJSONSource).setData(draw);else{m.addSource('drawing',{type:'geojson',data:draw});m.addLayer({id:'drawing-line',type:'line',source:'drawing',paint:{'line-color':'#174c3c','line-width':3}});}
  for(const p of props.data.properties.filter(p=>props.selectedTerritory==='all'||p.territory_id===props.selectedTerritory)){const v=latestVisit(props.data.visits,p.id),outcome=p.do_not_knock?'do_not_knock':v?.outcome;const el=document.createElement('button');el.className='live-door';el.style.background=outcome?outcomeColors[outcome]:'#64748b';el.setAttribute('aria-label',`${p.address}, ${outcome?outcomeLabels[outcome]:'No visits'}`);el.title=p.address;el.textContent=outcome==='do_not_knock'?'×':outcome==='inspection_requested'?'✓':'';el.onclick=e=>{e.stopPropagation();if(latest.current.drawPoints===null)latest.current.onProperty(p);};markers.push(new mapboxgl.Marker({element:el}).setLngLat([p.longitude,p.latitude]).addTo(m));}
  for(const r of props.data.members.filter(r=>r.role==='canvasser'&&(!props.focusedRep||r.user_id===props.focusedRep))){const p=props.data.locations.filter(l=>l.user_id===r.user_id).sort((a,b)=>b.captured_at.localeCompare(a.captured_at))[0];if(!p)continue;const el=document.createElement('div');el.className='live-rep';el.textContent=r.name.split(' ').map(n=>n[0]).join('');el.title=r.name;markers.push(new mapboxgl.Marker({element:el}).setLngLat([p.longitude,p.latitude]).addTo(m));}
  if(territories.length){const bounds=new mapboxgl.LngLatBounds();for(const t of territories)for(const point of t.boundary.coordinates[0])bounds.extend(point as [number,number]);m.fitBounds(bounds,{padding:60,maxZoom:16,duration:0});}
 };
 if(m.isStyleLoaded())update();else m.once('load',update);
 return()=>{m.off('load',update);markers.forEach(marker=>marker.remove());};
 },[props.data,props.focusedRep,props.selectedTerritory,props.showRoutes,props.drawPoints]);
 return <div className="live-map" ref={container}/>;
}
