import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {connect,schema} from './mongo-common.mjs';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
const email='vetmechpharma@gmail.com',username='admin';
let password=process.env.ADMIN_PASSWORD;
if(!password){if(!process.stdin.isTTY)throw Error('Use an interactive terminal or supply ADMIN_PASSWORD securely');process.stdout.write('New admin password (minimum 12 characters): ');const mute=new Writable({write(chunk,encoding,cb){cb()}});const prompt=createInterface({input:process.stdin,output:mute,terminal:true});password=await prompt.question('');prompt.close();process.stdout.write('\n');}
if(password.length<12||password.length>128)throw Error('Password must have 12–128 characters');
const salt=randomBytes(16).toString('hex'),hash='pbkdf2-sha512$100000$'+salt+'$'+pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha512').toString('hex');
const {client,db}=await connect();try{const session=client.startSession();try{await session.withTransaction(async()=>{const lock=await db.collection('_control').updateOne({_id:'ledger'},{$inc:{revision:1}},{session});if(!lock.matchedCount)throw Error('Run db:setup first');if(await db.collection('members').findOne({role:'admin'},{session}))throw Error('An admin already exists. This command does not reset accounts.');const now=new Date().toISOString(),member={};for(const c of schema.members)member[c.name]=c.default===null?null:/^'.*'$/.test(c.default)?c.default.slice(1,-1):Number(c.default);Object.assign(member,{email,user_id:'app-admin',name:'Dr. T. Lokesh',role:'admin',status:'active',created:now});await db.collection('members').insertOne(member,{session});await db.collection('credentials').insertOne({email,username,password_hash:hash,updated:now},{session});});console.log('Admin created. Username: admin. No test MR or default password was created.')}finally{await session.endSession()}}finally{await client.close()}
