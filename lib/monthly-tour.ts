import {eligibleForPlan,type PlanRow} from './tour-planning';
export type Holiday={date:string;name:string;note?:string};
export type TourDay={date:string;type:'visit'|'leave';routes:string[];reason:string;customers?:{id:string;name:string;routeId:string;routeName:string}[]};
export type TourHistory={id:string;action:string;reason:string;at:string;actor:string;before:TourDay[];after:TourDay[];from?:string;to?:string};
export type Programme={month:string;startsOn:string;status:'Draft'|'Pending'|'Approved'|'Rejected';revision:number;days:TourDay[];history:TourHistory[];submittedAt?:string;reviewedAt?:string;reason?:string;calendarRevision?:number};
export type HolidayCalendar={year:string;month?:string;name:string;holidays:Holiday[];confirmed:boolean;revision:number;source?:string};
export type HolidayWork=TourDay & {status:'Approved'|'Cancelled';revision:number;requestId:string;approvedAt:string;approvedBy:string;holiday:string;history?:TourHistory[]};
export const programmeKind='Tour programme',calendarKind='Tour calendar',holidayWorkKind='Tour holiday work';
export const holidayWorkID=(email:string,date:string)=>`holiday-work:${date}:${email}`;
export function holidayWorkFor(records:PlanRow[],email:string,date:string){const work=records.find(r=>r.id===holidayWorkID(email,date))?.data as unknown as HolidayWork|undefined;return work?.status==='Approved'?work:null;}
export const programmeID=(email:string,month:string)=>`monthly-tour:${month}:${email}`;
export const calendarID=(year:string)=>`tour-calendar:${year}`;
export function validTourDate(value:unknown):value is string{return typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function monthDates(month:string){if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month))return [];const [y,m]=month.split('-').map(Number);return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);}
export function nationalHolidays(year:string):Holiday[]{return [{date:year+'-01-26',name:'Republic Day'},{date:year+'-08-15',name:'Independence Day'},{date:year+'-10-02',name:'Gandhi Jayanti'}];}
export function emptyCalendar(period:string):HolidayCalendar{const year=period.slice(0,4),month=period.length===7?period:undefined;return {year,month,name:'Company holiday calendar',holidays:nationalHolidays(year).filter(h=>!month||h.date.startsWith(month)),confirmed:false,revision:0};}
/** Preserve reviewed historical/current annual calendars; future months need explicit monthly publication. */
export function calendarFor(records:PlanRow[],month:string,today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})):HolidayCalendar{
 const own=records.find(r=>r.id===calendarID(month))?.data as unknown as HolidayCalendar|undefined;if(own)return own;
 const old=records.find(r=>r.id===calendarID(month.slice(0,4)))?.data as unknown as HolidayCalendar|undefined;
 return old?{...old,month,holidays:old.holidays.filter(h=>h.date.startsWith(month)),confirmed:old.confirmed&&month<=today.slice(0,7)&&records.some(r=>r.kind===programmeKind&&(r.data as unknown as Programme).month===month&&(r.data as unknown as Programme).status==='Approved')}:emptyCalendar(month);
}
export function dayOff(date:string,calendar:HolidayCalendar){const holiday=calendar.holidays.find(h=>h.date===date)?.name;return new Date(date+'T12:00:00Z').getUTCDay()===0?(holiday?'Sunday · '+holiday:'Sunday'):holiday||'';}
export function workingDates(month:string,calendar:HolidayCalendar,start=month+'-01'){return monthDates(month).filter(d=>d>=start&&!dayOff(d,calendar));}
export function tourGate(programme:Programme|null,calendar:HolidayCalendar,date:string,holidayWork:HolidayWork|null=null){
 let message='';const off=dayOff(date,calendar),exception=off&&holidayWork?.status==='Approved'&&holidayWork.date===date?holidayWork:null,day=exception||programme?.days.find(d=>d.date===date);
 if(off&&!exception)message=off+' — request Admin permission to work on this holiday before recording visits.';
 else if(!calendar.confirmed)message='Admin must publish this month’s holiday calendar before tour approval.';
 else if(!programme||programme.month!==date.slice(0,7))message='Create this month’s tour programme and submit it for Admin approval before recording visits.';
 else if(programme.status!=='Approved')message=`Monthly tour programme ${programme.status.toLowerCase()}. Admin approval is required before recording visits.`;
 else if(date<programme.startsOn)message='This date is before the approved programme starts.';
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
  const calendar=calendarFor(records,p.month);
  for(const day of p.days)if(day.type==='visit')add(day,dayOff(day.date,calendar)?'Cancelled':'Planned',dayOff(day.date,calendar));
  for(const work of records.filter(r=>r.kind===holidayWorkKind&&r.assigned_to===row.assigned_to).map(r=>r.data as unknown as HolidayWork).filter(d=>d.date.startsWith(p.month)&&d.date>=p.startsOn)){
   for(const h of work.history||[])for(const before of h.before)add(before,'Cancelled',h.reason);
   const active=work.status==='Approved'&&!!dayOff(work.date,calendar);if(active||!p.days.some(d=>d.date===work.date))add(work,active?'Planned':'Cancelled',work.reason);
  }
 }
 return [...records.filter(r=>r.kind!=='Tour plan'),...existing.values()];
}
export function approvedLeaveOn(records:PlanRow[],email:string,date:string){return records.find(r=>r.kind==='Leave'&&r.assigned_to===email&&r.data.Status==='Approved'&&r.data.From<=date&&r.data.To>=date&&!JSON.parse(r.data['Excluded dates']||'[]').includes(date));}
export {eligibleForPlan};
