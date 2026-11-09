import {z} from 'zod';
import {member,db,json,failure,sameOrigin,readJSON,HttpError,notification} from '../../../lib/server';
import {OWNER_EMAIL,type Member} from '../../../lib/permissions';
import {guard,indiaDay,ledgerFailure} from '../../../lib/operations';
import {assertOpen,periodGuard,stateSQL} from '../../../lib/periods';
import {audit} from '../../../lib/admin-audit';
import {monthDates,workingDates,validTourDate,dayOff,programmeID,programmeKey,programmeForDate,dailyProgrammeFor,sameTourDay,mergeTourHistory,calendarID,nationalHolidays,holidayWorkID,holidayWorkKind,type HolidayWork,type Programme,type TourDay,type HolidayCalendar} from '../../../lib/monthly-tour';
import {tourSnapshot,calendarFrom,programmeFrom,routesFor,snapshotDay,leaveSyncStatements,programmeKind,calendarKind} from '../../../lib/monthly-tour-server';
import {programmeAfterCalendar} from '../../../lib/tour-calendar-update';
const monthSchema=z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/);
const daySchema=z.object({date:z.string().refine(validTourDate),type:z.enum(['visit','leave']),routes:z.array(z.string().min(1).max(100)).max(20),reason:z.string().trim().max(1000).default('')});
const reasonSchema=z.string().trim().min(3).max(1000);
const parse=<T extends z.ZodTypeAny>(schema:T,value:unknown,message:string):z.output<T>=>{const p=schema.safeParse(value);if(!p.success)throw new HttpError(400,message);return p.data};
async function ownerFor(m:Member,email:unknown){if(m.role!=='admin'){if(email&&email!==m.email)throw new HttpError(403,'Use your own tour programme.');return m;}const owner=await db().prepare("SELECT * FROM members WHERE email=? AND role='mr'").bind(typeof email==='string'?email:'').first<Member>();if(!owner)throw new HttpError(400,'Select an MR.');return owner;}
export async function GET(req:Request){try{
 const m=await member(),q=new URL(req.url).searchParams,month=parse(monthSchema,q.get('month')||indiaDay().slice(0,7),'Select a valid month.'),{rows}=await tourSnapshot(),email=q.get('email');
 const owner=m.role==='admin'&&!email?null:await ownerFor(m,email),calendar=calendarFrom(rows,month);
 const periodClosed=!!await db().prepare('SELECT month FROM period_locks WHERE closed=1 AND month>=? LIMIT 1').bind(month).first();
 const programmes=rows.filter(r=>r.kind===programmeKind&&(m.role==='admin'||r.assigned_to===m.email)&&(!owner||r.assigned_to===owner.email)&&((r.data as unknown as Programme).month===month||q.get('review')==='1'&&(r.data as unknown as Programme).status==='Pending'));
 const requests=(await db().prepare("SELECT * FROM workflow_requests WHERE kind='tour_change' ORDER BY created DESC").all<any>()).results.filter(r=>(m.role==='admin'||r.mr_email===m.email)&&(!owner||r.mr_email===owner.email)).map(r=>({...r,body:JSON.parse(r.body)})).filter(r=>r.body.programmes?.some((p:any)=>p.month===month)||q.get('review')==='1'&&r.status==='Pending');
 return json({calendar,periodClosed,holidayWork:rows.filter(r=>r.kind===holidayWorkKind&&(m.role==='admin'||r.assigned_to===m.email)&&(!owner||r.assigned_to===owner.email)&&r.data.date.startsWith(month)).map(r=>({...r.data,email:r.assigned_to})),programme:owner?programmeFrom(rows,owner.email,month):null,dailyProgrammes:owner?programmes.filter(r=>(r.data as unknown as Programme).scope==='day').map(r=>r.data).sort((a,b)=>a.startsOn.localeCompare(b.startsOn)):[],programmes,requests,routes:owner?routesFor(owner,rows).map(r=>({id:r.id,name:r.data.Name,district:r.data.District})):[],leave:owner?rows.filter(r=>r.kind==='Leave'&&r.assigned_to===owner.email&&r.data.Status==='Approved'):[],today:indiaDay()});
}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 sameOrigin(req);const m=await member(),b=await readJSON(req,256*1024) as any,now=new Date().toISOString(),today=indiaDay(),{rows,stamp}=await tourSnapshot(),statements=[guard('version',`(${stateSQL})=?`,[stamp])];
 const saveProgramme=(owner:Member,p:Programme)=>{statements.push(periodGuard(p.month),db().prepare("INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,'Tour programme',?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(programmeKey(owner.email,p),owner.user_id||owner.email,JSON.stringify(p),now,owner.email));};
 const dailyPlans=(email:string,month:string)=>rows.filter(r=>r.kind===programmeKind&&r.assigned_to===email).map(r=>r.data as unknown as Programme).filter(p=>p.scope==='day'&&p.month===month);
 const pendingChanges=async(email:string)=>(await db().prepare("SELECT body FROM workflow_requests WHERE kind='tour_change' AND mr_email=? AND status='Pending'").bind(email).all<{body:string}>()).results.map(r=>JSON.parse(r.body));
 const freshMonth=async(month:string)=>{if(month<today.slice(0,7))throw new HttpError(409,'Previous monthly programmes are read-only.');await assertOpen(month);};
 const checkDay=(d:TourDay,calendar:HolidayCalendar,complete=true)=>{if(dayOff(d.date,calendar))throw new HttpError(400,`${d.date}: Sundays and government holidays cannot be planned for visits or leave.`);if(d.type==='leave'&&d.reason.length<3)throw new HttpError(400,`Enter a leave reason for ${d.date}.`);if(complete&&d.type==='visit'&&!d.routes.length)throw new HttpError(400,`Choose a route for ${d.date}.`);if(new Set(d.routes).size!==d.routes.length)throw new HttpError(400,'Select each route only once.');};
 const checkOpenVisits=(email:string,dates:string[])=>{if(rows.some(r=>r.kind==='Visits'&&r.assigned_to===email&&dates.includes(r.data.Date)&&r.data.Status!=='Closed'))throw new HttpError(409,'Close the open visit before changing that day’s schedule.');};
 if(b.action==='calendar'){
  if(m.role!=='admin')throw new HttpError(403,'Only Admin can maintain holidays.');const month=parse(monthSchema,b.month,'Choose a valid month.'),year=month.slice(0,4),old=calendarFrom(rows,month);await assertOpen(month);if(b.revision!==old.revision)throw new HttpError(409,'Holiday calendar changed. Refresh before saving.');
  const holidays=parse(z.array(z.object({date:z.string().refine(validTourDate),name:z.string().trim().min(2).max(120),note:z.string().trim().max(500).default('')})).max(31),b.holidays,'Enter valid holiday dates, names and notes.');if(holidays.some(h=>!h.date.startsWith(month+'-'))||new Set(holidays.map(h=>h.date)).size!==holidays.length)throw new HttpError(400,'Use unique dates within the selected month.');
  for(const national of nationalHolidays(year).filter(h=>h.date.startsWith(month)))if(!holidays.some(h=>h.date===national.date))throw new HttpError(400,'National holidays must remain in the shared calendar.');
  const reason=parse(reasonSchema,b.reason,'Enter a reason for publishing or changing holidays.');
  const changed=[...new Set([...holidays,...old.holidays].map(h=>h.date))].filter(d=>{const a=holidays.find(h=>h.date===d),c=old.holidays.find(h=>h.date===d);return a?.name!==c?.name||(a?.note||'')!==(c?.note||'')});
  const next:HolidayCalendar={year,month,name:String(b.name||'Company holiday calendar').slice(0,100),source:String(b.source||'').slice(0,1000),holidays:holidays.sort((a,b)=>a.date.localeCompare(b.date)),confirmed:true,revision:old.revision+1};
  const added=changed.filter(date=>!dayOff(date,old)&&!!dayOff(date,next));
  if(rows.some(r=>r.kind==='Visits'&&r.data.Status!=='Closed'&&changed.includes(r.data.Date)))throw new HttpError(409,'Close open visits before changing holidays on that date. Recorded work will be preserved.');
  const change={id:crypto.randomUUID(),reason,at:now,actor:m.email};
  for(const row of rows.filter(r=>r.kind===programmeKind&&(r.data as unknown as Programme).month===month)){
   const before=row.data as unknown as Programme,updated=programmeAfterCalendar(before,next,change);if(!updated)continue;
   statements.push(db().prepare('UPDATE records SET data=? WHERE id=?').bind(JSON.stringify(updated),row.id),audit(m,'Tour plan adjusted for holidays','Tour plan',row.id,before,updated,reason));
   if(before.status!==updated.status)statements.push(notification(row.assigned_to,updated.scope==='day'?'Daily plan changed to holiday':'Tour programme needs review',updated.reason||reason,'Tour plan',row.id));
  }
  const pending=(await db().prepare("SELECT * FROM workflow_requests WHERE kind='tour_change' AND status='Pending'").all<any>()).results;
  for(const request of pending){
   const body=JSON.parse(request.body);
   const affected=body.type==='holiday_work'?changed.includes(body.from):body.programmes?.some((p:any)=>p.after.some((d:TourDay)=>added.includes(d.date)));
   if(affected){
    const reviewReason='Admin changed the company holiday calendar. Review the date and submit a new request if needed. '+reason;
    statements.push(db().prepare('UPDATE workflow_requests SET status=?,reason=?,reviewed=? WHERE id=?').bind('Rejected',reviewReason,now,request.id),notification(request.mr_email,'Tour change needs review',reviewReason,'Tour plan',request.id),audit(m,'Tour change rejected after holiday update','Tour plan',request.id,body,{status:'Rejected'},reviewReason));
   }else if(body.type==='holiday_work'&&body.from.startsWith(month+'-')&&body.calendarRevision===old.revision){
    // An unrelated date change must not invalidate this MR's holiday-work request.
    statements.push(db().prepare('UPDATE workflow_requests SET body=? WHERE id=?').bind(JSON.stringify({...body,calendarRevision:next.revision}),request.id));
   }
  }
  for(const row of rows.filter(r=>r.kind===holidayWorkKind)){const work=row.data as unknown as HolidayWork;if(work.status!=='Approved'||!changed.includes(work.date)||dayOff(work.date,next))continue;const cancellation={...work,status:'Cancelled',revision:work.revision+1,approvedBy:m.email,approvedAt:now,reason:'Holiday removed from the shared calendar: '+reason,history:[...(work.history||[]),{id:crypto.randomUUID(),action:'holiday removed',reason,at:now,actor:m.email,before:[{date:work.date,type:work.type,routes:work.routes,reason:work.reason,customers:work.customers}],after:[]}]};statements.push(db().prepare('UPDATE records SET data=? WHERE id=?').bind(JSON.stringify(cancellation),row.id));}
  statements.push(periodGuard(month),db().prepare("INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,'Tour calendar',?,?,'') ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(calendarID(month),m.user_id||m.email,JSON.stringify(next),now),audit(m,'Monthly holidays published','Tour plan',calendarID(month),old,next,reason));
  const reps=(await db().prepare("SELECT email FROM members WHERE role='mr' AND status='active'").all<{email:string}>()).results;for(const rep of reps)statements.push(notification(rep.email,'Monthly holidays published',`${month} · Company holidays updated for all MRs. Submitted plans now follow this calendar; recorded work is preserved.`,'Tour plan',calendarID(month)));
  await db().batch(statements);return json({ok:true});
 }
 if(b.action==='request-holiday-work'){
  const owner=await ownerFor(m,b.email);if(owner.status!=='active')throw new HttpError(409,'MR is disabled.');const date=parse(z.string().refine(validTourDate),b.date,'Choose a holiday date.'),month=date.slice(0,7),mode=parse(z.enum(['work','cancel']),b.mode||'work','Choose work or cancel.'),reason=parse(reasonSchema,b.reason,'Explain the holiday work request.');await freshMonth(month);if(date<today)throw new HttpError(409,'Past holiday work cannot be changed.');
  const calendar=calendarFrom(rows,month),old=rows.find(r=>r.id===holidayWorkID(owner.email,date))?.data as unknown as HolidayWork|undefined;
  if(!calendar.confirmed)throw new HttpError(409,'Admin must publish this month’s holiday calendar first.');if(!dayOff(date,calendar)&&mode==='work')throw new HttpError(400,'Use a daily plan or monthly programme for a normal working date.');if(mode==='cancel'&&old?.status!=='Approved')throw new HttpError(409,'No approved holiday work to cancel.');
  const routes=mode==='cancel'?[]:parse(z.array(z.string().min(1).max(100)).min(1).max(20),b.routes,'Choose at least one accessible route.');if(new Set(routes).size!==routes.length)throw new HttpError(400,'Select each route once.');const day:TourDay={date,type:'visit',routes,reason};if(mode==='work')snapshotDay(day,owner,rows);checkOpenVisits(owner.email,[date]);
  const pending=(await db().prepare("SELECT body FROM workflow_requests WHERE kind='tour_change' AND mr_email=? AND status='Pending'").bind(owner.email).all<{body:string}>()).results;
  if(pending.some(r=>{const v=JSON.parse(r.body);return v.type==='holiday_work'&&v.from===date}))throw new HttpError(409,'Holiday work for this date is already awaiting Admin review.');
  const id=crypto.randomUUID(),body={type:'holiday_work',mode,from:date,reason,holiday:dayOff(date,calendar),holidayNote:calendar.holidays.find(h=>h.date===date)?.note||'',calendarRevision:calendar.revision,workRevision:old?.revision||0,programmes:[{month,before:old?.status==='Approved'?[old]:[],after:[day]}]};
  statements.push(periodGuard(month),db().prepare("INSERT INTO workflow_requests(id,kind,mr_email,record_id,body,status,created) VALUES (?,'tour_change',?,?,?,'Pending',?)").bind(id,owner.email,holidayWorkID(owner.email,date),JSON.stringify(body),now),notification(OWNER_EMAIL,'Holiday work approval requested',`${owner.name} · ${date} · ${mode}`,'Approvals',id),audit(m,'Holiday work requested','Tour plan',id,null,body,reason));await db().batch(statements);return json({ok:true,id});
 }
 if(['save','submit','withdraw','approve','reject','save-day','submit-day','withdraw-day','approve-day','reject-day'].includes(b.action)){
  const daily=b.action.endsWith('-day'),action=daily?b.action.slice(0,-4):b.action;
  const owner=await ownerFor(m,b.email);if(owner.status!=='active'&&action!=='reject')throw new HttpError(409,'The MR account is disabled.');
  const month=parse(monthSchema,b.month,'Select a valid month.'),date=daily?parse(z.string().refine(validTourDate),b.date,'Select a valid daily plan date.'):'';
  if(daily&&!date.startsWith(month+'-'))throw new HttpError(400,'The daily date must be in the selected month.');
  if(action==='reject')await assertOpen(month);else await freshMonth(month);
  if(daily&&['save','submit','approve'].includes(action)&&date<today)throw new HttpError(409,'Past daily plans are read-only. Reject this request and choose a current or future date.');
  const monthly=programmeFrom(rows,owner.email,month),old=daily?dailyProgrammeFor(rows,owner.email,date):monthly,calendar=calendarFrom(rows,month);
  if(b.revision!==(old?.revision||0))throw new HttpError(409,'Programme changed. Refresh and review again.');
  if(daily&&['save','submit','approve'].includes(action)&&monthly&&['Approved','Pending'].includes(monthly.status)&&monthly.days.some(d=>d.date===date))throw new HttpError(409,'This date is covered by an approved or pending monthly programme. Use a schedule change, or withdraw the monthly submission first.');
  let next:Programme=old?structuredClone(old):{scope:daily?'day':'month',month,startsOn:daily?date:month===today.slice(0,7)?today:month+'-01',status:'Draft',revision:0,days:[],history:[]};
  const id=programmeKey(owner.email,next),title=daily?'Daily tour plan':'Monthly tour programme',label=daily?date:month;
  const approvedDays=daily?[]:dailyPlans(owner.email,month).filter(p=>p.status==='Approved'&&p.startsOn>=next.startsOn&&!dayOff(p.startsOn,calendar));
  const checkMonthlyOverlap=async()=>{
   if(daily)return;
   if(dailyPlans(owner.email,month).some(p=>p.status==='Pending'&&p.startsOn>=next.startsOn))throw new HttpError(409,'Review or withdraw pending daily submissions before submitting or approving the full month.');
   if((await pendingChanges(owner.email)).some(r=>r.type!=='holiday_work'&&r.programmes?.some((p:any)=>p.month===month)))throw new HttpError(409,'Review or withdraw pending schedule changes before submitting or approving the full month.');
  };
  if(['save','submit'].includes(action)){
   if(old&&['Approved','Pending'].includes(old.status))throw new HttpError(409,'Use a change request for an approved programme, or withdraw a pending submission first.');
   const days=parse(z.array(daySchema).max(daily?1:31),b.days,'Enter valid dates, routes and leave details.');
   if(daily&&(days.length!==1||days[0].date!==date))throw new HttpError(400,'A daily submission must contain only the selected date.');
   if(new Set(days.map(d=>d.date)).size!==days.length||days.some(d=>!d.date.startsWith(month+'-')||d.date<next.startsOn))throw new HttpError(400,'Use each date once within this programme’s planning period.');
   for(const plan of approvedDays){const approved=plan.days[0],entry=days.find(d=>d.date===approved.date);if(entry&&!sameTourDay(entry,approved))throw new HttpError(409,`${approved.date} already has an approved daily plan. Request a schedule change before replacing it.`);if(!entry)days.push(approved);}
   const validRoutes=routesFor(owner,rows);for(const d of days){checkDay(d,calendar,action==='submit');if(d.routes.some(id=>!validRoutes.some(r=>r.id===id)))throw new HttpError(400,'Choose routes assigned or accessible to this MR.');if(d.type==='leave')d.routes=[];}
   if(action==='submit'){
    if(!calendar.confirmed)throw new HttpError(409,'Admin must confirm this month’s holiday calendar first.');
    if(!daily){const missing=workingDates(month,calendar,next.startsOn).filter(date=>!days.some(d=>d.date===date));if(missing.length)throw new HttpError(400,'Complete every working day. Missing: '+missing.slice(0,5).join(', '));}
    await checkMonthlyOverlap();next.status='Pending';next.submittedAt=now;next.calendarRevision=calendar.revision;
    statements.push(notification(OWNER_EMAIL,title+' awaiting approval',`${owner.name} · ${label}`,'Approvals',id));
   }else next.status='Draft';next.days=days.sort((a,b)=>a.date.localeCompare(b.date));next.reason='';
  }else if(action==='withdraw'){if(old?.status!=='Pending')throw new HttpError(409,'Only a pending programme can be withdrawn.');next.status='Draft';}
  else{
   if(m.role!=='admin')throw new HttpError(403,'Admin approval is required.');if(old?.status!=='Pending')throw new HttpError(409,'Programme already reviewed or not submitted.');
   if(action==='approve'){
    if(!calendar.confirmed||next.calendarRevision!==calendar.revision)throw new HttpError(409,'Holiday calendar changed. Reject this submission so the MR can review and resubmit it.');
    for(const d of next.days)checkDay(d,calendar);
    if(daily&&(next.days.length!==1||next.days[0].date!==date))throw new HttpError(409,'Invalid daily submission. Reject it and ask the MR to resubmit.');
    if(!daily&&workingDates(month,calendar,next.startsOn).some(date=>!next.days.some(d=>d.date===date)))throw new HttpError(409,'The programme does not cover every working day.');
    await checkMonthlyOverlap();
    for(const plan of approvedDays){const d=next.days.find(d=>d.date===plan.startsOn);if(!d||!sameTourDay(d,plan.days[0]))throw new HttpError(409,'An approved daily plan changed. Reject the monthly submission and ask the MR to resubmit.');}
    next.days=next.days.map(d=>approvedDays.find(p=>p.startsOn===d.date)?.days[0]||snapshotDay(d,owner,rows));
    next.history=mergeTourHistory([...next.history,...approvedDays.flatMap(p=>p.history||[])]);
    next.status='Approved';statements.push(...leaveSyncStatements(owner,next.days,rows,now));
   }else{next.status='Rejected';next.reason=parse(reasonSchema,b.reason,'Enter the rejection reason.');}
   next.reviewedAt=now;statements.push(notification(owner.email,`${title} ${next.status.toLowerCase()}`,`${label}${next.reason?' · '+next.reason:''}`,'Tour plan',id));
  }
  next.revision++;saveProgramme(owner,next);statements.push(audit(m,title+' '+action,'Tour plan',id,old,next,next.reason||action));await db().batch(statements);return json({ok:true});
 }
 if(b.action==='request-change'){
  const owner=await ownerFor(m,b.email);if(owner.status!=='active')throw new HttpError(409,'MR is disabled.');const from=parse(z.string().refine(validTourDate),b.from,'Select the scheduled date.'),reason=parse(reasonSchema,b.reason,'Enter the reason for the change.'),type=parse(z.enum(['routes','postpone','leave']),b.type,'Choose a change type.');if(from<today)throw new HttpError(409,'Past schedules cannot be changed.');
  const changes=new Map<string,{id:string;month:string;revision:number;before:TourDay[];after:TourDay[]}>();
  const changeDay=async(date:string,update:(day:TourDay)=>TourDay)=>{await freshMonth(date.slice(0,7));const p=programmeForDate(rows,owner.email,date),cal=calendarFrom(rows,date.slice(0,7));if(p?.status!=='Approved')throw new HttpError(409,'An approved daily or monthly plan is required for each affected date.');if(p.scope==='day'&&programmeFrom(rows,owner.email,p.month)?.status==='Pending')throw new HttpError(409,'Withdraw the pending monthly submission before requesting a daily change.');if(!cal.confirmed||dayOff(date,cal))throw new HttpError(400,'Choose a working date in a confirmed holiday calendar.');if(date<p.startsOn)throw new HttpError(400,'Date is outside the approved planning period.');const original=p.days.find(d=>d.date===date)||{date,type:'visit' as const,routes:[],reason:''};const after=update(structuredClone(original));checkDay(after,cal);snapshotDay(after,owner,rows);const id=programmeKey(owner.email,p);let change=changes.get(id);if(!change){change={id,month:p.month,revision:p.revision,before:[],after:[]};changes.set(id,change);}change.before.push(original);change.after.push(after);};
  if(type==='routes'){const routes=parse(z.array(z.string().min(1).max(100)).min(1).max(20),b.routes,'Select at least one replacement route.');await changeDay(from,d=>({...d,type:'visit',routes,reason}));}
  else if(type==='postpone'){
   const to=parse(z.string().refine(validTourDate),b.to,'Select the postponed date.');if(to<=from)throw new HttpError(400,'Choose a later working date.');const a=programmeForDate(rows,owner.email,from)?.days.find(d=>d.date===from),c=programmeForDate(rows,owner.email,to)?.days.find(d=>d.date===to);if(a?.type!=='visit'||c?.type!=='visit')throw new HttpError(400,'Postponement swaps two approved working-route days. Choose a date with a route programme.');
   await changeDay(from,d=>({...d,routes:c.routes,reason}));await changeDay(to,d=>({...d,routes:a.routes,reason}));
  }else{
   const to=parse(z.string().refine(validTourDate),b.to||from,'Select the last leave date.');if(to<from||Date.parse(to)-Date.parse(from)>90*86400000)throw new HttpError(400,'Choose a leave range of up to 91 days.');for(let time=Date.parse(from+'T12:00:00Z');time<=Date.parse(to+'T12:00:00Z');time+=86400000){const date=new Date(time).toISOString().slice(0,10),cal=calendarFrom(rows,date.slice(0,7));if(!dayOff(date,cal))await changeDay(date,d=>({...d,type:'leave',routes:[],reason}));}if(!changes.size)throw new HttpError(400,'The leave range contains no working days.');
  }
  const programmes=[...changes.values()];checkOpenVisits(owner.email,programmes.flatMap(p=>p.after.map(d=>d.date)));
  const pending=(await db().prepare("SELECT body FROM workflow_requests WHERE kind='tour_change' AND mr_email=? AND status='Pending'").bind(owner.email).all<{body:string}>()).results;
  if(pending.some(r=>JSON.parse(r.body).type!=='holiday_work'&&JSON.parse(r.body).programmes.some((p:any)=>changes.has(p.id||programmeID(owner.email,p.month)))))throw new HttpError(409,'A change for this programme is already awaiting Admin review.');
  const id=crypto.randomUUID(),body={type,from,to:b.to||'',reason,programmes};statements.push(...programmes.map(p=>periodGuard(p.month)),db().prepare("INSERT INTO workflow_requests(id,kind,mr_email,record_id,body,status,created) VALUES (?,'tour_change',?,?,?,'Pending',?)").bind(id,owner.email,programmes[0].id,JSON.stringify(body),now),notification(OWNER_EMAIL,'Tour change approval requested',`${owner.name} · ${from} · ${type}`,'Approvals',id),audit(m,'Tour change requested','Tour plan',id,null,body,reason));await db().batch(statements);return json({ok:true,id});
 }
 if(['approve-change','reject-change','cancel-change'].includes(b.action)){
  const r=await db().prepare("SELECT * FROM workflow_requests WHERE id=? AND kind='tour_change'").bind(typeof b.id==='string'?b.id:'').first<any>();if(!r||r.status!=='Pending')throw new HttpError(409,'Request already reviewed or unavailable.');
  if(b.action==='cancel-change'){if(r.mr_email!==m.email)throw new HttpError(403,'Only the requesting MR can withdraw this request.');}else if(m.role!=='admin')throw new HttpError(403,'Admin approval is required.');
  const owner=await db().prepare("SELECT * FROM members WHERE email=? AND role='mr'").bind(r.mr_email).first<Member>();if(!owner)throw new HttpError(404,'MR unavailable.');const body=JSON.parse(r.body),status=b.action==='approve-change'?'Approved':b.action==='reject-change'?'Rejected':'Cancelled',reviewReason=status==='Rejected'?parse(reasonSchema,b.reason,'Enter a rejection reason.'):String(b.reason||body.reason).slice(0,1000);
  if(status==='Approved'&&body.type==='holiday_work'){
   if(owner.status!=='active')throw new HttpError(409,'MR is disabled.');const date=body.from,month=date.slice(0,7);await freshMonth(month);if(date<today)throw new HttpError(409,'Requested date has passed. Reject this request and choose a new date.');const calendar=calendarFrom(rows,month),old=rows.find(r=>r.id===holidayWorkID(owner.email,date))?.data as unknown as HolidayWork|undefined;
   if(!calendar.confirmed||calendar.revision!==body.calendarRevision)throw new HttpError(409,'Holiday calendar changed. Reject this request and ask the MR to review and resubmit.');if((old?.revision||0)!==body.workRevision)throw new HttpError(409,'Holiday work changed. Review a new request.');if(body.mode!=='cancel'&&!dayOff(date,calendar))throw new HttpError(409,'This is no longer a holiday. Submit a daily plan or update the monthly programme instead.');checkOpenVisits(owner.email,[date]);
   const next:HolidayWork={...(body.mode==='cancel'?old!:snapshotDay(body.programmes[0].after[0],owner,rows)),status:body.mode==='cancel'?'Cancelled':'Approved',revision:(old?.revision||0)+1,requestId:r.id,approvedAt:now,approvedBy:m.email,holiday:body.holiday,reason:body.reason,history:[...(old?.history||[]),{id:r.id,action:body.mode==='cancel'?'cancel holiday work':'holiday work',reason:body.reason,at:now,actor:m.email,before:old?.status==='Approved'?[{date:old.date,type:old.type,routes:old.routes,reason:old.reason,customers:old.customers}]:[],after:body.mode==='cancel'?[]:[body.programmes[0].after[0]]}]};
   statements.push(periodGuard(month),db().prepare("INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,'Tour holiday work',?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(holidayWorkID(owner.email,date),owner.user_id||owner.email,JSON.stringify(next),now,owner.email));if(body.mode!=='cancel')statements.push(...leaveSyncStatements(owner,[next],rows,now));
  }else if(status==='Approved'){
   if(owner.status!=='active')throw new HttpError(409,'MR is disabled.');const changedDays:TourDay[]=[];for(const change of body.programmes){await freshMonth(change.month);const p=(rows.find(r=>r.kind===programmeKind&&r.assigned_to===owner.email&&r.id===(change.id||programmeID(owner.email,change.month)))?.data as unknown as Programme)||null;if(p?.status!=='Approved'||p.revision!==change.revision)throw new HttpError(409,'Programme changed. Reject this request and ask the MR to submit it again.');if(p.scope==='day'&&programmeFrom(rows,owner.email,p.month)?.status==='Pending')throw new HttpError(409,'Withdraw the pending monthly submission before approving a daily change.');if(p.scope==='day'&&programmeForDate(rows,owner.email,p.startsOn)?.scope!=='day')throw new HttpError(409,'This date is now covered by a monthly approval. Reject this request and submit a new schedule change.');const calendar=calendarFrom(rows,change.month);if(!calendar.confirmed)throw new HttpError(409,'Publish this month’s holiday calendar first.');
    for(const day of change.after){if(day.date<today)throw new HttpError(409,'Requested date has passed. Reject the request and ask for new dates.');checkDay(day,calendar);}checkOpenVisits(owner.email,change.after.map((d:TourDay)=>d.date));
    const after=change.after.map((d:TourDay)=>snapshotDay(d,owner,rows)),next:Programme={...p,revision:p.revision+1,days:[...p.days.filter(d=>!after.some((a:TourDay)=>a.date===d.date)),...after].sort((a,b)=>a.date.localeCompare(b.date)),history:[...(p.history||[]),{id:r.id,action:body.type,reason:body.reason,at:now,actor:m.email,before:change.before,after,...(body.type==='postpone'?{from:body.from,to:body.to}:{})}]};
    saveProgramme(owner,next);changedDays.push(...after);
   }statements.push(...leaveSyncStatements(owner,changedDays,rows,now));
  }
  statements.push(db().prepare('UPDATE workflow_requests SET status=?,reason=?,reviewed=? WHERE id=?').bind(status,reviewReason,now,r.id),notification(owner.email,`Tour change ${status.toLowerCase()}`,`${body.from} · ${reviewReason}`,'Tour plan',r.id),audit(m,'Tour change '+status,'Tour plan',r.id,body,{status,reason:reviewReason},reviewReason));await db().batch(statements);return json({ok:true});
 }
 throw new HttpError(400,'Unknown tour programme action.');
}catch(e){try{ledgerFailure(e)}catch(error){return failure(error)}}}
