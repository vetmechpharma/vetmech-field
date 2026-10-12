// Run only via the root-owned systemd unit; never expose backup execution to HTTP.
import {readFile,writeFile,mkdir,rm,cp,realpath,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {MongoClient} from 'mongodb';
import {createReadStream} from 'node:fs';
const root='/opt/vetmech-field',stage='/var/lib/vetmech-backup/stage',configPath='/etc/vetmech-backup.json';
if(process.getuid?.()!==0)throw Error('Run through the root-owned backup service.');
process.umask(0o077);
async function hashFile(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')}
const cfgStat=await stat(configPath);if(cfgStat.uid!==0||(cfgStat.mode&0o077))throw Error('Backup config must be root-owned mode 600.');
const cfg=JSON.parse(await readFile(configPath,'utf8'));
if(!/^(sftp:|s3:|b2:|azure:|gs:|rest:https:\/\/)/.test(process.env.RESTIC_REPOSITORY||''))throw Error('Configure an external encrypted repository, not a local directory.');
if(!process.env.RESTIC_PASSWORD_FILE||cfg.exclusiveAppWriter!==true)throw Error('Encryption password file and exclusiveAppWriter acknowledgement required.');
process.loadEnvFile(root+'/shared/.env');
const client=await new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000}).connect(),db=client.db(process.env.MONGODB_DB||'vetmech_field');if(db.databaseName!=='vetmech_field')throw Error('Backup is restricted to vetmech_field.');
function run(cmd,args,opts={}){return new Promise((resolve,reject)=>{let out='';const c=spawn(cmd,args,{...opts,stdio:['ignore','pipe','pipe']});c.stdout.on('data',x=>{out+=x;if(out.length>10_000_000)c.kill()});c.stderr.on('data',()=>{});c.on('error',()=>reject(Error(cmd+' could not start')));c.on('close',code=>code===0?resolve(out):reject(Error(cmd+' failed; inspect service configuration and connectivity')));});}
const collection=db.collection('communication_settings'),old=await collection.findOne({id:'backup_monitor'});let monitor=old?JSON.parse(old.data):{};let stopped=false;
async function report(values){const latest=await collection.findOne({id:'backup_monitor'});monitor={...(latest?JSON.parse(latest.data):monitor),...values};await collection.updateOne({id:'backup_monitor'},{$set:{data:JSON.stringify(monitor),updated:new Date().toISOString()}},{upsert:true});}
try{
 await report({status:'Running',attempt:new Date().toISOString(),message:'Preparing encrypted off-server backup.'});
 await run('restic',['snapshots','--json']); // Verify destination before any outage.
 await mkdir(stage,{recursive:true,mode:0o700});await rm(stage,{recursive:true,force:true});await mkdir(stage,{mode:0o700});
 const revision=(await readFile(root+'/current/REVISION','utf8')).trim();if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Invalid release revision');
 // Archive the deployed source, not a potentially newer checkout; no GitHub access is needed to recover.
 await run('runuser',['-u','vetmech','--','git','-C',root+'/repository','archive','--format=tar','--output='+root+'/shared/backup-source.tar',revision]);
 await cp(root+'/shared/backup-source.tar',stage+'/source.tar');await rm(root+'/shared/backup-source.tar');
 await cp(root+'/shared/.env',stage+'/application.env');
 await writeFile(stage+'/service.txt',await run('systemctl',['cat','vetmech-field.service']));
 await cp('/etc/nginx/sites-enabled/vetmech-mr',stage+'/nginx.conf');
 if(cfg.uploadsPath){const p=await realpath(cfg.uploadsPath);if(!p.startsWith(root+'/shared/')||p===root+'/shared')throw Error('Uploads must be inside the app shared folder');await cp(p,stage+'/uploads',{recursive:true});}
 const dumpConfig=stage+'/dump-config.yml';await writeFile(dumpConfig,'uri: '+JSON.stringify(process.env.MONGODB_URI)+'\n',{mode:0o600});
 await run('systemctl',['is-active','--quiet','vetmech-field']);stopped=true;await run('systemctl',['stop','vetmech-field']);
 try{await run('mongodump',['--config='+dumpConfig,'--db=vetmech_field','--archive='+stage+'/database.archive.gz','--gzip']);}finally{await run('systemctl',['start','vetmech-field']);stopped=false;await rm(dumpConfig,{force:true});}
 await run('systemctl',['is-active','--quiet','vetmech-field']);
 const files=['source.tar','application.env','service.txt','nginx.conf','database.archive.gz'],checksums={};for(const f of files)checksums[f]=await hashFile(stage+'/'+f);
 await writeFile(stage+'/manifest.json',JSON.stringify({format:1,app:'VETMECH Field Force',database:'vetmech_field',revision,created:new Date().toISOString(),checksums},null,2));
 const output=await run('restic',['backup',stage,'--tag','vetmech-field','--json']);const summary=output.trim().split('\n').map(x=>JSON.parse(x)).find(x=>x.message_type==='summary');if(!summary?.snapshot_id)throw Error('No snapshot confirmed');
 await run('restic',['check']);
 await report({status:'Success',lastSuccess:new Date().toISOString(),snapshot:summary.snapshot_id,message:'Encrypted external snapshot saved; repository metadata check passed. A restore drill is still required.'});
 await rm(stage,{recursive:true,force:true});
}catch(e){if(stopped){try{await run('systemctl',['start','vetmech-field']);stopped=false}catch{}}await report({status:'Failed',message:stopped?'Backup failed and app restart failed. Restore service immediately.':e.message});process.exitCode=1;}finally{await client.close();}
