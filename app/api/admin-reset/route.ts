import {z} from 'zod';
import {admin,db,failure,HttpError,json,readJSON,sameOrigin} from '../../../lib/server';
import {transaction} from '../../../lib/mongo/database';
import {mongoDB} from '../../../lib/mongo/client';
import {requestWriteToken} from '../../../lib/mongo/session-guard';
import {previewReset,resetApplicationData,RESET_PHRASE} from '../../../lib/mongo/data-reset';
import {digest,sessionCookie,verifyPassword} from '../../../lib/passwords';

const resetInput=z.object({action:z.literal('reset'),token:z.string().regex(/^[a-f0-9]{64}$/),confirmation:z.literal(RESET_PHRASE),understood:z.literal(true),password:z.string().min(1).max(128),reason:z.string().trim().min(3).max(500)}).strict();
export async function POST(req:Request){try{
 sameOrigin(req);const actor=await admin(),input=await readJSON(req,4096),sessionToken=await requestWriteToken();
 if(!sessionToken)throw new HttpError(401,'Sign in again before resetting application data.');
 if(input.action==='preview')return json(await transaction(c=>previewReset(c,actor,sessionToken)));
 const parsed=resetInput.safeParse(input);if(!parsed.success)throw new HttpError(400,'Enter your Admin password, a reason and DELETE ALL DATA, and acknowledge the deletion.');
 const b=parsed.data,native=await mongoDB(),preview=await native.collection('_control').findOne({_id:('data-reset:'+actor.email) as any}),tokenHash=await digest(b.token);
 if(!preview||preview.token_hash!==tokenHash||preview.expires<=Date.now())throw new HttpError(409,'Reset review expired or was already used. Review the data again.');
 const key='data-reset:'+actor.email,now=Date.now(),limit=await db().prepare('SELECT attempts,expires FROM login_limits WHERE key=?').bind(key).first<{attempts:number;expires:number}>();
 if(limit&&limit.expires>now&&limit.attempts>=5)throw new HttpError(429,'Too many incorrect Admin passwords. Try again in 15 minutes.');
 const credential=await db().prepare('SELECT password_hash FROM credentials WHERE email=?').bind(actor.email).first<{password_hash:string}>();
 if(!credential||!await verifyPassword(b.password,credential.password_hash)){
  await db().prepare('INSERT INTO login_limits (key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires<=? THEN 1 ELSE attempts+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END').bind(key,now+900000,now,now).run();
  throw new HttpError(400,'Admin password is incorrect. Review the reset again before retrying.');
 }
 const result=await transaction(c=>resetApplicationData(c,actor,sessionToken,tokenHash,credential.password_hash,b.reason));
 return Response.json(result,{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie('',0)}});
 }catch(e){return failure(e);}}
