import {db} from './server';
import {orderApproved} from './order-workflow';
/** Recheck stored messages too: an old queue must not bypass the new approval rule. */
export async function messageBlock(row:any){
 if(row.visit_id?.startsWith('test:'))return '';
 if(!row.group_id)return 'Previous template version. This unsent message has been superseded.';
 if(!row.visit_id?.startsWith('order:'))return '';
 const [,id,role]=row.visit_id.split(':'),order=await db().prepare('SELECT * FROM invoices WHERE id=?').bind(id).first<any>();
 if(role==='agency'&&(!order||!orderApproved(order)))return 'Admin approval is required before forwarding to the stockist.';
 if(order&&Number(row.id.split(':')[2])!==order.revision)return 'Replaced by a newer order revision.';
 return '';
}
