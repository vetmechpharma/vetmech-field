const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function({load,root,sql,ok,request,records,commerce,invoice,qty,s1,shared,owner,alice,who}){
 const tables=sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
 const snapshot=tables.map(table=>[table,sql.prepare('SELECT * FROM '+table).all()]);
 const read=id=>{const row=sql.prepare('SELECT * FROM invoices WHERE id=?').get(id);return {...row,items:JSON.parse(row.items)}};
 const save=(data,id,status=200)=>records.POST(request({kind:'Products',data,id})).then(r=>ok(r,status));
 const approvals=load(path.join(root,'app/api/approvals/route.ts'));
 const patch=(body,status=200)=>commerce.PATCH(request(body,'PATCH')).then(r=>ok(r,status));
 try{
  who(owner);
  const data={Name:'Direct net fixture',Pack:'15 ml',MRP:'105',PTR:'80',PTS:'72','GST %':'5','Landing cost':'20','Scheme 1 enabled':'Yes','Scheme 1 paid':'30','Scheme 1 free':'10','Scheme 2 enabled':'Yes','Scheme 2 type':'Direct net rate','Scheme 2 minimum qty':'100','Scheme 2 net rate':'25'};
  await save({...data,'Scheme 2 net rate':'25.001'},undefined,400);
  const product=await save(data),item=(q=100,scheme='2',extra={})=>({productId:product.id,qty:q,scheme,...extra});
  await ok(await commerce.POST(request(invoice('primary',s1.id,[item(100,'none',{retailSchemeIds:['2']})]))),400);
  who(alice);const catalogue=(await ok(await records.GET())).records.find(r=>r.id===product.id);assert.equal(catalogue.data['Scheme 2 net rate'],'25');assert.equal(catalogue.data['Landing cost'],undefined);
  const order=(q=100,stockistId='company-stock',extra={})=>invoice('secondary',stockistId,[item(q,'2',extra)],{customerId:shared.id});
  await ok(await commerce.POST(request(order(99))),400);
  await ok(await commerce.POST(request(order(100,s1.id))),400);
  await ok(await commerce.POST(request(order(100,'company-stock',{proposedRate:10}))),400);
  await ok(await commerce.POST(request(order(100,'company-stock',{proposedFree:10}))),400);
  const placed=order();assert((await ok(await commerce.POST(request(placed)))).pendingApproval);
  let stored=read(placed.id);assert.equal(stored.accepted,0);assert.equal(stored.items[0].rate,2500);assert.equal(stored.items[0].free,0);assert.equal(stored.subtotal,250000);assert.equal(stored.total,262500);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM stock_movements WHERE invoice_id=?').get(placed.id).n,0);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM workflow_requests WHERE record_id=? AND kind IN ('custom_scheme','direct_order')").get(placed.id).n,0);
  await patch({id:placed.id,revision:1,requestId:crypto.randomUUID(),action:'approveOrder'},403);
  await patch({id:placed.id,revision:1,requestId:crypto.randomUUID(),lines:[item(99)]},400);
  who(owner);await patch({id:placed.id,revision:1,requestId:crypto.randomUUID(),action:'approveOrder'});
  stored=read(placed.id);assert.equal(stored.accepted,1);assert.equal(qty(s1.id,product.id),0);
  const summary=sql.prepare("SELECT kind,data FROM records WHERE json_extract(data,'$.\"Invoice ID\"')=?").get(placed.id);assert.equal(summary.kind,'Secondary sales');assert.equal(JSON.parse(summary.data).Rate,'25');
  await save({...data,'Scheme 2 minimum qty':'200','Scheme 2 net rate':'30','GST %':'18','Change reason':'Next offer revision'},product.id);
  who(alice);await patch({id:placed.id,revision:2,requestId:crypto.randomUUID(),lines:[item(99)]},400);
  const edit={id:placed.id,revision:2,requestId:crypto.randomUUID(),lines:[item(120)],notes:'More of the saved direct offer'};
  assert((await patch(edit)).pendingApproval);assert.equal(read(placed.id).subtotal,250000);
  const pending=JSON.parse(sql.prepare('SELECT body FROM workflow_requests WHERE id=?').get(edit.requestId).body);assert.equal(pending.proposedItems[0].rate,2500);assert.equal(pending.proposedItems[0].schemeMinimumQty,100);
  who(owner);const preview=await ok(await approvals.GET());await patch({action:'approve',requestId:edit.requestId,hash:preview.hash});stored=read(placed.id);assert.equal(stored.subtotal,300000);assert.equal(stored.items[0].gst,5);
  await patch({id:placed.id,revision:3,requestId:crypto.randomUUID(),reprice:true,lines:[item(120)]},400);
  await patch({id:placed.id,revision:3,requestId:crypto.randomUUID(),reprice:true,lines:[item(200)]});stored=read(placed.id);assert.equal(stored.subtotal,600000);assert.equal(stored.items[0].gst,18);assert.equal(stored.items[0].schemeMinimumQty,200);
  await patch({id:placed.id,revision:4,requestId:crypto.randomUUID(),action:'status',status:'Delivered'});assert.equal(read(placed.id).status,'Delivered');assert.equal(sql.prepare('SELECT COUNT(*) n FROM stock_movements WHERE invoice_id=?').get(placed.id).n,0);
  who(alice);const normal=invoice('secondary',s1.id,[item(30,'1')],{customerId:shared.id});await ok(await commerce.POST(request(normal)));assert.equal(read(normal.id).items[0].free,10);
  await patch({id:normal.id,revision:1,requestId:crypto.randomUUID(),lines:[item(200)]},400);
  console.log('PASS: direct net-rate API validation, minimum quantity, forbidden stockist/primary/stacked offers, normal Admin approval, separate secondary sales, saved-rate edits, reprice approval, company completion and MR cost privacy.');
 }finally{
  for(const [table]of snapshot)sql.exec('DELETE FROM '+table);
  for(const [table,rows]of snapshot)if(rows.length){const cols=Object.keys(rows[0]),insert=sql.prepare('INSERT INTO '+table+'('+cols.join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')');for(const row of rows)insert.run(...cols.map(k=>row[k]));}
  who(alice);
 }
};
