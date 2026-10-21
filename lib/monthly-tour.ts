import {eligibleForPlan,type PlanRow} from './tour-planning';
export type Holiday={date:string;name:string};
export type TourDay={date:string;type:'visit'|'leave';routes:string[];reason:string;customers?:{id:string;name:string;routeId:string;routeName:string}[]};
export type TourHistory={id:string;action:string;reason:string;at:string;actor:string;before:TourDay[];after:TourDay[];from?:string;to?:string};
export type Programme={month:string;startsOn:string;status:'Draft'|'Pending'|'Approved'|'Rejected';revision:number;days:TourDay[];history:TourHistory[];submittedAt?:string;reviewedAt?:string;reason?:string;calendarRevision?:number};
export type HolidayCalendar={year:string;name:string;holidays:Holiday[];confirmed:boolean;revision:number;source?:string};
export const programmeKind='Tour programme',calendarKind='Tour calendar';
export const programmeID=(email:string,month:string)=>`monthly-tour:${month}:${email}`;
export const calendarID=(year:string)=>`tour-calendar:${year}`;
export function validTourDate(value:unknown):value is string{return typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function monthDates(month:string){if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month))return [];const [y,m]=month.split('-').map(Number);return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);}
export function nationalHolidays(year:string):Holiday[]{return [{date:year+'-01-26',name:'Republic Day'},{date:year+'-08-15',name:'Independence Day'},{date:year+'-10-02',name:'Gandhi Jayanti'}];}
export function emptyCalendar(year:string):HolidayCalendar{return {year,name:'Company government holiday calendar',holidays:nationalHolidays(year),confirmed:false,revision:0};}
export function dayOff(date:string,calendar:HolidayCalendar){const holiday=calendar.holidays.find(h=>h.date===date)?.name;return new Date(date+'T12:00:00Z').getUTCDay()===0?(holiday?'Sunday · '+holiday:'Sunday'):holiday||'';}
export function workingDates(month:string,calendar:HolidayCalendar,start=month+'-01'){return monthDates(month).filter(d=>d>=start&&!dayOff(d,calendar));}
export function tourGate(programme:Programme|null,calendar:HolidayCalendar,date:string){
 let message='';const off=dayOff(date,calendar),day=programme?.days.find(d=>d.date===date);
 if(off)message=off+' — visits are not scheduled today.';
 else if(!calendar.confirmed)message='Admin must confirm this year’s government holiday calendar before tour approval.';
 else if(!programme||programme.month!==date.slice(0,7))message='Create this month’s tour programme and submit it for Admin approval before recording visits.';
 else if(programme.status!=='Approved')message=`Monthly tour programme ${programme.status.toLowerCase()}. Admin approval is required before recording visits.`;
 else if(!day)message='No approved schedule for this date. Request a tour change from Admin.';
 else if(day.type==='leave')message='Approved leave for this date. Request a working route change before recording visits.';
 else if(!day.routes.length)message='No approved route for this date. Request a tour change from Admin.';
 return {date,allowed:!message,message,routeIds:message?[]:day!.routes,status:programme?.status||'Not planned',month:date.slice(0,7)};
}
/** Customer snapshots preserve approved coverage when customers move or masters change later. */
export function expandProgrammes(records:PlanRow[]):PlanRow[]{
 const existing=new Map(records.filter(r=>r.kind==='Tour plan').map(r=>[`${r.assigned_to}|${r.data.Date}|${r.data['Customer ID']||r.data.Customer}`,r]));
 for(const row of records.filter(r=>r.kind===programmeKind)){
  const p=row.data as unknown as Programme;if(p.status!=='Approved')continue;
  const add=(day:TourDay,status:string,reason='',to='')=>{for(const c of day.customers||[]){const key=`${row.assigned_to}|${day.date}|${c.id}`,old=existing.get(key);if(old&&status!=='Planned'&&old.data.Status==='Planned'&&old.data['Programme ID'])continue;
   existing.set(key,{id:`tour:${row.assigned_to}:${day.date}:${c.id}`,kind:'Tour plan',assigned_to:row.assigned_to,owner:row.owner,created:row.created,data:{Date:day.date,Customer:c.name,'Customer ID':c.id,Route:c.routeName,'Route ID':c.routeId,Status:status,'Programme ID':row.id,'Plan reason':reason,...(to?{'Rescheduled to':to}:{})}});
  }};
  for(const h of p.history||[])for(const before of h.before){const destination=h.action==='postpone'&&h.from&&h.to?(before.date===h.from?h.to:h.from):h.after.find(d=>d.date!==before.date&&d.routes.some(id=>before.routes.includes(id)))?.date;add(before,destination?'Rescheduled':'Cancelled',h.reason,destination);}
  const calendarRow=records.find(r=>r.id===calendarID(p.month.slice(0,4))),calendar=calendarRow?.data as unknown as HolidayCalendar|undefined;
  for(const day of p.days)if(day.type==='visit')add(day,calendar&&dayOff(day.date,calendar)?'Cancelled':'Planned',calendar?dayOff(day.date,calendar):'');
 }
 return [...records.filter(r=>r.kind!=='Tour plan'),...existing.values()];
}
export function approvedLeaveOn(records:PlanRow[],email:string,date:string){return records.find(r=>r.kind==='Leave'&&r.assigned_to===email&&r.data.Status==='Approved'&&r.data.From<=date&&r.data.To>=date&&!JSON.parse(r.data['Excluded dates']||'[]').includes(date));}
export {eligibleForPlan};
