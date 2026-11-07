import {applyPercentage} from './product-pricing';
import {secondarySale} from './order-workflow';
import {COMPANY_STOCK_ID} from './supply';

export const earningsKind = 'Monthly earnings plan';
export const earningsHistoryKind = 'Monthly earnings revision';
export const earningsID = (email:string,month:string) => `monthly-earnings:${email}:${month}`;
type Row = Record<string,any>;
// Optional quantity fields preserve existing value-only plans without inventing historical quantities.
export type ProductPlan = {productId:string;name:string;packing:string;target:number;targetQty?:number|null;targetRate?:number|null;salaryBps:number;pts:number|null;cost:number|null};
export type IncentiveSlab = {above:number;rateBps:number};
export type EarningsPlan = {version:1|2;revision:number;month:string;mrEmail:string;target:number;salaryBudget:number|null;products:ProductPlan[];slabs:IncentiveSlab[];savedAt:string;savedBy:string;reason:string};
export type ProductProgress = {productId:string;name:string;packing:string;target:number|null;achieved:number;pending:number|null;percentage:number|null;targetQty:number|null;achievedQty:number;paidQty:number;freeQty:number;pendingQty:number|null;quantityPercentage:number|null};
type ProgressTarget = Pick<ProductProgress,'productId'|'name'|'packing'|'target'|'targetQty'>;
type ProgressSale = {productId:string;name:string;packing:string;date:string;qty:number;free:number;net:number};
export type ProductTargetSnapshot = {version:1;month:string;targets:ProgressTarget[];sales:ProgressSale[]};
export const percentAmount = (paise:number,bps:number) => Number((BigInt(paise)*BigInt(bps)+BigInt(5000))/BigInt(10000));
export function findEarningsPlan(records:Row[],email:string,month:string):EarningsPlan|null {
 return records.find(r=>r.id===earningsID(email,month)&&r.kind===earningsKind)?.data||null;
}
function scaled(value:unknown,max:number,label:string) {
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||Math.abs(value*100-Math.round(value*100))>0.00001)throw new Error(`${label} must be a number from 0 to ${max} with at most two decimals.`);
 return Math.round(value*100);
}
export function validateEarningsInput(b:any,rates:ReadonlyMap<string,number|null>) {
 if(!b||!Array.isArray(b.products)||!b.products.length||b.products.length>500)throw new Error('Choose between 1 and 500 products.');
 const products:{productId:string;targetQty:number|null;targetRate:number|null;target:number;salaryBps:number}[]=b.products.map((p:any)=>{
  if(!p||typeof p.productId!=='string'||!p.productId||p.productId.length>100)throw new Error('Choose a valid product.');
  if(p.targetQty!==null&&(!Number.isSafeInteger(p.targetQty)||p.targetQty<1||p.targetQty>1000000000))throw new Error('Target quantity must be a whole number from 1 to 1000000000, or blank for no quantity target.');
  const targetRate=rates.get(p.productId)??null;
  if(p.targetQty!==null&&(targetRate===null||!Number.isSafeInteger(targetRate)||targetRate<=0))throw new Error('Set a positive PTS excluding GST for every product with a quantity target.');
  const target=p.targetQty===null?0:p.targetQty*targetRate!;
  if(!Number.isSafeInteger(target)||target>10000000000)throw new Error('Product target value cannot exceed ₹10,00,00,000.');
  return {productId:p.productId,targetQty:p.targetQty as number|null,targetRate,target,salaryBps:scaled(p.salaryPercent,100,'Salary percentage')};
 });
 if(new Set(products.map((p:any)=>p.productId)).size!==products.length)throw new Error('A product can appear only once in this monthly plan.');
 const target=products.reduce((n:number,p:any)=>n+p.target,0);
 if(target<100||target>10000000000)throw new Error('Combined quantity × PTS target must be between ₹1 and ₹10,00,00,000.');
 if(!Array.isArray(b.slabs)||b.slabs.length>20)throw new Error('Use up to 20 incentive slabs.');
 const slabs=b.slabs.map((s:any)=>({above:scaled(s?.above,100000000,'Incentive threshold'),rateBps:scaled(s?.percent,100,'Incentive percentage')})).sort((a:IncentiveSlab,c:IncentiveSlab)=>a.above-c.above);
 if(slabs.some((s:IncentiveSlab,i:number)=>s.above<target||s.rateBps===0||i>0&&(s.above===slabs[i-1].above||s.rateBps<slabs[i-1].rateBps)))throw new Error('Incentive thresholds must be at or above the target, unique, and have positive, non-decreasing percentages.');
 const salaryBudget=b.salaryBudget==null?null:scaled(b.salaryBudget,100000000,'Planned salary budget');
 return {target,products,slabs,salaryBudget};
}
export function incentiveFor(sales:number,slabs:IncentiveSlab[]) {
 const slab=[...slabs].sort((a,b)=>b.above-a.above).find(s=>sales>s.above);
 return {above:slab?.above??null,rateBps:slab?.rateBps??0,amount:slab?percentAmount(sales,slab.rateBps):0};
}
/** Largest remainders keep product incentive allocations equal to the monthly total, to the paise. */
export function allocateProportionally(total:number,weights:number[]) {
 const sum=weights.reduce((a,b)=>a+b,0);if(!sum)return weights.map(()=>0);
 const values=weights.map((w,i)=>{const n=BigInt(total)*BigInt(w);return {i,amount:Number(n/BigInt(sum)),remainder:n%BigInt(sum)}});
 let left=total-values.reduce((n,v)=>n+v.amount,0);
 for(const v of [...values].sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1)){if(left--<=0)break;v.amount++;}
 return values.map(v=>v.amount);
}
export const targetMonthEnd=(month:string)=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
export function validTargetThrough(month:string,date:string){return /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)&&date.slice(0,7)===month&&date<=targetMonthEnd(month);}
type Sale = ProgressSale&{direct:boolean|null;discount:number;legacy:boolean};
function salesFor(email:string,userId:string|null,month:string,records:Row[],invoices:Row[],through=targetMonthEnd(month)):Sale[] {
 const within=(date:string)=>date.slice(0,7)===month&&date.slice(0,10)<=through;
 const lines:Sale[]=[];
 for(const i of invoices.filter(i=>secondarySale(i)&&i.mr_email===email&&within(i.date))) {
  for(const l of i.items)lines.push({productId:l.productId,name:l.name,packing:l.packing||'',date:i.date.slice(0,10),qty:l.qty,free:l.free||0,net:l.subtotal,direct:i.stockist_id===COMPANY_STOCK_ID,discount:Number(l.schemeDiscount||0),legacy:false});
 }
 const catalogue=records.filter(r=>r.kind==='Products');
 for(const r of records.filter(r=>r.kind==='Secondary sales'&&!r.data['Invoice ID']&&(r.assigned_to?r.assigned_to===email:!!userId&&r.owner===userId)&&within(r.data.Date||r.created))) {
  const d=r.data,matches=catalogue.filter(p=>p.data.Name===d.Product),id=d['Product ID']|| (matches.length===1?matches[0].id:'');
  lines.push({productId:id||'legacy:'+String(d.Product||r.id),name:d.Product||'Unmapped legacy sale',packing:catalogue.find(p=>p.id===id)?.data.Pack||'',date:(d.Date||r.created).slice(0,10),qty:Number(d.Quantity||0),free:Number(d['Free quantity']||0),net:Math.round(Number(d.Quantity||0)*Number(d.Rate||0)*100),direct:null,discount:0,legacy:true});
 }
 return lines;
}
function planTargets(plan:EarningsPlan|null):ProgressTarget[]{return (plan?.products||[]).map(p=>({productId:p.productId,name:p.name,packing:p.packing,target:plan?.version===2&&p.targetQty==null?null:p.target,targetQty:p.targetQty??null}));}
function progressRows(targets:ProgressTarget[],lines:ProgressSale[]) {
 const map=new Map<string,ProductProgress>();
 const blank=(p:ProgressTarget):ProductProgress=>({...p,achieved:0,pending:p.target,percentage:p.target?0:null,paidQty:0,freeQty:0,achievedQty:0,pendingQty:p.targetQty,quantityPercentage:p.targetQty?0:null});
 for(const p of targets)map.set(p.productId,blank(p));
 for(const l of lines){const p=map.get(l.productId)||blank({productId:l.productId,name:l.name,packing:l.packing,target:null,targetQty:null});p.achieved+=l.net;p.paidQty+=l.qty;p.freeQty+=l.free;p.achievedQty+=l.qty+l.free;map.set(l.productId,p);}
 return [...map.values()].map(p=>({...p,pending:p.target===null?null:Math.max(0,p.target-p.achieved),percentage:p.target?p.achieved/p.target*100:null,pendingQty:p.targetQty===null?null:Math.max(0,p.targetQty-p.achievedQty),quantityPercentage:p.targetQty?p.achievedQty/p.targetQty*100:null})).sort((a,b)=>a.name.localeCompare(b.name)||a.packing.localeCompare(b.packing)||a.productId.localeCompare(b.productId));
}
export function productTargetProgress(email:string,userId:string|null,month:string,records:Row[],invoices:Row[],through?:string) {
 return progressRows(planTargets(findEarningsPlan(records,email,month)),salesFor(email,userId,month,records,invoices,through));
}
/** Public daily totals let closed-month date filters use the approved snapshot, never live orders. */
export function productTargetSnapshot(email:string,userId:string|null,month:string,records:Row[],invoices:Row[]):ProductTargetSnapshot {
 const sales=new Map<string,ProgressSale>();
 for(const l of salesFor(email,userId,month,records,invoices)){
  const key=l.date+'|'+l.productId,p=sales.get(key)||{productId:l.productId,name:l.name,packing:l.packing,date:l.date,qty:0,free:0,net:0};
  p.qty+=l.qty;p.free+=l.free;p.net+=l.net;sales.set(key,p);
 }
 return {version:1,month,targets:planTargets(findEarningsPlan(records,email,month)),sales:[...sales.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.productId.localeCompare(b.productId))};
}
export function snapshotTargetProgress(snapshot:ProductTargetSnapshot,through:string) {
 if(snapshot.version!==1||!validTargetThrough(snapshot.month,through))throw new Error('Choose a valid date within this report month.');
 return progressRows(snapshot.targets,snapshot.sales.filter(s=>s.date<=through));
}
export function productTargetStatus(p:ProductProgress){
 const qty=p.targetQty==null?'Qty target not set':p.pendingQty===0?'Qty target complete':'Qty target pending';
 const value=p.target==null?'Value target not set':p.pending===0?'Value target complete':'Value target pending';
 return qty+' · '+value;
}
export function monthlyEarnings(email:string,userId:string|null,month:string,records:Row[],invoices:Row[]) {
 const plan=findEarningsPlan(records,email,month);if(!plan)return null;
 const lines=salesFor(email,userId,month,records,invoices),progress=progressRows(planTargets(plan),lines),sales=lines.reduce((n,l)=>n+l.net,0),incentive=incentiveFor(sales,plan.slabs);
 const allocated=allocateProportionally(incentive.amount,progress.map(p=>p.achieved));
 const products=progress.map((p,index)=>{
  const terms=plan.products.find(t=>t.productId===p.productId),list=lines.filter(l=>l.productId===p.productId);
  const salary=percentAmount(p.achieved,terms?.salaryBps||0);
  let directRevenue=0,stockistRevenue=0,cost=0,complete=true;
  for(const l of list) {
   if(l.legacy||!terms||terms.cost===null||l.direct===false&&terms.pts===null){complete=false;continue;}
   if(l.direct)directRevenue+=l.net;else stockistRevenue+=applyPercentage(terms!.pts!,l.discount)*l.qty;
   cost+=terms.cost*(l.qty+l.free);
  }
  const revenue=complete?directRevenue+stockistRevenue:null,landingCost=complete?cost:null,bonus=allocated[index];
  return {...p,salaryBps:terms?.salaryBps??null,salary,incentive:bonus,allocation:salary+bonus,qty:list.reduce((n,l)=>n+l.qty,0),free:list.reduce((n,l)=>n+l.free,0),directRevenue:complete?directRevenue:null,stockistRevenue:complete?stockistRevenue:null,landingCost,revenue,grossProfit:revenue===null?null:revenue-cost,profit:revenue===null?null:revenue-cost-salary-bonus,costComplete:complete};
 });
 const salary=products.reduce((n,p)=>n+p.salary,0);
 return {plan,sales,salary,incentive,totalAllocation:salary+incentive.amount,salaryAtTarget:plan.products.reduce((n,p)=>n+percentAmount(p.target,p.salaryBps),0),unallocatedSales:products.filter(p=>p.salaryBps===null).reduce((n,p)=>n+p.achieved,0),profit:products.every(p=>p.costComplete)?products.reduce((n,p)=>n+p.profit!,0):null,products};
}
