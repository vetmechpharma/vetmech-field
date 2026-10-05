import {periodGuard} from '../../../lib/periods';
import {indiaDay} from '../../../lib/operations';
import {z} from 'zod';
import {member,db,json,sameOrigin,failure,HttpError,notification} from '../../../lib/server';
import {customer,record,requireGPS,issueStatements,ledgerFailure,benefitPosting} from '../../../lib/operations';
import {canRead,type Member} from '../../../lib/permissions';
const schema=z.object({id:z.string().uuid(),kind:z.enum(['gift','sample']),movement:z.enum(['allocate','issue','return']),mrEmail:z.string().default(''),itemId:z.string().min(1),qty:z.number().int().min(1).max(100000),unitCost:z.number().min(0).max(10000000).default(0),customerId:z.string().default(''),gps:z.unknown().optional()});
export async function GET(){try{
 const m=await member();const balances=(await db().prepare('SELECT * FROM benefit_balances').all<Record<string,any>>()).results.filter(r=>m.role==='admin'||r.mr_email===m.email);
 const movements=(await db().prepare('SELECT * FROM benefit_movements ORDER BY created DESC LIMIT 2000').all<Record<string,any>>()).results.filter(r=>m.role==='admin'||r.mr_email===m.email);
 // Gift history is limited to customers visible to this MR, including supplies by other MRs.
 const customers=(await db().prepare("SELECT * FROM records WHERE kind='Customers'").all<any>()).results;
 const visible=new Set<string>();for(const c of customers)if(canRead(m,c))visible.add(c.id);
 const supplied=(await db().prepare("SELECT item_id,customer_id,MIN(created) AS created FROM benefit_movements WHERE kind='gift' AND movement='issue' GROUP BY item_id,customer_id").all<Record<string,any>>()).results.filter(r=>m.role==='admin'||visible.has(r.customer_id));
 const totals=(await db().prepare('SELECT kind,mr_email,movement,SUM(quantity) AS quantity,SUM(cost) AS cost FROM benefit_movements GROUP BY kind,mr_email,movement').all<Record<string,any>>()).results.filter(r=>m.role==='admin'||r.mr_email===m.email);return json({balances,movements,supplied,totals});
}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 sameOrigin(req);const m=await member();const parsed=schema.safeParse(await req.json());if(!parsed.success)throw new HttpError(400,'Check the allotment / issue details.');const b=parsed.data;await record(b.itemId,b.kind==='gift'?'Gifts':'Products');
 if(b.movement!=='issue'){
  if(m.role!=='admin')throw new HttpError(403,'Only Admin can allot stock.');const rep=await db().prepare("SELECT * FROM members WHERE email=? AND role='mr'").bind(b.mrEmail).first<Member>();if(!rep||(b.movement==='allocate'&&rep.status!=='active'))throw new HttpError(400,'Choose an active MR for allotment.');
  if(b.movement==='return'){try{await db().batch([periodGuard(indiaDay()),...await issueStatements(rep!,b.kind,b.itemId,b.qty,'','',null,b.id,'return')])}catch(e){ledgerFailure(e)}return json({ok:true});}
  try{await db().batch([periodGuard(indiaDay()),db().prepare("INSERT INTO benefit_movements(id,kind,movement,mr_email,item_id,quantity,cost,created) VALUES (?,?,?,?,?,?,?,?)").bind(b.id,b.kind,'allocate',b.mrEmail,b.itemId,b.qty,Math.round(b.unitCost*b.qty*100),new Date().toISOString()),...benefitPosting(b.id,b.kind),notification(b.mrEmail,`${b.kind==='gift'?'Gift':'Sample'} allotment`,`${b.qty} units allotted.`,b.kind==='gift'?'Gifts':'Samples',b.id)])}catch(e){ledgerFailure(e)}
 }else{
  if(m.role!=='mr')throw new HttpError(403,'Use the MR account to record customer distribution.');await customer(m,b.customerId);const gps=requireGPS(b.gps);
  const issue=await issueStatements(m,b.kind,b.itemId,b.qty,b.customerId,'',gps,b.id);try{await db().batch([periodGuard(indiaDay()),...issue])}catch(e){ledgerFailure(e)}
 }
 return json({ok:true});
}catch(e){return failure(e)}}
