import {db} from './server';
import type {PricedLine} from './field-rules';
import {secondarySale,companyOrder,reservesStock} from './order-workflow';
export async function orderStock(old:any|null,next:any,items:PricedLine[]){const statements=[],before:PricedLine[]=old?JSON.parse(old.items):[],stockist=next.stockist_id,now=new Date().toISOString();
 const movements=(await db().prepare('SELECT product_id,quantity FROM stock_movements WHERE invoice_id=?').bind(next.id).all<any>()).results;
 statements.push(db().prepare('DELETE FROM stock_reservations WHERE order_id=?').bind(next.id));
 const ids=new Set([...before.map(l=>l.productId),...items.map(l=>l.productId),...movements.map(l=>l.product_id)]);
 for(const pid of ids){const b=items.find(l=>l.productId===pid),posted=movements.filter(l=>l.product_id===pid).reduce((n,l)=>n+l.quantity,0),wanted=!companyOrder(next)&&secondarySale({...next,kind:'secondary'})&&b?-(b.qty+b.free):0,delta=wanted-posted;
 if(delta)statements.push(db().prepare('INSERT INTO stock_movements(id,invoice_id,stockist_id,product_id,quantity,created) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),next.id,stockist,pid,delta,now),db().prepare('INSERT INTO stock_balances(id,stockist_id,product_id,quantity) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET quantity=quantity+excluded.quantity').bind(stockist+'|'+pid,stockist,pid,delta));
 if(reservesStock(next)&&b)statements.push(db().prepare('INSERT INTO stock_reservations(id,order_id,stockist_id,product_id,quantity) VALUES (?,?,?,?,?)').bind(next.id+'|'+pid,next.id,stockist,pid,b.qty+b.free));
 }return statements;
}
export function summaryStatements(order:any,items:PricedLine[],mr:any,c:any,s:any){const statements=[db().prepare("DELETE FROM records WHERE kind IN ('Orders','Secondary sales') AND json_extract(data,'$.\"Invoice ID\"')=?").bind(order.id)];
 for(const item of items){const data={Date:order.date,Customer:c.Name,Stockist:s.Name,Product:item.name,Quantity:String(item.qty),'Free quantity':String(item.free),Rate:String(item.rate/100),'GST %':String(item.gst),'Order number':order.number,'Invoice ID':order.id,Representative:mr.name,Status:order.status,Notes:order.notes};statements.push(db().prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),mr.user_id,secondarySale({...order,kind:'secondary'})?'Secondary sales':'Orders',JSON.stringify(data),order.created,mr.email));}return statements;
}
