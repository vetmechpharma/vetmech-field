'use client';
import {useEffect,useState} from 'react';
import {Check,Save,Send} from 'lucide-react';
import {today} from '../lib/ui-config';
import {dayOff,monthDates,type HolidayCalendar,type HolidayWork,type Programme,type TourDay} from '../lib/monthly-tour';
import {RouteChoice,DayText,dateLabel,type Route} from './tour-day-controls';

type Props={
 month:string;date:string;onDateChange:(date:string)=>void;calendar:HolidayCalendar;monthly:Programme|null;plans:Programme[];
 routes:Route[];holidayWork:HolidayWork[];requests:any[];leave:any[];
 busy:boolean;admin:boolean;locked?:boolean;
 onMarkHoliday?:()=>void;
 onAction:(body:any,message:string)=>Promise<void>;
 onChange:(date:string,routes:string[])=>void;
 onHoliday:(date:string,routes:string[])=>void;
};

export function DailyTourPlan({month,date,onDateChange:setDate,calendar,monthly,plans,routes,holidayWork,requests,leave,busy,admin,locked=false,onMarkHoliday,onAction,onChange,onHoliday}:Props){
 const [day,setDay]=useState<TourDay>({date,type:'visit',routes:[],reason:''});
 const [review,setReview]=useState('');
 const daily=plans.find(p=>p.startsOn===date)||null;
 const monthlyDay=monthly?.days.find(d=>d.date===date);
 const covered=!!monthlyDay&&['Approved','Pending'].includes(monthly?.status||'');
 const shown=covered?monthly:daily;
 const off=dayOff(date,calendar),work=holidayWork.find(w=>w.date===date&&w.status==='Approved');
 const pendingHoliday=requests.some(r=>r.status==='Pending'&&r.body.type==='holiday_work'&&r.body.from===date);
 const past=date<today(),editable=!locked&&!past&&!off&&!covered&&!['Approved','Pending'].includes(daily?.status||'');
 useEffect(()=>{
  const approvedLeave=leave.find(r=>r.data.From<=date&&r.data.To>=date&&!JSON.parse(r.data['Excluded dates']||'[]').includes(date));
  setDay(shown?.days.find(d=>d.date===date)||monthlyDay||{date,type:approvedLeave?'leave':'visit',routes:[],reason:approvedLeave?.data.Reason||''});setReview('');
 },[date,shown,monthlyDay,leave]);
 const action=(name:string,message:string)=>onAction({action:name+'-day',date,revision:daily?.revision||0,days:[day],reason:review},message);
 const complete=day.type==='leave'?day.reason.trim().length>=3:day.routes.length>0;
 return <div className="daily-tour-planner">
  <div className="daily-tour-heading"><div><h3>Plan a single day</h3><p>Submit this date only. Upcoming days can be planned later.</p></div><label>Plan date<input aria-label="Daily plan date" type="date" min={month+'-01'} max={monthDates(month).at(-1)} value={date} disabled={busy} onChange={e=>{if(e.target.value.startsWith(month+'-'))setDate(e.target.value)}}/></label></div>
  {admin&&!off&&onMarkHoliday&&<button type="button" className="secondary holiday-action" disabled={busy||locked} onClick={onMarkHoliday}>Mark holiday</button>}
  {off?<div className="daily-tour-status">
   <span className="badge amber">{off}</span><p>{calendar.holidays.find(h=>h.date===date)?.note||'Working on this holiday needs Admin permission.'}</p>
   {work&&<p><strong>Holiday work approved · </strong><DayText day={work} routes={routes}/></p>}
   {pendingHoliday&&<p role="status">Holiday work request pending</p>}
   {!past&&!locked&&<button className="secondary" disabled={busy||!calendar.confirmed||pendingHoliday} onClick={()=>onHoliday(date,work?.routes||[])}>{work?'Change holiday work':'Request to work'}</button>}
  </div>:<>
   <div className="daily-tour-status"><span className={'badge '+(shown?.status==='Approved'?'success':'amber')}>{covered?`Monthly · ${monthly?.status}`:daily?.status||'Not planned'}</span><strong>{dateLabel(date)}</strong></div>
   {covered&&<p className="footnote">This date is covered by the monthly programme.{monthly?.status==='Pending'?' Withdraw the monthly submission before submitting a separate day.':' Use a schedule change to update its routes or request leave.'}</p>}
   {covered&&monthly?.status==='Pending'&&!past&&!locked&&<button type="button" className="secondary" disabled={busy} onClick={()=>onAction({action:'withdraw',revision:monthly.revision},'Monthly submission withdrawn. Choose this date and submit it separately.')}>Withdraw month to plan this day</button>}
   {daily?.reason&&!covered&&<p className="form-error">Admin review: {daily.reason}</p>}
   {past&&<p className="footnote">Past dates are read-only.</p>}
   {editable?<div className="form-grid daily-tour-fields">
    <label>Day plan<select aria-label="Daily plan type" value={day.type} disabled={busy} onChange={e=>setDay({...day,type:e.target.value as TourDay['type'],routes:[],reason:''})}><option value="visit">Route visits</option><option value="leave">Request leave</option></select></label>
    {day.type==='leave'?<label>Leave reason<textarea aria-label="Daily leave reason" minLength={3} maxLength={1000} value={day.reason} disabled={busy} onChange={e=>setDay({...day,reason:e.target.value})}/></label>:<RouteChoice routes={routes} value={day.routes} onChange={ids=>setDay({...day,routes:ids})} disabled={busy} label="Choose routes for this date"/>}
    <div className="dialog-actions full-field"><button className="secondary" disabled={busy||day.type==='leave'&&!complete} onClick={()=>action('save','Daily draft saved. Submit this date when ready.')}><Save size={17}/>Save daily draft</button><button className="primary" disabled={busy||!complete||!calendar.confirmed} onClick={()=>action('submit','This date was sent to Admin for approval. Upcoming dates are not required.')}><Send size={17}/>Submit day for approval</button></div>
    {!complete&&<p className="footnote full-field">{day.type==='leave'?'Enter a leave reason to submit this date.':'Select at least one route to enable Submit day for approval.'}</p>}
   </div>:<>
    <div className="daily-tour-detail"><DayText day={covered?monthlyDay:shown?.days.find(d=>d.date===date)} routes={routes}/>{day.customers&&<small>{day.customers.length} customers in the approved route list</small>}</div>
    {shown?.status==='Approved'&&!past&&!locked&&(!covered||monthly?.status==='Approved')&&<button className="secondary" disabled={busy} onClick={()=>onChange(date,day.routes)}>Request change</button>}
   </>}
   {daily?.status==='Pending'&&!covered&&!locked&&<div className="daily-tour-review">
    <p>Waiting for Admin. Visits for this date unlock after approval.</p>
    <button className="secondary" disabled={busy} onClick={()=>action('withdraw','Daily submission withdrawn. You can edit and resubmit this date.')}>Withdraw daily submission</button>
    {admin&&<><label>Review reason (required to reject)<input maxLength={1000} value={review} disabled={busy} onChange={e=>setReview(e.target.value)}/></label><div className="field-actions"><button className="primary" disabled={busy||past} onClick={()=>action('approve','Daily plan approved.')}><Check size={17}/>Approve day</button><button className="secondary" disabled={busy||review.trim().length<3} onClick={()=>action('reject','Daily plan rejected with your reason.')}>Reject day</button></div></>}
   </div>}
  </>}
  {!!plans.length&&<details className="daily-tour-submissions" open><summary>Daily submissions · {plans.length}</summary><div>{plans.map(p=><button key={p.startsOn} type="button" aria-pressed={date===p.startsOn} className="secondary" disabled={busy} onClick={()=>setDate(p.startsOn)}><span>{dateLabel(p.startsOn)}</span><span className={'badge '+(p.status==='Approved'?'success':'amber')}>{p.status}</span></button>)}</div></details>}
 </div>;
}
