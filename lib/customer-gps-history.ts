import {createHash} from 'node:crypto';
import {db} from './server';
import {parseGPS} from './business';
import type {Member,StoredRecord} from './permissions';
export const customerGPSKind='Customer GPS capture';
/** Snapshot only saved device captures, never manufacture a visit or a capture time. */
export function customerGPSSnapshot(id:string,data:Record<string,string>,owner:string,assignedTo:string,legacy=false){
 const at=data['Location captured at'],point=parseGPS(data.Location||'');
 if(!point||!at||!Number.isFinite(Date.parse(at))||data['Location source']==='Latest MR visit GPS')return null;
 const capturedAt=new Date(at).toISOString();
 return {id:'customer-gps:'+createHash('sha256').update(JSON.stringify([id,capturedAt,point.lat,point.lng])).digest('hex'),owner,assigned_to:assignedTo,kind:customerGPSKind,created:capturedAt,data:{Date:new Date(capturedAt).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),Customer:data.Name||'Customer','Customer ID':id,Route:data.Route||'',Location:data.Location,'Location captured at':capturedAt,'Location address':data['Location address']||data['Location name']||'','Legacy attribution':legacy?'Yes':'No'}};
}
export function customerGPSStatements(id:string,data:Record<string,string>,old:StoredRecord|null,actor:Member){
 const previous:Record<string,string>=old?JSON.parse(old.data):{};
 const changed=data.Location!==previous.Location||data['Location captured at']!==previous['Location captured at'];
 // Prevent a copied visit source from hiding a newly recaptured customer location.
 if(changed){delete data['Location visit ID'];delete data['Location MR'];if(data['Location source']==='Latest MR visit GPS')data['Location source']='Customer GPS capture';}
 const snapshots=[old?customerGPSSnapshot(id,previous,old.owner,old.assigned_to,true):null,changed?customerGPSSnapshot(id,data,actor.user_id||'',actor.email):null].filter(x=>x!==null);
 return snapshots.map(s=>db().prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET id=excluded.id').bind(s.id,s.owner,s.kind,JSON.stringify(s.data),s.created,s.assigned_to));
}
