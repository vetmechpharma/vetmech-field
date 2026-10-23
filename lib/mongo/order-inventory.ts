import {mongoClient,mongoDB} from './client';
import {secondarySale,companyOrder,reservesStock} from '../order-workflow';

const policy='approved-approximate-v1';
let ready:Promise<void>|undefined;

/** One atomic transition for existing installations. Original orders and closed reports stay intact. */
export async function reconcileOrderInventory(db:any,session:any){
 const options={session},control=await db.collection('_control').findOne({_id:'ledger'},options);
 if(control?.order_inventory_policy===policy)return;
 if(!control)throw Error('Run db:setup before starting the application');
 // Share the same write lock as business transactions, including concurrent app workers.
 await db.collection('_control').updateOne({_id:'ledger'},{$inc:{revision:1}},options);
 const orders=await db.collection('invoices').find({kind:'secondary'},options).toArray(),ids=orders.map((o:any)=>o.id);
 const allMoves=ids.length?await db.collection('stock_movements').find({invoice_id:{$in:ids}},options).toArray():[];
 const byOrder=new Map<string,any[]>();for(const move of allMoves)byOrder.set(move.invoice_id,[...(byOrder.get(move.invoice_id)||[]),move]);
 const corrections:any[]=[],balances=new Map<string,any>(),reservations:any[]=[];
 for(const order of orders){
  const items=JSON.parse(order.items),moves=byOrder.get(order.id)||[];
  const products=new Set([...items.map((l:any)=>l.productId),...moves.map((m:any)=>m.product_id)]);
  for(const pid of products){
   const posted=moves.filter((m:any)=>m.product_id===pid).reduce((n:number,m:any)=>n+m.quantity,0);
   const wanted=!companyOrder(order)&&secondarySale(order)?-items.filter((l:any)=>l.productId===pid).reduce((n:number,l:any)=>n+l.qty+(l.free||0),0):0;
   const delta=wanted-posted;if(!delta)continue;
   corrections.push({id:crypto.randomUUID(),invoice_id:order.id,stockist_id:order.stockist_id,product_id:pid,quantity:delta,created:new Date().toISOString()});
   const key=order.stockist_id+'|'+pid,entry=balances.get(key)||{id:key,stockist_id:order.stockist_id,product_id:pid,delta:0};entry.delta+=delta;balances.set(key,entry);
  }
  if(reservesStock(order))for(const l of items)reservations.push({id:order.id+'|'+l.productId,order_id:order.id,stockist_id:order.stockist_id,product_id:l.productId,quantity:l.qty+(l.free||0)});
 }
 if(corrections.length)await db.collection('stock_movements').insertMany(corrections,options);
 if(balances.size)await db.collection('stock_balances').bulkWrite([...balances.values()].map(({delta,...b})=>({updateOne:{filter:{stockist_id:b.stockist_id,product_id:b.product_id},update:{$inc:{quantity:delta},$setOnInsert:b},upsert:true}})),options);
 if(ids.length)await db.collection('stock_reservations').deleteMany({order_id:{$in:ids}},options);
 if(reservations.length)await db.collection('stock_reservations').insertMany(reservations,options);
 await db.collection('_control').updateOne({_id:'ledger'},{$set:{order_inventory_policy:policy,order_inventory_migrated_at:new Date().toISOString()}},options);
}

export async function ensureOrderInventory(){
 if(!ready)ready=(async()=>{
  const db=await mongoDB();
  if((await db.collection('_control').findOne({_id:'ledger' as any}))?.order_inventory_policy===policy)return;
  const session=(await mongoClient()).startSession();
  try{await session.withTransaction(()=>reconcileOrderInventory(db,session),{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});}finally{await session.endSession();}
 })().catch(error=>{ready=undefined;throw error});
 return ready;
}
