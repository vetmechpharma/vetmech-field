const env=process.env;
import {phoneNumber} from './order-messages';
import {db} from './server';
export async function sendWhatsApp(id:string){
 const row=await db().prepare('SELECT * FROM whatsapp_outbox WHERE id=?').bind(id).first<{id:string;visit_id:string;phone:string;message:string;status:string}>();if(!row||['sent','accepted','sending','uncertain','superseded'].includes(row.status))return;
 let raw=row.phone;
 if(row.visit_id.startsWith('order:')){const parts=row.visit_id.split(':');if(parts[2]==='agency'){const r=await db().prepare("SELECT data FROM records WHERE id=? AND kind='Stockists'").bind(parts[3]).first<{data:string}>();const d=JSON.parse(r?.data||'{}');raw=d['WhatsApp number']||d.Phone||''}else{const r=await db().prepare("SELECT data FROM records WHERE id='whatsapp-settings'").first<{data:string}>();raw=JSON.parse(r?.data||'{}')['Admin WhatsApp number']||''}}
 else{const contact=await db().prepare("SELECT json_extract(c.data,'$.\"Mobile 1\"') AS mobile,json_extract(c.data,'$.Phone') AS phone FROM records v JOIN records c ON c.id=json_extract(v.data,'$.\"Customer ID\"') WHERE v.id=?").bind(row.visit_id).first<{mobile:string;phone:string}>();raw=contact?.mobile||contact?.phone||row.phone;}
 const current=phoneNumber(raw);if(current!==row.phone){row.phone=current;await db().prepare('UPDATE whatsapp_outbox SET phone=? WHERE id=?').bind(current,id).run();}
 if(!row.phone){await db().prepare("UPDATE whatsapp_outbox SET status='missing_phone',error='Add a valid recipient WhatsApp number before sending.' WHERE id=? AND status IN ('awaiting_setup','missing_phone','failed')").bind(id).run();return;}
 if(!env.WHATSAPP_WEBHOOK_URL||!env.WHATSAPP_API_KEY){await db().prepare("UPDATE whatsapp_outbox SET status='awaiting_setup',error='WhatsApp gateway is not connected. Message saved; not sent.' WHERE id=? AND status IN ('awaiting_setup','missing_phone','failed')").bind(id).run();return;}
 const url=new URL(env.WHATSAPP_WEBHOOK_URL);if(url.protocol!=='https:')return;
 const claimed=await db().prepare("UPDATE whatsapp_outbox SET status='sending',error='' WHERE id=? AND status IN ('awaiting_setup','failed','missing_phone') RETURNING id").bind(id).first();if(!claimed)return;
 try{
  // The configured gateway must implement this explicit webhook contract and deduplicate reference.
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.WHATSAPP_API_KEY}`,'Idempotency-Key':id},body:JSON.stringify({phone:row.phone,message:row.message,session:env.WHATSAPP_SESSION||'primary',reference:id}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`Gateway returned ${response.status}.`);
  const result=await response.json() as {sent?:boolean;accepted?:boolean};
  if(result.sent!==true&&result.accepted!==true)throw new Error('Gateway did not confirm acceptance.');
  await db().prepare("UPDATE whatsapp_outbox SET status=?,sent_at=?,error='' WHERE id=?").bind(result.sent===true?'sent':'accepted',new Date().toISOString(),id).run();
 }catch(e){await db().prepare("UPDATE whatsapp_outbox SET status='uncertain',error=? WHERE id=?").bind('Delivery not confirmed. Check the gateway before retrying to avoid duplicates.',id).run();}
}
