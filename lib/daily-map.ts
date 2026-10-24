import {parseGPS} from './business';
import {distanceKm} from './field-updates';
export type DayPoint={id:string;recordId:string;kind:'Check in'|'Check out'|'Visit'|'Visit close';name:string;customerId:string;route:string;address:string;capturedAt:string;lat:number;lng:number;accuracy:number|null;legacyTime:boolean};
export function validDay(day:string){return /^20\d{2}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;}
function gps(raw:string|undefined){try{const p=JSON.parse(raw||'null');return p&&typeof p.lat==='number'&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&typeof p.lng==='number'&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180?{lat:p.lat,lng:p.lng,accuracy:typeof p.accuracy==='number'&&p.accuracy>=0&&Number.isFinite(p.accuracy)?p.accuracy:null,capturedAt:typeof p.capturedAt==='string'?p.capturedAt:''}:null;}catch{return null;}}
export function dailyPoints(records:{id:string;kind:string;created:string;data:string|Record<string,string>}[],day:string){
 const points:DayPoint[]=[];let missingGPS=0;
 for(const r of records){let d:Record<string,string>;try{d=typeof r.data==='string'?JSON.parse(r.data):r.data;}catch{missingGPS++;continue;}
  const close=r.kind==='Visits'?gps(d['Closing GPS']):null,start=gps(d['GPS data']);
  const candidates:{p:ReturnType<typeof gps>|ReturnType<typeof parseGPS>;kind:DayPoint['kind'];suffix:string;time:string;address:string}[]=[];
  if(r.kind==='Attendance')candidates.push({p:start||parseGPS(d.Location||''),kind:d.Action==='Check out'?'Check out':'Check in',suffix:'attendance',time:start?.capturedAt||d['Location captured at'],address:d['Location address']||d['Location name']||''});
  else if(r.kind==='Visits'){
   if(start)candidates.push({p:start,kind:'Visit',suffix:'start',time:start.capturedAt,address:close?(d['Opening location address']||d['Opening location name']||''):(d['Location address']||d['Location name']||'')});
   if(close)candidates.push({p:close,kind:'Visit close',suffix:'close',time:close.capturedAt,address:d['Location address']||d['Location name']||''});
   if(!start&&!close)candidates.push({p:parseGPS(d.Location||''),kind:d.Status==='Closed'?'Visit close':'Visit',suffix:'legacy',time:d['Location captured at'],address:d['Location address']||d['Location name']||''});
  }
  if(!candidates.some(c=>c.p))missingGPS++;
  for(const c of candidates){if(!c.p)continue;const exact=Number.isFinite(Date.parse(c.time)),at=exact?c.time:(/^\d{2}:\d{2}(:\d{2})?$/.test(d.Time||'')?day+'T'+d.Time+(d.Time.length===5?':00':'')+'+05:30':r.created);if(!Number.isFinite(Date.parse(at)))continue;
   const capturedAt=new Date(at).toISOString();if(new Date(at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})!==day)continue;
   if(points.some(p=>p.recordId===r.id&&p.lat===c.p!.lat&&p.lng===c.p!.lng&&p.capturedAt===capturedAt))continue;
   points.push({id:r.id+':'+c.suffix,recordId:r.id,kind:c.kind,name:r.kind==='Visits'?d.Customer||'Customer visit':c.kind,customerId:d['Customer ID']||'',route:d.Route||'',address:c.address||'',capturedAt,lat:c.p.lat,lng:c.p.lng,accuracy:c.p.accuracy,legacyTime:!exact});
  }
 }
 points.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)||a.id.localeCompare(b.id));
 let straightKm=0;for(let i=1;i<points.length;i++)straightKm+=distanceKm({...points[i-1],accuracy:0},{...points[i],accuracy:0});
 return {points,missingGPS,straightKm:Math.round(straightKm*100)/100,visits:new Set(points.filter(p=>p.kind.startsWith('Visit')).map(p=>p.recordId)).size};
}
/** Overlap each chunk's last stop so no journey leg disappears at an API boundary. */
export function routeChunks<T>(points:T[]){const chunks:T[][]=[];for(let i=0;i<points.length-1;i+=26)chunks.push(points.slice(i,i+27));return chunks;}
