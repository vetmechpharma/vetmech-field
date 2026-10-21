import {readJSON,member,db,json,failure,sameOrigin,HttpError,notification} from '../../../lib/server';
import {canRead,OWNER_EMAIL,type Member} from '../../../lib/permissions';
import {guard,indiaDay,ledgerFailure} from '../../../lib/operations';
import {stateSQL} from '../../../lib/periods';
import {audit} from '../../../lib/admin-audit';
import {customerStatuses,planState,type PlanRow} from '../../../lib/tour-planning';
const validDate=(d:any)=>typeof d==='string'&&/^20\d\d-\d\d-\d\d$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
async function snapshot(){const raw=(await db().prepare('SELECT * FROM records').all<any>()).results;return {raw,rows:raw.map(r=>({...r,data:JSON.parse(r.data)})) as PlanRow[]};}
export async function GET(){try{const m=await member(),{raw,rows}=await snapshot(),visible=raw.filter(r=>canRead(m,r)),ids=new Set(visible.map(r=>r.id));const requests=(await db().prepare("SELECT * FROM workflow_requests WHERE kind='customer_status' ORDER BY created DESC").all<any>()).results.filter(r=>m.role==='admin'||r.mr_email===m.email);return json({plans:rows.filter(r=>r.kind==='Tour plan'&&ids.has(r.id)).map(p=>({...p,state:planState(p,rows,indiaDay())})),requests:requests.map(r=>({...r,body:JSON.parse(r.body)}))});}catch(e){return failure(e)}}
export async function POST(req:Request){try{sameOrigin(req);const m=await member(),b=await readJSON(req) as any,now=new Date().toISOString(),today=indiaDay(),stamp=(await db().prepare(stateSQL).first<{stamp:string}>())!.stamp,{raw,rows}=await snapshot(),statements=[guard('version',`(${stateSQL})=?`,[stamp])];
 const write=(r:any,data:any)=>statements.push(db().prepare('UPDATE records SET data=? WHERE id=?').bind(JSON.stringify(data),r.id));
 if(['plan','reschedule','cancel'].includes(b.action))throw new HttpError(409,'Use the monthly tour programme and Admin-approved date change requests.');
 if(b.action==='status-request'||b.action==='status-set'){
 const c=raw.find(r=>r.kind==='Customers'&&r.id===b.customerId);if(!c||!canRead(m,c))throw new HttpError(403,'Customer unavailable.');if(!customerStatuses.includes(b.status)||typeof b.reason!=='string'||b.reason.trim().length<3)throw new HttpError(400,'Choose a customer status and enter a reason.');if(b.status==='Temporarily unavailable'&&(!validDate(b.resume)||b.resume<=today))throw new HttpError(400,'Choose a future resume date.');
 const body={name:JSON.parse(c.data).Name,status:b.status,reason:b.reason.slice(0,1000),resume:b.status==='Temporarily unavailable'?b.resume:'',routeId:b.routeId||''};
 if(m.role==='mr'){const id=crypto.randomUUID();statements.push(guard('version',"NOT EXISTS(SELECT 1 FROM workflow_requests WHERE kind='customer_status' AND record_id=? AND mr_email=? AND status='Pending')",[c.id,m.email]),db().prepare("INSERT INTO workflow_requests(id,kind,mr_email,record_id,body,status,created) VALUES (?,'customer_status',?,?,?,'Pending',?)").bind(id,m.email,c.id,JSON.stringify(body),now),notification(OWNER_EMAIL,'Customer status approval',`${m.name} · ${body.name} · ${body.status}`,'Approvals',id));}
 else{applyStatus(c,body);}
 await db().batch(statements);return json({ok:true});
 }
 if(b.action==='approve-status'||b.action==='reject-status'){
 if(m.role!=='admin')throw new HttpError(403,'Admin approval required.');const r=await db().prepare("SELECT * FROM workflow_requests WHERE id=? AND kind='customer_status' AND status='Pending'").bind(b.id).first<any>();if(!r)throw new HttpError(409,'Request already reviewed or unavailable.');const c=raw.find(c=>c.id===r.record_id&&c.kind==='Customers');if(!c)throw new HttpError(404,'Customer unavailable.');const body=JSON.parse(r.body),status=b.action==='approve-status'?'Approved':'Rejected';if(status==='Approved')applyStatus(c,body);
 statements.push(guard('version',"EXISTS(SELECT 1 FROM workflow_requests WHERE id=? AND status='Pending')",[r.id]),db().prepare('UPDATE workflow_requests SET status=?,reason=?,reviewed=? WHERE id=?').bind(status,String(b.reason||status),now,r.id),notification(r.mr_email,`Customer status ${status.toLowerCase()}`,body.name+' · '+body.status,'Customers',r.id),audit(m,'Customer status '+status,'Customers',c.id,null,body,String(b.reason||status)));await db().batch(statements);return json({ok:true});
 }
 throw new HttpError(400,'Unknown action.');
 function applyStatus(c:any,body:any){const d=JSON.parse(c.data),route=body.routeId?rows.find(r=>r.kind==='Routes'&&r.id===body.routeId):null;if(body.routeId&&!route)throw new HttpError(400,'Selected route unavailable.');if((d['Customer status']||'').startsWith('Relocated')&&body.status==='Active'&&!route)throw new HttpError(400,'Choose the correct route before reactivating a relocated customer.');const next={...d,'Customer status':body.status,'Status reason':body.reason,'Resume date':body.resume,'Status updated at':now,...(route?{'Route ID':route.id,Route:route.data.Name,District:route.data.District||'','MR route access':'{}'}:{})};write(c,next);statements.push(audit(m,'Customer status / route updated','Customers',c.id,d,next,body.reason));}
}catch(e){try{ledgerFailure(e)}catch(error){return failure(error)}}}
