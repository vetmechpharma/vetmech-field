import {db} from './server';
import {OWNER_EMAIL,type Member} from './permissions';
import type {PricedLine} from './field-rules';
export function phoneNumber(raw:string){let n=(raw||'').replace(/\D/g,'');if(n.length===10)n='91'+n;return /^[1-9]\d{9,14}$/.test(n)?n:'';}
export async function orderMessages(m:Member,order:{id:string;number:string;date:string;stockistId:string;customer:string;items:PricedLine[];subtotal:number;total:number;notes:string},revision=1){
 const agency=await db().prepare("SELECT data FROM records WHERE id=? AND kind='Stockists'").bind(order.stockistId).first<{data:string}>(),settings=await db().prepare("SELECT data FROM records WHERE id='whatsapp-settings'").first<{data:string}>();
 const a=JSON.parse(agency?.data||'{}'),config=JSON.parse(settings?.data||'{}');
 const body=`VETMECH — ${revision===1?'New MR order':'UPDATED MR order (replaces earlier details)'}\nOrder number: ${order.number}\nDate: ${order.date}\nMR: ${m.name}\nCustomer: ${order.customer}\nAgency: ${a.Name||'—'}\n${order.items.map(l=>`${l.name}: ${l.qty} paid + ${l.free} free; ${l.scheme==='none'?'no scheme':'scheme '+l.scheme}; ₹${(l.total/100).toFixed(2)} incl. GST`).join('\n')}\nNet: ₹${(order.subtotal/100).toFixed(2)}\nTotal incl. GST: ₹${(order.total/100).toFixed(2)}${order.notes?'\nRequests: '+order.notes:''}\nRevision: ${revision}`;
 const recipients=[{role:'agency',phone:phoneNumber(a['WhatsApp number']||a.Phone||''),ref:`order:${order.id}:agency:${order.stockistId}`},{role:'admin',phone:phoneNumber(config['Admin WhatsApp number']||''),ref:`order:${order.id}:admin`}];
 const ids=recipients.map(r=>`order:${order.id}:${revision}:${r.role}`),statements=recipients.map((r,i)=>db().prepare("INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,error,created) VALUES (?,?,?,?,?,'awaiting_setup','',?)").bind(ids[i],r.ref,m.email,r.phone,body,new Date().toISOString()));
 // Supersede unsent older revisions so connecting the gateway later cannot send stale order details.
 statements.unshift(db().prepare("UPDATE whatsapp_outbox SET status='superseded',error='Replaced by a newer order revision.' WHERE visit_id LIKE ? AND status IN ('awaiting_setup','missing_phone','failed')").bind(`order:${order.id}:%`));
 return {ids,statements};
}
