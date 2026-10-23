import {COMPANY_STOCK_ID} from './supply';
export function orderApproved(order:any){return !!order.accepted||order.status==='Delivered';}
export function companyOrder(order:any){return order.stockist_id===COMPANY_STOCK_ID;}
/** Approved order value is secondary sales, regardless of forwarding/delivery acknowledgement. */
export function secondarySale(order:any){return order.kind==='secondary'&&order.status!=='Cancelled'&&(orderApproved(order)||order.status===undefined);}
export function reservesStock(order:any){return !companyOrder(order)&&order.status==='Placed'&&!orderApproved(order);}
export function orderStage(order:any){
 if(order.status==='Cancelled')return 'Cancelled';
 if(order.status==='Delivered')return companyOrder(order)?'Completed':'Previously supplied';
 if(!orderApproved(order))return 'Pending Admin approval';
 if(companyOrder(order))return 'Approved — awaiting company completion';
 if(order.forwarding_state==='unconfirmed')return 'Approved — forwarding needs attention';
 return Number(order.forwarded_revision)===Number(order.revision)?'Forwarded to stockist':'Approved — forwarding pending';
}
export function unresolvedOrder(order:any){return order.kind==='secondary'&&order.status==='Placed'&&(!orderApproved(order)||companyOrder(order));}
