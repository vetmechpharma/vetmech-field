import {secondarySale} from './order-workflow';
import {COMPANY_STOCK_ID} from './supply';

export const earningsKind = 'Monthly earnings plan';
export const earningsHistoryKind = 'Monthly earnings revision';
export const earningsID = (email:string,month:string) => `monthly-earnings:${email}:${month}`;
type Row = Record<string,any>;
export type ProductPlan = {productId:string;name:string;packing:string;target:number;salaryBps:number;pts:number|null;cost:number|null};
export type IncentiveSlab = {above:number;rateBps:number};
export type EarningsPlan = {version:1;revision:number;month:string;mrEmail:string;target:number;salaryBudget:number|null;products:ProductPlan[];slabs:IncentiveSlab[];savedAt:string;savedBy:string;reason:string};
export type ProductProgress = {productId:string;name:string;packing:string;target:number|null;achieved:number;pending:number|null;percentage:number|null};
export const percentAmount = (paise:number,bps:number) => Number((BigInt(paise)*BigInt(bps)+5000n)/10000n);
export function findEarningsPlan(records:Row[],email:string,month:string):EarningsPlan|null {
 return records.find(r=>r.id===earningsID(email,month)&&r.kind===earningsKind)?.data||null;
}
function scaled(value:unknown,max:number,label:string) {
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||Math.abs(value*100-Math.round(value*100))>0.00001)throw new Error(`${label} must be a number from 0 to ${max} with at most two decimals.`);
 return Math.round(value*100);
}
export function validateEarningsInput(b:any) {
 if(!b||!Array.isArray(b.products)||!b.products.length||b.products.length>500)throw new Error('Choose between 1 and 500 products.');
 const target=scaled(b.target,100000000,'Monthly target');if(target<100)throw new Error('Monthly target must be at least ₹1.');
 const products=b.products.map((p:any)=>{
  if(!p||typeof p.productId!=='string'||!p.productId||p.productId.length>100)throw new Error('Choose a valid product.');
  return {productId:p.productId,target:scaled(p.target,100000000,'Product target'),salaryBps:scaled(p.salaryPercent,100,'Salary percentage')};
 });
 if(new Set(products.map((p:any)=>p.productId)).size!==products.length)throw new Error('A product can appear only once in this monthly plan.');
 if(products.reduce((n:number,p:any)=>n+p.target,0)!==target)throw new Error('Product targets must add up to this MR’s monthly target.');
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
type Sale = {productId:string;name:string;packing:string;qty:number;free:number;net:number;direct:boolean|null;discount:number;legacy:boolean};
function salesFor(email:string,userId:string|null,month:string,records:Row[],invoices:Row[]):Sale[] {
 const lines:Sale[]=[];
 for(const i of invoices.filter(i=>secondarySale(i)&&i.mr_email===email&&i.date.startsWith(month))) {
  for(const l of i.items)lines.push({productId:l.productId,name:l.name,packing:l.packing||'',qty:l.qty,free:l.free||0,net:l.subtotal,direct:i.stockist_id===COMPANY_STOCK_ID,discount:Number(l.schemeDiscount||0),legacy:false});
 }
 const catalogue=records.filter(r=>r.kind==='Products');
 for(const r of records.filter(r=>r.kind==='Secondary sales'&&!r.data['Invoice ID']&&(r.assigned_to?r.assigned_to===email:!!userId&&r.owner===userId)&&(r.data.Date||r.created).startsWith(month))) {
  const d=r.data,matches=catalogue.filter(p=>p.data.Name===d.Product),id=d['Product ID']|| (matches.length===1?matches[0].id:'');
  lines.push({productId:id||'legacy:'+String(d.Product||r.id),name:d.Product||'Unmapped legacy sale',packing:catalogue.find(p=>p.id===id)?.data.Pack||'',qty:Number(d.Quantity||0),free:Number(d['Free quantity']||0),net:Math.round(Number(d.Quantity||0)*Number(d.Rate||0)*100),direct:null,discount:0,legacy:true});
 }
 return lines;
}
function progressRows(plan:EarningsPlan|null,lines:Sale[]) {
 const map=new Map<string,ProductProgress>();
 for(const p of plan?.products||[])map.set(p.productId,{productId:p.productId,name:p.name,packing:p.packing,target:p.target,achieved:0,pending:p.target,percentage:p.target?0:null});
 for(const l of lines){const p=map.get(l.productId)||{productId:l.productId,name:l.name,packing:l.packing,target:null,achieved:0,pending:null,percentage:null};p.achieved+=l.net;map.set(l.productId,p);}
 return [...map.values()].map(p=>({...p,pending:p.target===null?null:Math.max(0,p.target-p.achieved),percentage:p.target?p.achieved/p.target*100:null})).sort((a,b)=>a.name.localeCompare(b.name)||a.packing.localeCompare(b.packing)||a.productId.localeCompare(b.productId));
}
export function productTargetProgress(email:string,userId:string|null,month:string,records:Row[],invoices:Row[]) {
 return progressRows(findEarningsPlan(records,email,month),salesFor(email,userId,month,records,invoices));
}
export function monthlyEarnings(email:string,userId:string|null,month:string,records:Row[],invoices:Row[]) {
 const plan=findEarningsPlan(records,email,month);if(!plan)return null;
 const lines=salesFor(email,userId,month,records,invoices),progress=progressRows(plan,lines),sales=lines.reduce((n,l)=>n+l.net,0),incentive=incentiveFor(sales,plan.slabs);
 const allocated=allocateProportionally(incentive.amount,progress.map(p=>p.achieved));
 const products=progress.map((p,index)=>{
  const terms=plan.products.find(t=>t.productId===p.productId),list=lines.filter(l=>l.productId===p.productId);
  const salary=percentAmount(p.achieved,terms?.salaryBps||0);
  let directRevenue=0,stockistRevenue=0,cost=0,complete=true;
  for(const l of list) {
   if(l.legacy||!terms||terms.cost===null||l.direct===false&&terms.pts===null){complete=false;continue;}
   if(l.direct)directRevenue+=l.net;else stockistRevenue+=(terms!.pts!-percentAmount(terms!.pts!,Math.round(l.discount*100)))*l.qty;
   cost+=terms.cost*(l.qty+l.free);
  }
  const revenue=complete?directRevenue+stockistRevenue:null,landingCost=complete?cost:null,bonus=allocated[index];
  return {...p,salaryBps:terms?.salaryBps??null,salary,incentive:bonus,allocation:salary+bonus,qty:list.reduce((n,l)=>n+l.qty,0),free:list.reduce((n,l)=>n+l.free,0),directRevenue:complete?directRevenue:null,stockistRevenue:complete?stockistRevenue:null,landingCost,revenue,grossProfit:revenue===null?null:revenue-cost,profit:revenue===null?null:revenue-cost-salary-bonus,costComplete:complete};
 });
 const salary=products.reduce((n,p)=>n+p.salary,0);
 return {plan,sales,salary,incentive,totalAllocation:salary+incentive.amount,salaryAtTarget:plan.products.reduce((n,p)=>n+percentAmount(p.target,p.salaryBps),0),unallocatedSales:products.filter(p=>p.salaryBps===null).reduce((n,p)=>n+p.achieved,0),profit:products.every(p=>p.costComplete)?products.reduce((n,p)=>n+p.profit!,0):null,products};
}
