import {db,failure,HttpError,member} from '../../../../lib/server';

export async function GET(req:Request){try{
 const actor=await member();
 const email=new URL(req.url).searchParams.get('email')||actor.email;
 if(email.length>254)throw new HttpError(400,'Invalid employee.');
 if(actor.role!=='admin'&&email!==actor.email)throw new HttpError(403,'You can only view your own employee photo.');
 const photo=await db().prepare('SELECT image_base64 FROM employee_photos WHERE email=?').bind(email).first<{image_base64:string}>();
 if(!photo)throw new HttpError(404,'No employee photo has been added.');
 return new Response(new Uint8Array(Buffer.from(photo.image_base64,'base64')),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
}catch(e){return failure(e)}}
