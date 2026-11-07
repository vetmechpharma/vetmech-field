import {writeCSV} from './product-csv';
import {productTargetStatus,type ProductProgress} from './monthly-earnings';
export function productTargetCSV(rows:ProductProgress[],mr:string,month:string,through:string){
 const amount=(n:number|null)=>n==null?'Not set':(n/100).toFixed(2);
 return writeCSV([
  ['MR','Month','Through date','Product','Packing','Target units','Achieved units','Paid units','Free units','Pending units','Quantity achievement %','Target value excl GST','Achieved value excl GST','Pending value excl GST','Value achievement %','Status'],
  ...rows.map(p=>[mr,month,through,p.name,p.packing,String(p.targetQty??'Not set'),String(p.achievedQty??'Not recorded'),String(p.paidQty??''),String(p.freeQty??''),String(p.pendingQty??''),p.quantityPercentage==null?'':p.quantityPercentage.toFixed(2),amount(p.target),amount(p.achieved),p.pending==null?'':amount(p.pending),p.percentage==null?'':p.percentage.toFixed(2),productTargetStatus(p)])
 ]);
}
