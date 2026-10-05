import {readFile} from 'node:fs/promises';
import {connect,verify} from './mongo-common.mjs';
if(!process.env.APP_ORIGIN||!/^https:\/\/[^/]+$/.test(process.env.APP_ORIGIN))throw Error('Set APP_ORIGIN to the public HTTPS origin, without a trailing slash.');
const {client,db}=await connect();try{await verify(db);if(!await db.collection('_control').findOne({_id:'ledger'}))throw Error('Run db:setup first')}finally{await client.close()}
process.env.HOSTNAME='127.0.0.1';process.env.PORT=process.env.PORT||'3010';process.env.NODE_ENV='production';
try{process.env.APP_RELEASE=(await readFile(new URL('../REVISION',import.meta.url),'utf8')).trim()}catch{process.env.APP_RELEASE='development'}
await import('../.next/standalone/server.js');
