import {db} from './server';
import {guard} from './operations';
import {gpsString,type GPSPoint} from './field-rules';
import type {Member} from './permissions';
/** Called only inside an authorised GPS visit transaction. Never changes postal Address. */
export function customerLocationStatements(customer:{id:string;data:string;details:Record<string,string>},gps:GPSPoint,area:{name?:string;address?:string},visitId:string,m:Member){
 const old=customer.details,previous=Date.parse(old['Location captured at']||'');if(Number.isFinite(previous)&&previous>=Date.parse(gps.capturedAt))return [];
 const next={...old,Location:gpsString(gps),'GPS data':JSON.stringify(gps),'Location captured at':gps.capturedAt,'Location name':(area.name||'').trim().slice(0,300),'Location address':(area.address||'').trim().slice(0,1000),'Location source':'Latest MR visit GPS','Location visit ID':visitId,'Location MR':m.name};
 return [guard('version','EXISTS(SELECT 1 FROM records WHERE id=? AND data=?)',[customer.id,customer.data]),db().prepare('UPDATE records SET data=? WHERE id=?').bind(JSON.stringify(next),customer.id)];
}
