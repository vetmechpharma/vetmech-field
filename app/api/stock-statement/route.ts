import {stockAvailability} from '../../../lib/stock-availability';
import {batchInventory} from '../../../lib/batch-stock';
import {indiaDay} from '../../../lib/operations';
import {COMPANY_STOCK_ID} from '../../../lib/supply';
import {member,db,json,failure,HttpError} from '../../../lib/server';
import {idList} from '../../../lib/field-rules';
export async function GET(req:Request){try{
 const m=await member(),q=new URL(req.url).searchParams,from=q.get('from')||'',to=q.get('to')||'';
 if(![from,to].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d)))||from>to)throw new HttpError(400,'Choose a valid date range.');
 const allowed=idList(m.stockist_ids),permit=(id:string)=>id===COMPANY_STOCK_ID||m.role==='admin'||allowed.includes(id);
 const balances=(await db().prepare('SELECT * FROM stock_balances').all<any>()).results.filter(b=>permit(b.stockist_id));
 const reservations=(await db().prepare('SELECT * FROM stock_reservations').all<any>()).results.filter(b=>permit(b.stockist_id));
 const invoices=(await db().prepare('SELECT * FROM invoices').all<any>()).results;
 const lookup=new Map(invoices.map(i=>[i.id,i]));
 const movements=(await db().prepare('SELECT * FROM stock_movements ORDER BY created').all<any>()).results.filter(b=>permit(b.stockist_id));
 const sums=new Map<string,any>();
 for(const b of balances)sums.set(b.stockist_id+'|'+b.product_id,{stockistId:b.stockist_id,productId:b.product_id,opening:0,received:0,issued:0,returned:0,closing:0,physical:b.quantity,reserved:0,available:0});
 const details:any[]=[];
 for(const b of movements){const invoice=lookup.get(b.invoice_id),day=new Date(b.created).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),key=b.stockist_id+'|'+b.product_id;
 if(!sums.has(key))sums.set(key,{stockistId:b.stockist_id,productId:b.product_id,opening:0,received:0,issued:0,returned:0,closing:0,physical:0,reserved:0,available:0});
 const s=sums.get(key);if(day<from)s.opening+=b.quantity;if(day<=to)s.closing+=b.quantity;
 if(day>=from&&day<=to){const type=b.quantity<0?'Approved order / adjustment out':['primary','company_receipt'].includes(invoice?.kind||'')?'Stock receipt':'Return / adjustment in';if(b.quantity<0)s.issued-=b.quantity;else if(['primary','company_receipt'].includes(invoice?.kind||''))s.received+=b.quantity;else s.returned+=b.quantity;details.push({id:b.id,stockistId:b.stockist_id,productId:b.product_id,date:day,number:invoice?.number||b.invoice_id,type,quantity:b.quantity});}
 }
 const batches=batchInventory(invoices.map(i=>({...i,items:JSON.parse(i.items)})),balances);
 for(const b of stockAvailability(balances,reservations,batches,indiaDay())){
  const key=b.stockist_id+'|'+b.product_id;
  if(!sums.has(key))sums.set(key,{stockistId:b.stockist_id,productId:b.product_id,opening:0,received:0,issued:0,returned:0,closing:0});
  Object.assign(sums.get(key),{physical:b.quantity,reserved:b.reserved,available:b.available,expired:b.expired,shortage:b.shortage});
 }
 return json({summary:[...sums.values()],movements:details,asOf:new Date().toISOString()});
}catch(e){return failure(e)}}
