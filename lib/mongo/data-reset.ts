import schema from './schema.json';
import {type Context,put} from './database';
import {assertWriteSession} from './session-guard';
import {digest,randomToken} from '../passwords';
import {HttpError} from '../http-input';
import type {Member} from '../permissions';

export const RESET_PHRASE='DELETE ALL DATA';
const previewID=(email:string)=>'data-reset:'+email;
const labels:Record<string,string>={members:'MR accounts',credentials:'MR login credentials',sessions:'Active sessions',employee_photos:'MR profile photos',notifications:'Notifications',invoices:'Orders and primary invoices',stock_balances:'Stock balances',stock_movements:'Stock movements',stock_reservations:'Pending stock demand',benefit_balances:'Sample and gift balances',benefit_movements:'Sample and gift entries',commitments:'Sample commitments',visit_closures:'Closed visits',whatsapp_outbox:'WhatsApp messages and logs',email_outbox:'Email messages and logs',order_edits:'Order edit history',followup_tasks:'Follow-ups',period_events:'Month-closing history',period_locks:'Month locks',period_reports:'Closed monthly reports',workflow_requests:'Approval requests',admin_audit:'Old Admin activity history',mr_drafts:'Saved MR drafts'};
const opts=(c:Context)=>c.session?{session:c.session}:{};
async function resetScope(c:Context){
 const admins=await c.db.collection('members').find({role:'admin'},opts(c)).toArray(),emails=admins.map(m=>m.email);
 return {admins,filters:Object.fromEntries(Object.keys(schema).filter(t=>!['communication_settings','login_limits'].includes(t)).map(table=>[table,
  table==='records'?{id:{$ne:'whatsapp-settings'}}:table==='members'?{role:{$ne:'admin'}}:['credentials','employee_photos'].includes(table)?{email:{$nin:emails}}:{}
 ]))};
}
async function idleMessages(c:Context){
 for(const table of ['whatsapp_outbox','email_outbox'])if(await c.db.collection(table).findOne({status:'sending'},opts(c)))throw new HttpError(409,'A message is being sent. Wait for it to finish, then review the reset again.');
}
async function resetCounts(c:Context,filters:Record<string,any>){
 const items:{label:string;count:number}[]=[];
 for(const [table,filter]of Object.entries(filters)){
  if(table==='records'){
   const groups=await c.db.collection(table).aggregate([{$match:filter},{$group:{_id:'$kind',count:{$sum:1}}},{$sort:{_id:1}}],opts(c)).toArray();
   for(const g of groups)items.push({label:String(g._id),count:g.count});
  }else{const count=await c.db.collection(table).countDocuments(filter,opts(c));if(count)items.push({label:labels[table]||table.replaceAll('_',' '),count});}
 }
 return items;
}
export async function previewReset(c:Context,actor:Member,sessionToken:string){
 const active=await assertWriteSession(c,sessionToken);if(active?.role!=='admin'||active.email!==actor.email)throw new HttpError(403,'Admin access is required.');
 await idleMessages(c);
 const scope=await resetScope(c),items=await resetCounts(c,scope.filters),ledger=await c.db.collection('_control').findOne({_id:'ledger' as any},opts(c));
 const token=randomToken(),expires=Date.now()+10*60*1000;
 await c.db.collection('_control').updateOne({_id:previewID(actor.email) as any},{$set:{kind:'data-reset-preview',token_hash:await digest(token),revision:ledger!.revision,expires}},{...opts(c),upsert:true});
 return {token,expires,items,total:items.reduce((n,i)=>n+i.count,0),adminAccountsKept:scope.admins.length};
}
export async function resetApplicationData(c:Context,actor:Member,sessionToken:string,tokenHash:string,passwordHash:string,reason:string){
 const active=await assertWriteSession(c,sessionToken);if(active?.role!=='admin'||active.email!==actor.email)throw new HttpError(403,'Admin access is required.');
 const preview=await c.db.collection('_control').findOne({_id:previewID(actor.email) as any},opts(c)),ledger=await c.db.collection('_control').findOne({_id:'ledger' as any},opts(c));
 if(!preview||preview.token_hash!==tokenHash||preview.expires<=Date.now())throw new HttpError(409,'Reset review expired or was already used. Review the data again.');
 // transaction() acquired the shared ledger lock and increased revision once.
 if(ledger!.revision!==preview.revision+1)throw new HttpError(409,'Data changed after your review. Review the reset again.');
 if(!await c.db.collection('credentials').findOne({email:actor.email,password_hash:passwordHash},opts(c)))throw new HttpError(409,'Admin credentials changed. Sign in and review again.');
 await idleMessages(c);
 const scope=await resetScope(c),items=await resetCounts(c,scope.filters),id=crypto.randomUUID(),created=new Date().toISOString();
 for(const [table,filter]of Object.entries(scope.filters))await c.db.collection(table).deleteMany(filter,opts(c));
 for(const admin of scope.admins)await c.db.collection('members').updateOne({email:admin.email},{$set:{target:0,territory:'',district:'',headquarters:'',route:'',route_ids:'[]',district_ids:'[]',stockist_ids:'[]'}},opts(c));
 await c.db.collection('_control').deleteMany({kind:'data-reset-preview'},opts(c));
 await c.db.collection('_control').updateOne({_id:'ledger' as any},{$set:{last_data_reset:{id,created,actor:actor.email},data_generation:id}},opts(c));
 await put(c,'admin_audit',{id,actor_email:actor.email,actor_name:actor.name,action:'Application data reset',entity_kind:'Application',entity_id:id,before_data:JSON.stringify({items}),after_data:JSON.stringify({adminAccountsKept:scope.admins.length,configurationRetained:true}),reason,created});
 return {ok:true,id,created,total:items.reduce((n,i)=>n+i.count,0)};
}
