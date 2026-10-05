import {z} from 'zod';
import {member,db,sameOrigin,failure,HttpError} from '../../../../lib/server';
import {passwordHash,verifyPassword,sessionCookie} from '../../../../lib/passwords';
const schema=z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(12).max(128)});
export async function POST(req:Request){try{
 sameOrigin(req);const m=await member();const parsed=schema.safeParse(await req.json());if(!parsed.success)throw new HttpError(400,'Use a new password of 12–128 characters.');
 const c=await db().prepare('SELECT password_hash FROM credentials WHERE email=?').bind(m.email).first<{password_hash:string}>();
 if(!c||!await verifyPassword(parsed.data.currentPassword,c.password_hash))throw new HttpError(400,'Current password is incorrect.');
 if(parsed.data.currentPassword===parsed.data.newPassword)throw new HttpError(400,'Choose a different new password.');
 await db().batch([db().prepare('UPDATE credentials SET password_hash=?,updated=? WHERE email=?').bind(await passwordHash(parsed.data.newPassword),new Date().toISOString(),m.email),db().prepare('DELETE FROM sessions WHERE email=?').bind(m.email)]);
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie('',0)}});
}catch(e){return failure(e)}}
