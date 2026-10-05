import { headers } from 'next/headers';
import {mongoDatabase} from './mongo/database';
import {digest,readToken} from './passwords';
import { type Member } from './permissions';
export function db(){return mongoDatabase;}
export class HttpError extends Error {constructor(public status:number,message:string){super(message)}}
export async function member():Promise<Member>{
 const token=readToken((await headers()).get('cookie'));
 if(!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'Please log in with your VETMECH username and password.');
 const m=await db().prepare('SELECT m.*, c.username FROM sessions s JOIN members m ON m.email=s.email JOIN credentials c ON c.email=m.email WHERE s.token_hash=? AND s.expires>?').bind(await digest(token),Date.now()).first<Member>();
 if(!m)throw new HttpError(401,'Your session has expired. Please log in again.');
 if(m.status!=='active')throw new HttpError(403,'Your account is disabled. Contact Admin.');
 return m;
}
export async function admin(){const m=await member();if(m.role!=='admin')throw new HttpError(403,'Admin access is required.');return m;}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==(process.env.APP_ORIGIN||new URL(req.url).origin))throw new HttpError(403,'This request is not allowed.');}
export function failure(e:unknown){if(String(e).includes('PERIOD_CLOSED'))e=new HttpError(409,'This month or a later reporting month is closed. Admin must reopen it first.');if(String(e).includes('STALE_REVIEW'))e=new HttpError(409,'Data changed. Refresh and review again.');if(e instanceof HttpError)return Response.json({error:e.message},{status:e.status,headers:{'Cache-Control':'no-store'}});console.error(e);return Response.json({error:'Unable to complete this action. Please retry; your input has been kept.'},{status:503});}
export function json(data:unknown){return Response.json(data,{headers:{'Cache-Control':'no-store'}});}
export function notification(recipient:string,title:string,body:string,module:string,recordId:string|null=null){return db().prepare('INSERT INTO notifications (id,recipient,title,body,module,record_id,created) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),recipient,title,body,module,recordId,new Date().toISOString());}
