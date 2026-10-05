import {mongoDB} from '../../../lib/mongo/client';
export const dynamic='force-dynamic';
export async function GET(){
 try{const db=await mongoDB();await db.command({ping:1});if(!await db.collection('_control').findOne({_id:'ledger' as any}))throw Error('Not initialized');return Response.json({status:'ok',release:process.env.APP_RELEASE||'development'},{headers:{'Cache-Control':'no-store'}})}
 catch{return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
