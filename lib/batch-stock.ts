import type {PricedLine} from './field-rules';
export type BatchAllocation={key:string;quantity:number};
export type BatchRow={key:string;stockistId:string;productId:string;batch:string;expiry:string;physical:number;reserved:number;available:number;legacy:boolean};
export function expiryLimit(day:string){const d=new Date(day+'T00:00:00Z'),n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+6);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(n,last));return d.toISOString().slice(0,10)}
export function batchKey(stockist:string,product:string,batch:string,expiry:string){return JSON.stringify([stockist,product,batch,expiry])}
export function batchInventory(invoices:any[],balances:any[],exclude=''):BatchRow[]{
 const map=new Map<string,BatchRow>();
 const get=(s:string,p:string,b:string,e:string)=>{const key=batchKey(s,p,b,e);if(!map.has(key))map.set(key,{key,stockistId:s,productId:p,batch:b,expiry:e,physical:0,reserved:0,available:0,legacy:!b});return map.get(key)!};
 for(const inv of invoices){if(inv.kind==='secondary'||inv.status==='Cancelled')continue;for(const l of inv.items){if(l.batch&&l.expiry)get(inv.stockist_id,l.productId,l.batch,l.expiry).physical+=l.qty+l.free}}
 // Reconcile pre-upgrade stock to an explicit untracked bucket, never invent expiry dates.
 for(const inv of invoices){if(inv.kind!=='secondary'||inv.status!=='Delivered')continue;for(const l of inv.items)for(const a of l.allocations||[]){const r=map.get(a.key);if(r)r.physical-=a.quantity}}
 for(const b of balances){const tracked=[...map.values()].filter(r=>r.stockistId===b.stockist_id&&r.productId===b.product_id).reduce((n,r)=>n+r.physical,0);get(b.stockist_id,b.product_id,'','').physical=b.quantity-tracked;}
 for(const inv of invoices){if(inv.kind!=='secondary'||inv.status==='Cancelled')continue;for(const l of inv.items){if(inv.id===exclude){if(inv.status==='Delivered'){if(l.allocations?.length){for(const a of l.allocations){const r=map.get(a.key);if(r)r.physical+=a.quantity}}else get(inv.stockist_id,l.productId,'','').physical+=l.qty+l.free;}continue;}if(inv.status==='Placed'){if(l.allocations?.length){for(const a of l.allocations){const r=map.get(a.key);if(r)r.reserved+=a.quantity}}else get(inv.stockist_id,l.productId,'','').reserved+=l.qty+l.free;}}}
 return [...map.values()].map(r=>({...r,available:r.physical-r.reserved}));
}
export function allocateBatches(rows:BatchRow[],stockist:string,items:PricedLine[],day:string){for(const l of items){let need=l.qty+l.free;l.allocations=[];const eligible=rows.filter(r=>r.stockistId===stockist&&r.productId===l.productId&&(!r.expiry||r.expiry>=day)).sort((a,b)=>(a.expiry||'9999').localeCompare(b.expiry||'9999')||a.key.localeCompare(b.key));for(const r of eligible){const qty=Math.min(need,Math.max(0,r.available));if(qty){l.allocations.push({key:r.key,quantity:qty});r.available-=qty;need-=qty}}if(need)throw Error(`Insufficient unexpired available stock for ${l.name}. Expired batches cannot be ordered.`);}}
