import {admin,db,json,failure,sameOrigin,readJSON,HttpError} from '../../../lib/server';
import {guard} from '../../../lib/operations';
import {assertOpen,periodGuard} from '../../../lib/periods';
import {audit} from '../../../lib/admin-audit';
import {earningsID,earningsKind,earningsHistoryKind,validateEarningsInput,type EarningsPlan,type ProductPlan} from '../../../lib/monthly-earnings';
type Stored={id:string;data:string;kind:string;created:string;assigned_to:string};
function scope(month:unknown,email:unknown) {
 if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||typeof email!=='string'||email.length>200||!email)throw new HttpError(400,'Select an MR and a valid month.');
 return {month,email};
}
const versionGuard=(id:string,row:Stored|null)=>row?guard('version','EXISTS(SELECT 1 FROM records WHERE id=? AND data=?)',[id,row.data]):guard('version','NOT EXISTS(SELECT 1 FROM records WHERE id=?)',[id]);
const moneyOrNull=(value:unknown)=>value!==undefined&&value!==null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Math.round(Number(value)*100):null;
export async function GET(req:Request){try{
 await admin();const q=new URL(req.url).searchParams,{month,email}=scope(q.get('month'),q.get('mr'));
 if(!await db().prepare("SELECT email FROM members WHERE email=? AND role='mr'").bind(email).first())throw new HttpError(404,'MR not found.');
 const [plan,target,products,history,closed]=await Promise.all([
  db().prepare('SELECT * FROM records WHERE id=?').bind(earningsID(email,month)).first<Stored>(),
  db().prepare('SELECT * FROM records WHERE id=?').bind(`monthly-target:${email}:${month}`).first<Stored>(),
  db().prepare("SELECT * FROM records WHERE kind='Products'").all<Stored>(),
  db().prepare('SELECT * FROM records WHERE kind=? AND assigned_to=?').bind(earningsHistoryKind,email).all<Stored>(),
  db().prepare('SELECT month FROM period_locks WHERE closed=1 AND month>=? LIMIT 1').bind(month).first()
 ]);
 return json({month,email,closed:!!closed,plan:plan?JSON.parse(plan.data):null,expectedTarget:target?Number(JSON.parse(target.data)['MR monthly target']):null,products:products.results.map(r=>{const d=JSON.parse(r.data);return {id:r.id,name:d.Name||r.id,packing:d.Pack||''}}).sort((a,b)=>a.name.localeCompare(b.name)||a.packing.localeCompare(b.packing)),history:history.results.map(r=>JSON.parse(r.data) as EarningsPlan).filter(p=>p.month===month).sort((a,b)=>b.revision-a.revision).map(p=>({revision:p.revision,savedAt:p.savedAt,savedBy:p.savedBy,reason:p.reason}))});
}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 sameOrigin(req);const actor=await admin(),b=await readJSON(req,262144) as any,{month,email}=scope(b?.month,b?.email);
 if(b.refreshCostBasis!==undefined&&typeof b.refreshCostBasis!=='boolean')throw new HttpError(400,'Choose whether to refresh the pricing basis.');
 if(!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0)throw new HttpError(400,'Reload the monthly plan before saving.');
 if(b.expectedTarget!==null&&(typeof b.expectedTarget!=='number'||!Number.isFinite(b.expectedTarget)))throw new HttpError(400,'Reload the monthly target before saving.');
 if(!await db().prepare("SELECT email FROM members WHERE email=? AND role='mr'").bind(email).first())throw new HttpError(404,'MR not found.');
 await assertOpen(month);
 let input:ReturnType<typeof validateEarningsInput>;try{input=validateEarningsInput(b)}catch(e){throw new HttpError(400,(e as Error).message)}
 const id=earningsID(email,month),targetId=`monthly-target:${email}:${month}`;
 const [oldRow,targetRow,catalogue]=await Promise.all([db().prepare('SELECT * FROM records WHERE id=?').bind(id).first<Stored>(),db().prepare('SELECT * FROM records WHERE id=?').bind(targetId).first<Stored>(),db().prepare("SELECT * FROM records WHERE kind='Products'").all<Stored>()]);
 const old:EarningsPlan|null=oldRow?JSON.parse(oldRow.data):null,priorTarget=targetRow?Number(JSON.parse(targetRow.data)['MR monthly target']):null;
 if(b.expectedRevision!==(old?.revision||0)||b.expectedTarget!==priorTarget)throw new HttpError(409,'This MR’s monthly plan or target changed. Reload it before saving.');
 const reason=typeof b.reason==='string'?b.reason.trim():'';
 if(reason.length>500||old&&reason.length<5)throw new HttpError(400,'Enter a change reason between 5 and 500 characters.');
 const guards=[versionGuard(id,oldRow),versionGuard(targetId,targetRow)];
 const products:ProductPlan[]=input.products.map((p:{productId:string;target:number;salaryBps:number})=>{
  const record=catalogue.results.find(r=>r.id===p.productId),previous=old?.products.find(t=>t.productId===p.productId);
  if(!record&&!previous)throw new HttpError(400,'A selected product is unavailable. Reload the product list.');
  if(previous&&!b.refreshCostBasis)return {...previous,...p};
  if(!record)throw new HttpError(400,'An archived product cannot refresh its pricing basis.');
  guards.push(versionGuard(record.id,record));
  const d=JSON.parse(record.data);
  return {...p,name:d.Name||record.id,packing:d.Pack||'',pts:moneyOrNull(d.PTS),cost:moneyOrNull(d['Landing cost'])};
 });
 const now=new Date().toISOString(),plan:EarningsPlan={version:1,revision:(old?.revision||0)+1,month,mrEmail:email,target:input.target,salaryBudget:input.salaryBudget,products,slabs:input.slabs,savedAt:now,savedBy:actor.email,reason:reason||'Initial monthly plan'};
 const data=JSON.stringify(plan),targetData=JSON.stringify({...(targetRow?JSON.parse(targetRow.data):{}),'MR monthly target':input.target/100,Month:month});
 await db().batch([periodGuard(month),...guards,
  oldRow?db().prepare('UPDATE records SET data=? WHERE id=?').bind(data,id):db().prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').bind(id,actor.user_id||actor.email,earningsKind,data,now,email),
  db().prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').bind(id+':revision:'+plan.revision,actor.user_id||actor.email,earningsHistoryKind,data,now,email),
  db().prepare("INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,'Settings',?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(targetId,actor.user_id||actor.email,targetData,now,email),
  audit(actor,'Monthly product plan saved','Monthly earnings plan',id,old,plan,plan.reason),
  audit(actor,'Monthly target saved','Monthly target',targetId,{target:priorTarget},{target:input.target/100},'Saved with product plan revision '+plan.revision)
 ]);
 return json({ok:true,month,email,revision:plan.revision,target:input.target/100});
}catch(e){return failure(e)}}
