import {z} from 'zod';
import {db,json,failure,sameOrigin,HttpError} from '../../../../lib/server';
import {digest,randomToken,verifyPassword,sessionCookie} from '../../../../lib/passwords';
const schema=z.object({username:z.string().trim().toLowerCase().min(3).max(50).regex(/^[a-z0-9._-]+$/),password:z.string().min(1).max(128)});
export async function POST(req:Request){try{
 sameOrigin(req);if(Number(req.headers.get('content-length')||0)>4096)throw new HttpError(400,'Request too large.');
 const parsed=schema.safeParse(await req.json());if(!parsed.success)throw new HttpError(400,'Enter your username and password.');
 const {username,password}=parsed.data,now=Date.now();
 for(const [key,max] of [[`user:${username}`,10],[`ip:${await digest(req.headers.get('x-real-ip')||'unknown')}`,60]] as const){
 const limit=await db().prepare('INSERT INTO login_limits (key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires<=? THEN 1 ELSE attempts+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING attempts').bind(key,now+900000,now,now).first<{attempts:number}>();
 if(!limit||limit.attempts>max)throw new HttpError(429,'Too many login attempts. Please try again in 15 minutes.');
 }
 const account=await db().prepare('SELECT c.email,c.password_hash,m.status,m.role FROM credentials c JOIN members m ON m.email=c.email WHERE c.username=?').bind(username).first<{email:string;password_hash:string;status:string;role:string}>();
 const dummy='pbkdf2-sha512$100000$00112233445566778899aabbccddeeff$'+'0'.repeat(64);
 const valid=await verifyPassword(password,account?.password_hash||dummy);
 if(!account||!valid||account.status!=='active')throw new HttpError(401,'Incorrect username or password, or account inactive.');
 const token=randomToken();
 await db().batch([
 db().prepare('DELETE FROM sessions WHERE expires<=?').bind(now),
 db().prepare('DELETE FROM login_limits WHERE expires<=? OR key=?').bind(now,`user:${username}`),
 db().prepare('INSERT INTO sessions (token_hash,email,expires) SELECT ?,email,? FROM credentials WHERE email=? AND password_hash=?').bind(await digest(token),now+43200000,account.email,account.password_hash)
 ]);
 return Response.json({ok:true,role:account.role},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(token)}});
}catch(e){return failure(e)}}
