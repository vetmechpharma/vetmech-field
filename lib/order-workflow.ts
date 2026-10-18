import {COMPANY_STOCK_ID} from './supply';
export function orderApproved(order:any){return !!order.accepted||order.status==='Delivered';}
export function companyOrder(order:any){return order.stockist_id===COMPANY_STOCK_ID;}
export function orderStage(order:any){
 if(order.status==='Cancelled')return 'Cancelled';
 if(order.status==='Delivered')return companyOrder(order)?'Completed':'Previously supplied';
 if(!orderApproved(order))return 'Pending Admin approval';
 if(companyOrder(order))return 'Approved — awaiting company completion';
 if(order.forwarding_state==='unconfirmed')return 'Approved — forwarding needs attention';
 return Number(order.forwarded_revision)===Number(order.revision)?'Forwarded to stockist':'Approved — forwarding pending';
}
export function unresolvedOrder(order:any){return order.kind==='secondary'&&order.status==='Placed'&&(!orderApproved(order)||companyOrder(order));}
