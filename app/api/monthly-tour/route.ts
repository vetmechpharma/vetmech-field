import {z} from 'zod';
import {member,db,json,failure,sameOrigin,readJSON,HttpError,notification} from '../../../lib/server';
import {OWNER_EMAIL,type Member} from '../../../lib/permissions';
import {guard,indiaDay,ledgerFailure} from '../../../lib/operations';
import {assertOpen,periodGuard,stateSQL} from '../../../lib/periods';
import {audit} from '../../../lib/admin-audit';
import {monthDates,workingDates,validTourDate,dayOff,programmeID,calendarID,nationalHolidays,type Programme,type TourDay,type HolidayCalendar} from '../../../lib/monthly-tour';
import {tourSnapshot,calendarFrom,programmeFrom,routesFor,snapshotDay,leaveSyncStatements,programmeKind,calendarKind} from '../../../lib/monthly-tour-server';
const monthSchema=z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/);
const daySchema=z.object({date:z.string().refine(validTourDate),type:z.enum(['visit','leave']),routes:z.array(z.string().min(1).max(100)).max(20),reason:z.string().trim().max(1000).default('')});
const reasonSchema=z.string().trim().min(3).max(1000);
const parse=<T extends z.ZodTypeAny>(schema:T,value:unknown,message:string):z.output<T>=>{const p=schema.safeParse(value);if(!p.success)throw new HttpError(400,message);return p.data};
async function ownerFor(m:Member,email:unknown){if(m.role!=='admin'){if(email&&email!==m.email)throw new HttpError(403,'Use your own tour programme.');return m;}const owner=await db().prepare("SELECT * FROM members WHERE email=? AND role='mr'").bind(typeof email==='string'?email:'').first<Member>();if(!owner)throw new HttpError(400,'Select an MR.');return owner;}
export async function GET(req:Request){try{
 const m=await member(),q=new URL(req.url).searchParams,month=parse(monthSchema,q.get('month')||indiaDay().slice(0,7),'Select a valid month.'),{rows}=await tourSnapshot(),email=q.get('email');
 const owner=m.role==='admin'&&!email?null:await ownerFor(m,email),calendar=calendarFrom(rows,month.slice(0,4));
 const programmes=rows.filter(r=>r.kind===programmeKind&&(m.role==='admin'||r.assigned_to===m.email)&&((r.data as unknown as Programme).month===month||q.get('review')==='1'&&(r.data as unknown as Programme).status==='Pending'));
 const requests=(await db().prepare("SELECT * FROM workflow_requests WHERE kind='tour_change' ORDER BY created DESC").all<any>()).results.filter(r=>(m.role==='admin'||r.mr_email===m.email)&&(!owner||r.mr_email===owner.email)).map(r=>({...r,body:JSON.parse(r.body)})).filter(r=>r.body.programmes?.some((p:any)=>p.month===month)||q.get('review')==='1'&&r.status==='Pending');
 return json({calendar,programme:owner?programmeFrom(rows,owner.email,month):null,programmes,requests,routes:owner?routesFor(owner,rows).map(r=>({id:r.id,name:r.data.Name,district:r.data.District})):[],leave:owner?rows.filter(r=>r.kind==='Leave'&&r.assigned_to===owner.email&&r.data.Status==='Approved'):[],today:indiaDay()});
}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 sameOrigin(req);const m=await member(),b=await readJSON(req,256*1024) as any,now=new Date().toISOString(),today=indiaDay(),{rows,stamp}=await tourSnapshot(),statements=[guard('version',`(${stateSQL})=?`,[stamp])];
 const saveProgramme=(owner:Member,p:Programme)=>{statements.push(periodGuard(p.month),db().prepare("INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,'Tour programme',?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(programmeID(owner.email,p.month),owner.user_id||owner.email,JSON.stringify(p),now,owner.email));};
 const freshMonth=async(month:string)=>{if(month<today.slice(0,7))throw new HttpError(409,'Previous monthly programmes are read-only.');await assertOpen(month);};
 const checkDay=(d:TourDay,calendar:HolidayCalendar,complete=true)=>{if(dayOff(d.date,calendar))throw new HttpError(400,`${d.date}: Sundays and government holidays cannot be planned for visits or leave.`);if(d.type==='leave'&&d.reason.length<3)throw new HttpError(400,`Enter a leave reason for ${d.date}.`);if(complete&&d.type==='visit'&&!d.routes.length)throw new HttpError(400,`Choose a route for ${d.date}.`);if(new Set(d.routes).size!==d.routes.length)throw new HttpError(400,'Select each route only once.');};
 const checkOpenVisits=(email:string,dates:string[])=>{if(rows.some(r=>r.kind==='Visits'&&r.assigned_to===email&&dates.includes(r.data.Date)&&r.data.Status!=='Closed'))throw new HttpError(409,'Close the open visit before changing that day’s schedule.');};
 if(b.action==='calendar'){
  if(m.role!=='admin')throw new HttpError(403,'Only Admin can maintain holidays.');const year=parse(z.string().regex(/^20\d\d$/),b.year,'Choose a valid year.'),old=calendarFrom(rows,year);if(b.revision!==old.revision)throw new HttpError(409,'Holiday calendar changed. Refresh before saving.');
  const holidays=parse(z.array(z.object({date:z.string().refine(validTourDate),name:z.string().trim().min(2).max(120)})).max(80),b.holidays,'Enter valid holiday dates and names.');if(holidays.some(h=>!h.date.startsWith(year+'-'))||new Set(holidays.map(h=>h.date)).size!==holidays.length)throw new HttpError(400,'Use unique dates within the selected year.');
  for(const national of nationalHolidays(year))if(!holidays.some(h=>h.date===national.date))throw new HttpError(400,'Republic Day, Independence Day and Gandhi Jayanti must remain holidays.');
  const reason=parse(reasonSchema,b.reason,'Enter a reason for confirming or changing holidays.');
  const changed=[...new Set([...holidays,...old.holidays].map(h=>h.date))].filter(d=>holidays.find(h=>h.date===d)?.name!==old.holidays.find(h=>h.date===d)?.name);
  for(const d of changed){if(old.confirmed&&d<today)throw new HttpError(409,'Past holiday dates cannot be changed.');if(d>=today)await assertOpen(d);}
  if(rows.some(r=>r.kind==='Visits'&&r.data.Status!=='Closed'&&changed.includes(r.data.Date)&&holidays.some(h=>h.date===r.data.Date)))throw new HttpError(409,'Close open visits before marking that date as a holiday.');
  const next:HolidayCalendar={year,name:String(b.name||'Company government holiday calendar').slice(0,100),source:String(b.source||'').slice(0,1000),holidays:holidays.sort((a,b)=>a.date.localeCompare(b.date)),confirmed:true,revision:old.revision+1};
  statements.push(...changed.filter(d=>d>=today).map(periodGuard),db().prepare("INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,'Tour calendar',?,?,'') ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(calendarID(year),m.user_id||m.email,JSON.stringify(next),now),audit(m,'Government holiday calendar confirmed','Tour plan',calendarID(year),old,next,reason));await db().batch(statements);return json({ok:true});
 }
 if(['save','submit','withdraw','approve','reject'].includes(b.action)){
  const owner=await ownerFor(m,b.email);if(owner.status!=='active'&&b.action!=='reject')throw new HttpError(409,'The MR account is disabled.');const month=parse(monthSchema,b.month,'Select a valid month.');if(b.action==='reject')await assertOpen(month);else await freshMonth(month);
  const old=programmeFrom(rows,owner.email,month),calendar=calendarFrom(rows,month.slice(0,4));if(b.revision!==(old?.revision||0))throw new HttpError(409,'Programme changed. Refresh and review again.');
  let next:Programme=old?structuredClone(old):{month,startsOn:month===today.slice(0,7)?today:month+'-01',status:'Draft',revision:0,days:[],history:[]};
  if(['save','submit'].includes(b.action)){
   if(old&&['Approved','Pending'].includes(old.status))throw new HttpError(409,'Use a change request for an approved programme, or withdraw a pending submission first.');
   const days=parse(z.array(daySchema).max(31),b.days,'Enter valid dates, routes and leave details.');if(new Set(days.map(d=>d.date)).size!==days.length||days.some(d=>!d.date.startsWith(month+'-')||d.date<next.startsOn))throw new HttpError(400,'Use each date once within this programme’s planning period.');
   const validRoutes=routesFor(owner,rows);for(const d of days){checkDay(d,calendar,b.action==='submit');if(d.routes.some(id=>!validRoutes.some(r=>r.id===id)))throw new HttpError(400,'Choose routes assigned or accessible to this MR.');if(d.type==='leave')d.routes=[];}
   if(b.action==='submit'){
    if(!calendar.confirmed)throw new HttpError(409,'Admin must confirm this year’s government holiday calendar first.');const missing=workingDates(month,calendar,next.startsOn).filter(date=>!days.some(d=>d.date===date));if(missing.length)throw new HttpError(400,'Complete every working day. Missing: '+missing.slice(0,5).join(', '));
    next.status='Pending';next.submittedAt=now;next.calendarRevision=calendar.revision;statements.push(notification(OWNER_EMAIL,'Monthly tour programme awaiting approval',`${owner.name} · ${month}`,'Approvals',programmeID(owner.email,month)));
   }else next.status='Draft';next.days=days.sort((a,b)=>a.date.localeCompare(b.date));next.reason='';
  }else if(b.action==='withdraw'){if(old?.status!=='Pending')throw new HttpError(409,'Only a pending programme can be withdrawn.');next.status='Draft';}
  else{
   if(m.role!=='admin')throw new HttpError(403,'Admin approval is required.');if(old?.status!=='Pending')throw new HttpError(409,'Programme already reviewed or not submitted.');
   if(b.action==='approve'){
    if(!calendar.confirmed||next.calendarRevision!==calendar.revision)throw new HttpError(409,'Holiday calendar changed. Reject this submission so the MR can review and resubmit it.');
    for(const d of next.days)checkDay(d,calendar);if(workingDates(month,calendar,next.startsOn).some(date=>!next.days.some(d=>d.date===date)))throw new HttpError(409,'The programme does not cover every working day.');
    next.days=next.days.map(d=>snapshotDay(d,owner,rows));next.status='Approved';statements.push(...leaveSyncStatements(owner,next.days,rows,now));
   }else{next.status='Rejected';next.reason=parse(reasonSchema,b.reason,'Enter the rejection reason.');}
   next.reviewedAt=now;statements.push(notification(owner.email,`Monthly tour programme ${next.status.toLowerCase()}`,`${month}${next.reason?' · '+next.reason:''}`,'Tour plan',programmeID(owner.email,month)));
  }
  next.revision++;saveProgramme(owner,next);statements.push(audit(m,'Monthly tour '+b.action,'Tour plan',programmeID(owner.email,month),old,next,next.reason||b.action));await db().batch(statements);return json({ok:true});
 }
 if(b.action==='request-change'){
  const owner=await ownerFor(m,b.email);if(owner.status!=='active')throw new HttpError(409,'MR is disabled.');const from=parse(z.string().refine(validTourDate),b.from,'Select the scheduled date.'),reason=parse(reasonSchema,b.reason,'Enter the reason for the change.'),type=parse(z.enum(['routes','postpone','leave']),b.type,'Choose a change type.');if(from<today)throw new HttpError(409,'Past schedules cannot be changed.');
  const changes=new Map<string,{month:string;revision:number;before:TourDay[];after:TourDay[]}>();
  const changeDay=async(date:string,update:(day:TourDay)=>TourDay)=>{await freshMonth(date.slice(0,7));const p=programmeFrom(rows,owner.email,date.slice(0,7)),cal=calendarFrom(rows,date.slice(0,4));if(p?.status!=='Approved')throw new HttpError(409,'An approved monthly programme is required for each affected month.');if(!cal.confirmed||dayOff(date,cal))throw new HttpError(400,'Choose a working date in a confirmed holiday calendar.');if(date<p.startsOn)throw new HttpError(400,'Date is outside the approved planning period.');const original=p.days.find(d=>d.date===date)||{date,type:'visit' as const,routes:[],reason:''};const after=update(structuredClone(original));checkDay(after,cal);snapshotDay(after,owner,rows);let change=changes.get(p.month);if(!change){change={month:p.month,revision:p.revision,before:[],after:[]};changes.set(p.month,change);}change.before.push(original);change.after.push(after);};
  if(type==='routes'){const routes=parse(z.array(z.string().min(1).max(100)).min(1).max(20),b.routes,'Select at least one replacement route.');await changeDay(from,d=>({...d,type:'visit',routes,reason}));}
  else if(type==='postpone'){
   const to=parse(z.string().refine(validTourDate),b.to,'Select the postponed date.');if(to<=from)throw new HttpError(400,'Choose a later working date.');const a=programmeFrom(rows,owner.email,from.slice(0,7))?.days.find(d=>d.date===from),c=programmeFrom(rows,owner.email,to.slice(0,7))?.days.find(d=>d.date===to);if(a?.type!=='visit'||c?.type!=='visit')throw new HttpError(400,'Postponement swaps two approved working-route days. Choose a date with a route programme.');
   await changeDay(from,d=>({...d,routes:c.routes,reason}));await changeDay(to,d=>({...d,routes:a.routes,reason}));
  }else{
   const to=parse(z.string().refine(validTourDate),b.to||from,'Select the last leave date.');if(to<from||Date.parse(to)-Date.parse(from)>90*86400000)throw new HttpError(400,'Choose a leave range of up to 91 days.');for(let time=Date.parse(from+'T12:00:00Z');time<=Date.parse(to+'T12:00:00Z');time+=86400000){const date=new Date(time).toISOString().slice(0,10),cal=calendarFrom(rows,date.slice(0,4));if(!dayOff(date,cal))await changeDay(date,d=>({...d,type:'leave',routes:[],reason}));}if(!changes.size)throw new HttpError(400,'The leave range contains no working days.');
  }
  const programmes=[...changes.values()];checkOpenVisits(owner.email,programmes.flatMap(p=>p.after.map(d=>d.date)));
  const pending=(await db().prepare("SELECT body FROM workflow_requests WHERE kind='tour_change' AND mr_email=? AND status='Pending'").bind(owner.email).all<{body:string}>()).results;
  if(pending.some(r=>JSON.parse(r.body).programmes.some((p:any)=>changes.has(p.month))))throw new HttpError(409,'A change for this programme is already awaiting Admin review.');
  const id=crypto.randomUUID(),body={type,from,to:b.to||'',reason,programmes};statements.push(...programmes.map(p=>periodGuard(p.month)),db().prepare("INSERT INTO workflow_requests(id,kind,mr_email,record_id,body,status,created) VALUES (?,'tour_change',?,?,?,'Pending',?)").bind(id,owner.email,programmeID(owner.email,from.slice(0,7)),JSON.stringify(body),now),notification(OWNER_EMAIL,'Tour change approval requested',`${owner.name} · ${from} · ${type}`,'Approvals',id),audit(m,'Tour change requested','Tour plan',id,null,body,reason));await db().batch(statements);return json({ok:true,id});
 }
 if(['approve-change','reject-change','cancel-change'].includes(b.action)){
  const r=await db().prepare("SELECT * FROM workflow_requests WHERE id=? AND kind='tour_change'").bind(typeof b.id==='string'?b.id:'').first<any>();if(!r||r.status!=='Pending')throw new HttpError(409,'Request already reviewed or unavailable.');
  if(b.action==='cancel-change'){if(r.mr_email!==m.email)throw new HttpError(403,'Only the requesting MR can withdraw this request.');}else if(m.role!=='admin')throw new HttpError(403,'Admin approval is required.');
  const owner=await db().prepare("SELECT * FROM members WHERE email=? AND role='mr'").bind(r.mr_email).first<Member>();if(!owner)throw new HttpError(404,'MR unavailable.');const body=JSON.parse(r.body),status=b.action==='approve-change'?'Approved':b.action==='reject-change'?'Rejected':'Cancelled',reviewReason=status==='Rejected'?parse(reasonSchema,b.reason,'Enter a rejection reason.'):String(b.reason||body.reason).slice(0,1000);
  if(status==='Approved'){
   if(owner.status!=='active')throw new HttpError(409,'MR is disabled.');const changedDays:TourDay[]=[];for(const change of body.programmes){await freshMonth(change.month);const p=programmeFrom(rows,owner.email,change.month);if(p?.status!=='Approved'||p.revision!==change.revision)throw new HttpError(409,'Programme changed. Reject this request and ask the MR to submit it again.');const calendar=calendarFrom(rows,change.month.slice(0,4));if(!calendar.confirmed)throw new HttpError(409,'Confirm the government holiday calendar first.');
    for(const day of change.after){if(day.date<today)throw new HttpError(409,'Requested date has passed. Reject the request and ask for new dates.');checkDay(day,calendar);}checkOpenVisits(owner.email,change.after.map((d:TourDay)=>d.date));
    const after=change.after.map((d:TourDay)=>snapshotDay(d,owner,rows)),next:Programme={...p,revision:p.revision+1,days:[...p.days.filter(d=>!after.some((a:TourDay)=>a.date===d.date)),...after].sort((a,b)=>a.date.localeCompare(b.date)),history:[...(p.history||[]),{id:r.id,action:body.type,reason:body.reason,at:now,actor:m.email,before:change.before,after,...(body.type==='postpone'?{from:body.from,to:body.to}:{})}]};
    saveProgramme(owner,next);changedDays.push(...after);
   }statements.push(...leaveSyncStatements(owner,changedDays,rows,now));
  }
  statements.push(db().prepare('UPDATE workflow_requests SET status=?,reason=?,reviewed=? WHERE id=?').bind(status,reviewReason,now,r.id),notification(owner.email,`Tour change ${status.toLowerCase()}`,`${body.from} · ${reviewReason}`,'Tour plan',r.id),audit(m,'Tour change '+status,'Tour plan',r.id,body,{status,reason:reviewReason},reviewReason));await db().batch(statements);return json({ok:true});
 }
 throw new HttpError(400,'Unknown tour programme action.');
}catch(e){try{ledgerFailure(e)}catch(error){return failure(error)}}}
