// Real product/order routes, isolated fixtures restored before the rest of the suite.
const assert=require('node:assert/strict');
module.exports=async function({sql,ok,request,records,commerce,invoice,qty,s1,shared,owner,alice,who}){
 const tables=sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
 const snapshot=tables.map(table=>[table,sql.prepare('SELECT * FROM '+table).all()]);
 const saved=id=>JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(id).data);
 const save=(data,id,status=200)=>records.POST(request({kind:'Products',data,id})).then(r=>ok(r,status));
 try{
  who(owner);
  const large={Name:'X-TRAZ (Amitraz)',Pack:'50 ML',MRP:'200',PTR:'120',PTS:'90','GST %':'5'},small={Name:large.Name,Pack:'15 ml',MRP:'100',PTR:'60',PTS:'45','GST %':'5'};
  const p50=await save(large),p15=await save(small);assert.notEqual(p50.id,p15.id);
  const duplicate=await save({...small,Name:' x-traz (amitraz) ',Pack:' 15 ML '},undefined,409);assert.match(duplicate.error,/name and packing/);
  await save({...small,Pack:'50 ml'},p15.id,409);assert.equal(saved(p15.id).Pack,'15 ml');
  await save({...saved(p15.id),Pack:' 15 ML '},p15.id);assert.equal(saved(p15.id).Pack,'15 ML');
  const legacy=await save({Name:'Legacy packing test',MRP:'1',PTR:'1',PTS:'1'});await save({Name:' legacy packing test ',Pack:' ',MRP:'1',PTR:'1',PTS:'1'},undefined,409);await save(saved(legacy.id),legacy.id);
  // The relaxed rule is product-specific. Other master names remain unique.
  await ok(await records.POST(request({kind:'Stockists',data:{Name:'Shared stockist'}})),409);
  who(alice);await save(small,undefined,403);
  who(owner);
  await ok(await commerce.POST(request(invoice('primary',s1.id,[{productId:p50.id,qty:20,scheme:'none'},{productId:p15.id,qty:40,scheme:'none'}]))));
  assert.equal(qty(s1.id,p50.id),20);assert.equal(qty(s1.id,p15.id),40);
  who(alice);
  const order=invoice('secondary',s1.id,[{productId:p50.id,qty:2,scheme:'none'},{productId:p15.id,qty:3,scheme:'none'}],{customerId:shared.id});
  await ok(await commerce.POST(request(order)));
  const originalItems=sql.prepare('SELECT items FROM invoices WHERE id=?').get(order.id).items,items=JSON.parse(originalItems);
  assert.deepEqual(items.map(i=>[i.productId,i.packing,i.rate]),[[p50.id,'50 ML',12000],[p15.id,'15 ML',6000]]);
  const summary=()=>sql.prepare("SELECT data FROM records WHERE json_extract(data,'$.\"Invoice ID\"')=?").all(order.id).map(r=>JSON.parse(r.data));
  assert.deepEqual(new Set(summary().map(r=>r['Product ID'])),new Set([p50.id,p15.id]));assert.deepEqual(new Set(summary().map(r=>r.Packing)),new Set(['50 ML','15 ML']));
  who(owner);await ok(await commerce.PATCH(request({id:order.id,revision:1,requestId:crypto.randomUUID(),action:'approveOrder'},'PATCH')));
  assert.equal(qty(s1.id,p50.id),18);assert.equal(qty(s1.id,p15.id),37);assert(summary().every(r=>r.Product===large.Name));
  // Editing one pack must not reprice or rename another pack's history.
  await save({...saved(p15.id),Name:'X-TRAZ Small',PTR:'65','Change reason':'Small pack price review'},p15.id);
  assert.equal(saved(p50.id).Name,large.Name);assert.equal(Number(saved(p50.id).PTR),120);assert.equal(Number(saved(p15.id).PTR),65);
  assert.equal(sql.prepare('SELECT items FROM invoices WHERE id=?').get(order.id).items,originalItems);
  assert(summary().every(r=>r.Product===large.Name));assert.equal(qty(s1.id,p50.id),18);assert.equal(qty(s1.id,p15.id),37);
  const afterEdit=await ok(await records.GET());assert(afterEdit.records.some(r=>r.id===p50.id&&r.data.Pack==='50 ML'));assert(afterEdit.records.some(r=>r.id===p15.id&&r.data.Pack==='15 ML'));
  console.log('PASS: manual create/edit allows distinct packs, blocks duplicate pairs, preserves blank-pack legacy products and Admin access, and isolates pack prices, order snapshots and stock balances.');
 }finally{
  for(const [table]of snapshot)sql.exec('DELETE FROM '+table);
  for(const [table,rows]of snapshot)if(rows.length){const cols=Object.keys(rows[0]),insert=sql.prepare('INSERT INTO '+table+'('+cols.join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')');for(const row of rows)insert.run(...cols.map(k=>row[k]));}
  who(alice);
 }
};
