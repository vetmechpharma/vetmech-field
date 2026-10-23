import {pendingCustomEdit} from '../../../lib/custom-schemes';
import {stockAvailability} from '../../../lib/stock-availability';
import {batchInventory} from '../../../lib/batch-stock';
import {audit} from '../../../lib/admin-audit';
import {stateSQL} from '../../../lib/periods';
import {digest} from '../../../lib/passwords';
import {readJSON,member,admin,db,json,failure,HttpError,sameOrigin,notification} from '../../../lib/server';
import {idList} from '../../../lib/field-rules';
import {guard,indiaDay} from '../../../lib/operations';
import type {Member} from '../../../lib/permissions';
export async function GET(){try{
 const m=await member(),stamp=(await db().prepare(stateSQL).first<{stamp:string}>())!.stamp;
 const requests=(await db().prepare("SELECT * FROM workflow_requests WHERE kind IN ('customer_access','order_edit') ORDER BY created DESC").all<any>()).results.filter(r=>m.role==='admin'||r.mr_email===m.email);
 const records=m.role==='admin'?(await db().prepare("SELECT id,data FROM records WHERE kind IN ('Customers','Routes','Products','Stockists')").all<any>()).results.map(r=>({...r,data:JSON.parse(r.data)})):[];
 const orders=(await (m.role==='admin'?db().prepare("SELECT * FROM invoices WHERE kind='secondary'"):db().prepare("SELECT * FROM invoices WHERE kind='secondary' AND mr_email=?").bind(m.email)).all<any>()).results;
 const edits=(await db().prepare('SELECT * FROM order_edits').all<any>()).results;
 for(const request of requests){if(request.kind!=='order_edit')continue;const body=JSON.parse(request.body),edit=edits.find(e=>e.id===request.id);if(edit){body.beforeOrder=JSON.parse(edit.before_data);body.afterOrder=JSON.parse(edit.after_data);body.proposedItems=body.afterOrder.status==='Cancelled'?[]:JSON.parse(body.afterOrder.items);}request.body=JSON.stringify(body);}
 const newOrders=orders.filter(o=>o.status==='Placed'&&!o.accepted&&!pendingCustomEdit(requests,o.id)).map(o=>({id:'approval:'+o.id,kind:'order_approval',status:'Pending',mr_email:o.mr_email,record_id:o.id,created:o.created,reason:'',body:JSON.stringify({revision:o.revision,number:o.number,editComparison:requests.filter(r=>r.kind==='order_edit'&&r.status==='Approved'&&r.record_id===o.id).map(r=>JSON.parse(r.body)).find(b=>b.afterOrder?.revision===o.revision)})}));
 let stock:any[]=[];
 if(m.role==='admin'){
  const [balances,reservations,batchInvoices]=await Promise.all([db().prepare('SELECT * FROM stock_balances').all<any>(),db().prepare('SELECT * FROM stock_reservations').all<any>(),db().prepare('SELECT * FROM invoices').all<any>()]);
  stock=stockAvailability(balances.results,reservations.results,batchInventory(batchInvoices.results.map(i=>({...i,items:JSON.parse(i.items)})),balances.results),indiaDay());
 }
 if((await db().prepare(stateSQL).first<{stamp:string}>())!.stamp!==stamp)throw new HttpError(409,'Data changed. Refresh approvals.');
 return json({stock,hash:await digest(stamp),orders,requests:[...newOrders,...requests.map(r=>m.role==='admin'?r:{id:r.id,record_id:r.record_id,mr_email:r.mr_email,kind:r.kind,status:r.status,created:r.created,reason:r.reason,body:r.kind==='order_edit'?r.body:JSON.stringify({submitted:{Name:JSON.parse(r.body).submitted?.Name}})})],records});
}catch(e){return failure(e)}}
export async function POST(req:Request){try{sameOrigin(req);const a=await admin(),b=await readJSON(req) as any;if(!['approve','reject'].includes(b.action)||typeof b.id!=='string')throw new HttpError(400,'Choose a request.');const r=await db().prepare("SELECT * FROM workflow_requests WHERE id=? AND kind='customer_access' AND status='Pending'").bind(b.id).first<any>();if(!r)throw new HttpError(409,'Request already reviewed.');const body=JSON.parse(r.body),now=new Date().toISOString(),statements=[guard('version',"EXISTS(SELECT 1 FROM workflow_requests WHERE id=? AND status='Pending')",[r.id])];
 if(b.action==='approve'){const mr=await db().prepare('SELECT * FROM members WHERE email=?').bind(r.mr_email).first<Member>();if(!mr||mr.status!=='active'||!idList(mr.route_ids).includes(body.routeId))throw new HttpError(409,'The requested route must still be assigned to an active MR.');const id=b.customerId||r.record_id;if(!body.candidates.includes(id))throw new HttpError(400,'Choose one of the matching customers.');const c=await db().prepare("SELECT * FROM records WHERE id=? AND kind='Customers'").bind(id).first<any>();if(!c)throw new HttpError(404,'Customer unavailable.');const d=JSON.parse(c.data);let grants:Record<string,string>={};try{grants=JSON.parse(d['MR route access']||'{}')}catch{}grants[r.mr_email]=body.routeId;d['MR route access']=JSON.stringify(grants);d['Blocked MRs']=JSON.stringify(idList(d['Blocked MRs']).filter(x=>x!==r.mr_email));statements.push(audit(a,'Customer route access granted','Customers',c.id,JSON.parse(c.data),d,String(b.reason||'Approved duplicate-customer access request')),guard('version','EXISTS(SELECT 1 FROM records WHERE id=? AND data=?)',[c.id,c.data]),db().prepare('UPDATE records SET data=? WHERE id=?').bind(JSON.stringify(d),c.id));}
 if(b.action==='reject')statements.push(audit(a,'Customer access request rejected','Customers',r.record_id,body,null,String(b.reason||'Rejected duplicate-customer access request')));
 const status=b.action==='approve'?'Approved':'Rejected',reason=String(b.reason||`${status} by ${a.name}`).slice(0,1000);statements.push(db().prepare('UPDATE workflow_requests SET status=?,reviewed=?,reason=? WHERE id=?').bind(status,now,reason,r.id),notification(r.mr_email,`Customer access ${status.toLowerCase()}`,`${body.submitted.Name} · ${reason}`,'Customers',r.record_id));await db().batch(statements);return json({ok:true});
}catch(e){return failure(e)}}
