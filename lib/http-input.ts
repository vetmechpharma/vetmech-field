export class HttpError extends Error {
 constructor(public status:number,message:string){super(message)}
}

/** Enforce the actual streamed size: Content-Length alone is not a limit. */
export async function readJSON(req:Request,limit=256*1024):Promise<Record<string,any>>{
 if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new HttpError(415,'Send this request as JSON.');
 const length=req.headers.get('content-length');
 if(length&&(!/^\d+$/.test(length)||Number(length)>limit))throw new HttpError(413,'Request too large.');
 if(!req.body)throw new HttpError(400,'A JSON object is required.');
 const reader=req.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){void reader.cancel().catch(()=>{});throw new HttpError(413,'Request too large.');}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();const data=JSON.parse(text);
  if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(400,'A JSON object is required.');
  return data;
 }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Invalid JSON. Check the form and retry.');}
 finally{reader.releaseLock();}
}
