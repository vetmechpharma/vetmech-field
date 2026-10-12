import {COMPANY_STOCK_ID,COMPANY_NAME} from './supply';
import {communicationConfig} from './communication-settings';
import {renderMessage,stockistOrderPhone} from './message-templates';
import {emailStatement} from './email';
import {db} from './server';
import {OWNER_EMAIL,type Member} from './permissions';
import type {PricedLine} from './field-rules';
export function phoneNumber(raw:string){let n=(raw||'').replace(/\D/g,'');if(n.length===10)n='91'+n;return /^[1-9]\d{9,14}$/.test(n)?n:'';}
export async function orderMessages(m:Member,order:{id:string;number:string;date:string;stockistId:string;customer:string;items:PricedLine[];subtotal:number;total:number;notes:string},revision=1){
 const agency=await db().prepare("SELECT data FROM records WHERE id=? AND kind='Stockists'").bind(order.stockistId).first<{data:string}>();
 const a=JSON.parse(agency?.data||'{}'),config=await communicationConfig();
 const body=renderMessage(config.templates[revision===1?'order_new':'order_update'],{order_number:order.number,date:order.date,mr_name:m.name,customer_name:order.customer,agency_name:order.stockistId===COMPANY_STOCK_ID?COMPANY_NAME:a.Name||'—',items:order.items.map(l=>`${l.name}: ${l.qty} paid + ${l.free} free; ${l.schemeNote||(l.scheme==='none'?'no scheme':'scheme '+l.scheme)}; ₹${(l.total/100).toFixed(2)} incl. GST`).join('\n'),net_value:'₹'+(order.subtotal/100).toFixed(2),total_value:'₹'+(order.total/100).toFixed(2),notes:order.notes||'—',revision:String(revision)});
 const recipients=[...(order.stockistId===COMPANY_STOCK_ID?[]:[{role:'agency',phone:phoneNumber(stockistOrderPhone(a)),ref:`order:${order.id}:agency:${order.stockistId}`}]),{role:'admin',phone:phoneNumber(config.adminPhone),ref:`order:${order.id}:admin`}];
 const ids=recipients.map(r=>`order:${order.id}:${revision}:${r.role}`),statements=recipients.map((r,i)=>db().prepare("INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,error,created) VALUES (?,?,?,?,?,'awaiting_setup','',?)").bind(ids[i],r.ref,m.email,r.phone,body,new Date().toISOString()));
 // Supersede unsent older revisions so connecting the gateway later cannot send stale order details.
 statements.unshift(db().prepare("UPDATE whatsapp_outbox SET status='superseded',error='Replaced by a newer order revision.' WHERE visit_id LIKE ? AND status IN ('awaiting_setup','missing_phone','failed')").bind(`order:${order.id}:%`));
 if(config.smtpEnabled){for(const [index,email] of (order.stockistId===COMPANY_STOCK_ID?[config.adminEmail]:[a.Email||'',config.adminEmail]).entries()){if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))statements.push(emailStatement(ids[index],m.email,email,`VETMECH order ${order.number} · revision ${revision}`,body));}statements.unshift(db().prepare("UPDATE email_outbox SET status='superseded',error='Replaced by a newer order revision.' WHERE id LIKE ? AND status IN ('queued','awaiting_setup','failed')").bind(`order:${order.id}:%`));}
 return {ids,statements};
}
