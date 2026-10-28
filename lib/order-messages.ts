import {customerPhone} from './customer-phone';
import {COMPANY_STOCK_ID,COMPANY_NAME} from './supply';
import {communicationConfig} from './communication-settings';
import {renderMessage,stockistOrderPhone,doctorName,messageDate,quantityItems,splitMessage,type TemplateKey} from './message-templates';
import {emailStatement} from './email';
import {db} from './server';
import type {Member} from './permissions';
import type {PricedLine} from './field-rules';
export function phoneNumber(raw:string){let n=customerPhone(raw).replace(/\D/g,'');if(n.length===10)n='91'+n;return /^[1-9]\d{9,14}$/.test(n)?n:'';}
export function whatsappStatements(groupId:string,ref:string,mr:string,phone:string,body:string){
 const parts=splitMessage(body),ids=parts.map((_,i)=>i?`${groupId}:part:${i+1}`:groupId),created=new Date().toISOString();
 return {ids,statements:parts.map((message,i)=>db().prepare("INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,error,created,group_id) VALUES (?,?,?,?,?,'awaiting_setup','',?,?)").bind(ids[i],ref,mr,phone,message,created,groupId))};
}
export async function orderQuantityItems(items:PricedLine[]){
 const missing=[...new Set(items.filter(l=>!l.packing).map(l=>l.productId))];
 const catalogue=missing.length?(await db().prepare("SELECT id,data FROM records WHERE kind='Products' AND id IN ("+missing.map(()=>'?').join(',')+")").bind(...missing).all<{id:string;data:string}>()).results:[];
 return quantityItems(items.map(l=>({...l,packing:l.packing||JSON.parse(catalogue.find(p=>p.id===l.productId)?.data||'{}').Pack||''})));
}
export type OrderMessageEvent='new'|'approved'|'updated'|'completed'|'cancelled'|'rejected';
export async function orderMessages(m:Member,order:{id:string;number:string;date:string;stockistId:string;customer:string;customerId?:string;items:PricedLine[];subtotal:number;total:number;notes:string},revision=1,event:OrderMessageEvent='new',approved=false){
 const agency=await db().prepare("SELECT data FROM records WHERE id=? AND kind='Stockists'").bind(order.stockistId).first<{data:string}>();
 const contact=order.customerId?await db().prepare("SELECT data FROM records WHERE id=? AND kind='Customers'").bind(order.customerId).first<{data:string}>():null;
 const a=JSON.parse(agency?.data||'{}'),c=JSON.parse(contact?.data||'{}'),config=await communicationConfig(),company=order.stockistId===COMPANY_STOCK_ID;
 const values={order_number:order.number,date:messageDate(order.date),mr_name:m.name,customer_name:doctorName(c.Name||order.customer),customer_phone:c['Mobile 1']||c.Phone||'Not recorded',customer_address:c.Address||'Not recorded',agency_name:company?COMPANY_NAME:a.Name||'—',items:await orderQuantityItems(order.items),revision:String(revision),event:event==='updated'?'ORDER UPDATED':event==='cancelled'?'ORDER CANCELLED':event==='rejected'?'ORDER REJECTED':event==='completed'?'ORDER COMPLETED':'ORDER APPROVED',status:event==='rejected'?'Rejected':event==='cancelled'?'Cancelled':event==='completed'?'Completed':approved?(company?'Approved — awaiting company completion':'Approved for forwarding to stockist'):event==='new'&&order.items.some(l=>l.scheme==='other')?'Pending custom scheme approval':'Pending Admin approval'};
 const key:TemplateKey=event==='new'?'order_new':event==='approved'?'order_approved':event==='completed'?'company_completed':event==='rejected'?'order_rejected':event==='cancelled'?'order_cancelled':'order_update';
 const recipients=[...((event!=='new'&&(approved||['cancelled','rejected'].includes(event)))?[{role:'customer',phone:phoneNumber(values.customer_phone),email:c.Email||'',ref:`order:${order.id}:customer:${order.customerId||''}`,key}]:[]),
 {role:'admin',phone:phoneNumber(config.adminPhone),email:config.adminEmail,ref:`order:${order.id}:admin`,key:event==='new'?'order_admin_review' as TemplateKey:'order_internal_status' as TemplateKey},
 ...(!company&&approved?[{role:'agency',phone:phoneNumber(stockistOrderPhone(a)),email:a.Email||'',ref:`order:${order.id}:agency:${order.stockistId}`,key:event==='approved'?'stockist_forward' as TemplateKey:'stockist_update' as TemplateKey}]:[])];
 const ids:string[]=[],statements=[db().prepare("UPDATE whatsapp_outbox SET status='superseded',error='Replaced by a newer order revision.' WHERE visit_id LIKE ? AND status IN ('awaiting_setup','missing_phone','failed')").bind(`order:${order.id}:%`),db().prepare("UPDATE email_outbox SET status='superseded',error='Replaced by a newer order revision.' WHERE id LIKE ? AND status IN ('queued','awaiting_setup','failed')").bind(`order:${order.id}:%`)];
 for(const r of recipients){const id=`order:${order.id}:${revision}:${r.role}:${event}`,body=renderMessage(config.templates[r.key],values),wa=whatsappStatements(id,r.ref,m.email,r.phone,body);ids.push(...wa.ids);statements.push(...wa.statements);
  if(config.smtpEnabled&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))statements.push(emailStatement(id,m.email,r.email,`VETMECH order ${order.number} · revision ${revision}`,body));
 }
 return {ids,statements};
}
