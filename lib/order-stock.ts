import {db} from './server';
import {guard} from './operations';
import type {PricedLine} from './field-rules';
export function availableGuard(stockist:string,product:string){return guard('stock',`COALESCE((SELECT quantity FROM stock_balances WHERE stockist_id=? AND product_id=?),0)>=COALESCE((SELECT SUM(quantity) FROM stock_reservations WHERE stockist_id=? AND product_id=?),0)`,[stockist,product,stockist,product])}
export function orderStock(old:any|null,next:any,items:PricedLine[]){const statements=[],before:PricedLine[]=old?JSON.parse(old.items):[],stockist=next.stockist_id,now=new Date().toISOString();
 statements.push(db().prepare('DELETE FROM stock_reservations WHERE order_id=?').bind(next.id));
 const ids=new Set([...before.map(l=>l.productId),...items.map(l=>l.productId)]);
 for(const pid of ids){const a=before.find(l=>l.productId===pid),b=items.find(l=>l.productId===pid),previous=old?.status==='Delivered'&&a?a.qty+a.free:0,current=next.status==='Delivered'&&b?b.qty+b.free:0,delta=previous-current;
 if(delta){if(delta<0)statements.push(guard('stock','EXISTS(SELECT 1 FROM stock_balances WHERE stockist_id=? AND product_id=?)',[stockist,pid]));statements.push(db().prepare('INSERT INTO stock_movements(id,invoice_id,stockist_id,product_id,quantity,created) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),next.id,stockist,pid,delta,now),db().prepare('UPDATE stock_balances SET quantity=quantity+? WHERE stockist_id=? AND product_id=?').bind(delta,stockist,pid));}
 if(next.status==='Placed'&&b)statements.push(db().prepare('INSERT INTO stock_reservations(id,order_id,stockist_id,product_id,quantity) VALUES (?,?,?,?,?)').bind(next.id+'|'+pid,next.id,stockist,pid,b.qty+b.free));
 statements.push(availableGuard(stockist,pid));
 }return statements;
}
export function summaryStatements(order:any,items:PricedLine[],mr:any,c:any,s:any){const statements=[db().prepare("DELETE FROM records WHERE kind IN ('Orders','Secondary sales') AND json_extract(data,'$.\"Invoice ID\"')=?").bind(order.id)];
 for(const item of items){const data={Date:order.date,Customer:c.Name,Stockist:s.Name,Product:item.name,Quantity:String(item.qty),'Free quantity':String(item.free),Rate:String(item.rate/100),'GST %':String(item.gst),'Order number':order.number,'Invoice ID':order.id,Representative:mr.name,Status:order.status,Notes:order.notes};statements.push(db().prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),mr.user_id,order.status==='Delivered'?'Secondary sales':'Orders',JSON.stringify(data),order.created,mr.email));}return statements;
}
