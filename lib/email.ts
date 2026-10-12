import {db} from './server';
import {communicationConfig,cleanupCommunicationLogs} from './communication-settings';
import {deliverSMTP,smtpAvailable} from './communication-runtime';
export function emailStatement(id:string,mr:string,to:string,subject:string,message:string){return db().prepare("INSERT INTO email_outbox(id,mr_email,recipient,subject,message,status,error,created) VALUES (?,?,?,?,?,'queued','',?)").bind(id,mr,to,subject,message,new Date().toISOString());}
export async function sendEmail(id:string){
 const row=await db().prepare('SELECT * FROM email_outbox WHERE id=?').bind(id).first<any>();if(!row||!['queued','awaiting_setup','failed'].includes(row.status))return;
 if(Date.parse(row.created)<Date.now()-30*86400000){await cleanupCommunicationLogs();return;}
 const c=await communicationConfig();if(!c.smtpEnabled||!smtpAvailable){await db().prepare("UPDATE email_outbox SET status='awaiting_setup',error=? WHERE id=?").bind(smtpAvailable?'SMTP delivery is disabled.':'SMTP delivery requires the Node.js VPS deployment.',id).run();return;}
 const claimed=await db().prepare("UPDATE email_outbox SET status='sending',error='' WHERE id=? AND status IN ('queued','awaiting_setup','failed') RETURNING id").bind(id).first();if(!claimed)return;
 try{await deliverSMTP(c,row.recipient,row.subject,row.message);await db().prepare("UPDATE email_outbox SET status='accepted',sent_at=?,error='' WHERE id=?").bind(new Date().toISOString(),id).run();}
 catch{await db().prepare("UPDATE email_outbox SET status='uncertain',error='SMTP delivery was not confirmed. Check the mail provider before sending another message.' WHERE id=?").bind(id).run();}
}
