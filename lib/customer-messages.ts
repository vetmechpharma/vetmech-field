import {createHash} from 'node:crypto';
import {db,HttpError} from './server';
import {phoneNumber} from './order-messages';
import {communicationConfig,cleanupCommunicationLogs} from './communication-settings';
import {whatsappGateway,gatewayConfirmation,gatewayMessageId,gatewayRejection} from './whatsapp-gateway';
import {audit} from './admin-audit';
import type {Member} from './permissions';
export const maxAttachment=5*1024*1024;
export function messageText(template:string,name:string){
 if(typeof template!=='string'||!template.trim()||template.length>4096)throw new HttpError(400,'Enter a message up to 4096 characters.');
 if([...template.matchAll(/{{(.*?)}}/g)].some(m=>m[1].trim()!=='customer_name'))throw new HttpError(400,'Only {{customer_name}} is supported.');
 return template.replace(/{{\s*customer_name\s*}}/g,name.replace(/^Dr\.?\s*/i,'').replace(/[\r\n*_~`]/g,' ').slice(0,200)).trim();
}
export function messageAttachment(input:any){
 if(!input)return null;
 if(typeof input.name!=='string'||input.name.length>150||typeof input.base64!=='string'||input.base64.length>Math.ceil(maxAttachment/3)*4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))throw new HttpError(400,'Choose a valid image or PDF up to 5 MB.');
 const bytes=Buffer.from(input.base64,'base64');
 const mime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':'';
 if(!bytes.length||bytes.length>maxAttachment||!mime||input.type!==mime)throw new HttpError(400,'Only JPG, PNG, WebP and PDF files up to 5 MB are supported.');
 return {bytes,mime,name:input.name.replace(/[^a-zA-Z0-9._ -]/g,'_')||'attachment',hash:createHash('sha256').update(bytes).digest('hex')};
}
export async function sendCustomerMessage(actor:Member,b:any){
 if(!/^[a-f0-9-]{36}$/i.test(b.campaign||'')||typeof b.customerId!=='string'||b.customerId.length>100||typeof b.phone!=='string')throw new HttpError(400,'Review recipients before sending.');
 const customer=await db().prepare("SELECT data FROM records WHERE id=? AND kind='Customers'").bind(b.customerId).first<{data:string}>();
 if(!customer)throw new HttpError(404,'Customer no longer exists.');const data=JSON.parse(customer.data),phone=phoneNumber(data['Mobile 1']||data.Phone||'');
 if(!phone||phone!==b.phone)throw new HttpError(409,'Customer phone changed or is invalid. Review recipients again.');
 const text=messageText(b.template,data.Name||'Customer'),file=messageAttachment(b.attachment);
 if(text.length>(file?1024:4096))throw new HttpError(400,file?'Attachment captions are limited to 1024 characters.':'Personalised message exceeds 4096 characters.');
 const config=await communicationConfig();if(!config.whatsappEnabled||!config.whatsappKey||!config.whatsappSession)throw new HttpError(400,'Configure an enabled WhatsApp gateway and session first.');
 const gateway=whatsappGateway(config.whatsappUrl,config.whatsappSession,phone,text,'');if(file&&!gateway.vetmech)throw new HttpError(400,'Attachments require the VETMECH MSG /api/v1/messages gateway.');
 const id='broadcast:'+b.campaign+':'+createHash('sha256').update(phone).digest('hex').slice(0,24);
 const fingerprint=createHash('sha256').update(JSON.stringify([actor.email,b.customerId,phone,text,file?.hash||'',file?.name||''])).digest('hex');
 const group='broadcast:'+fingerprint;
 const prior=await db().prepare('SELECT * FROM whatsapp_outbox WHERE id=?').bind(id).first<any>();
 if(prior){if(prior.group_id!==group)throw new HttpError(409,'This send already exists with different content. Review its delivery log.');return {id,status:prior.status,reused:true};}
 await cleanupCommunicationLogs();
 const now=new Date().toISOString();
 await db().batch([db().prepare("INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,error,created,group_id,gateway_url,gateway_session) VALUES (?,?,?,?,?,'sending','',?,?,?,?)").bind(id,id,actor.email,phone,text,now,group,gateway.url.href,config.whatsappSession),audit(actor,'Customer WhatsApp send','Customers',b.customerId,null,{messageId:id,phone,attachment:file?.name||'',attachmentHash:file?.hash||''},'Admin reviewed recipient and message')]);
 let status='uncertain',error='',providerId='',providerStatus='';
 try{
  let body:BodyInit,headers:Record<string,string>={Authorization:`Bearer ${config.whatsappKey}`,'Idempotency-Key':id};let url=gateway.url;
  if(file){url=new URL('/api/v1/messages/send-media',gateway.url.origin);const form=new FormData();form.set('sessionId',config.whatsappSession);form.set('phone',phone);form.set('caption',text);form.set('file',new Blob([new Uint8Array(file.bytes)],{type:file.mime}),file.name);body=form;}
  else{body=JSON.stringify(gateway.body);headers['Content-Type']='application/json';}
  const response=await fetch(url,{method:'POST',redirect:'error',headers,body,signal:AbortSignal.timeout(20000)});const result=await response.json().catch(()=>null);providerId=gatewayMessageId(result);providerStatus=String(result?.status||'').slice(0,100);
  if(response.ok){status=gatewayConfirmation(result,gateway.animitra,gateway.vetmech)||'uncertain';}
  else{error=gatewayRejection(response.status,gateway.animitra,gateway.vetmech);status=error&&!providerId?'failed':'uncertain';}
  if(['uncertain','not_sent','demo_only'].includes(status))error='Submission is not confirmed. Check gateway status before creating another send.';
 }catch{error='Gateway connection interrupted. Check the gateway before retrying; no automatic resend.';}
 await db().prepare('UPDATE whatsapp_outbox SET status=?,error=?,gateway_id=?,gateway_status=?,sent_at=? WHERE id=?').bind(status,error,providerId,providerStatus,new Date().toISOString(),id).run();
 return {id,status,error};
}
