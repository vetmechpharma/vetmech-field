import type {BatchRow} from './batch-stock';

// Reservations are requested units, including demand awaiting replenishment.
// Available stock is never negative and excludes known expired units.
export function stockAvailability(balances:any[],reservations:any[],batches:BatchRow[],day:string){
 const result=new Map<string,any>();
 const key=(s:string,p:string)=>JSON.stringify([s,p]);
 for(const b of balances)result.set(key(b.stockist_id,b.product_id),{...b,reserved:0});
 for(const r of reservations){const k=key(r.stockist_id,r.product_id);if(!result.has(k))result.set(k,{id:r.stockist_id+'|'+r.product_id,stockist_id:r.stockist_id,product_id:r.product_id,quantity:0,reserved:0});result.get(k).reserved+=r.quantity;}
 return [...result.values()].map(b=>{
  const expired=batches.filter(r=>r.stockistId===b.stockist_id&&r.productId===b.product_id&&r.expiry&&r.expiry<day).reduce((n,r)=>n+Math.max(0,r.physical),0);
  const unexpired=Math.max(0,b.quantity-expired),available=Math.max(0,unexpired-b.reserved);
  return {...b,expired,unexpired,available,orderable:available,shortage:Math.max(0,b.reserved-unexpired)};
 });
}
