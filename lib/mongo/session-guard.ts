import {headers} from 'next/headers';
import {digest,readToken} from '../passwords';
import {HttpError} from '../http-input';
import type {Context} from './database';

// Authentication itself writes these tables before a session exists.
export function businessWrite(queries:string[]){
 return queries.some(q=>{
  const table=q.match(/^(?:INSERT(?: OR REPLACE)? INTO|UPDATE|DELETE FROM) (\w+)/i)?.[1];
  return table&&!['login_limits','sessions','credentials','ledger_guards'].includes(table);
 });
}
export async function requestWriteToken(){
 try{return readToken((await headers()).get('cookie'));}
 catch{return undefined;} // Maintenance scripts outside a Next.js request.
}
export async function assertWriteSession(c:Context,token:string|undefined){
 if(token===undefined)return;
 const opts=c.session?{session:c.session}:{},session=/^[a-f0-9]{64}$/.test(token)?await c.db.collection('sessions').findOne({token_hash:await digest(token),expires:{$gt:Date.now()}},opts):null;
 const member=session?await c.db.collection('members').findOne({email:session.email,status:'active'},opts):null;
 const credential=member?await c.db.collection('credentials').findOne({email:member.email},opts):null;
 if(!member||!credential)throw new HttpError(401,'Your session has ended. Sign in again before saving.');
 return member;
}
