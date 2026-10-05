/* Exercise real route handlers against an isolated SQLite database. */
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const sql=new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root,'tests/fixtures/drizzle/0000_medical_omega_flight.sql'),'utf8'));
sql.prepare('INSERT INTO records VALUES (?,?,?,?,?)').run('legacy','owner-user','Customers',JSON.stringify({Name:'Legacy customer'}),'2026-10-01');
for(const file of fs.readdirSync(path.join(root,'tests/fixtures/drizzle')).filter(f=>f.endsWith('.sql')&&!f.startsWith('0000')).sort())sql.exec(fs.readFileSync(path.join(root,'tests/fixtures/drizzle',file),'utf8'));
let identity=null;let browserCookie=null;
async function sessionHeaders(){
 if(browserCookie!==null)return new Headers({cookie:browserCookie,'oai-authenticated-user-id':'forged-owner','oai-authenticated-user-email':'vetmechpharma@gmail.com'});
 if(!identity)return new Headers();
 const token=require('node:crypto').createHash('sha256').update('test-session:'+identity.email).digest('hex');
 const hash=require('node:crypto').createHash('sha256').update(token).digest('hex');
 sql.prepare('INSERT OR REPLACE INTO sessions (token_hash,email,expires) VALUES (?,?,?)').run(hash,identity.email,Date.now()+1000000);
 await mongo.collection('sessions').updateOne({token_hash:hash},{$set:{token_hash:hash,email:identity.email,expires:Date.now()+1000000}},{upsert:true});return new Headers({cookie:'__Host-vetmech-session='+token});
}
const database={prepare(query){let args=[];return {bind(...values){args=values;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;function localRequire(name){if(name==='cloudflare:workers')throw Error('Cloudflare dependency remains');if(name==='next/headers')return {headers:async()=>sessionHeaders()};if(name==='next/navigation')return {redirect(){throw new Error('Unexpected redirect')}};if(name.endsWith('.json'))return require(path.resolve(path.dirname(file),name));if(name.startsWith('.')){const p=path.resolve(path.dirname(file),name);return load(p.endsWith('.ts')?p:p+'.ts')}return require(name)}new Function('require','module','exports',code)(localRequire,m,m.exports);if(file.endsWith('/route.ts'))for(const key of Object.keys(m.exports)){const handler=m.exports[key];if(typeof handler==='function')m.exports[key]=async(...args)=>{await pushFixtures();try{return await handler(...args)}finally{await pullResults()}}}return m.exports}
let mongo,replset,testClient;
async function startMongo(){
 if(process.env.MONGO_TEST_MODE==='model'){
  const model=require('./mongo-model.cjs')();mongo=model.db;testClient=model.client;
  Object.assign(load(path.join(root,'lib/mongo/client.ts')),{mongoClient:async()=>testClient,mongoDB:async()=>mongo});
  console.log('MODEL TEST: native query simulation, not a real MongoDB integration test.');
 }else{
  let uri=process.env.MONGO_TEST_URI;
  if(!uri){const {MongoMemoryReplSet}=require('mongodb-memory-server');replset=await MongoMemoryReplSet.create({binary:{version:'7.0.24'},replSet:{count:1,storageEngine:'wiredTiger'}});uri=replset.getUri();}
  process.env.MONGODB_URI=uri;process.env.MONGODB_DB='vetmech_test_'+require('node:crypto').randomUUID().replaceAll('-','');
  const {MongoClient}=require('mongodb');testClient=await new MongoClient(uri).connect();mongo=testClient.db(process.env.MONGODB_DB);
 }
 await (await import('../scripts/mongo-common.mjs')).setup(mongo);
}
async function pushFixtures(){
 const {schema,stored}=await import('../scripts/mongo-common.mjs');
 for(const table of Object.keys(schema)){await mongo.collection(table).deleteMany({});const docs=sql.prepare('SELECT * FROM '+table).all();if(docs.length)await mongo.collection(table).insertMany(docs.map(stored));}
}
async function pullResults(){
 const {schema}=await import('../scripts/mongo-common.mjs');
 for(const [table,columns]of Object.entries(schema)){sql.exec('DELETE FROM '+table);const cols=columns.map(c=>c.name);const insert=sql.prepare('INSERT INTO '+table+'('+cols.join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')');for(const d of await mongo.collection(table).find().sort({_id:1}).toArray())insert.run(...cols.map(k=>d[k]??null));}
}
async function stopMongo(){try{const c=await load(path.join(root,'lib/mongo/client.ts')).mongoClient();await c.close()}catch{}if(mongo&&process.env.MONGO_TEST_MODE!=='model')await mongo.dropDatabase();await testClient?.close();await replset?.stop();}

const records=load(path.join(root,'app/api/records/route.ts')),team=load(path.join(root,'app/api/team/route.ts')),session=load(path.join(root,'app/api/session/route.ts')),inbox=load(path.join(root,'app/api/notifications/route.ts'));
const testMR=load(path.join(root,'app/api/test-mr/route.ts'));
const owner={id:'owner-user',email:'vetmechpharma@gmail.com'},alice={id:'alice-user',email:'alice@example.test'},bob={id:'bob-user',email:'bob@example.test'};
const request=(data,method='POST',origin='https://app.test')=>new Request('https://app.test/api/test',{method,headers:{'Content-Type':'application/json',origin},body:JSON.stringify(data)});
async function ok(response,expected=200){assert.equal(response.status,expected,await response.clone().text());return response.json()}
(async()=>{
 await startMongo();
 const health=load(path.join(root,'app/api/health/route.ts'));
 assert.equal((await ok(await health.GET())).status,'ok');
 const healthClient=load(path.join(root,'lib/mongo/client.ts')),healthyDB=healthClient.mongoDB;
 healthClient.mongoDB=async()=>{throw Error('Private connection detail')};
 const unavailable=await ok(await health.GET(),503);assert.deepEqual(unavailable,{status:'unavailable'});
 healthClient.mongoDB=healthyDB;
 console.log('PASS: release health reports database readiness and returns a private-data-free failure response.');
 await ok(await records.GET(),401);
 identity=owner;await ok(await session.GET());
 const post=async(kind,data,extra={})=>ok(await records.POST(request({kind,data:kind==='Products'&&extra.id?{...data,'Change reason':'Catalogue price review'}:data,...extra})));
 const d1=await post('Districts',{Name:'Tirupur'}),d2=await post('Districts',{Name:'Erode'});
 const r1=await post('Routes',{Name:'Uthukuli',District:'Tirupur'}),r2=await post('Routes',{Name:'South Tirupur',District:'Tirupur'}),r3=await post('Routes',{Name:'Perundurai',District:'Erode'});
 const s1=await post('Stockists',{Name:'Shared stockist'}),s2=await post('Stockists',{Name:'Second stockist'});
 const makeRep=async(u,routes,stocks)=>ok(await team.POST(request({email:u.email,username:u===alice?'alice':'bob',password:'Test-only-password-456',name:u===alice?'Alice Rep':'Bob Rep',target:400000,status:'active',route_ids:routes,stockist_ids:stocks,district_ids:[]})));
 await makeRep(alice,[r1.id,r3.id],[s1.id,s2.id]);await makeRep(bob,[r2.id],[s1.id]);
 const profile=sql.prepare('SELECT * FROM members WHERE email=?').get(alice.email);assert.deepEqual(new Set(JSON.parse(profile.district_ids)),new Set([d1.id,d2.id]));
 const shared=await post('Customers',{Name:'Shared doctor',Route:'Uthukuli','Route access':'Yes','Mobile 1':'9876543210'});
 const assigned=await post('Customers',{Name:'Assigned doctor',Route:'Perundurai'},{assignedTo:alice.email});
 const clinic=await post('Customers',{Name:'Linked clinic','Customer category':'Medical / Clinic',Route:'Uthukuli','Stockist IDs':JSON.stringify([s1.id])},{assignedTo:alice.email});
 const product=await post('Products',{Name:'Product A',MRP:'200',PTR:'120',PTS:'90','GST %':'5','Sample cost':'2','Scheme 1 enabled':'Yes','Scheme 1 paid':'10','Scheme 1 free':'2','Scheme 2 enabled':'Yes','Scheme 2 paid':'5','Scheme 2 free':'1','Scheme 3 enabled':'Yes','Scheme 3 paid':'20','Scheme 3 free':'5'});
 const otherProduct=await post('Products',{Name:'Product B',MRP:'100',PTR:'75',PTS:'50','GST %':'0','Retail offer enabled':'Yes','Retail offer rate':'70'});
 const gift=await post('Gifts',{Name:'Diary','Unit cost':'100','One per customer':'Yes'});
 identity=bob;const ownBob=await post('Customers',{Name:'Bob doctor',Route:'South Tirupur'});
 identity=alice;const own=await post('Customers',{Name:'Alice doctor',Route:'Uthukuli'});
 let rows=(await ok(await records.GET())).records;assert(rows.some(r=>r.id===shared.id));assert(rows.some(r=>r.id===assigned.id));assert(rows.some(r=>r.id===own.id));assert(!rows.some(r=>r.id===ownBob.id));assert(!rows.some(r=>r.id==='legacy'));assert(!('PTS' in rows.find(r=>r.id===product.id).data));
 await ok(await records.POST(request({kind:'Customers',id:own.id,data:{Name:'Changed',Route:'Uthukuli'}})),403);
 await ok(await records.DELETE(request({id:own.id},'DELETE')),403);
 await ok(await records.POST(request({kind:'Customers',data:{Name:'Wrong route',Route:'South Tirupur'}})),403);
 await ok(await team.GET(),403);
 const fieldDate=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),gps=()=>({lat:11.17,lng:77.46,accuracy:12,capturedAt:new Date().toISOString()});
 const attend=action=>({Date:fieldDate,Action:action,'GPS data':JSON.stringify(gps())});
 await ok(await records.POST(request({kind:'Visits',data:{Customer:'Shared doctor',Date:fieldDate}})),409);
 await ok(await records.POST(request({kind:'Attendance',data:{Date:fieldDate,Action:'Check in'}})),400);
 await ok(await records.POST(request({kind:'Attendance',data:{Date:fieldDate,Action:'Check in','GPS data':JSON.stringify({...gps(),capturedAt:new Date(Date.now()-300001).toISOString()})}})),400);
 const checkin=await post('Attendance',attend('Check in'));
 await ok(await records.POST(request({kind:'Attendance',data:attend('Check in')})),409);
 await ok(await records.POST(request({kind:'Attendance',id:checkin.id,data:attend('Check out')})),403);
 const visit=await post('Visits',{Customer:'Shared doctor',Date:fieldDate,Purpose:'Order'});
 const commerce=load(path.join(root,'app/api/commerce/route.ts')),benefits=load(path.join(root,'app/api/benefits/route.ts')),closeVisit=load(path.join(root,'app/api/visits/close/route.ts')),whatsapp=load(path.join(root,'app/api/whatsapp/route.ts'));
 const invoice=(kind,stockistId,lines,extra={})=>({id:crypto.randomUUID(),kind,stockistId,date:fieldDate,lines,...extra});
 const qty=(stock,prod)=>sql.prepare('SELECT quantity FROM stock_balances WHERE stockist_id=? AND product_id=?').get(stock,prod)?.quantity||0;
 await ok(await commerce.POST(request(invoice('primary',s1.id,[{productId:product.id,qty:50,scheme:'1'}]))),403);
 identity=owner;
 const primary=invoice('primary',s1.id,[{productId:product.id,qty:50,scheme:'1'},{productId:otherProduct.id,qty:10,scheme:'none'}]);await ok(await commerce.POST(request(primary)));assert.equal(qty(s1.id,product.id),60);assert.equal(qty(s1.id,otherProduct.id),10);
 const primaryStored=sql.prepare('SELECT * FROM invoices WHERE id=?').get(primary.id);assert.equal(primaryStored.total,522500);
 await ok(await commerce.POST(request(primary)));assert.equal(qty(s1.id,product.id),60);
 await ok(await commerce.POST(request(invoice('primary',s2.id,[{productId:product.id,qty:20,scheme:'none'}]))));
 identity=alice;let sales=await ok(await commerce.GET());assert.equal(sales.stock.find(s=>s.product_id===product.id&&s.stockist_id===s1.id).quantity,60);assert(!('rate' in sales.invoices.find(i=>i.id===primary.id).items[0]));
 identity=bob;sales=await ok(await commerce.GET());assert.equal(sales.stock.find(s=>s.product_id===product.id).quantity,60);assert(!sales.stock.some(s=>s.stockist_id===s2.id));
 identity=alice;
 await ok(await commerce.POST(request(invoice('secondary',s2.id,[{productId:product.id,qty:1,scheme:'none'}],{customerId:clinic.id}))),400);
 const order=invoice('secondary',s1.id,[{productId:product.id,qty:10,scheme:'1'},{productId:otherProduct.id,qty:2,scheme:'none'}],{customerId:shared.id,visitId:visit.id,notes:'Customer requests samples',commitments:[{productId:product.id,qty:3,notes:'Deliver during this or next visit'}]});
 await ok(await commerce.POST(request(order)));assert.equal(qty(s1.id,product.id),60);const reservedStock=(await ok(await commerce.GET())).stock.find(s=>s.stockist_id===s1.id&&s.product_id===product.id);assert.equal(reservedStock.reserved,12);assert.equal(reservedStock.available,48);assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='Secondary sales'").get().n,0);
 const approvals=load(path.join(root,'app/api/approvals/route.ts'));identity=owner;await ok(await commerce.PATCH(request({id:order.id,requestId:crypto.randomUUID(),revision:1,action:'status',status:'Delivered'},'PATCH')));identity=alice;assert.equal(qty(s1.id,product.id),48);assert.equal(qty(s1.id,otherProduct.id),8);
 const orderStored=sql.prepare('SELECT * FROM invoices WHERE id=?').get(order.id);assert.equal(orderStored.total,140000);assert.equal(JSON.parse(orderStored.items)[1].rate,7000);
 await ok(await commerce.POST(request(order)));assert.equal(qty(s1.id,product.id),48);
 const failed=invoice('secondary',s1.id,[{productId:product.id,qty:1,scheme:'none'},{productId:otherProduct.id,qty:999,scheme:'none'}],{customerId:shared.id});await ok(await commerce.POST(request(failed)),409);assert.equal(qty(s1.id,product.id),48);assert(!sql.prepare('SELECT id FROM invoices WHERE id=?').get(failed.id));
 await ok(await records.POST(request({kind:'Orders',data:{Date:fieldDate}})),400);
 identity=owner;
 const allocate=(kind,itemId,qty,unitCost,mrEmail=alice.email)=>({id:crypto.randomUUID(),kind,movement:'allocate',itemId,qty,unitCost,mrEmail});
 await ok(await benefits.POST(request(allocate('sample',product.id,10,2))));await ok(await benefits.POST(request(allocate('gift',gift.id,3,100))));
 const balance=(kind,email,id)=>sql.prepare('SELECT * FROM benefit_balances WHERE id=?').get(`${kind}|${email}|${id}`);
 identity=alice;const promise=sql.prepare('SELECT * FROM commitments WHERE invoice_id=?').get(order.id);
 await ok(await closeVisit.POST(request({id:visit.id,gps:null})),400);
 const closure={id:visit.id,gps:gps(),gifts:[{itemId:gift.id,qty:1}],samples:[{itemId:product.id,qty:2,commitmentId:promise.id}]};await ok(await closeVisit.POST(request(closure)));
 assert.equal(balance('gift',alice.email,gift.id).quantity,2);assert.equal(balance('sample',alice.email,product.id).quantity,8);assert.equal(balance('sample',alice.email,product.id).value,1600);assert.equal(sql.prepare('SELECT fulfilled FROM commitments WHERE id=?').get(promise.id).fulfilled,2);
 await ok(await closeVisit.POST(request(closure)));assert.equal(balance('gift',alice.email,gift.id).quantity,2);
 const message=(await ok(await whatsapp.GET())).messages[0];assert.equal(message.status,'awaiting_setup');assert(message.message.includes('Alice Rep'));assert(message.message.includes('Product A'));assert.equal(message.phone,'919876543210');
 const again=await post('Visits',{Customer:'Shared doctor',Date:fieldDate});
 await ok(await closeVisit.POST(request({id:again.id,gps:gps(),gifts:[{itemId:gift.id,qty:1}],samples:[{itemId:product.id,qty:1,commitmentId:promise.id}]})),409);
 assert.equal(balance('sample',alice.email,product.id).quantity,8);assert.equal(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(again.id).data).Status,'Open');
 identity=owner;await post('Gifts',{Name:'Diary','Unit cost':'100','One per customer':'No'},{id:gift.id});
 identity=alice;await ok(await closeVisit.POST(request({id:again.id,gps:gps(),gifts:[{itemId:gift.id,qty:1}],samples:[{itemId:product.id,qty:1,commitmentId:promise.id}]})));assert.equal(sql.prepare('SELECT fulfilled FROM commitments WHERE id=?').get(promise.id).fulfilled,3);
 identity=owner;await post('Gifts',{Name:'Diary','Unit cost':'100','One per customer':'Yes'},{id:gift.id});await makeRep(bob,[r1.id,r2.id],[s1.id]);await ok(await benefits.POST(request(allocate('gift',gift.id,2,100,bob.email))));
 identity=bob;await ok(await benefits.POST(request({id:crypto.randomUUID(),kind:'gift',movement:'issue',itemId:gift.id,qty:1,customerId:shared.id,gps:gps()})),409);assert((await ok(await benefits.GET())).supplied.some(s=>s.item_id===gift.id&&s.customer_id===shared.id));
 identity=alice;const sampleIssue={id:crypto.randomUUID(),kind:'sample',movement:'issue',itemId:product.id,qty:1,customerId:shared.id,gps:gps()};await ok(await benefits.POST(request(sampleIssue)));await ok(await benefits.POST(request(sampleIssue)),409);assert.equal(balance('sample',alice.email,product.id).quantity,6);
 await ok(await benefits.POST(request({...sampleIssue,id:crypto.randomUUID(),qty:100})),409);assert.equal(balance('sample',alice.email,product.id).quantity,6);
 await post('Attendance',attend('Check out'));await ok(await records.POST(request({kind:'Attendance',data:attend('Check out')})),409);await ok(await records.POST(request({kind:'Attendance',data:attend('Check in')})),409);await ok(await records.POST(request({kind:'Visits',data:{Customer:'Shared doctor',Date:fieldDate}})),409);
 await post('Expenses',{Date:fieldDate,Category:'Fuel',Amount:'100',Status:'Submitted'});
 identity=owner;rows=(await ok(await records.GET())).records;assert(rows.some(r=>r.id===ownBob.id));assert(rows.some(r=>r.kind==='Samples'&&r.data['Ledger ID']));
 await ok(await records.DELETE(request({id:product.id},'DELETE')),409);
 // Monthly report uses the full ledger, honours role boundaries, and retains monthly targets.
 const reports=load(path.join(root,'app/api/monthly-report/route.ts'));
 const reportURL=(email=alice.email,month=fieldDate.slice(0,7),summary=false)=>new Request('https://app.test/api/monthly-report?mr='+encodeURIComponent(email)+'&month='+month+(summary?'&summary=1':''));
 await ok(await reports.POST(request({month:fieldDate.slice(0,7),email:alice.email,target:1000})));
 let report=await ok(await reports.GET(reportURL()));assert.equal(report.summary.achieved,134000);assert.equal(report.summary.target,100000);assert.equal(report.summary.percentage,134);assert.equal(report.summary.pending,0);assert.equal(report.summary.exceeded,34000);assert.equal(report.metrics.visits,2);assert.equal(report.metrics.repeatVisits,1);assert.equal(report.metrics.orders,1);
 const agency=report.tables.find(t=>t.title==='Agency stock reconciliation at month end').rows;assert.equal(agency.find(r=>r[0]==='Shared stockist'&&r[1]==='Product A')[6],48);assert.equal(report.tables.find(t=>t.title==='Secondary sales — order and product detail').rows.length,2);assert.equal(report.tables.find(t=>t.title==='Highest order-value customers').rows[0][1],'Shared doctor');
 identity=bob;await ok(await reports.GET(reportURL()),403);await ok(await reports.POST(request({month:fieldDate.slice(0,7),email:bob.email,target:1000})),403);const bobReport=await ok(await reports.GET(reportURL(bob.email)));assert.equal(bobReport.summary.achieved,0);assert(!bobReport.tables.find(t=>t.title==='Primary sales — linked agencies').columns.includes('PTS'));assert(!JSON.stringify(bobReport).includes('Bob doctor:'));const bobStock=bobReport.tables.find(t=>t.title==='Agency stock reconciliation at month end').rows.find(r=>r[1]==='Product A');assert.equal(bobStock[4],12);assert.equal(bobStock[5],0);assert.equal(bobStock[6],48);
 identity=alice;await ok(await reports.GET(reportURL(alice.email,'2026-13')),400);const selfSummary=await ok(await reports.GET(reportURL(alice.email,fieldDate.slice(0,7),true)));assert.equal(selfSummary.summaries.length,1);assert.equal(selfSummary.summaries[0].target,100000);
 identity=null;await ok(await reports.GET(reportURL()),401);identity=owner;
 // Month opening/closing and GST exclusion using a previous-month receipt and next-month issue.
 const {buildReport}=load(path.join(root,'lib/monthly-report.ts'));
 const fixtureMember={...profile,stockist_ids:JSON.stringify(['a'])},line={productId:'p',name:'P',qty:10,free:2,scheme:'1',rate:100,subtotal:1000,total:1100,gst:10};
 const fixtureInvoices=[{id:'before',kind:'primary',date:'2026-08-31',stockist_id:'a',mr_email:'admin',items:[line],subtotal:1000,total:1100},{id:'during',kind:'secondary',date:'2026-09-30',stockist_id:'a',mr_email:alice.email,customer_id:'c',items:[line],subtotal:1000,total:1100},{id:'after',kind:'secondary',date:'2026-10-01',stockist_id:'a',mr_email:alice.email,customer_id:'c',items:[line],subtotal:1000,total:1100}];
 const fixtureMoves=fixtureInvoices.map((i,n)=>({id:String(n),invoice_id:i.id,stockist_id:'a',product_id:'p',quantity:n===0?30:-12,created:i.date}));
 const monthly=buildReport(fixtureMember,'2026-09',[],fixtureInvoices,fixtureMoves,[],[],true);assert.equal(monthly.summary.achieved,1000);assert.deepEqual(monthly.tables.find(t=>t.title==='Agency stock reconciliation at month end').rows[0],['a','p',30,0,12,12,18]);
 console.log('PASS: monthly report permissions, saved targets, GST exclusion, no double counting, repeat visits, shared-agency reconciliation, PTS hiding and month boundaries.');
 // Order revisions adjust stock and summaries atomically; older queued messages are superseded.
 await ok(await whatsapp.POST(request({adminPhone:'9944472488'})));await post('Stockists',{Name:'Shared stockist',Phone:'9876543211','WhatsApp number':'9876543212'},{id:s1.id});
 const edit={id:order.id,requestId:crypto.randomUUID(),revision:2,lines:[{productId:product.id,qty:5,scheme:'none'},{productId:otherProduct.id,qty:2,scheme:'none'}],notes:'Reduced order'};
 identity=bob;await ok(await commerce.PATCH(request(edit,'PATCH')),403);identity=alice;assert((await ok(await commerce.PATCH(request(edit,'PATCH')))).pendingApproval);assert.equal(qty(s1.id,product.id),48);identity=owner;let approvalView=await ok(await approvals.GET());await ok(await commerce.PATCH(request({action:'approve',requestId:edit.requestId,hash:approvalView.hash},'PATCH')));identity=alice;assert.equal(qty(s1.id,product.id),55);assert.equal(sql.prepare('SELECT subtotal FROM invoices WHERE id=?').get(order.id).subtotal,74000);
 await ok(await commerce.PATCH(request(edit,'PATCH')));assert.equal(qty(s1.id,product.id),55);await ok(await commerce.PATCH(request({...edit,requestId:crypto.randomUUID()},'PATCH')),409);
 const badEdit={...edit,requestId:crypto.randomUUID(),revision:3,lines:[{productId:product.id,qty:1,scheme:'none'},{productId:otherProduct.id,qty:999,scheme:'none'}]};assert((await ok(await commerce.PATCH(request(badEdit,'PATCH')))).pendingApproval);identity=owner;approvalView=await ok(await approvals.GET());await ok(await commerce.PATCH(request({action:'approve',requestId:badEdit.requestId,hash:approvalView.hash},'PATCH')),409);await ok(await commerce.PATCH(request({action:'reject',requestId:badEdit.requestId,reason:'Insufficient stock'},'PATCH')));identity=alice;assert.equal(qty(s1.id,product.id),55);assert.equal(sql.prepare('SELECT revision FROM invoices WHERE id=?').get(order.id).revision,3);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM order_edits WHERE invoice_id=?').get(order.id).n,2);
 const editedReport=await ok(await reports.GET(reportURL()));assert.equal(editedReport.summary.achieved,74000);assert.equal(editedReport.metrics.primary,680000);const editedStock=editedReport.tables.find(t=>t.title==='Agency stock reconciliation at month end').rows.find(r=>r[0]==='Shared stockist'&&r[1]==='Product A');assert.equal(editedStock[3],60);assert.equal(editedStock[4],5);assert.equal(editedStock[6],55);assert(editedReport.tables.find(t=>t.title==='Field activity — complete recorded details').webOnly);
 const queued=sql.prepare('SELECT * FROM whatsapp_outbox WHERE id LIKE ?').all('order:'+order.id+':%');assert.equal(queued.length,6);assert.equal(queued.filter(q=>q.status==='superseded').length,4);assert.equal(queued.find(q=>q.id.endsWith(':3:agency')).phone,'919876543212');assert.equal(queued.find(q=>q.id.endsWith(':3:admin')).phone,'919944472488');assert(queued.find(q=>q.id.endsWith(':3:admin')).message.includes('UPDATED MR order'));
 const insights=load(path.join(root,'lib/route-insights.ts'));const customerFixture=(id,route)=>({id,kind:'Customers',owner:fixtureMember.user_id,assigned_to:alice.email,created:'2026-01-01',data:{Name:id,Route:route}});const activityFixture=(id,customer,date)=>({id,kind:'Visits',assigned_to:alice.email,created:date,data:{Date:date,'Customer ID':customer}});
 const ri=insights.routeInsights(fixtureMember,'2026-09','2026-08',2,[customerFixture('never','R1'),customerFixture('no-order','R1'),customerFixture('dormant','R2'),customerFixture('active','R2'),activityFixture('v1','no-order','2026-09-02'),activityFixture('v2','active','2026-09-03')],[{id:'old',kind:'secondary',mr_email:alice.email,customer_id:'dormant',date:'2026-06-30',subtotal:10000,number:'OLD'},{id:'prev',kind:'secondary',mr_email:alice.email,customer_id:'active',date:'2026-08-10',subtotal:10000,number:'PREV'},{id:'new',kind:'secondary',mr_email:alice.email,customer_id:'active',date:'2026-09-10',subtotal:20000,number:'NEW'}]);
 assert(ri.tables[1].rows.some(r=>r[0]==='never'));assert(ri.tables[2].rows.some(r=>r[0]==='no-order'));assert.equal(ri.tables[3].rows.length,1);assert.equal(ri.tables[3].rows[0][0],'dormant');assert.equal(ri.tables[0].rows.find(r=>r[0]==='R2')[9],'100.0%');
 const routeAPI=load(path.join(root,'app/api/route-performance/route.ts'));identity=bob;await ok(await routeAPI.GET(reportURL()),403);identity=owner;
 console.log('PASS: editable orders, idempotent revisions, atomic stock rollback, corrected reports, agency/Admin queues, PDF appendix flag and route/inactivity analysis.');
 // Unaccepted edits preserve original prices; repricing is an explicit reviewed request.
 identity=alice;const flexible=invoice('secondary',s2.id,[{productId:product.id,qty:2,scheme:'none'}],{customerId:own.id});await ok(await commerce.POST(request(flexible)));assert.equal(qty(s2.id,product.id),20);
 identity=owner;const productData=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(product.id).data);await post('Products',{...productData,PTR:'150'},{id:product.id});
 identity=alice;await ok(await commerce.PATCH(request({id:flexible.id,requestId:crypto.randomUUID(),revision:1,lines:[{productId:product.id,qty:3,scheme:'none'}],notes:'Keep rate'},'PATCH')));assert.equal(sql.prepare('SELECT subtotal FROM invoices WHERE id=?').get(flexible.id).subtotal,36000);
 const repricing={id:flexible.id,requestId:crypto.randomUUID(),revision:2,lines:[{productId:product.id,qty:3,scheme:'none'}],notes:'Reprice',reprice:true};assert((await ok(await commerce.PATCH(request(repricing,'PATCH')))).pendingApproval);identity=owner;const stalePreview=await ok(await approvals.GET());await post('Products',{...productData,PTR:'160'},{id:product.id});await ok(await commerce.PATCH(request({action:'approve',requestId:repricing.requestId,hash:stalePreview.hash},'PATCH')),409);approvalView=await ok(await approvals.GET());await ok(await commerce.PATCH(request({action:'approve',requestId:repricing.requestId,hash:approvalView.hash},'PATCH')));assert.equal(sql.prepare('SELECT subtotal FROM invoices WHERE id=?').get(flexible.id).subtotal,48000);
 await ok(await commerce.PATCH(request({id:flexible.id,requestId:crypto.randomUUID(),revision:3,action:'accept'},'PATCH')));identity=alice;await ok(await commerce.PATCH(request({id:flexible.id,requestId:crypto.randomUUID(),revision:4,action:'status',status:'Cancelled',reason:'Cancellation test confirmed'},'PATCH')),403);identity=owner;await ok(await commerce.PATCH(request({id:flexible.id,requestId:crypto.randomUUID(),revision:4,action:'status',status:'Cancelled',reason:'Cancellation test confirmed'},'PATCH')));assert.equal(qty(s2.id,product.id),20);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM stock_reservations WHERE order_id=?').get(flexible.id).n,0);
 // Duplicate doctor access is approved for a requested route without creating another doctor.
 const duplicate=await post('Customers',{Name:'Protected doctor',Route:'Perundurai','Mobile 1':'9780012345','Registration no':'REG-123'},{assignedTo:alice.email});identity=bob;const countBefore=sql.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='Customers'").get().n;
 const accessResult=await post('Customers',{Name:'Different spelling',Route:'South Tirupur','Mobile 1':'9780012345'});assert(accessResult.accessRequested);assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='Customers'").get().n,countBefore);assert(!(await ok(await records.GET())).records.some(c=>c.id===duplicate.id));const accessRequest=sql.prepare("SELECT * FROM workflow_requests WHERE kind='customer_access' AND mr_email=? AND status='Pending'").get(bob.email);await ok(await approvals.POST(request({id:accessRequest.id,action:'approve'})),403);identity=owner;await ok(await approvals.POST(request({id:accessRequest.id,action:'approve'})));identity=bob;const sharedDoctor=(await ok(await records.GET())).records.find(c=>c.id===duplicate.id);assert.equal(sharedDoctor.data.Route,'South Tirupur');assert(!sharedDoctor.data['MR route access']);await ok(await records.POST(request({id:duplicate.id,kind:'Customers',data:{Name:'Overwrite',Route:'South Tirupur'}})),403);
 // Follow-up dates persist and another MR cannot alter them.
 const follow=load(path.join(root,'app/api/followups/route.ts'));const nextAction={mrEmail:bob.email,customerId:duplicate.id,source:'manual-test',due:fieldDate,notes:'Discuss next order',status:'Open'};await ok(await follow.POST(request(nextAction)));const followed=await ok(await follow.GET(new Request('https://app.test/api/followups')));assert(followed.items.some(i=>i.customerId===duplicate.id&&i.due===fieldDate&&i.saved));identity=alice;await ok(await follow.POST(request(nextAction)),403);identity=bob;await ok(await follow.POST(request({...nextAction,status:'Done'})));
 // Close a completed month: block backdated creation, editing, stock and target changes; preserve approved snapshot.
 identity=owner;const periods=load(path.join(root,'app/api/periods/route.ts')),previousMonth=insights.shiftMonth(fieldDate.slice(0,7),-1),historicalDate=previousMonth+'-15';sql.prepare('UPDATE invoices SET date=? WHERE id=?').run(historicalDate,order.id);sql.prepare("UPDATE records SET data=json_set(data,'$.Date',?) WHERE json_extract(data,'$.\"Invoice ID\"')=?").run(historicalDate,order.id);
 await ok(await reports.POST(request({month:previousMonth,email:alice.email,target:1234})));
 let review=await ok(await periods.POST(request({action:'review',month:previousMonth})));await post('Products',{...productData,PTR:'170'},{id:product.id});await ok(await periods.POST(request({action:'close',month:previousMonth,hash:review.hash})),409);review=await ok(await periods.POST(request({action:'review',month:previousMonth})));await ok(await periods.POST(request({action:'close',month:previousMonth,hash:review.hash})));
 const archived=await ok(await reports.GET(reportURL(alice.email,previousMonth)));assert(archived.closed);assert.equal(archived.summary.target,123400);await ok(await reports.POST(request({month:previousMonth,email:alice.email,target:9999})),409);await ok(await commerce.POST(request({...invoice('primary',s1.id,[{productId:product.id,qty:1,scheme:'none'}]),date:historicalDate})),409);await ok(await commerce.PATCH(request({id:order.id,requestId:crypto.randomUUID(),revision:3,action:'status',status:'Cancelled',reason:'Cancellation test confirmed'},'PATCH')),409);
 await post('Customers',{Name:'Protected doctor renamed',Route:'Perundurai','Mobile 1':'9780012345','Registration no':'REG-123'},{id:duplicate.id,assignedTo:alice.email});assert.deepEqual(await ok(await reports.GET(reportURL(alice.email,previousMonth))),archived);
 identity=alice;await ok(await periods.POST(request({action:'reopen',month:previousMonth,reason:'Fix month'})),403);const archivedMR=await ok(await reports.GET(reportURL(alice.email,previousMonth)));assert(!archivedMR.tables.find(t=>t.title==='Primary sales — linked agencies').columns.includes('PTS'));identity=owner;await ok(await periods.POST(request({action:'reopen',month:previousMonth,reason:'Reviewed correction requested'})));await ok(await reports.POST(request({month:previousMonth,email:alice.email,target:2000})));
 console.log('PASS: reservations/delivery/cancellation, saved-rate edits and explicit repricing approval, stale review protection, duplicate route grants, follow-up persistence, immutable month snapshots, close/reopen permissions and period write locks.');
 // Admin hub: real permissions, immutable comparison values, access revocation and audit rollback.
 const hub=load(path.join(root,'app/api/admin-hub/route.ts')),access=load(path.join(root,'app/api/customer-access/route.ts'));
 const hubURL=(params='')=>new Request('https://app.test/api/admin-hub?'+params);
 identity=bob;await ok(await hub.GET(hubURL()),403);await ok(await access.GET(),403);await ok(await access.POST(request({customerId:ownBob.id,email:bob.email,action:'revoke',reason:'Unauthorized'})),403);
 identity=owner;let overview=await ok(await hub.GET(hubURL('month='+previousMonth)));const aCompare=overview.comparison.find(m=>m.email===alice.email);assert.equal(aCompare.achieved,74000);assert.equal(aCompare.target,200000);assert.equal(aCompare.orderingCustomers,1);assert(overview.months.some(m=>m.month===previousMonth));
 let aProfile=await ok(await hub.GET(hubURL('mode=profile&mr='+encodeURIComponent(alice.email))));assert(aProfile.routes.includes('Perundurai'));assert(aProfile.stock.some(s=>s.stockist_id===s2.id));assert(aProfile.customers.some(c=>c.id===own.id));assert.equal(aProfile.comparison.sampleCost,800);assert.equal(aProfile.comparison.giftCost,20000);
 const stockView=overview.stock.find(s=>s.stockist_id===s1.id&&s.product_id===product.id);assert.equal(stockView.available,stockView.quantity-stockView.reserved);
 const beforeAccessCount=sql.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='Customers'").get().n;
 await ok(await access.POST(request({customerId:ownBob.id,email:bob.email,action:'revoke',reason:'Territory reassigned'})));
 identity=bob;assert(!(await ok(await records.GET())).records.some(r=>r.id===ownBob.id));await ok(await commerce.POST(request(invoice('secondary',s1.id,[{productId:product.id,qty:1,scheme:'none'}],{customerId:ownBob.id}))),403);
 identity=owner;const auditCount=()=>sql.prepare('SELECT COUNT(*) AS n FROM admin_audit').get().n;let auditBefore=auditCount();await ok(await access.POST(request({customerId:ownBob.id,email:bob.email,action:'grant',routeId:r3.id,reason:'Wrong assigned route'})),400);assert.equal(auditCount(),auditBefore);
 await ok(await access.POST(request({customerId:ownBob.id,email:bob.email,action:'grant',routeId:r2.id,reason:'Coverage approved'})));identity=bob;rows=(await ok(await records.GET())).records;assert(rows.some(r=>r.id===ownBob.id));assert(!('Blocked MRs' in rows.find(r=>r.id===ownBob.id).data));
 identity=owner;await ok(await access.POST(request({customerId:shared.id,email:bob.email,action:'revoke',reason:'Shared route exception'})));identity=bob;assert(!(await ok(await records.GET())).records.some(r=>r.id===shared.id));identity=owner;await ok(await access.POST(request({customerId:shared.id,email:bob.email,action:'grant',routeId:r1.id,reason:'Shared route restored'})));assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='Customers'").get().n,beforeAccessCount);
 const missingReasonProduct=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(product.id).data);auditBefore=auditCount();await ok(await records.POST(request({kind:'Products',id:product.id,data:{...missingReasonProduct,PTR:'999'}})),400);assert.equal(auditCount(),auditBefore);
 const history=await ok(await hub.GET(hubURL('mode=audit')));assert(history.events.some(e=>e.action==='Customer access revoked'&&e.reason==='Territory reassigned'&&e.actor_email===owner.email));assert(history.events.some(e=>e.action==='Order repricing approved'));assert(history.events.some(e=>e.action==='Month reopened'));assert(history.events.every(e=>e.actor_email===owner.email&&e.reason&&e.created));
 const impact=load(path.join(root,'lib/approval-preview.ts')).stockImpact,previous=[{productId:'p',name:'P',qty:10,free:2}],proposed=[{productId:'p',name:'P',qty:5,free:1},{productId:'q',name:'Q',qty:2,free:0}],balances=[{stockist_id:'s',product_id:'p',quantity:50,reserved:15},{stockist_id:'s',product_id:'q',quantity:10,reserved:0}];
 let deltas=impact({stockist_id:'s',status:'Placed',items:JSON.stringify(previous)},proposed,balances);assert.equal(deltas[0].physicalAfter,50);assert.equal(deltas[0].reservedAfter,9);assert.equal(deltas[0].availableAfter,41);assert.equal(deltas[1].availableAfter,8);
 deltas=impact({stockist_id:'s',status:'Delivered',items:JSON.stringify(previous)},[],balances);assert.equal(deltas[0].physicalAfter,62);assert.equal(deltas[0].availableAfter,47);
 const overdueLib=load(path.join(root,'lib/admin-overview.ts'));assert.deepEqual(overdueLib.pendingMonths('2026-04-01',[],[{date:'2026-01-01',kind:'secondary',status:'Placed'}],[{month:'2026-02',closed:1}]).map(m=>m.month),['2026-01','2026-03']);
 const mrFixture=sql.prepare('SELECT * FROM members WHERE email=?').get(bob.email),recordFixture=sql.prepare('SELECT * FROM records').all().map(r=>({...r,data:JSON.parse(r.data)}));assert.equal(overdueLib.overdueActions('2026-04-01',[mrFixture],recordFixture,[{mr_email:bob.email,customer_id:ownBob.id,status:'Open',due:'2026-03-30',source:'manual',id:'task'}]).length,1);
 const archiveFixture={summary:{target:11100,achieved:5500,pending:5600,percentage:49.55},metrics:{visits:8,repeatVisits:3},tables:[{title:'Highest order-value customers',rows:[[],[]]},{title:'Samples and gifts — allocation, usage and closing balance',rows:[['sample','P',0,0,0,0,0,'₹12.50'],['gift','G',0,0,0,0,0,'₹100.00']]}]};const frozen=overdueLib.comparison(mrFixture,'2026-01',[],[],[],archiveFixture);assert.equal(frozen.target,11100);assert.equal(frozen.visits,8);assert.equal(frozen.orderingCustomers,2);assert.equal(frozen.sampleCost,1250);assert.equal(frozen.giftCost,10000);
 console.log('PASS: Admin hub and profile permissions, comparison totals, stock preview including removed lines, grant/revoke creator and shared access, no duplicate customers, price-change reasons, audit trail and rejected-change rollback.');
 // MR drafts, customer history and request-to-allot flow.
 const draftsAPI=load(path.join(root,'app/api/drafts/route.ts')),historyAPI=load(path.join(root,'app/api/customer-history/route.ts')),requestsAPI=load(path.join(root,'app/api/allotment-requests/route.ts'));
 identity=owner;await ok(await draftsAPI.GET(),403);identity=alice;
 const draftOrder={id:crypto.randomUUID(),kind:'order',revision:0,payload:{customerId:own.id,customerName:'Alice doctor',stockistId:s2.id,date:fieldDate,notes:'Draft only',visitId:'',lines:[{productId:product.id,qty:1,scheme:'none'}],promises:[]}};
 const oldPhysical=qty(s2.id,product.id),oldReservations=sql.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n;assert.equal((await ok(await draftsAPI.POST(request(draftOrder)))).revision,1);assert.equal(qty(s2.id,product.id),oldPhysical);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n,oldReservations);assert((await ok(await draftsAPI.GET())).drafts.some(d=>d.id===draftOrder.id));
 await ok(await draftsAPI.POST(request({...draftOrder,payload:{...draftOrder.payload,notes:'Stale'}})),409);
 identity=bob;assert(!(await ok(await draftsAPI.GET())).drafts.some(d=>d.id===draftOrder.id));await ok(await draftsAPI.POST(request({...draftOrder,revision:1})),403);await ok(await draftsAPI.DELETE(request({id:draftOrder.id,revision:1},'DELETE')),404);identity=alice;
 await ok(await commerce.POST(request({...invoice('secondary',s2.id,draftOrder.payload.lines,{customerId:own.id}),id:draftOrder.id})));assert(!(await ok(await draftsAPI.GET())).drafts.some(d=>d.id===draftOrder.id));await ok(await draftsAPI.POST(request({...draftOrder,revision:1})),409);assert.equal(qty(s2.id,product.id),oldPhysical);assert.equal(sql.prepare('SELECT subtotal FROM invoices WHERE id=?').get(draftOrder.id).subtotal,17000); // Current PTR, not a copied historical rate.
 const discardDraft={...draftOrder,id:crypto.randomUUID()};await ok(await draftsAPI.POST(request(discardDraft)));await ok(await draftsAPI.DELETE(request({id:discardDraft.id,revision:1},'DELETE')));await ok(await draftsAPI.POST(request({...discardDraft,revision:2})),409);
 const noteDraft={id:crypto.randomUUID(),kind:'visit',revision:0,payload:{form:{Customer:'Alice doctor',Date:fieldDate,Notes:'Unfinished note','GPS data':'old-location'}}};await ok(await draftsAPI.POST(request(noteDraft)));assert(!JSON.parse(sql.prepare('SELECT payload FROM mr_drafts WHERE id=?').get(noteDraft.id).payload).form['GPS data']);await ok(await records.POST(request({kind:'Visits',draftId:noteDraft.id,data:{Customer:'Alice doctor',Date:fieldDate,Notes:'Resume'}})),409);assert((await ok(await draftsAPI.GET())).drafts.some(d=>d.id===noteDraft.id)); // Checkout must still block recording visits.
 const historyResponse=await ok(await historyAPI.GET(new Request('https://app.test/api/customer-history?customer='+shared.id)));assert(historyResponse.visits.length>=2);assert(historyResponse.orders.every(o=>o.mr_email===alice.email));assert(historyResponse.issues.every(i=>i.mr_email===alice.email));assert(!JSON.stringify(historyResponse).includes('MR route access'));
 identity=bob;await ok(await historyAPI.GET(new Request('https://app.test/api/customer-history?customer='+own.id)),403);identity=owner;await ok(await access.POST(request({customerId:shared.id,email:alice.email,action:'revoke',reason:'History access test'})));identity=alice;await ok(await historyAPI.GET(new Request('https://app.test/api/customer-history?customer='+shared.id)),403);identity=owner;await ok(await access.POST(request({customerId:shared.id,email:alice.email,action:'grant',routeId:r1.id,reason:'Restore history access'})));
 identity=bob;const beforeSample=balance('sample',bob.email,product.id)?.quantity||0,allotRequest={action:'request',id:crypto.randomUUID(),kind:'sample',itemId:product.id,qty:4,purpose:'Route demonstration samples'};await ok(await requestsAPI.POST(request(allotRequest)));await ok(await requestsAPI.POST(request(allotRequest)));assert.equal(balance('sample',bob.email,product.id)?.quantity||0,beforeSample);await ok(await requestsAPI.POST(request({id:allotRequest.id,action:'allot',qty:4,unitCost:2,reason:'Self approval'})),403);
 identity=alice;assert(!(await ok(await requestsAPI.GET())).requests.some(r=>r.id===allotRequest.id));identity=owner;assert(!(await ok(await approvals.GET())).requests.some(r=>r.id===allotRequest.id));await ok(await requestsAPI.POST(request({id:allotRequest.id,action:'allot',qty:3,unitCost:2,reason:'Approved route quantity'})));assert.equal(balance('sample',bob.email,product.id).quantity,beforeSample+3);await ok(await requestsAPI.POST(request({id:allotRequest.id,action:'allot',qty:3,unitCost:2,reason:'Duplicate review'})),409);assert.equal(balance('sample',bob.email,product.id).quantity,beforeSample+3);
 identity=bob;const rejectRequest={...allotRequest,id:crypto.randomUUID(),kind:'gift',itemId:gift.id};await ok(await requestsAPI.POST(request(rejectRequest)));identity=owner;const beforeGift=balance('gift',bob.email,gift.id).quantity;await ok(await requestsAPI.POST(request({id:rejectRequest.id,action:'reject',reason:'Use existing balance first'})));assert.equal(balance('gift',bob.email,gift.id).quantity,beforeGift);
 identity=bob;await post('Attendance',attend('Check in'));const visitDraftBody={id:crypto.randomUUID(),kind:'visit',revision:0,payload:{form:{Customer:'Bob doctor',Date:fieldDate,Notes:'Resume visit'}}};await ok(await draftsAPI.POST(request(visitDraftBody)));const newVisit=await ok(await records.POST(request({kind:'Visits',draftId:visitDraftBody.id,data:visitDraftBody.payload.form})));assert.equal(newVisit.id,visitDraftBody.id);await ok(await records.POST(request({kind:'Visits',draftId:visitDraftBody.id,data:visitDraftBody.payload.form})));assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM records WHERE id=?').get(newVisit.id).n,1);assert(!(await ok(await draftsAPI.GET())).drafts.some(d=>d.id===newVisit.id));await ok(await records.POST(request({kind:'Attendance',data:attend('Check out')})),409);
 const closeDraft={id:crypto.randomUUID(),kind:'visit_close',revision:0,payload:{visitId:newVisit.id,customerName:'Bob doctor',gifts:[],samples:[],notes:'Closing note draft'}};await ok(await draftsAPI.POST(request(closeDraft)));await ok(await closeVisit.POST(request({id:newVisit.id,gps:gps(),gifts:[],samples:[],notes:'Closing note draft'})));assert(!(await ok(await draftsAPI.GET())).drafts.some(d=>d.id===closeDraft.id));await ok(await draftsAPI.POST(request({...closeDraft,revision:1})),409);await post('Attendance',attend('Check out'));identity=owner;
 console.log('PASS: isolated durable drafts, stale-save protection, no stock effects until order placement, current repeat-order rates, visit draft idempotency, checkout and fresh GPS gates, own-customer history, and one-time Admin request allotments/rejections.');
 // Attendance calendar: recorded historical GPS, missing actions, duplicates and future dates.
 const attendanceLib=load(path.join(root,'lib/attendance.ts')),attendanceAPI=load(path.join(root,'app/api/attendance/route.ts'));
 const attMember={...profile,email:'calendar@example.test',user_id:'calendar-user'},attDate='2024-02-01';
 const attRecord=(day,action,gps=true,time=action==='Check in'?'03:30':'12:30')=>({kind:'Attendance',assigned_to:attMember.email,owner:attMember.user_id,created:`2024-02-${String(day).padStart(2,'0')}T${time}:00Z`,data:{Date:`2024-02-${String(day).padStart(2,'0')}`,Action:action,Time:time,'GPS data':gps?JSON.stringify({lat:11.17,lng:77.46,accuracy:12,capturedAt:`2024-02-${String(day).padStart(2,'0')}T${time}:00Z`}):''}});
 const attRecords=[attRecord(1,'Check in'),attRecord(1,'Check out'),attRecord(2,'Check in'),attRecord(3,'Check out'),attRecord(4,'Check in'),attRecord(4,'Check out',false),attRecord(5,'Check in'),attRecord(5,'Check in'),attRecord(5,'Check out'),attRecord(6,'Check in'),attRecord(6,'Check out',true,'02:30'),{...attRecord(7,'Check in'),assigned_to:bob.email}];
 const calendar=attendanceLib.attendanceMonth(attMember,'2024-02',attRecords,'2024-02-10');assert.equal(calendar.days.length,29);assert.equal(calendar.days[0].status,'complete');assert.equal(calendar.days[0].duration,'9h 0m');assert.equal(calendar.days[1].status,'partial');assert.equal(calendar.days[2].label,'Missing check-in');assert.equal(calendar.days[3].status,'gps_missing');assert.equal(calendar.days[4].status,'review');assert.equal(calendar.days[5].label,'Checkout before check-in');assert.equal(calendar.days[6].status,'missing');assert.equal(calendar.days[10].status,'future');assert.equal(calendar.summary.complete,1);assert.equal(calendar.summary.upcoming,19);assert.equal(attendanceLib.recordedGPS({'GPS data':JSON.stringify({lat:100,lng:77,accuracy:1,capturedAt:attDate+'T03:30:00Z'})},attDate),null);
 identity=alice;await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month='+fieldDate.slice(0,7))),403);identity=owner;await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month=2026-99')),400);const adminAttendance=await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month='+fieldDate.slice(0,7)+'&mr='+encodeURIComponent(bob.email))));assert.equal(adminAttendance.attendance.length,1);assert.equal(adminAttendance.attendance[0].email,bob.email);assert.equal(adminAttendance.attendance[0].days.find(d=>d.date===fieldDate).status,'complete');
 const districtAttendance=await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month='+fieldDate.slice(0,7)+'&district='+d2.id)));assert(districtAttendance.attendance.some(m=>m.email===alice.email));assert(!districtAttendance.attendance.some(m=>m.email===bob.email));
 const reportLayouts=load(path.join(root,'lib/report-layout.ts'));assert.equal(reportLayouts.cellTone('Complete · GPS verified'),'complete');assert.equal(reportLayouts.cellTone('Missing checkout'),'missing');assert(reportLayouts.numericColumn('Net sales'));assert(!reportLayouts.numericColumn('Order number'));
 console.log('PASS: Admin-only monthly attendance, district/MR filtering, historical GPS completion, missing check-in/out, invalid GPS, duplicate and reversed entries, leap months, future-date neutrality and PDF status formatting.');
 await ok(await team.POST(request({email:alice.email,name:'Alice Rep',target:400000,status:'disabled'})));
 await ok(await benefits.POST(request({id:crypto.randomUUID(),kind:'sample',movement:'return',itemId:product.id,mrEmail:alice.email,qty:1})));assert.equal(balance('sample',alice.email,product.id).quantity,5);assert((await ok(await records.GET())).records.some(r=>r.kind==='Samples'&&r.data.Movement==='Returned'&&r.data['Ledger ID']));
 console.log('PASS: multi-route/district assignments, route-based customer access, MR create-only customers, mandatory fresh GPS, one check-in/out, shared stock, multi-line atomic invoices, PTS/PTR/retail pricing, schemes, stock isolation, gift repeat rules across MRs, costs, sample commitments, close-once visits and truthful WhatsApp outbox.');
 // Exercise actual password/session endpoints without the business-test session fixtures.
 const login=load(path.join(root,'app/api/auth/login/route.ts')),logout=load(path.join(root,'app/api/auth/logout/route.ts')),password=load(path.join(root,'app/api/auth/password/route.ts'));
 const passwords=load(path.join(root,'lib/passwords.ts'));
 browserCookie='';
 await ok(await session.GET(),401);await ok(await records.GET(),401);await ok(await team.GET(),401);await ok(await inbox.GET(),401);
 await ok(await records.POST(request({kind:'Customers',data:{Name:'Anonymous'}})),401);
 await ok(await login.POST(request({username:'bob',password:'wrong-password'})),401);
 await ok(await login.POST(request({username:'bob',password:'Test-only-password-456'},'POST','https://evil.test')),403);
 let signed=await login.POST(request({username:'bob',password:'Test-only-password-456'}));await ok(signed);let cookie=signed.headers.get('set-cookie');assert(cookie.includes('HttpOnly')&&cookie.includes('Secure')&&cookie.includes('SameSite=Strict'));
 browserCookie=cookie.split(';')[0];assert.equal((await ok(await session.GET())).member.email,bob.email);await ok(await team.GET(),403);
 await ok(await testMR.POST(request({enabled:true})),410);
 await ok(await password.POST(request({currentPassword:'wrong',newPassword:'New-test-password-789'})),400);
 await ok(await password.POST(request({currentPassword:'Test-only-password-456',newPassword:'New-test-password-789'})));
 await ok(await session.GET(),401);browserCookie='';
 await ok(await login.POST(request({username:'bob',password:'Test-only-password-456'})),401);
 signed=await login.POST(request({username:'bob',password:'New-test-password-789'}));await ok(signed);browserCookie=signed.headers.get('set-cookie').split(';')[0];
 assert.equal((await ok(await session.GET())).member.role,'mr');
 const logOutRequest=new Request('https://app.test/api/auth/logout',{method:'POST',headers:{origin:'https://app.test',cookie:browserCookie}});await ok(await logout.POST(logOutRequest));await ok(await session.GET(),401);
 browserCookie='';await ok(await login.POST(request({username:'alice',password:'Test-only-password-456'})),401);
 for(let i=0;i<10;i++)await ok(await login.POST(request({username:'missing',password:'No-account-password'})),401);
 await ok(await login.POST(request({username:'missing',password:'No-account-password'})),429);
 // Admin password reset revokes a real MR session and never returns hashes.
 sql.prepare('UPDATE credentials SET password_hash=? WHERE username=?').run(await passwords.passwordHash('Admin-test-password-789'),'admin');
 signed=await login.POST(request({username:'bob',password:'New-test-password-789'}));await ok(signed);const bobCookie=signed.headers.get('set-cookie').split(';')[0];
 signed=await login.POST(request({username:'admin',password:'Admin-test-password-789'}));await ok(signed);browserCookie=signed.headers.get('set-cookie').split(';')[0];
 const members=(await ok(await team.GET())).members;assert(members.every(m=>!m.password_hash));
 await ok(await team.POST(request({email:bob.email,username:'bob',password:'Reset-test-password-123',name:'Bob Rep',target:400000,status:'active'})));
 await ok(await team.POST(request({username:'newmr',password:'Initial-test-password',name:'New Rep',target:400000,status:'active'})));
 await ok(await team.POST(request({username:'newmr',email:'duplicate@example.test',password:'Initial-test-password',name:'Duplicate Rep',target:400000,status:'active'})),409);
 browserCookie=bobCookie;await ok(await session.GET(),401);
 browserCookie='';signed=await login.POST(request({username:'newmr',password:'Initial-test-password'}));await ok(signed);browserCookie=signed.headers.get('set-cookie').split(';')[0];assert.equal((await ok(await session.GET())).member.role,'mr');
 console.log('PASS: independent login, forged ChatGPT headers rejected, anonymous access denied, role enforcement, rate limits, password changes, logout, disabled accounts, username uniqueness, admin resets and session revocation.');

 // Calendar month restrictions apply to direct edits, approval requests and cancellations.
 browserCookie=null;
 const monthOrder=sql.prepare("SELECT * FROM invoices WHERE kind='secondary' AND status<>'Cancelled' LIMIT 1").get();
 const savedDate=monthOrder.date;
 const savedStatus=sql.prepare('SELECT status FROM members WHERE email=?').get(monthOrder.mr_email).status;
 sql.prepare("UPDATE members SET status='active' WHERE email=?").run(monthOrder.mr_email);
 identity={email:monthOrder.mr_email};
 for(const date of ['2020-01-15','2099-12-15']){
  sql.prepare('UPDATE invoices SET date=? WHERE id=?').run(date,monthOrder.id);
  for(const action of ['edit','status'])await ok(await commerce.PATCH(request({id:monthOrder.id,revision:monthOrder.revision,requestId:crypto.randomUUID(),action,status:'Cancelled',reason:'Month restriction test',lines:[],reprice:true})),409);
  assert((await ok(await commerce.GET())).invoices.find(i=>i.id===monthOrder.id).changeBlockReason.includes('original order month'));
 }
 sql.prepare('UPDATE invoices SET date=? WHERE id=?').run(fieldDate,monthOrder.id);
 sql.prepare("INSERT INTO period_locks(month,closed,closure_id,updated,admin_email,reason) VALUES (?,1,'test-lock',?,?,?)").run(fieldDate.slice(0,7),new Date().toISOString(),owner.email,'Current-month lock test');
 for(const who of [identity,owner]){identity=who;await ok(await commerce.PATCH(request({id:monthOrder.id,revision:monthOrder.revision,requestId:crypto.randomUUID(),action:'status',status:'Cancelled',reason:'Locked month'})),409);assert((await ok(await commerce.GET())).invoices.find(i=>i.id===monthOrder.id).changeBlockReason.includes('locked'));}
 sql.prepare('DELETE FROM period_locks WHERE month=?').run(fieldDate.slice(0,7));
 sql.prepare('UPDATE invoices SET date=? WHERE id=?').run(savedDate,monthOrder.id);
 sql.prepare('UPDATE members SET status=? WHERE email=?').run(savedStatus,monthOrder.mr_email);
 const policy=load(path.join(root,'lib/order-edit-policy.ts')).orderChangeBlock;
 assert.equal(policy('mr','2026-10-01','2026-10-31'), '');
 assert(policy('mr','2026-09-30','2026-10-01'));
 assert.equal(policy('admin','2026-09-30','2026-10-01'), '');
 assert(policy('admin','2026-09-30','2026-10-01',['2026-09']));
 console.log('PASS: MR past/future-month edits, approval requests and cancellations blocked; locked-month controls and API blocked for MR/Admin.');
 if(process.env.MONGO_TEST_MODE!=='model'){
  const native=load(path.join(root,'lib/mongo/database.ts')).mongoDatabase;
  const {availableGuard}=load(path.join(root,'lib/order-stock.ts'));
  await native.prepare('INSERT INTO stock_balances(id,stockist_id,product_id,quantity) VALUES (?,?,?,?)').bind('race|p','race','p',10).run();
  const reserve=(id)=>native.batch([native.prepare('INSERT INTO stock_reservations(id,order_id,stockist_id,product_id,quantity) VALUES (?,?,?,?,?)').bind(id,id,'race','p',7),availableGuard('race','p')]);
  const outcomes=await Promise.allSettled([reserve('race-a'),reserve('race-b')]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(await mongo.collection('stock_reservations').countDocuments({stockist_id:'race'}),1);
  assert.equal((await mongo.collection('stock_balances').findOne({id:'race|p'})).quantity,10);
  console.log('PASS: real replica-set concurrent stock reservations prevent overselling and roll back the losing order.');
 }

})().catch(e=>{console.error(e);process.exitCode=1}).finally(stopMongo);

