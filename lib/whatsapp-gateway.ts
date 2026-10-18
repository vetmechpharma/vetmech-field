/** VETMECH MSG contract: POST /api/v1/messages/send; GET /api/v1/messages/:id. */
export function whatsappGateway(raw:string,session:string,phone:string,message:string,reference:string){
 const url=new URL(raw),animitra=url.hostname==='wa.animitra.in',vetmech=url.hostname==='msg.vetmechpharma.in'||/^\/api\/v1\/messages\/send\/?$/.test(url.pathname);
 if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('Use an HTTPS gateway URL without credentials or fragments.');
 if(vetmech){if(!['/','/api/v1/messages/send','/api/v1/messages/send/'].includes(url.pathname)||url.search)throw Error('Use https://msg.vetmechpharma.in/api/v1/messages/send');url.pathname='/api/v1/messages/send';}
 else if(animitra){if(!['/','/api/v1/send/text','/api/v1/send/text/'].includes(url.pathname)||url.search)throw Error('For ANIMitra use https://wa.animitra.in/api/v1/send/text');url.pathname='/api/v1/send/text';}
 return {url,animitra,vetmech,body:vetmech?{sessionId:session,phone,text:message}:animitra?{session_id:session,to:phone,text:message}:{phone,message,session,reference}};
}
export function gatewayMessageId(result:any){const id=result?.id||result?.messageId;return typeof id==='string'&&id.trim()&&id.length<=200?id:'';}
export function gatewayConfirmation(result:any,animitra:boolean,vetmech=false):string|null{
 if(vetmech){if(!gatewayMessageId(result))return null;const status:Record<string,string>={queued:'accepted',sending:'accepted',submitted:'submitted',sent:'submitted',delivered:'delivered',read:'read',uncertain:'uncertain',not_sent:'not_sent',demo_only:'demo_only'};return status[result.status]||null;}
 return animitra?result?.ok===true&&typeof result.messageId==='string'&&result.messageId.trim()?'accepted':null:result?.sent===true?'sent':result?.accepted===true?'accepted':null;
}
export function gatewayRejection(status:number,animitra:boolean,vetmech=false){
 const known:Record<number,string>={400:'Check the session ID, recipient and text.',401:'API key is missing or invalid.',402:'Subscription inactive or quota reached.',403:vetmech?'API key needs send permission and access to this session.':'API key requires send:text permission.',404:'Check the endpoint and session name.',409:vetmech?'Idempotency conflict. Do not resend with a different key; check the original message.':'WhatsApp session is disconnected. Reconnect / scan its QR in the gateway.',413:'Message exceeds the gateway size limit.',422:'Gateway rejected the request fields.',429:'Gateway rate limit or message quota reached.'};
 return (animitra||vetmech)&&known[status]?`${vetmech?'VETMECH MSG':'ANIMitra'} HTTP ${status}: ${known[status]}`:'';
}
