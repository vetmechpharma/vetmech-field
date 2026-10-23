import {companyOrder,orderApproved,reservesStock} from './order-workflow';
export function stockImpact(order:any,proposed:any[],stock:any[],nextAccepted?:boolean){
 if(!order||companyOrder(order))return [];
 const original=typeof order.items==='string'?JSON.parse(order.items):order.items,ids=[...new Set<string>([...original,...proposed].map(l=>l.productId))];
 const approved=order.status!=='Cancelled'&&orderApproved(order),afterApproved=nextAccepted??approved;
 return ids.map(id=>{const a=original.find((l:any)=>l.productId===id),b=proposed.find(l=>l.productId===id),s=stock.find(s=>s.stockist_id===order.stockist_id&&s.product_id===id),oldQty=(a?.qty||0)+(a?.free||0),newQty=(b?.qty||0)+(b?.free||0),physical=s?.quantity||0,reserved=s?.reserved||0,physicalAfter=physical+(approved?oldQty:0)-(afterApproved?newQty:0),reservedAfter=reserved-(reservesStock(order)?oldQty:0)+(!afterApproved?newQty:0);return {id,name:b?.name||a?.name,physical,reserved,available:Math.max(0,physical-reserved),physicalAfter,reservedAfter,availableAfter:Math.max(0,physicalAfter-reservedAfter),shortageAfter:Math.max(0,reservedAfter-physicalAfter)}});
}
