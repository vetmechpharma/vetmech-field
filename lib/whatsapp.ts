import {whatsappGateway,gatewayConfirmation,gatewayRejection,gatewayMessageId} from './whatsapp-gateway';
import {communicationConfig,cleanupCommunicationLogs} from './communication-settings';
import {stockistOrderPhone} from './message-templates';
import {sendEmail} from './email';
import {phoneNumber} from './order-messages';
import {messageBlock} from './message-policy';
import {guard} from './operations';
import {db,notification,HttpError} from './server';
export async function sendWhatsApp(id:string){await Promise.allSettled([dispatchWhatsApp(id),sendEmail(id)]);}
const accepted=['sent','accepted','submitted','delivered','read'];
async function recordForwarding(row:any){
 if(!row.visit_id.startsWith('order:')||row.visit_id.split(':')[2]!=='agency'||!row.group_id)return;
 const orderId=row.visit_id.split(':')[1],revision=Number(row.id.split(':')[2]);
 for(let attempt=0;attempt<5;attempt++){
 const order=await db().prepare('SELECT * FROM invoices WHERE id=?').bind(orderId).first<any>();
 if(!order||!order.accepted||order.status!=='Placed'||order.revision!==revision)return;
 const parts=(await db().prepare('SELECT status FROM whatsapp_outbox WHERE group_id=?').bind(row.group_id).all<any>()).results;
 const complete=parts.length>0&&parts.every(p=>accepted.includes(p.status));
 const state=complete?(parts.every(p=>['delivered','read'].includes(p.status))?'delivered':'accepted'):parts.some(p=>['failed','not_sent','uncertain','demo_only'].includes(p.status))?'unconfirmed':'pending';
 const first=complete&&Number(order.forwarded_revision)!==revision;
 try{await db().batch([
  guard('version','EXISTS(SELECT 1 FROM invoices WHERE id=? AND revision=? AND accepted=1 AND status=?)',[orderId,revision,'Placed']),
  guard('version','EXISTS(SELECT 1 FROM invoices WHERE id=? AND COALESCE(forwarded_revision,0)=? AND COALESCE(forwarding_state,\'\')=?)',[orderId,Number(order.forwarded_revision||0),order.forwarding_state||'']),
  db().prepare('UPDATE invoices SET forwarded_revision=?,forwarded_at=?,forwarding_state=? WHERE id=?').bind(complete?revision:0,complete?(order.forwarded_at||new Date().toISOString()):'',state,orderId),
  ...(first?[notification(order.mr_email,'Order forwarded to stockist',`${order.number} · Gateway accepted the order. This does not confirm stockist supply.`,'Orders',orderId)]:[]),
 ]);return;}catch{/* Another part or edit won the receipt update. Re-read before retrying. */}
 }
}
async function dispatchWhatsApp(id:string){
 await cleanupCommunicationLogs();
 const config=await communicationConfig(),row=await db().prepare('SELECT * FROM whatsapp_outbox WHERE id=?').bind(id).first<any>();
 if(!row||![ 'awaiting_setup','failed','missing_phone'].includes(row.status)||row.gateway_id)return;
 if(Date.parse(row.created)<Date.now()-30*86400000)return;
 const blocked=await messageBlock(row);if(blocked){await db().prepare("UPDATE whatsapp_outbox SET status='superseded',error=? WHERE id=?").bind(blocked,id).run();return;}
 let raw=row.phone;
 if(row.visit_id.startsWith('order:')){const parts=row.visit_id.split(':');if(parts[2]==='agency'||parts[2]==='customer'){const r=await db().prepare('SELECT data FROM records WHERE id=? AND kind=?').bind(parts[3],parts[2]==='agency'?'Stockists':'Customers').first<{data:string}>();const d=JSON.parse(r?.data||'{}');raw=parts[2]==='agency'?stockistOrderPhone(d):d['Mobile 1']||d.Phone||row.phone;}else raw=config.adminPhone;}
 else if(!row.visit_id.startsWith('test:')){const contact=await db().prepare("SELECT json_extract(c.data,'$.\"Mobile 1\"') AS mobile,json_extract(c.data,'$.Phone') AS phone FROM records v JOIN records c ON c.id=json_extract(v.data,'$.\"Customer ID\"') WHERE v.id=?").bind(row.visit_id).first<{mobile:string;phone:string}>();raw=contact?.mobile||contact?.phone||row.phone;}
 row.phone=phoneNumber(raw);await db().prepare('UPDATE whatsapp_outbox SET phone=? WHERE id=?').bind(row.phone,id).run();
 if(!row.phone){await db().prepare("UPDATE whatsapp_outbox SET status='missing_phone',error='Add a valid recipient WhatsApp number before sending.' WHERE id=?").bind(id).run();return;}
 if(!config.whatsappEnabled||!config.whatsappUrl||!config.whatsappKey){await db().prepare("UPDATE whatsapp_outbox SET status='awaiting_setup',error='Gateway is not connected. Message saved; not sent.' WHERE id=?").bind(id).run();return;}
 let gateway:ReturnType<typeof whatsappGateway>;try{gateway=whatsappGateway(config.whatsappUrl,config.whatsappSession,row.phone,row.message,id)}catch(e){await db().prepare("UPDATE whatsapp_outbox SET status='failed',error=? WHERE id=?").bind((e as Error).message,id).run();return;}
 if(row.message.length>4096){await db().prepare("UPDATE whatsapp_outbox SET status='failed',error='Message exceeds 4096 characters. Review the template.' WHERE id=?").bind(id).run();return;}
 const claimed=await db().prepare("UPDATE whatsapp_outbox SET status='sending',error='',gateway_url=?,gateway_session=? WHERE id=? AND status IN ('awaiting_setup','failed','missing_phone') RETURNING id").bind(gateway.url.href,config.whatsappSession,id).first();if(!claimed)return;
 try{
  const response=await fetch(gateway.url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.whatsappKey}`,'Idempotency-Key':id},body:JSON.stringify(gateway.body),signal:AbortSignal.timeout(12000)});
  let result:any;try{result=await response.json()}catch{result=null;}
  const providerId=gatewayMessageId(result);
  if(providerId)await db().prepare('UPDATE whatsapp_outbox SET gateway_id=?,gateway_status=? WHERE id=?').bind(providerId,String(result?.status||''),id).run();
  if(!response.ok){const rejected=gatewayRejection(response.status,gateway.animitra,gateway.vetmech);if(rejected&&!providerId){await db().prepare("UPDATE whatsapp_outbox SET status='failed',error=? WHERE id=?").bind(rejected,id).run();return;}throw Error(`Gateway HTTP ${response.status}. Check status before retrying.`);}
  const status=gatewayConfirmation(result,gateway.animitra,gateway.vetmech);if(!status)throw Error('Gateway response did not confirm acceptance. Check gateway logs before retrying.');
  await db().prepare('UPDATE whatsapp_outbox SET status=?,sent_at=?,error=? WHERE id=?').bind(status,new Date().toISOString(),['uncertain','not_sent','demo_only'].includes(status)?'Gateway has not confirmed submission. Check its status; no automatic resend.':'',id).run();
 }catch(e){await db().prepare("UPDATE whatsapp_outbox SET status='uncertain',error=? WHERE id=?").bind(e instanceof Error&&e.message.startsWith('Gateway ')?e.message:'Gateway connection failed or timed out. Check the gateway before retrying to avoid duplicates.',id).run();}
 finally{await recordForwarding(row);}
}
export async function refreshWhatsAppStatus(id:string){
 const row=await db().prepare('SELECT * FROM whatsapp_outbox WHERE id=?').bind(id).first<any>();
 if(!row||!row.gateway_id)throw new HttpError(400,'No gateway message ID is available. Check the gateway directly; do not create a duplicate send.');
 const config=await communicationConfig(),gateway=whatsappGateway(config.whatsappUrl,config.whatsappSession,row.phone,row.message,id);
 if(!gateway.vetmech||gateway.url.href!==row.gateway_url||config.whatsappSession!==row.gateway_session)throw new HttpError(409,'Restore the matching gateway URL and session to check this message.');
 let response:Response;try{response=await fetch(new URL('/api/v1/messages/'+encodeURIComponent(row.gateway_id),gateway.url.origin),{redirect:'error',headers:{Authorization:`Bearer ${config.whatsappKey}`},signal:AbortSignal.timeout(10000)})}catch{throw new HttpError(502,'Gateway status is unavailable. The message was not resent.');}
 if(!response.ok)throw new HttpError(502,response.status===403?'The API key needs read scope and permission for this session.':'Gateway status check failed. The message was not resent.');
 const result=await response.json();if(gatewayMessageId(result)!==row.gateway_id||result.sessionId&&result.sessionId!==row.gateway_session||result.phone&&result.phone!==row.phone)throw new HttpError(502,'Gateway status did not match this message.');
 const status=gatewayConfirmation(result,false,true);if(!status)throw new HttpError(502,'Unknown gateway status. The message was not resent.');
 await db().prepare('UPDATE whatsapp_outbox SET status=?,gateway_status=?,checked_at=?,error=? WHERE id=?').bind(status,String(result.status),new Date().toISOString(),['uncertain','not_sent','demo_only'].includes(status)?'Submission is not confirmed. Check the gateway before taking further action.':'',id).run();
 await recordForwarding(row);return status;
}
