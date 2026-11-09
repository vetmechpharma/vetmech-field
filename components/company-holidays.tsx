'use client';
import {useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {monthDates,nationalHolidays,type HolidayCalendar,type Holiday} from '../lib/monthly-tour';
import {centralHolidayPreset,holidayPresetSources} from '../lib/holiday-presets';

export function CompanyHolidays({calendar,locked=false,requestedDate,onSaved}:{
 calendar:HolidayCalendar;locked?:boolean;requestedDate:{date:string;key:number}|null;onSaved:()=>void|Promise<void>;
}){
 const [holidays,H]=useState<Holiday[]>(calendar.holidays),[name,N]=useState(calendar.name),[source,S]=useState(calendar.source||'');
 const [reason,R]=useState(''),[error,E]=useState(''),[message,M]=useState(''),[busy,B]=useState(false),[open,O]=useState(!calendar.confirmed);
 const details=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{H(calendar.holidays);N(calendar.name);S(calendar.source||'');R('')},[calendar]);
 useEffect(()=>{
  if(!requestedDate||locked)return;
  O(true);E('');M('');H(old=>old.some(h=>h.date===requestedDate.date)?old:[...old,{date:requestedDate.date,name:'',note:''}]);
  details.current?.scrollIntoView?.({behavior:'smooth',block:'start'});
 },[requestedDate,locked]);
 const month=calendar.month!,preset=centralHolidayPreset(calendar.year)?.filter(h=>h.date.startsWith(month));
 return <details ref={details} className="tour-holidays" open={open} onToggle={e=>O(e.currentTarget.open)}>
  <summary><b>Company holidays · {month}</b><span className={'badge '+(calendar.confirmed?'success':'amber')}>{calendar.confirmed?'Published for all MRs':'Admin review required'}</span></summary>
  <p>Admin can assign any date in an open month, even after tour submission or approval. Sundays are automatic; add festivals, state and local holidays below.</p>
  <p className="footnote">Applies to all MRs. Recorded attendance and visits stay in history. Close any open visits before marking their date as a holiday.</p>
  {locked&&<p role="status" className="info-box">This month is locked by month-end closing. Reopen it before changing holidays.</p>}
  <form onSubmit={async e=>{
   e.preventDefault();if(busy||locked)return;B(true);E('');M('');
   try{
    const r=await fetch('/api/monthly-tour',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'calendar',month,revision:calendar.revision,name,source,holidays,reason})});
    const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to save holidays.');
    await onSaved();M('Holidays saved for all MRs. Tour plans and attendance now follow the updated calendar.');
   }catch(e){E((e as Error).message)}finally{B(false)}
  }}>
   <div className="form-grid"><label>Calendar name<input value={name} maxLength={100} disabled={busy||locked} onChange={e=>N(e.target.value)}/></label><label>Holiday notice / source (optional)<input value={source} maxLength={1000} disabled={busy||locked} onChange={e=>S(e.target.value)} placeholder="Company or government notice"/></label></div>
   {!!preset?.length&&!calendar.confirmed&&<><button type="button" className="secondary" disabled={busy||locked} onClick={()=>{H(preset);S(holidayPresetSources.join(' '))}}>Load this month’s Central 2026 reference</button><p className="footnote">This reference is for Delhi/New Delhi offices. Review regional dates before publishing.</p></>}
   <div className="tour-holiday-list">{holidays.map((h,i)=>{
    const fixed=nationalHolidays(calendar.year).some(n=>n.date===h.date);
    return <div key={i}>
     <label>Date<input aria-label={`Holiday ${i+1} date`} required type="date" min={month+'-01'} max={monthDates(month).at(-1)} value={h.date} disabled={busy||locked||fixed} onChange={e=>H(holidays.map((x,j)=>j===i?{...x,date:e.target.value}:x))}/></label>
     <label>Holiday / festival<input aria-label={`Holiday ${i+1} name`} required minLength={2} maxLength={120} value={h.name} disabled={busy||locked} onChange={e=>H(holidays.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/></label>
     <label>Note<input aria-label={`Holiday ${i+1} note`} maxLength={500} value={h.note||''} disabled={busy||locked} placeholder="Note for all MRs" onChange={e=>H(holidays.map((x,j)=>j===i?{...x,note:e.target.value}:x))}/></label>
     <button type="button" className="text-button" disabled={busy||locked||fixed} onClick={()=>H(holidays.filter((_,j)=>j!==i))}>Remove</button>
    </div>;
   })}</div>
   {!locked&&<>
    <button type="button" className="secondary" disabled={busy||holidays.length>=31} onClick={()=>H([...holidays,{date:'',name:'',note:''}])}>Add holiday</button>
    <label>Publish / change reason<input required minLength={3} maxLength={1000} value={reason} disabled={busy} onChange={e=>R(e.target.value)}/></label>
    <button className="primary" disabled={busy}><Check size={17}/>{busy?'Saving holidays…':'Publish holidays for all MRs'}</button>
   </>}
   {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </form>
 </details>;
}
