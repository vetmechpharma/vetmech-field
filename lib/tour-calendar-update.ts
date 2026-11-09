import {dayOff,workingDates,type HolidayCalendar,type Programme,type TourHistory} from './monthly-tour';

/** Calendar edits may remove a proposed work day, but never rewrite approved work. */
export function programmeAfterCalendar(p:Programme,calendar:HolidayCalendar,change:{id:string;reason:string;at:string;actor:string}):Programme|null {
 if(!['Draft','Pending'].includes(p.status))return null;
 const off=p.days.filter(d=>!!dayOff(d.date,calendar));
 const days=p.scope==='day'?p.days:p.days.filter(d=>!dayOff(d.date,calendar));
 const next:Programme={...p,days,revision:p.revision+1,calendarRevision:calendar.revision};
 const history:TourHistory={...change,action:'Company holiday update',before:off,after:[]};
 if(off.length)next.history=[...(p.history||[]),history];
 if(p.status==='Pending'){
  if(p.scope==='day'&&dayOff(p.startsOn,calendar)){
   next.status='Rejected';next.reviewedAt=change.at;
   next.reason=`Admin marked ${p.startsOn} as ${dayOff(p.startsOn,calendar)}. Request holiday work if needed.`;
  }else if(p.scope!=='day'&&workingDates(p.month,calendar,p.startsOn).some(date=>!days.some(d=>d.date===date))){
   next.status='Draft';
   next.reason='The holiday calendar now includes an unplanned working day. Complete the missing date and resubmit.';
  }
 }
 return next;
}
