import nodemailer from 'nodemailer';
export const communicationEnv=process.env;
export const smtpAvailable=true;
export async function deliverSMTP(config:any,to:string,subject:string,text:string){
 const transport=nodemailer.createTransport({host:config.smtpHost,port:config.smtpPort,secure:config.smtpPort===465,requireTLS:config.smtpPort!==465,auth:{user:config.smtpUser,pass:config.smtpPassword},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true,tls:{rejectUnauthorized:true}});
 try{const result=await transport.sendMail({from:{name:'VETMECH Field Force MR App',address:config.smtpFrom},to,subject,text});if(!result.accepted.length)throw new Error('SMTP did not accept the message.');}finally{transport.close();}
}
