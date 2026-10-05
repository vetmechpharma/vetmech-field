import {db,sameOrigin,failure} from '../../../../lib/server';
import {digest,readToken,sessionCookie} from '../../../../lib/passwords';
export async function POST(req:Request){try{sameOrigin(req);const token=readToken(req.headers.get('cookie'));if(token)await db().prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie('',0)}})}catch(e){return failure(e)}}
