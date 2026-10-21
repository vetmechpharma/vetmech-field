import {db,HttpError} from './server';
import {type Member,canRead} from './permissions';
import {guard,indiaDay} from './operations';
import {stateSQL} from './periods';
import {accessRoute} from './customer-route';
import {programmeKind,calendarKind,programmeID,calendarFor,holidayWorkFor,tourGate,eligibleForPlan,approvedLeaveOn,type Programme,type HolidayCalendar,type TourDay} from './monthly-tour';
import type {PlanRow} from './tour-planning';
export async function tourSnapshot(){
 const stamp=(await db().prepare(stateSQL).first<{stamp:string}>())!.stamp;
 const raw=(await db().prepare('SELECT * FROM records').all<any>()).results;
 return {stamp,raw,rows:raw.map(r=>({...r,data:JSON.parse(r.data)})) as PlanRow[]};
}
export function calendarFrom(rows:PlanRow[],month:string){return calendarFor(rows,month,indiaDay());}
export function programmeFrom(rows:PlanRow[],email:string,month:string){return (rows.find(r=>r.id===programmeID(email,month))?.data as unknown as Programme)||null;}
export function routeForCustomer(owner:Member,c:PlanRow,rows:PlanRow[]){return accessRoute(owner,c.data)||c.data['Route ID']||rows.find(r=>r.kind==='Routes'&&r.data.Name===c.data.Route)?.id||'';}
export function routesFor(owner:Member,rows:PlanRow[]){const customers=rows.filter(c=>c.kind==='Customers'&&canRead(owner,{...c,data:JSON.stringify(c.data),owner:c.owner||'',created:c.created||''}));return rows.filter(r=>r.kind==='Routes'&&(canRead(owner,{...r,data:JSON.stringify(r.data),owner:r.owner||'',created:r.created||''})||customers.some(c=>routeForCustomer(owner,c,rows)===r.id)));}
export function snapshotDay(day:TourDay,owner:Member,rows:PlanRow[]):TourDay{
 if(day.type==='leave')return {...day,routes:[],customers:[]};
 const routes=routesFor(owner,rows);if(day.routes.some(id=>!routes.some(r=>r.id===id)))throw new HttpError(400,'A selected route is no longer assigned or accessible to this MR.');
 const customers=rows.filter(c=>c.kind==='Customers'&&canRead(owner,{...c,data:JSON.stringify(c.data),owner:c.owner||'',created:c.created||''})&&eligibleForPlan(c.data,day.date)&&day.routes.includes(routeForCustomer(owner,c,rows))).map(c=>{const routeId=routeForCustomer(owner,c,rows);return {id:c.id,name:c.data.Name,routeId,routeName:routes.find(r=>r.id===routeId)!.data.Name}});
 if(customers.length>1000)throw new HttpError(400,'A single day exceeds 1,000 customers. Plan fewer routes for that day.');
 return {...day,customers};
}
export function leaveSyncStatements(owner:Member,days:TourDay[],rows:PlanRow[],now:string){
 const out=[];const working=days.filter(d=>d.type==='visit').map(d=>d.date);
 // An approved working-route change cancels leave only on those dates, preserving the rest of a range.
 for(const leave of rows.filter(r=>r.kind==='Leave'&&r.assigned_to===owner.email&&r.data.Status==='Approved')){
  const excluded=JSON.parse(leave.data['Excluded dates']||'[]') as string[],add=working.filter(d=>d>=leave.data.From&&d<=leave.data.To&&!excluded.includes(d));
  if(add.length)out.push(db().prepare('UPDATE records SET data=? WHERE id=?').bind(JSON.stringify({...leave.data,'Excluded dates':JSON.stringify([...excluded,...add]),'Tour change at':now}),leave.id));
 }
 for(const day of days){const id=`tour-leave:${owner.email}:${day.date}`;if(day.type==='leave')out.push(db().prepare("INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,'Leave',?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(id,owner.user_id||owner.email,JSON.stringify({From:day.date,To:day.date,Status:'Approved',Reason:day.reason,'Tour programme':programmeID(owner.email,day.date.slice(0,7))}),now,owner.email));}
 return out;
}
export function gateFrom(rows:PlanRow[],m:Member,date=indiaDay()){return tourGate(programmeFrom(rows,m.email,date.slice(0,7)),calendarFrom(rows,date.slice(0,7)),date,holidayWorkFor(rows,m.email,date));}
export async function approvedTourGuards(m:Member,date:string,customerId?:string){
 const {stamp,rows}=await tourSnapshot(),gate=gateFrom(rows,m,date);if(!gate.allowed)throw new HttpError(409,gate.message);
 if(customerId){const c=rows.find(r=>r.id===customerId&&r.kind==='Customers');if(!c||!canRead(m,{...c,data:JSON.stringify(c.data),owner:c.owner||'',created:c.created||''})||!gate.routeIds.includes(routeForCustomer(m,c,rows)))throw new HttpError(409,'This customer is outside today’s approved routes. Request a tour change and obtain Admin approval.');if(!eligibleForPlan(c.data,date))throw new HttpError(409,'This customer is unavailable for visits. Ask Admin to review their status.');}
 return [guard('version',`(${stateSQL})=?`,[stamp])];
}
export {programmeKind,calendarKind,approvedLeaveOn};
