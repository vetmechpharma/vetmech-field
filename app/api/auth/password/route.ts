import {z} from 'zod';
import {readJSON,member,db,sameOrigin,failure,HttpError} from '../../../../lib/server';
import {passwordHash,verifyPassword,sessionCookie} from '../../../../lib/passwords';
import {guard} from '../../../../lib/operations';
const schema=z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(1).max(128)});
export async function POST(req:Request){try{
 sameOrigin(req);const m=await member();const parsed=schema.safeParse(await readJSON(req));if(!parsed.success)throw new HttpError(400,'Enter a non-empty password of up to 128 characters.');if(m.role!=='mr'&&parsed.data.newPassword.length<12)throw new HttpError(400,'Admin passwords must contain at least 12 characters.');
 const c=await db().prepare('SELECT password_hash FROM credentials WHERE email=?').bind(m.email).first<{password_hash:string}>();
 if(!c||!await verifyPassword(parsed.data.currentPassword,c.password_hash))throw new HttpError(400,'Current password is incorrect.');
 if(parsed.data.currentPassword===parsed.data.newPassword)throw new HttpError(400,'Choose a different new password.');
 await db().batch([guard('version','EXISTS(SELECT 1 FROM credentials WHERE email=? AND password_hash=?)',[m.email,c.password_hash]),db().prepare('UPDATE credentials SET password_hash=?,updated=? WHERE email=?').bind(await passwordHash(parsed.data.newPassword),new Date().toISOString(),m.email),db().prepare('DELETE FROM sessions WHERE email=?').bind(m.email)]);
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie('',0)}});
}catch(e){return failure(e)}}
