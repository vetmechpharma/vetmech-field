import {z} from 'zod';
import {admin,member,db,json,failure,sameOrigin,HttpError} from '../../../lib/server';
import {communicationConfig,publicConfig,seal,cleanupCommunicationLogs} from '../../../lib/communication-settings';
import {messageTemplates,templateTokens} from '../../../lib/message-templates';
import {phoneNumber} from '../../../lib/order-messages';
import {sendWhatsApp} from '../../../lib/whatsapp';
import {emailStatement,sendEmail} from '../../../lib/email';
const email=z.union([z.literal(''),z.string().email().max(254)]);
const schema=z.object({whatsappEnabled:z.boolean(),whatsappUrl:z.string().max(1000),whatsappKey:z.string().max(4000).default(''),whatsappSession:z.string().trim().min(1).max(100),adminPhone:z.string().max(30),smtpEnabled:z.boolean(),smtpHost:z.string().trim().max(253),smtpPort:z.union([z.literal(465),z.literal(587)]),smtpUser:z.string().max(254),smtpPassword:z.string().max(4000).default(''),smtpFrom:email,adminEmail:email,templates:z.object({order_new:z.string().trim().min(10).max(5000),order_update:z.string().trim().min(10).max(5000),visit_thanks:z.string().trim().min(10).max(5000)})});
export async function GET(){try{const m=await member();await cleanupCommunicationLogs();const wa=(await db().prepare('SELECT * FROM whatsapp_outbox ORDER BY created DESC LIMIT 500').all<any>()).results.filter(r=>m.role==='admin'||r.mr_email===m.email);const emails=m.role==='admin'?(await db().prepare('SELECT * FROM email_outbox ORDER BY created DESC LIMIT 500').all<any>()).results:[];return json({config:m.role==='admin'?publicConfig(await communicationConfig()):null,whatsapp:wa,emails});}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 sameOrigin(req);const m=await admin(),raw=await req.json() as any;
 if(raw.action==='retry'){if(typeof raw.id!=='string')throw new HttpError(400,'Choose a message.');if(raw.channel==='email')await sendEmail(raw.id);else await sendWhatsApp(raw.id);return json({ok:true});}
 if(raw.action==='test'){
  const c=await communicationConfig(),id='test:'+crypto.randomUUID(),text='VETMECH Field Force MR App — configuration test.';
  if(raw.channel==='email'){if(!c.smtpEnabled||!c.adminEmail)throw new HttpError(400,'Save enabled SMTP settings and Admin email first.');await emailStatement(id,m.email,c.adminEmail,'VETMECH configuration test',text).run();await sendEmail(id);}
  else{if(!c.whatsappEnabled||!c.adminPhone)throw new HttpError(400,'Save enabled WhatsApp settings and Admin phone first.');await db().prepare("INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,error,created) VALUES (?,?,?,?,?,'awaiting_setup','',?)").bind(id,id,m.email,c.adminPhone,text,new Date().toISOString()).run();await sendWhatsApp(id);}
  return json({ok:true,message:'Test recorded. Check its delivery status in the logs.'});
 }
 if(raw.action!=='save')throw new HttpError(400,'Unknown action.');
 const parsed=schema.safeParse(raw.config);if(!parsed.success)throw new HttpError(400,'Check the communication settings and template lengths.');const b=parsed.data,old=await communicationConfig();
 if(b.adminPhone&&!phoneNumber(b.adminPhone))throw new HttpError(400,'Enter a valid Admin WhatsApp phone.');b.adminPhone=phoneNumber(b.adminPhone);
 if(b.whatsappUrl){let url:URL;try{url=new URL(b.whatsappUrl)}catch{throw new HttpError(400,'Enter a valid HTTPS gateway URL.');}if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new HttpError(400,'Use an HTTPS gateway URL without embedded credentials or fragments.');}
 if(b.whatsappEnabled&&(!b.whatsappUrl||!(b.whatsappKey||old.whatsappKey)))throw new HttpError(400,'WhatsApp requires a gateway URL and API key.');
 if(b.smtpHost&&!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(b.smtpHost))throw new HttpError(400,'Use an SMTP hostname, without a URL or path.');
 if(b.smtpEnabled&&(!b.smtpHost||!b.smtpUser||!(b.smtpPassword||old.smtpPassword)||!b.smtpFrom))throw new HttpError(400,'Complete SMTP host, username, password and sender email.');
 for(const [name,template] of Object.entries(b.templates)){const tokens=[...template.matchAll(/{{\s*(\w+)\s*}}/g)].map(x=>x[1]);if(tokens.some(t=>!templateTokens.includes(t)))throw new HttpError(400,'Unknown placeholder in '+name);const required=name==='visit_thanks'?['customer_name','mr_name','orders']:['order_number','items','notes'];if(required.some(t=>!tokens.includes(t)))throw new HttpError(400,name+' must include '+required.map(t=>'{{'+t+'}}').join(', '));}
 const data={...b,whatsappKey:await seal(b.whatsappKey||old.whatsappKey),smtpPassword:await seal(b.smtpPassword||old.smtpPassword)};
 await db().prepare("INSERT INTO communication_settings(id,data,updated) VALUES ('main',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated").bind(JSON.stringify(data),new Date().toISOString()).run();return json({ok:true,config:publicConfig(await communicationConfig())});
}catch(e){return failure(e)}}
