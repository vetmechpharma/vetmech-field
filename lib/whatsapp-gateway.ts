/** ANIMitra API contract verified against https://wa.animitra.in/docs. */
export function whatsappGateway(raw:string,session:string,phone:string,message:string,reference:string){
 const url=new URL(raw),animitra=url.hostname==='wa.animitra.in';
 if(animitra){if(!['/','/api/v1/send/text','/api/v1/send/text/'].includes(url.pathname)||url.search)throw Error('For ANIMitra use https://wa.animitra.in/api/v1/send/text');url.pathname='/api/v1/send/text';}
 return {url,animitra,body:animitra?{session_id:session,to:phone,text:message}:{phone,message,session,reference}};
}
export function gatewayConfirmation(result:any,animitra:boolean){return animitra?result?.ok===true&&typeof result.messageId==='string'&&result.messageId.trim()?'accepted':null:result?.sent===true?'sent':result?.accepted===true?'accepted':null;}
export function gatewayRejection(status:number,animitra:boolean){
 const known:Record<number,string>={401:'API key is missing or invalid.',402:'Subscription inactive or quota reached.',403:'API key requires send:text permission.',404:'Check the endpoint and session name.',409:'WhatsApp session is disconnected. Reconnect / scan its QR in the gateway.',422:'Gateway rejected the request fields.',429:'Gateway rate limit or message quota reached.'};
 return animitra&&known[status]?`ANIMitra HTTP ${status}: ${known[status]}`:'';
}
