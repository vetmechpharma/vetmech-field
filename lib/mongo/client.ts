import {MongoClient} from 'mongodb';
let pending:Promise<MongoClient>|undefined;
export async function mongoClient(){
 if(!process.env.MONGODB_URI)throw Error('MONGODB_URI is required');
 if(!pending){const c=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:20,serverSelectionTimeoutMS:10000});pending=c.connect().catch(e=>{pending=undefined;throw e})}return pending;
}
export async function mongoDB(){const c=await mongoClient();return c.db(process.env.MONGODB_DB||'vetmech_field')}
