import {whatsappGateway,gatewayConfirmation,gatewayRejection} from './whatsapp-gateway';
import {communicationConfig,cleanupCommunicationLogs} from './communication-settings';
import {stockistOrderPhone} from './message-templates';
import {sendEmail} from './email';
import {phoneNumber} from './order-messages';
import {db} from './server';
export async function sendWhatsApp(id:string){await Promise.allSettled([dispatchWhatsApp(id),sendEmail(id)]);}
async function dispatchWhatsApp(id:string){
 await cleanupCommunicationLogs();
 const config=await communicationConfig();
 const row=await db().prepare('SELECT * FROM whatsapp_outbox WHERE id=?').bind(id).first<{id:string;visit_id:string;phone:string;message:string;status:string}>();if(!row||['sent','accepted','sending','uncertain','superseded'].includes(row.status))return;
 if(Date.parse((row as any).created)<Date.now()-30*86400000){await cleanupCommunicationLogs();return;}
 let raw=row.phone;
 if(row.visit_id.startsWith('order:')){const parts=row.visit_id.split(':');if(parts[2]==='agency'){const r=await db().prepare("SELECT data FROM records WHERE id=? AND kind='Stockists'").bind(parts[3]).first<{data:string}>();const d=JSON.parse(r?.data||'{}');raw=stockistOrderPhone(d)}else{raw=config.adminPhone}}
 else if(!row.visit_id.startsWith('test:')){const contact=await db().prepare("SELECT json_extract(c.data,'$.\"Mobile 1\"') AS mobile,json_extract(c.data,'$.Phone') AS phone FROM records v JOIN records c ON c.id=json_extract(v.data,'$.\"Customer ID\"') WHERE v.id=?").bind(row.visit_id).first<{mobile:string;phone:string}>();raw=contact?.mobile||contact?.phone||row.phone;}
 const current=phoneNumber(raw);if(current!==row.phone){row.phone=current;await db().prepare('UPDATE whatsapp_outbox SET phone=? WHERE id=?').bind(current,id).run();}
 if(!row.phone){await db().prepare("UPDATE whatsapp_outbox SET status='missing_phone',error='Add a valid recipient WhatsApp number before sending.' WHERE id=? AND status IN ('awaiting_setup','missing_phone','failed')").bind(id).run();return;}
 if(!config.whatsappEnabled||!config.whatsappUrl||!config.whatsappKey){await db().prepare("UPDATE whatsapp_outbox SET status='awaiting_setup',error='WhatsApp gateway is not connected. Message saved; not sent.' WHERE id=? AND status IN ('awaiting_setup','missing_phone','failed')").bind(id).run();return;}
 let gateway:ReturnType<typeof whatsappGateway>;try{gateway=whatsappGateway(config.whatsappUrl,config.whatsappSession,row.phone,row.message,id)}catch{await db().prepare("UPDATE whatsapp_outbox SET status='failed',error=? WHERE id=?").bind('Invalid gateway endpoint. For ANIMitra use https://wa.animitra.in/api/v1/send/text',id).run();return;}const {url,animitra}=gateway;if(url.protocol!=='https:')return;
 const claimed=await db().prepare("UPDATE whatsapp_outbox SET status='sending',error='' WHERE id=? AND status IN ('awaiting_setup','failed','missing_phone') RETURNING id").bind(id).first();if(!claimed)return;
 try{
  // ANIMitra does not document reference deduplication: never retry an ambiguous send automatically.
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.whatsappKey}`,'Idempotency-Key':id},body:JSON.stringify(gateway.body),signal:AbortSignal.timeout(12000)});
  if(!response.ok){const rejected=gatewayRejection(response.status,animitra);if(rejected){await db().prepare("UPDATE whatsapp_outbox SET status='failed',error=? WHERE id=?").bind(rejected,id).run();return;}throw new Error(`Gateway HTTP ${response.status}. Acceptance unknown; check gateway logs before retrying.`);}
  let result:any;try{result=await response.json()}catch{throw Error('Gateway returned a non-JSON response. Check the message endpoint and gateway logs before retrying.');}
  const status=gatewayConfirmation(result,animitra);if(!status)throw new Error('Gateway response did not confirm acceptance. Check gateway logs before retrying.');
  await db().prepare("UPDATE whatsapp_outbox SET status=?,sent_at=?,error='' WHERE id=?").bind(status,new Date().toISOString(),id).run();
 }catch(e){await db().prepare("UPDATE whatsapp_outbox SET status='uncertain',error=? WHERE id=?").bind(e instanceof Error&&/^(Gateway HTTP|Gateway returned|Gateway response)/.test(e.message)?e.message:'Gateway connection failed or timed out. Acceptance unknown; check gateway logs before retrying to avoid duplicates.',id).run();}
}
