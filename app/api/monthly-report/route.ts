import {mrReport} from '../../../lib/benefit-visibility';
import {periodGuard,assertOpen} from '../../../lib/periods';
import {routeInsights,shiftMonth} from '../../../lib/route-insights';
import {readJSON,member,admin,db,json,failure,HttpError,sameOrigin} from '../../../lib/server';
import {buildReport,totals,type Row} from '../../../lib/monthly-report';
import type {Member} from '../../../lib/permissions';
const validMonth=(m:string)=>typeof m==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(m);
export async function GET(req:Request){try{const viewer=await member(),q=new URL(req.url).searchParams,month=q.get('month')||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}).slice(0,7);if(!validMonth(month))throw new HttpError(400,'Choose a valid month.');
 const email=q.get('mr')||viewer.email;if(viewer.role!=='admin'&&email!==viewer.email)throw new HttpError(403,'You can view only your own report.');
 const closed=await db().prepare('SELECT closure_id,updated FROM period_locks WHERE month=? AND closed=1').bind(month).first<{closure_id:string;updated:string}>();if(closed){const archives=(await db().prepare('SELECT mr_email,report FROM period_reports WHERE closure_id=?').bind(closed.closure_id).all<{mr_email:string;report:string}>()).results.filter(r=>viewer.role==='admin'||r.mr_email===viewer.email);if(q.get('summary')==='1')return json({month,summaries:archives.map(r=>JSON.parse(r.report)[viewer.role].summary),closed:true});const saved=archives.find(r=>r.mr_email===email);if(!saved)throw new HttpError(404,'No archived report for this MR.');const archived=JSON.parse(saved.report)[viewer.role];return json(viewer.role==='admin'?archived:mrReport(archived));}
 const [rs,is,ms]=await Promise.all([db().prepare('SELECT * FROM records').all<Row>(),db().prepare('SELECT * FROM invoices').all<Row>(),db().prepare("SELECT * FROM members WHERE role='mr'").all<Member>()]);
 const records=rs.results.map(r=>({...r,data:JSON.parse(r.data)})),invoices=is.results.map(i=>({...i,items:JSON.parse(i.items)})),reps=ms.results.filter(m=>viewer.role==='admin'||m.email===viewer.email);
 if(q.get('summary')==='1')return json({month,summaries:reps.map(m=>totals(m,month,records,invoices))});
 const mr=reps.find(m=>m.email===email);if(!mr)throw new HttpError(404,'Choose a representative.');
 const [sm,bm,cm]=await Promise.all([db().prepare('SELECT * FROM stock_movements').all<Row>(),db().prepare('SELECT * FROM benefit_movements WHERE mr_email=?').bind(mr.email).all<Row>(),db().prepare('SELECT * FROM commitments WHERE mr_email=?').bind(mr.email).all<Row>()]);
 const compare=q.get('compare')||shiftMonth(month,-1),inactive=Number(q.get('inactive')||3);if(!validMonth(compare)||![1,2,3,6,12].includes(inactive))throw new HttpError(400,'Choose valid comparison settings.');const report=buildReport(mr,month,records,invoices,sm.results,bm.results,cm.results,viewer.role==='admin');report.tables.push(...routeInsights(mr,month,compare,inactive,records,invoices).tables);return json(viewer.role==='admin'?report:mrReport(report));
}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 sameOrigin(req);const a=await admin(),b=await readJSON(req) as any;
 if(!b||!validMonth(b.month))throw new HttpError(400,'Choose a valid month.');
 let targets:{email:string;target:number}[];
 if(Array.isArray(b.targets)){
  if(!b.targets.length||b.targets.length>200||!Number.isFinite(b.total)||b.total<1||b.total>100000000)throw new HttpError(400,'Enter a monthly total and MR allocations.');
  targets=b.targets;
  const reps=(await db().prepare("SELECT email FROM members WHERE role='mr' AND status='active'").all<{email:string}>()).results;
  if(new Set(targets.map(t=>t?.email)).size!==targets.length||targets.length!==reps.length||reps.some(m=>!targets.some(t=>t?.email===m.email)))throw new HttpError(400,'Include each active MR exactly once. Refresh the list.');
  if(targets.some(t=>!t||typeof t.email!=='string'||!Number.isFinite(t.target)||t.target<1||t.target>100000000))throw new HttpError(400,'Enter a positive target for each MR.');
  if(targets.reduce((n,t)=>n+Math.round(t.target*100),0)!==Math.round(b.total*100))throw new HttpError(400,'MR allocations must equal the total monthly target.');
 }else{
  if(typeof b.email!=='string'||!Number.isFinite(b.target)||b.target<1||b.target>100000000)throw new HttpError(400,'Enter a representative and positive target.');
  targets=[{email:b.email,target:b.target}];
 }
 for(const t of targets){if(!await db().prepare("SELECT email FROM members WHERE email=? AND role='mr'").bind(t.email).first())throw new HttpError(404,'Representative not found.');}
 await assertOpen(b.month);await db().batch([periodGuard(b.month),...targets.map(t=>db().prepare("INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,'Settings',?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(`monthly-target:${t.email}:${b.month}`,a.user_id||a.email,JSON.stringify({'MR monthly target':Math.round(t.target*100)/100,Month:b.month}),new Date().toISOString(),t.email))]);return json({ok:true});
}catch(e){return failure(e)}}
