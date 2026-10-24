/* Exercise real route handlers against an isolated SQLite database. */
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const NativeDate=Date,clockSeed=new NativeDate();clockSeed.setUTCMonth(clockSeed.getUTCMonth()+1,1);clockSeed.setUTCHours(6,0,0,0);while(clockSeed.getUTCDay()!==3)clockSeed.setUTCDate(clockSeed.getUTCDate()+1);if(clockSeed.toISOString().slice(5,10)==='10-02')clockSeed.setUTCDate(clockSeed.getUTCDate()+7);
const initialClockOffset=clockSeed.getTime()-NativeDate.now();let clockOffset=initialClockOffset;
global.Date=new Proxy(NativeDate,{construct(target,args){return Reflect.construct(target,args.length?args:[NativeDate.now()+clockOffset]);},apply(){return new NativeDate(NativeDate.now()+clockOffset).toString()},get(target,key){return key==='now'?()=>NativeDate.now()+clockOffset:Reflect.get(target,key)}});

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
 const makeRep=async(u,routes,stocks,photo)=>ok(await team.POST(request({email:u.email,username:u===alice?'alice':'bob',password:'Test-only-password-456',name:u===alice?'Alice Rep':'Bob Rep',target:400000,status:'active',route_ids:routes,stockist_ids:stocks,district_ids:[],photo})));
 const sharp=require('sharp');
 const portrait='data:image/jpeg;base64,'+(await sharp({create:{width:400,height:600,channels:3,background:'#3f7890'}}).jpeg().withMetadata({orientation:6}).toBuffer()).toString('base64');
 await makeRep(alice,[r1.id,r3.id],[s1.id,s2.id],portrait);await makeRep(bob,[r2.id],[s1.id]);
 const employeePhotos=load(path.join(root,'app/api/team/photo/route.ts'));
 const photoRequest=(email=alice.email)=>new Request('https://app.test/api/team/photo?email='+encodeURIComponent(email));
 const savePhoto=(photo,extra={})=>team.POST(request({email:alice.email,name:'Alice Rep',status:'active',photo,...extra}));
 let photoRow=sql.prepare('SELECT * FROM employee_photos WHERE email=?').get(alice.email);
 assert(photoRow);assert(Buffer.from(photoRow.image_base64,'base64').length<96*1024);
 const normalized=await sharp(Buffer.from(photoRow.image_base64,'base64')).metadata();
 assert.equal(normalized.width,256);assert.equal(normalized.height,256);assert.equal(normalized.format,'webp');assert(!normalized.exif);assert(!normalized.orientation);
 const firstPhotoVersion=sql.prepare('SELECT photo_version FROM members WHERE email=?').get(alice.email).photo_version;
 const photoResponse=await employeePhotos.GET(photoRequest());assert.equal(photoResponse.status,200);assert.equal(photoResponse.headers.get('content-type'),'image/webp');assert.equal(photoResponse.headers.get('cache-control'),'private, no-store');assert.equal(photoResponse.headers.get('x-content-type-options'),'nosniff');assert.equal(Buffer.from(await photoResponse.arrayBuffer()).toString('base64'),photoRow.image_base64);
 const teamList=await ok(await team.GET());assert.equal(teamList.members.find(m=>m.email===alice.email).photo_version,firstPhotoVersion);assert(!JSON.stringify(teamList).includes(photoRow.image_base64));
 identity=null;await ok(await employeePhotos.GET(photoRequest()),401);
 identity=bob;await ok(await employeePhotos.GET(photoRequest()),403);await ok(await employeePhotos.GET(photoRequest(bob.email)),404);await ok(await savePhoto(null),403);
 identity=alice;assert.equal((await employeePhotos.GET(new Request('https://app.test/api/team/photo'))).status,200);assert.equal((await ok(await session.GET())).member.photo_version,firstPhotoVersion);
 identity=owner;await ok(await team.POST(request({email:alice.email,name:'Alice Rep',status:'active',photo:null},'POST','https://evil.test')),403);
 for(const invalid of ['https://example.test/photo.jpg','data:image/svg+xml;base64,PHN2Zy8+','data:image/jpeg;base64,'+Buffer.from('<svg/>').toString('base64'),'data:image/png;base64,iVBORw0KGgo='])await ok(await savePhoto(invalid,{name:'Must not be saved'}),400);
 const oversized='data:image/jpeg;base64,'+Buffer.alloc(140*1024,65).toString('base64');await ok(await savePhoto(oversized),400);
 const hugeDimensions='data:image/png;base64,'+(await sharp({create:{width:2200,height:2200,channels:3,background:'#000000'}}).png().toBuffer()).toString('base64');await ok(await savePhoto(hugeDimensions),400);
 assert.equal(sql.prepare('SELECT name FROM members WHERE email=?').get(alice.email).name,'Alice Rep');
 assert.equal(sql.prepare('SELECT image_base64 FROM employee_photos WHERE email=?').get(alice.email).image_base64,photoRow.image_base64);
 const replacement='data:image/png;base64,'+(await sharp({create:{width:100,height:100,channels:3,background:'#123456'}}).png().toBuffer()).toString('base64');
 await ok(await savePhoto(replacement));photoRow=sql.prepare('SELECT * FROM employee_photos WHERE email=?').get(alice.email);
 const replacementVersion=sql.prepare('SELECT photo_version FROM members WHERE email=?').get(alice.email).photo_version;assert.notEqual(replacementVersion,firstPhotoVersion);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM employee_photos WHERE email=?').get(alice.email).n,1);
 await ok(await savePhoto(undefined));assert.equal(sql.prepare('SELECT photo_version FROM members WHERE email=?').get(alice.email).photo_version,replacementVersion);assert.equal(sql.prepare('SELECT image_base64 FROM employee_photos WHERE email=?').get(alice.email).image_base64,photoRow.image_base64);
 const photoAudit=JSON.stringify(sql.prepare('SELECT * FROM admin_audit').all());assert(!photoAudit.includes('base64,'));assert(!photoAudit.includes(photoRow.image_base64));assert(photoAudit.includes('photoAction'));
 await ok(await savePhoto(null));await ok(await employeePhotos.GET(photoRequest()),404);assert.equal(sql.prepare('SELECT photo_version FROM members WHERE email=?').get(alice.email).photo_version,'');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM employee_photos WHERE email=?').get(alice.email).n,0);
 console.log('PASS: employee photos save with new accounts, normalize and strip metadata, replace one stored copy, preserve on ordinary saves, remove, enforce size/format/dimension/authentication/access restrictions, and stay out of profile JSON/audit logs.');
 const profile=sql.prepare('SELECT * FROM members WHERE email=?').get(alice.email);assert.deepEqual(new Set(JSON.parse(profile.district_ids)),new Set([d1.id,d2.id]));
 const shared=await post('Customers',{Name:'Shared doctor',Address:'Original registered address',Pincode:'638751',Route:'Uthukuli','Route access':'Yes','Mobile 1':'9876543210'});
 const assigned=await post('Customers',{Name:'Assigned doctor',Route:'Perundurai'},{assignedTo:alice.email});
 const clinic=await post('Customers',{Name:'Linked clinic','Customer category':'Medical / Clinic',Route:'Uthukuli','Stockist IDs':JSON.stringify([s1.id])},{assignedTo:alice.email});
 const product=await post('Products',{Name:'Product A',MRP:'200',PTR:'120',PTS:'90','GST %':'5','Sample cost':'2','Scheme 1 enabled':'Yes','Scheme 1 paid':'10','Scheme 1 free':'2','Scheme 2 enabled':'Yes','Scheme 2 paid':'5','Scheme 2 free':'1','Scheme 3 enabled':'Yes','Scheme 3 paid':'20','Scheme 3 free':'5'});
 const otherProduct=await post('Products',{Name:'Product B',MRP:'100',PTR:'75',PTS:'50','GST %':'0','Retail offer enabled':'Yes','Retail offer rate':'70'});
 const categoryData=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(product.id).data);
 await post('Products',{...categoryData,'Product category':'  Mineral   Supplements  '},{id:product.id});
 const categorySaved=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(product.id).data);assert.equal(categorySaved['Product category'],'Mineral Supplements');assert.equal(categorySaved.PTR,categoryData.PTR);assert.equal(categorySaved['Scheme 1 paid'],categoryData['Scheme 1 paid']);
 await ok(await records.POST(request({kind:'Products',id:product.id,data:{...categorySaved,'Product category':'x'.repeat(101)}})),400);
 identity=alice;assert.equal((await ok(await records.GET())).records.find(r=>r.id===product.id).data['Product category'],'Mineral Supplements');
 await ok(await records.POST(request({kind:'Products',id:product.id,data:{...categorySaved,'Product category':'MR cannot change'}})),403);
 identity=owner;assert.equal(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(product.id).data)['Product category'],'Mineral Supplements');
 console.log('PASS: product categories persist through the API, remain visible to MR, reject oversized names and MR writes, and preserve prices and schemes.');
 const gift=await post('Gifts',{Name:'Diary','Unit cost':'100','One per customer':'Yes'});
 identity=bob;const ownBob=await post('Customers',{Name:'Bob doctor',Route:'South Tirupur'});
 identity=alice;const own=await post('Customers',{Name:'Alice doctor',Route:'Uthukuli'});
 // Route authorization must use the stored route, never a conflicting client-supplied name.
 const forgedRoute=await ok(await records.POST(request({kind:'Customers',data:{Name:'Approval bypass probe',Route:'Uthukuli','Route ID':r2.id}})));
 assert.equal(forgedRoute.accessRequested,true);
 assert(!sql.prepare("SELECT id FROM records WHERE kind='Customers' AND json_extract(data,'$.Name')='Approval bypass probe'").get());
 const pendingRoute=sql.prepare("SELECT body FROM workflow_requests WHERE kind='outside_customer' AND json_extract(body,'$.submitted.Name')='Approval bypass probe'").get();assert.equal(JSON.parse(pendingRoute.body).submitted.Route,'South Tirupur');
 sql.prepare("DELETE FROM workflow_requests WHERE kind='outside_customer' AND json_extract(body,'$.submitted.Name')='Approval bypass probe'").run();
 const priority=load(path.join(root,'lib/field-updates.ts')).customerPriority,priorityCustomer={id:'priority',created:'2026-09-15T00:00:00Z',data:{Name:'Priority fixture'}};
 assert.equal(priority(priorityCustomer,[{customer_id:'priority',kind:'secondary',status:'Delivered',date:'2026-09-20',subtotal:1200000}],[],'2026-10-17').tier,'Top buyer');
 assert.equal(priority({...priorityCustomer,created:'2026-09-30T20:00:00Z'},[],[],'2026-10-17').tier,'New customer');
 let rows=(await ok(await records.GET())).records;assert(rows.some(r=>r.id===shared.id));assert(rows.some(r=>r.id===assigned.id));assert(rows.some(r=>r.id===own.id));assert(!rows.some(r=>r.id===ownBob.id));assert(!rows.some(r=>r.id==='legacy'));assert.equal(rows.find(r=>r.id===product.id).data.PTS,'90');assert(!('Sample cost' in rows.find(r=>r.id===product.id).data));
 await ok(await records.POST(request({kind:'Customers',id:own.id,data:{Name:'Changed',Route:'Uthukuli'}})),403);
 await ok(await records.DELETE(request({id:own.id},'DELETE')),403);
 await ok(await records.POST(request({kind:'Customers',data:{Name:'Wrong route',Route:'South Tirupur'}})));
 await ok(await team.GET(),403);
 const fieldDate=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),gps=()=>({lat:11.17,lng:77.46,accuracy:12,capturedAt:new Date().toISOString()});
 const attend=action=>({Date:fieldDate,Action:action,'GPS data':JSON.stringify(gps())});
 await ok(await records.POST(request({kind:'Visits',data:{Customer:'Shared doctor',Date:fieldDate}})),409);
 await ok(await records.POST(request({kind:'Attendance',data:{Date:fieldDate,Action:'Check in'}})),400);
 await ok(await records.POST(request({kind:'Attendance',data:{Date:fieldDate,Action:'Check in','GPS data':JSON.stringify({...gps(),capturedAt:new Date(Date.now()-300001).toISOString()})}})),400);
 const checkin=await post('Attendance',attend('Check in'));
 await ok(await records.POST(request({kind:'Attendance',data:attend('Check in')})),409);
 await ok(await records.POST(request({kind:'Attendance',id:checkin.id,data:attend('Check out')})),403);
 await require('./monthly-tour-integration.cjs')({load,root,sql,ok,request,records,fieldDate,owner,alice,bob,r1,r2,r3,shared,assigned,who:u=>{identity=u},setClock:iso=>{clockOffset=iso?NativeDate.parse(iso)-NativeDate.now():initialClockOffset}});
 const visit=await post('Visits',{Customer:'Shared doctor',Date:fieldDate,Purpose:'Order'});
 const commerce=load(path.join(root,'app/api/commerce/route.ts')),benefits=load(path.join(root,'app/api/benefits/route.ts')),closeVisit=load(path.join(root,'app/api/visits/close/route.ts')),whatsapp=load(path.join(root,'app/api/whatsapp/route.ts'));
 const invoice=(kind,stockistId,lines,extra={})=>{const quotes=kind==='secondary'?[]:lines.map(l=>load(path.join(root,'lib/field-rules.ts')).priceLine(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(l.productId).data),l.productId,l.qty,l.scheme||'none',true));return {id:crypto.randomUUID(),kind,stockistId,date:fieldDate,...(kind!=='secondary'?{invoiceValue:quotes.reduce((n,l)=>n+l.subtotal,0)/100}:{}),lines:lines.map((l,i)=>kind==='secondary'?l:{...l,freeQty:quotes[i].free,batch:'TEST-BATCH',expiry:'2035-12-31'}),...extra}};
 const qty=(stock,prod)=>sql.prepare('SELECT quantity FROM stock_balances WHERE stockist_id=? AND product_id=?').get(stock,prod)?.quantity||0;
 await ok(await commerce.POST(request(invoice('primary',s1.id,[{productId:product.id,qty:50,scheme:'1'}]))),403);
 identity=owner;
 const primary=invoice('primary',s1.id,[{productId:product.id,qty:50,scheme:'1'},{productId:otherProduct.id,qty:10,scheme:'none'}]);await ok(await commerce.POST(request(primary)));assert.equal(qty(s1.id,product.id),60);assert.equal(qty(s1.id,otherProduct.id),10);
 const primaryStored=sql.prepare('SELECT * FROM invoices WHERE id=?').get(primary.id);assert.equal(primaryStored.total,Math.round(primary.invoiceValue*100));
 await ok(await commerce.POST(request(primary)));assert.equal(qty(s1.id,product.id),60);
 await ok(await commerce.POST(request(invoice('primary',s2.id,[{productId:product.id,qty:20,scheme:'none'}]))));
 identity=alice;let sales=await ok(await commerce.GET());assert.equal(sales.stock.find(s=>s.product_id===product.id&&s.stockist_id===s1.id).quantity,60);assert(!('rate' in sales.invoices.find(i=>i.id===primary.id).items[0]));
 identity=bob;sales=await ok(await commerce.GET());assert.equal(sales.stock.find(s=>s.product_id===product.id).quantity,60);assert(!sales.stock.some(s=>s.stockist_id===s2.id));
 identity=alice;
 await ok(await commerce.POST(request(invoice('secondary',s2.id,[{productId:product.id,qty:1,scheme:'none'}],{customerId:clinic.id}))),400);
 const order=invoice('secondary',s1.id,[{productId:product.id,qty:10,scheme:'1'},{productId:otherProduct.id,qty:2,scheme:'none'}],{customerId:shared.id,visitId:visit.id,notes:'Customer requests samples',commitments:[{productId:product.id,qty:3,notes:'Deliver during this or next visit'}]});
 await ok(await commerce.POST(request(order)));assert.equal(qty(s1.id,product.id),60);const reservedStock=(await ok(await commerce.GET())).stock.find(s=>s.stockist_id===s1.id&&s.product_id===product.id);assert.equal(reservedStock.reserved,12);assert.equal(reservedStock.available,48);assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='Secondary sales'").get().n,0);
 const approvals=load(path.join(root,'app/api/approvals/route.ts'));identity=owner;await ok(await commerce.PATCH(request({id:order.id,requestId:crypto.randomUUID(),revision:1,action:'status',status:'Delivered'},'PATCH')),403);
 // Historical delivered stockist fixture: preserve ledger/report/edit compatibility, while the live API no longer permits stockist completion.
 const historicBefore=sql.prepare('SELECT * FROM invoices WHERE id=?').get(order.id),historicAfter={...historicBefore,status:'Delivered',accepted:1,revision:2};
 sql.prepare("UPDATE invoices SET status='Delivered',accepted=1,revision=2 WHERE id=?").run(order.id);sql.prepare('DELETE FROM stock_reservations WHERE order_id=?').run(order.id);
 for(const l of JSON.parse(historicBefore.items)){sql.prepare('UPDATE stock_balances SET quantity=quantity-? WHERE stockist_id=? AND product_id=?').run(l.qty+l.free,s1.id,l.productId);sql.prepare('INSERT INTO stock_movements(id,invoice_id,stockist_id,product_id,quantity,created) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),order.id,s1.id,l.productId,-l.qty-l.free,new Date().toISOString());}
 sql.prepare("UPDATE records SET kind='Secondary sales',data=json_set(data,'$.Status','Delivered') WHERE kind='Orders' AND json_extract(data,'$.\"Invoice ID\"')=?").run(order.id);
 sql.prepare('INSERT INTO order_edits(id,invoice_id,revision,mr_email,before_data,after_data,created) VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(),order.id,1,alice.email,JSON.stringify(historicBefore),JSON.stringify(historicAfter),new Date().toISOString());
 identity=alice;assert.equal(qty(s1.id,product.id),48);assert.equal(qty(s1.id,otherProduct.id),8);
 const orderStored=sql.prepare('SELECT * FROM invoices WHERE id=?').get(order.id);assert.equal(orderStored.total,140000);assert.equal(JSON.parse(orderStored.items)[1].rate,7000);
 await ok(await commerce.POST(request(order)));assert.equal(qty(s1.id,product.id),48);
 const failed=invoice('secondary',s1.id,[{productId:product.id,qty:1,scheme:'none'},{productId:'missing-product',qty:999,scheme:'none'}],{customerId:shared.id});await ok(await commerce.POST(request(failed)),400);assert.equal(qty(s1.id,product.id),48);assert(!sql.prepare('SELECT id FROM invoices WHERE id=?').get(failed.id));
 await ok(await records.POST(request({kind:'Orders',data:{Date:fieldDate}})),400);
 identity=owner;
 const allocate=(kind,itemId,qty,unitCost,mrEmail=alice.email)=>({id:crypto.randomUUID(),kind,movement:'allocate',itemId,qty,unitCost,mrEmail});
 await ok(await benefits.POST(request(allocate('sample',product.id,10,2))));await ok(await benefits.POST(request(allocate('gift',gift.id,3,100))));
 const balance=(kind,email,id)=>sql.prepare('SELECT * FROM benefit_balances WHERE id=?').get(`${kind}|${email}|${id}`);
 identity=alice;const promise=sql.prepare('SELECT * FROM commitments WHERE invoice_id=?').get(order.id);
 await ok(await closeVisit.POST(request({id:visit.id,gps:null})),400);
 const closure={id:visit.id,gps:gps(),locationName:'Uthukuli',locationAddress:'Uthukuli, Tirupur, Tamil Nadu, India',gifts:[{itemId:gift.id,qty:1}],samples:[{itemId:product.id,qty:2,commitmentId:promise.id}]};await ok(await closeVisit.POST(request(closure)));
 const locatedCustomer=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(shared.id).data);assert.equal(locatedCustomer['Location name'],'Uthukuli');assert.equal(locatedCustomer['Location address'],closure.locationAddress);assert.equal(locatedCustomer.Address,'Original registered address');assert.equal(locatedCustomer.Pincode,'638751');assert.equal(locatedCustomer['Location visit ID'],visit.id);assert.equal(JSON.parse(locatedCustomer['GPS data']).lat,closure.gps.lat);const locationSnapshot=JSON.stringify(locatedCustomer);
 assert.equal(balance('gift',alice.email,gift.id).quantity,2);assert.equal(balance('sample',alice.email,product.id).quantity,8);assert.equal(balance('sample',alice.email,product.id).value,1600);assert.equal(sql.prepare('SELECT fulfilled FROM commitments WHERE id=?').get(promise.id).fulfilled,2);
 await ok(await closeVisit.POST(request(closure)));assert.equal(balance('gift',alice.email,gift.id).quantity,2);assert.equal(sql.prepare('SELECT data FROM records WHERE id=?').get(shared.id).data,locationSnapshot);
 const message=(await ok(await whatsapp.GET())).messages[0];assert.equal(message.status,'awaiting_setup');assert(message.message.includes('Alice Rep'));assert(message.message.includes('Product A'));assert.equal(message.phone,'919876543210');
 const again=await post('Visits',{Customer:'Shared doctor',Date:fieldDate});
 await ok(await closeVisit.POST(request({id:again.id,gps:gps(),gifts:[{itemId:gift.id,qty:1}],samples:[{itemId:product.id,qty:1,commitmentId:promise.id}]})),409);
 assert.equal(balance('sample',alice.email,product.id).quantity,8);assert.equal(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(again.id).data).Status,'Open');
 identity=owner;await post('Gifts',{Name:'Diary','Unit cost':'100','One per customer':'No'},{id:gift.id});
 assert.equal(sql.prepare('SELECT data FROM records WHERE id=?').get(shared.id).data,locationSnapshot);
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
 const badEdit={...edit,requestId:crypto.randomUUID(),revision:3,lines:[{productId:product.id,qty:1,scheme:'none'},{productId:otherProduct.id,qty:999,scheme:'none'}]};assert((await ok(await commerce.PATCH(request(badEdit,'PATCH')))).pendingApproval);identity=owner;approvalView=await ok(await approvals.GET());await ok(await commerce.PATCH(request({action:'reject',requestId:badEdit.requestId,reason:'Customer did not request this quantity'},'PATCH')));identity=alice;assert.equal(qty(s1.id,product.id),55);assert.equal(sql.prepare('SELECT revision FROM invoices WHERE id=?').get(order.id).revision,3);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM order_edits WHERE invoice_id=?').get(order.id).n,2);
 const editedReport=await ok(await reports.GET(reportURL()));assert.equal(editedReport.summary.achieved,74000);assert.equal(editedReport.metrics.primary,680000);const editedStock=editedReport.tables.find(t=>t.title==='Agency stock reconciliation at month end').rows.find(r=>r[0]==='Shared stockist'&&r[1]==='Product A');assert.equal(editedStock[3],60);assert.equal(editedStock[4],5);assert.equal(editedStock[6],55);assert(editedReport.tables.find(t=>t.title==='Field activity — complete recorded details').webOnly);
 const queued=sql.prepare('SELECT * FROM whatsapp_outbox WHERE id LIKE ?').all('order:'+order.id+':%');assert.equal(queued.length,4);assert.equal(queued.filter(q=>q.status==='superseded').length,1);assert.equal(queued.find(q=>q.id.endsWith(':3:agency:updated')).phone,'919876543212');assert.equal(queued.find(q=>q.id.endsWith(':3:admin:updated')).phone,'919944472488');assert(queued.find(q=>q.id.endsWith(':3:admin:updated')).message.includes('ORDER UPDATED'));
 const insights=load(path.join(root,'lib/route-insights.ts'));const customerFixture=(id,route)=>({id,kind:'Customers',owner:fixtureMember.user_id,assigned_to:alice.email,created:'2026-01-01',data:{Name:id,Route:route}});const activityFixture=(id,customer,date)=>({id,kind:'Visits',assigned_to:alice.email,created:date,data:{Date:date,'Customer ID':customer,Status:'Closed'}});
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
 const history=await ok(await hub.GET(hubURL('mode=audit')));assert(history.events.some(e=>e.action==='Customer access revoked'&&e.reason==='Territory reassigned'&&e.actor_email===owner.email));assert(history.events.some(e=>e.action==='Order repricing approved'));assert(history.events.some(e=>e.action==='Month reopened'));assert(history.events.every(e=>(e.actor_email===owner.email||e.entity_kind==='Tour plan'&&[alice.email,bob.email].includes(e.actor_email))&&e.reason&&e.created));
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
 const calendar=attendanceLib.attendanceMonth(attMember,'2024-02',attRecords,'2024-02-10');assert.equal(calendar.days.length,29);assert.equal(calendar.days[0].status,'complete');assert.equal(calendar.days[0].duration,'9h 0m');assert.equal(calendar.days[1].status,'partial');assert.equal(calendar.days[2].label,'Missing check-in');assert.equal(calendar.days[3].status,'gps_missing');assert.equal(calendar.days[4].status,'review');assert.equal(calendar.days[5].label,'Checkout before check-in');assert.equal(calendar.days[6].status,'missing');assert.equal(calendar.days[10].status,'holiday');assert.equal(calendar.summary.complete,1);assert.equal(calendar.summary.upcoming,16);assert.equal(attendanceLib.recordedGPS({'GPS data':JSON.stringify({lat:100,lng:77,accuracy:1,capturedAt:attDate+'T03:30:00Z'})},attDate),null);
 identity=alice;await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month='+fieldDate.slice(0,7))));identity=owner;await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month=2026-99')),400);const adminAttendance=await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month='+fieldDate.slice(0,7)+'&mr='+encodeURIComponent(bob.email))));assert.equal(adminAttendance.attendance.length,1);assert.equal(adminAttendance.attendance[0].email,bob.email);assert.equal(adminAttendance.attendance[0].days.find(d=>d.date===fieldDate).status,'complete');
 const districtAttendance=await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month='+fieldDate.slice(0,7)+'&district='+d2.id)));assert(districtAttendance.attendance.some(m=>m.email===alice.email));assert(!districtAttendance.attendance.some(m=>m.email===bob.email));
 const reportLayouts=load(path.join(root,'lib/report-layout.ts'));assert.equal(reportLayouts.cellTone('Complete · GPS verified'),'complete');assert.equal(reportLayouts.cellTone('Missing checkout'),'missing');assert(reportLayouts.numericColumn('Net sales'));assert(!reportLayouts.numericColumn('Order number'));
 console.log('PASS: Role-scoped monthly attendance, district/MR filtering, historical GPS completion, missing check-in/out, invalid GPS, duplicate and reversed entries, leap months, future-date neutrality and PDF status formatting.');
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
 await ok(await login.POST(new Request('https://app.test/api',{method:'POST',headers:{'content-type':'application/json','sec-fetch-site':'cross-site'},body:JSON.stringify({username:'bob',password:'Test-only-password-456'})})),403);
 const legacySalt='00112233445566778899aabbccddeeff',legacyHash='pbkdf2-sha512$100000$'+legacySalt+'$'+require('node:crypto').pbkdf2Sync('Test-only-password-456',Buffer.from(legacySalt,'hex'),100000,32,'sha512').toString('hex');
 sql.prepare('UPDATE credentials SET password_hash=? WHERE username=?').run(legacyHash,'bob');
 let signed=await login.POST(request({username:'bob',password:'Test-only-password-456'}));await ok(signed);let cookie=signed.headers.get('set-cookie');assert(cookie.includes('HttpOnly')&&cookie.includes('Secure')&&cookie.includes('SameSite=Strict'));
 assert(sql.prepare('SELECT password_hash FROM credentials WHERE username=?').get('bob').password_hash.startsWith('pbkdf2-sha512$220000$'));
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

 // Communication configuration is Admin-only and credentials are encrypted at rest.
 identity=owner;
 process.env.COMMUNICATIONS_SECRET='synthetic-communications-key-for-tests-only';
 const communications=load(path.join(root,'app/api/communications/route.ts'));
 const statement=load(path.join(root,'app/api/stock-statement/route.ts'));
 const runtime=load(path.join(root,'lib/communication-runtime.ts'));
 let smtpCalls=0;runtime.deliverSMTP=async(c,to)=>{assert.equal(c.smtpPassword,'synthetic-smtp-password');assert.equal(to,'admin@example.test');smtpCalls++};
 const config=(await ok(await communications.GET())).config;
 Object.assign(config,{whatsappEnabled:false,whatsappUrl:'https://example.test/send',whatsappKey:'synthetic-api-key',smtpEnabled:true,smtpHost:'smtp.example.test',smtpPort:587,smtpUser:'mailer',smtpPassword:'synthetic-smtp-password',smtpFrom:'mailer@example.test',adminEmail:'admin@example.test',adminPhone:'919876543210'});
 await ok(await communications.POST(request({action:'save',config})));
 const encrypted=sql.prepare("SELECT data FROM communication_settings WHERE id='main'").get().data;
 assert(!encrypted.includes('synthetic-api-key'));assert(!encrypted.includes('synthetic-smtp-password'));
 const publicSettings=(await ok(await communications.GET())).config;
 assert.equal(publicSettings.whatsappKey,undefined);assert.equal(publicSettings.smtpPassword,undefined);assert.equal(publicSettings.hasSmtpPassword,true);
 await ok(await communications.POST(request({action:'save',config:{...config,whatsappKey:'',smtpPassword:''}})));
 await ok(await communications.POST(request({action:'save',config:{...config,templates:{...config.templates,order_new:'Invalid {{unknown}}'}}})),400);
 await ok(await communications.POST(request({action:'test',channel:'email'})));
 assert.equal(smtpCalls,1);const emailLog=sql.prepare("SELECT * FROM email_outbox WHERE id LIKE 'test:%'").get();assert.equal(emailLog.status,'accepted');
 const nativeEmail=await mongo.collection('email_outbox').findOne({id:emailLog.id});assert(nativeEmail.expires_at instanceof Date);
 await ok(await communications.POST(request({action:'retry',channel:'email',id:emailLog.id})));assert.equal(smtpCalls,1);
 const before=new Date(Date.now()-31*86400000).toISOString();
 sql.prepare("INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,created) VALUES ('expired-wa','expired-visit',?,'919876543210','Old','accepted',?)").run(owner.email,before);
 sql.prepare("INSERT INTO email_outbox(id,mr_email,recipient,subject,message,status,created) VALUES ('expired-email',?,'old@example.test','Old','Old','accepted',?)").run(owner.email,before);
 const invoiceCount=sql.prepare('SELECT COUNT(*) AS n FROM invoices').get().n;
 await ok(await communications.GET());assert(!sql.prepare("SELECT id FROM whatsapp_outbox WHERE id='expired-wa'").get());assert(!sql.prepare("SELECT id FROM email_outbox WHERE id='expired-email'").get());assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM invoices').get().n,invoiceCount);
 const stockData=await ok(await statement.GET(new Request('https://example.test/api/stock-statement?from=2020-01-01&to=2099-12-31')));
 assert(stockData.summary.length);for(const row of stockData.summary){assert.equal(row.opening+row.received-row.issued+row.returned,row.closing);assert.equal(Math.max(0,row.physical-row.expired-row.reserved),row.available);}
 const activeMR=sql.prepare("SELECT * FROM members WHERE role='mr' AND status='active' LIMIT 1").get();identity={id:activeMR.user_id,email:activeMR.email};
 assert.equal((await ok(await communications.GET())).config,null);
 await ok(await communications.POST(request({action:'save',config})),403);
 const ownStock=await ok(await statement.GET(new Request('https://example.test/api/stock-statement?from=2020-01-01&to=2099-12-31')));
 assert(ownStock.summary.every(r=>JSON.parse(activeMR.stockist_ids||'[]').includes(r.stockistId)));
 const messages=load(path.join(root,'lib/message-templates.ts'));
 assert.equal(messages.stockistOrderPhone({Phone:'1111111111','Mobile 2':'2222222222','Order WhatsApp contact':'Mobile 2'}),'2222222222');
 assert.equal(messages.stockistOrderPhone({Phone:'1111111111','WhatsApp number':'3333333333'}),'3333333333');
 assert.equal(messages.renderMessage('Hi {{customer_name}}; {{items}}',{customer_name:'Dr. Test',items:'A 10; B 20'}),'Hi Dr. Test; A 10; B 20');
 identity=owner;
 console.log('PASS: encrypted Admin-only communication settings, template validation, SMTP acceptance/no duplicate retries, 30-day log cleanup, per-stockist product statements and MR isolation.');
 // New field operations: real route handlers, transactional ledger and role permissions.
 const planning=load(path.join(root,'app/api/field-planning/route.ts'));
 sql.prepare("UPDATE members SET status='active',route_ids=?,stockist_ids=? WHERE email=?").run(JSON.stringify([r1.id,r3.id]),JSON.stringify([s1.id,s2.id]),alice.email);
 sql.exec('DELETE FROM period_locks');identity=alice;
 await ok(await planning.POST(request({action:'leave',from:fieldDate,to:fieldDate,reason:'Personal leave'})));
 const leaveRequest=sql.prepare("SELECT * FROM workflow_requests WHERE kind='tour_change' AND status='Pending' AND mr_email=?").get(alice.email);
 await ok(await planning.POST(request({action:'leave',from:fieldDate,to:fieldDate,reason:'Overlapping leave'})),409);
 await ok(await planning.POST(request({action:'approve',id:leaveRequest.id})),403);
 identity=owner;await ok(await planning.POST(request({action:'approve',id:leaveRequest.id})));
 identity=alice;const mineAttendance=await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month='+fieldDate.slice(0,7))));assert(mineAttendance.attendance.every(m=>m.email===alice.email));assert(mineAttendance.attendance[0].days.find(d=>d.date===fieldDate).working);assert(mineAttendance.attendance[0].days.find(d=>d.date===fieldDate).label.includes('approved leave'));
 const future=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 await ok(await planning.POST(request({action:'leave',from:future,to:future,reason:'Family leave'})));const futureLeave=sql.prepare("SELECT * FROM workflow_requests WHERE kind='tour_change' AND status='Pending'").get();identity=owner;await ok(await planning.POST(request({action:'approve',id:futureLeave.id})));identity=alice;const futureCal=await ok(await attendanceAPI.GET(new Request('https://app.test/api/attendance?month='+future.slice(0,7))));assert.equal(futureCal.attendance[0].days.find(d=>d.date===future).status,'leave');
 await ok(await planning.POST(request({action:'cancel',id:futureLeave.id})),409);
 const monthlyTours=load(path.join(root,'app/api/monthly-tour/route.ts'));
 const returnFromLeave=await ok(await monthlyTours.POST(request({action:'request-change',type:'routes',from:future,routes:[r1.id,r3.id],reason:'Return to route work'})));
 identity=owner;await ok(await monthlyTours.POST(request({action:'approve-change',id:returnFromLeave.id})));identity=alice;
 const returnToday=await ok(await monthlyTours.POST(request({action:'request-change',type:'routes',from:fieldDate,routes:[r1.id,r3.id],reason:'Continue approved route work'})));identity=owner;await ok(await monthlyTours.POST(request({action:'approve-change',id:returnToday.id})));identity=alice;

 const outsideRequest=sql.prepare("SELECT * FROM workflow_requests WHERE kind='outside_customer' AND mr_email=?").get(alice.email);identity=owner;await ok(await planning.POST(request({action:'approve',id:outsideRequest.id})));identity=alice;const outsideCustomer=(await ok(await records.GET())).records.find(r=>r.data.Name==='Wrong route');assert(outsideCustomer);assert(!outsideCustomer.data['Outside route MRs']);
 const tours=load(path.join(root,'app/api/tour-planning/route.ts'));
 await ok(await tours.POST(request({action:'plan',date:fieldDate,routeId:r2.id})),409);
 await ok(await tours.POST(request({action:'reschedule',id:'legacy-plan',date:fieldDate,routeId:r2.id,reason:'Customer unavailable'})),409);
 await ok(await planning.POST(request({action:'tour',date:fieldDate,routeId:r2.id,customers:[own.id]})),400);
 await ok(await tours.POST(request({action:'status-request',customerId:outsideCustomer.id,status:'Relocated — route change required',reason:'Moved to another town'})));
 assert.equal(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(outsideCustomer.id).data)['Customer status'],undefined);
 const sr=sql.prepare("SELECT id FROM workflow_requests WHERE kind='customer_status' AND record_id=?").get(outsideCustomer.id);
 await ok(await tours.POST(request({action:'approve-status',id:sr.id})),403);
 identity=owner;await ok(await tours.POST(request({action:'approve-status',id:sr.id})));
 assert.equal(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(outsideCustomer.id).data)['Customer status'],'Relocated — route change required');
 await ok(await tours.POST(request({action:'status-set',customerId:outsideCustomer.id,status:'Active',reason:'Correct route now known'})),400);
 await ok(await tours.POST(request({action:'status-set',customerId:outsideCustomer.id,status:'Active',routeId:r2.id,reason:'Correct route now known'})));
 const nextPlanDate=new Date(Date.parse(fieldDate+'T00:00:00Z')+2*86400000).toISOString().slice(0,10);
 sql.prepare("INSERT INTO period_locks VALUES (?,1,'tour-lock',?,?,?)").run(nextPlanDate.slice(0,7),new Date().toISOString(),owner.email,'Tour month locked');
 await ok(await tours.POST(request({action:'plan',email:alice.email,date:nextPlanDate,routeId:r2.id})),409);sql.exec('DELETE FROM period_locks');
 const tourLogic=load(path.join(root,'lib/tour-planning.ts'));const fixture=[{id:'p',kind:'Tour plan',assigned_to:alice.email,data:{Date:'2026-10-08','Customer ID':'c',Customer:'Example',Status:'Cancelled'}},{id:'v',kind:'Visits',assigned_to:alice.email,data:{Date:'2026-10-15','Customer ID':'c',Customer:'Example',Status:'Closed'}}];
 assert.equal(tourLogic.planState(fixture[0],[fixture[0]],'2026-10-16'),'Cancelled');assert.equal(tourLogic.planState(fixture[0],fixture,'2026-10-16'),'Covered this month');assert.equal(tourLogic.tourReport(alice.email,'2026-10',fixture).rows[0][2],'Visited / Covered');assert.equal(tourLogic.tourReport(alice.email,'2026-10',[fixture[0]]).rows[0][2],'Not visited');assert.equal(tourLogic.eligibleForPlan({'Customer status':'Temporarily unavailable','Resume date':'2026-10-15'},'2026-10-14'),false);assert.equal(tourLogic.eligibleForPlan({'Customer status':'Temporarily unavailable','Resume date':'2026-10-15'},'2026-10-15'),true);
 console.log('PASS: legacy tour writes blocked, customer status approval, reactivation route, month lock and completed-only coverage.');
 identity=alice;

 const updates=load(path.join(root,'lib/field-updates.ts'));
 assert.equal(updates.previousMonth('2026-01-01'),'2025-12');assert(Math.abs(updates.distanceKm({lat:0,lng:0},{lat:0,lng:1})-111.195)<0.01);
 for(const [net,tier] of [[1000000,'Top buyer'],[999900,'Regular buyer'],[500000,'Regular buyer'],[499900,'Occasional buyer'],[0,'No orders']]){const p=updates.customerPriority({id:'x',created:'2025-01-01',data:{Name:'X'}},[{customer_id:'x',kind:'secondary',status:'Delivered',date:'2026-09-10',subtotal:net}],[],'2026-10-01');assert.equal(p.tier,tier);assert(p.noVisit);}
 identity=owner;await ok(await commerce.POST(request(invoice('company_receipt','company-stock',[{productId:product.id,qty:100,scheme:'none'},{productId:otherProduct.id,qty:50,scheme:'none'}]))));const agencyBefore=qty(s1.id,product.id),companyBefore=qty('company-stock',product.id);
 identity=alice;const direct=invoice('secondary','company-stock',[{productId:product.id,qty:2,scheme:'none',proposedRate:100,proposedFree:1}],{customerId:own.id});assert((await ok(await commerce.POST(request(direct)))).pendingApproval);assert(!sql.prepare('SELECT id FROM invoices WHERE id=?').get(direct.id));assert(!sql.prepare('SELECT id FROM stock_reservations WHERE order_id=?').get(direct.id));
 const bypass={...direct,lines:[{productId:product.id,qty:1,scheme:'none'}]};assert((await ok(await commerce.POST(request(bypass)))).pendingApproval);assert(!sql.prepare('SELECT id FROM invoices WHERE id=?').get(direct.id));await ok(await commerce.POST(request({action:'approveDirect',requestId:direct.id})),403);
 identity=owner;await ok(await commerce.POST(request({action:'approveDirect',requestId:direct.id})));await ok(await commerce.POST(request({action:'approveDirect',requestId:direct.id})),409);assert.equal(qty('company-stock',product.id),companyBefore);assert(!sql.prepare('SELECT quantity FROM stock_reservations WHERE order_id=?').get(direct.id));let postedDirect=sql.prepare('SELECT * FROM invoices WHERE id=?').get(direct.id);assert.equal(postedDirect.subtotal,20000);assert.equal(postedDirect.kind,'secondary');
 await ok(await commerce.PATCH(request({action:'status',status:'Delivered',id:direct.id,revision:postedDirect.revision,requestId:crypto.randomUUID()})));assert.equal(qty('company-stock',product.id),companyBefore);assert.equal(qty(s1.id,product.id),agencyBefore);
 identity=alice;const directHistory=await ok(await load(path.join(root,'app/api/customer-history/route.ts')).GET(new Request('https://app.test/api/customer-history?customer='+own.id)));assert(directHistory.orders.some(o=>o.id===direct.id&&o.agency.includes('Direct company')));
 const standardDirect=invoice('secondary','company-stock',[{productId:otherProduct.id,qty:1,scheme:'none'}],{customerId:clinic.id});await ok(await commerce.POST(request(standardDirect)));assert.equal(sql.prepare('SELECT status FROM invoices WHERE id=?').get(standardDirect.id).status,'Placed');
 const directRevision=sql.prepare('SELECT revision FROM invoices WHERE id=?').get(direct.id).revision,editDirectId=crypto.randomUUID();assert((await ok(await commerce.PATCH(request({id:direct.id,requestId:editDirectId,revision:directRevision,lines:[{productId:product.id,qty:2,scheme:'none',proposedRate:95,proposedFree:2}],notes:'Requested direct amendment'})))).pendingApproval);assert.equal(sql.prepare('SELECT subtotal FROM invoices WHERE id=?').get(direct.id).subtotal,20000);identity=owner;const directReview=await ok(await approvals.GET());await ok(await commerce.PATCH(request({action:'approve',requestId:editDirectId,hash:directReview.hash})));assert.equal(sql.prepare('SELECT subtotal FROM invoices WHERE id=?').get(direct.id).subtotal,19000);assert.equal(qty(s1.id,product.id),agencyBefore);identity=alice;
 const protectedStockist=invoice('secondary',s1.id,[{productId:product.id,qty:1,scheme:'none',proposedRate:1}],{customerId:own.id});await ok(await commerce.POST(request(protectedStockist)),400);
 const closedProposal=invoice('secondary','company-stock',[{productId:product.id,qty:1,scheme:'none',proposedRate:1}],{customerId:own.id});await ok(await commerce.POST(request(closedProposal)));sql.prepare("INSERT INTO period_locks VALUES (?,1,'new-lock',?,?,?)").run(fieldDate.slice(0,7),new Date().toISOString(),owner.email,'Test');identity=owner;await ok(await commerce.POST(request({action:'approveDirect',requestId:closedProposal.id})),409);sql.exec('DELETE FROM period_locks');await ok(await commerce.POST(request({action:'rejectDirect',requestId:closedProposal.id})));
 console.log('PASS: leave overlap/approval/working-day override, MR calendar isolation, outside-route access, idempotent route plans, monthly priority thresholds, endpoint distance, direct pricing approval, replay prevention, company/agency stock isolation, delivery recognition, clinic direct supply and locked proposals.');

 // Cost privacy is enforced on responses, not just on rendered labels.
 identity=alice;const publicBenefits=await ok(await benefits.GET());for(const row of [...publicBenefits.balances,...publicBenefits.movements,...publicBenefits.totals]){assert(!('cost' in row));assert(!('value' in row));}assert(publicBenefits.balances.filter(b=>b.kind==='sample').every(b=>typeof b.mrp==='number'));
 const mrCatalogue=(await ok(await records.GET())).records;for(const row of mrCatalogue.filter(r=>['Products','Samples','Gifts'].includes(r.kind))){assert(!('Unit cost' in row.data));assert(!('Sample cost' in row.data));}
 const publicRequests=await ok(await load(path.join(root,'app/api/allotment-requests/route.ts')).GET());assert(publicRequests.requests.every(r=>!('unitCost' in r.body)));
 const mrCostReport=await ok(await load(path.join(root,'app/api/monthly-report/route.ts')).GET(new Request('https://app.test/api/monthly-report?month='+fieldDate.slice(0,7))));assert(!('benefitCost' in mrCostReport.metrics));assert(mrCostReport.tables.filter(t=>t.title.startsWith('Samples and gifts')).every(t=>t.columns.every(c=>! /cost/i.test(c))));assert(mrCostReport.tables.find(t=>t.title.startsWith('Samples and gifts')).columns.includes('Sample MRP / unit'));
 identity=owner;const privateBenefits=await ok(await benefits.GET());assert(privateBenefits.balances.some(b=>'value' in b));assert(privateBenefits.movements.some(b=>'cost' in b));const adminCostReport=await ok(await load(path.join(root,'app/api/monthly-report/route.ts')).GET(new Request('https://app.test/api/monthly-report?month='+fieldDate.slice(0,7)+'&mr='+encodeURIComponent(alice.email))));assert('benefitCost' in adminCostReport.metrics);assert(adminCostReport.tables.some(t=>t.title==='Monthly sample and gift costing'));assert(adminCostReport.tables.some(t=>t.title==='Route-wise sample and gift spending'));
 const privacy=load(path.join(root,'lib/benefit-visibility.ts'));const oldReport={metrics:{benefitCost:123},tables:[{title:'Samples and gifts — allocation, usage and closing balance',columns:['Item','Usage cost','Closing cost'],rows:[['Sample',123,456]]},{title:'Legacy records — retained history',columns:['Type','Date','Details'],rows:[['Samples','2026-01-01','Product: X · Unit cost: 987 · Quantity: 2']]}]};const scrubbed=privacy.mrReport(oldReport);assert(!JSON.stringify(scrubbed).includes('987'));assert(!('benefitCost' in scrubbed.metrics));assert.deepEqual(scrubbed.tables[0].rows,[['Sample']]);assert.equal(oldReport.metrics.benefitCost,123);
 // ANIMitra transport contract: mock network only; no external messages sent.
 identity=owner;await ok(await communications.POST(request({action:'save',config:{...config,whatsappEnabled:true,whatsappUrl:'https://wa.animitra.in',whatsappKey:'synthetic-api-key',whatsappSession:'primary',smtpEnabled:false}})));
 const realFetch=global.fetch;let waCalls=0,waMode='ok';global.fetch=async(url,init)=>{waCalls++;assert.equal(String(url),'https://wa.animitra.in/api/v1/send/text');const body=JSON.parse(init.body);assert.equal(body.session_id,'primary');assert.equal(body.to,'919876543210');assert.equal(body.text,'Synthetic test');assert.equal(body.phone,undefined);return new Response(JSON.stringify(waMode==='ok'?{ok:true,messageId:'synthetic-id'}:{}),{status:waMode==='401'?401:waMode==='500'?500:200,headers:{'Content-Type':'application/json'}})};
 try{for(const mode of ['ok','401','500','unknown']){waMode=mode;const id='test:gateway-'+mode;sql.prepare("INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,created) VALUES (?,?,?,?,?,'awaiting_setup',?)").run(id,id,owner.email,'919876543210','Synthetic test',new Date().toISOString());await ok(await communications.POST(request({action:'retry',channel:'whatsapp',id})));const log=sql.prepare('SELECT * FROM whatsapp_outbox WHERE id=?').get(id);assert.equal(log.status,mode==='ok'?'accepted':mode==='401'?'failed':'uncertain');if(mode==='401')assert(log.error.includes('401'));else{const before=waCalls;await ok(await communications.POST(request({action:'retry',channel:'whatsapp',id})));assert.equal(waCalls,before);}}}finally{global.fetch=realFetch}
 console.log('PASS: ANIMitra endpoint/body, ok+messageId acceptance, clear rejection errors and no retry for accepted/ambiguous messages. No external sends.');
 const locationHelper=load(path.join(root,'lib/customer-location.ts'));assert.deepEqual(locationHelper.customerLocationStatements({id:'customer',data:'{}',details:{'Location captured at':'2026-10-08T09:00:00Z'}},{lat:11,lng:77,accuracy:10,capturedAt:'2026-10-08T08:59:00Z'},{name:'Old place'},'visit',{}),[]);
 console.log('PASS: completed visit updates readable customer GPS atomically, preserves postal address/pincode, retries remain idempotent, failed distribution rolls back, and older GPS cannot replace newer location.');
 console.log('PASS: MR costs absent from catalogue, benefit ledger, allotment requests and reports; sample unit MRP visible; legacy report redaction does not mutate archives; Admin cost and route/month reports retained.');

 const backupAPI=load(path.join(root,'app/api/backups/route.ts'));identity=alice;await ok(await backupAPI.GET(),403);identity=owner;const noBackup=await ok(await backupAPI.GET());assert.equal(noBackup.stale,true);
 sql.prepare('INSERT INTO communication_settings(id,data,updated) VALUES (?,?,?)').run('backup_monitor',JSON.stringify({status:'Success',lastSuccess:new Date().toISOString(),snapshot:'abcdef1234567890'}),new Date().toISOString());
 await ok(await backupAPI.POST(request({snapshot:'abcdef1234567890',date:fieldDate,reason:'Restored into isolated test database; verified balances and login.'})));const backupState=await ok(await backupAPI.GET());assert.equal(backupState.monitor.restoreSnapshot,'abcdef1234567890');assert.equal(backupState.stale,false);
 const badReceipt={...invoice('primary',s1.id,[{productId:product.id,qty:1,scheme:'none'}]),lines:[{productId:product.id,qty:1,scheme:'none',expiry:'2026-02-30'}]};await ok(await commerce.POST(request(badReceipt)),400);
 const batchStockView=await ok(await commerce.GET());assert(batchStockView.batches.some(b=>b.batch==='TEST-BATCH'&&b.expiry==='2035-12-31'));identity=alice;const mrStockView=await ok(await commerce.GET());assert(mrStockView.batches.every(b=>b.stockistId==='company-stock'||JSON.parse(sql.prepare('SELECT stockist_ids FROM members WHERE email=?').get(alice.email).stockist_ids).includes(b.stockistId)));assert(mrStockView.batches.every(b=>!('cost' in b)&&!('rate' in b)));identity=owner;
 console.log('PASS: backup Admin-only monitoring and restore evidence, invalid optional expiry rejection, scoped MR batch expiry with no internal rates.');
 // Multi-district headquarters, canonical geography and safe legacy migration.
 identity=owner;
 const geoA=await ok(await records.POST(request({kind:'Districts',data:{Name:'Geography A',State:'State One'}})));
 const geoB=await ok(await records.POST(request({kind:'Districts',data:{Name:'Geography B',State:'State Two'}})));
 const geoC=await ok(await records.POST(request({kind:'Districts',data:{Name:'Geography C',State:'State One'}})));
 const geoHQ=await ok(await records.POST(request({kind:'Headquarters',data:{Name:'Multi HQ','District IDs':JSON.stringify([geoA.id,geoB.id])}})));
 const geoRoute=await ok(await records.POST(request({kind:'Routes',data:{Name:'Geo route',District:'Geography B',Headquarters:'Multi HQ'}})));
 await ok(await records.POST(request({kind:'Routes',data:{Name:'Invalid geo route',District:'Geography C',Headquarters:'Multi HQ'}})),400);
 await ok(await records.POST(request({kind:'Headquarters',data:{Name:'Invalid HQ','District IDs':'["missing"]'}})),400);
 await ok(await records.POST(request({id:geoHQ.id,kind:'Headquarters',data:{Name:'Multi HQ','District IDs':JSON.stringify([geoA.id])}})),409);
 await ok(await records.DELETE(request({id:geoB.id},'DELETE')),409);
 const geoCustomer=await ok(await records.POST(request({kind:'Customers',data:{Name:'Geography customer',Type:'Veterinary Doctor','Customer category':'Doctor','Route ID':geoRoute.id,State:'Wrong state',District:'Wrong district'}})));
 const geoData=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(geoCustomer.id).data);
 assert.equal(geoData.State,'State Two');assert.equal(geoData.District,'Geography B');assert.equal(geoData.Headquarters,'Multi HQ');
 await ok(await records.POST(request({id:geoB.id,kind:'Districts',data:{Name:'Geography B renamed',State:'State Two'}})));
 const geographyHelper=load(path.join(root,'lib/geography.ts'));
 const geoRows=(await ok(await records.GET())).records;
 assert(geographyHelper.headquartersCovers(geoRows.find(r=>r.id===geoHQ.id).data,'Geography B renamed',geoRows));
 const legacyHQ=await ok(await records.POST(request({kind:'Headquarters',data:{Name:'Legacy HQ',District:'Geography A'}})));
 assert.deepEqual(JSON.parse(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(legacyHQ.id).data)['District IDs']),[geoA.id]);
 identity=alice;const geographyPlanning=await ok(await load(path.join(root,'app/api/field-planning/route.ts')).GET());assert(geographyPlanning.districts.some(d=>d.id===geoC.id&&d.data.State==='State One'));
 await ok(await records.POST(request({kind:'Headquarters',data:{Name:'MR forbidden HQ',District:'Geography A'}})),403);identity=owner;
 console.log('PASS: headquarters cover multiple districts, invalid route links and removal blocked, canonical customer geography, stable district IDs on rename, legacy HQ migration, MR geography discovery without write access.');
 browserCookie=null;identity=owner;
 await ok(await team.POST(request({username:'simplemr',password:'x',name:'Simple MR',target:1000,status:'active'})));
 await ok(await team.POST(request({username:'emptymr',password:'',name:'Empty MR',target:1000,status:'active'})),400);
 browserCookie='';const simpleLogin=await login.POST(request({username:'simplemr',password:'x'}));await ok(simpleLogin);browserCookie=simpleLogin.headers.get('set-cookie').split(';')[0];
 await ok(await password.POST(request({currentPassword:'x',newPassword:'@'})));
 browserCookie='';await ok(await login.POST(request({username:'simplemr',password:'x'})),401);await ok(await login.POST(request({username:'simplemr',password:'@'})));
 browserCookie=null;identity=owner;
 await ok(await password.POST(request({currentPassword:'Admin-test-password-789',newPassword:'x'})),400);
 const routeWithoutAssignment=await ok(await records.POST(request({kind:'Routes',assignedTo:alice.email,data:{Name:'Unassigned master route',District:'Geography A'}})));
 assert.equal(sql.prepare('SELECT assigned_to FROM records WHERE id=?').get(routeWithoutAssignment.id).assigned_to,'');
 const stockMatch=load(path.join(root,'lib/territory-stockists.ts')).stockistMatchesTerritory;
 const territoryRows=[{id:'district1',kind:'Districts',data:{Name:'District 1'}},{id:'route1',kind:'Routes',data:{Name:'Route 1',District:'District 1',Headquarters:'HQ 1'}}];
 assert(stockMatch({id:'s',kind:'Stockists',data:{District:'District 1'}},{route_ids:['route1'],district_ids:[]},territoryRows));
 assert(stockMatch({id:'s',kind:'Stockists',data:{Headquarters:'HQ 1'}},{route_ids:[],district_ids:[],headquarters:'HQ 1'},territoryRows));
 assert(!stockMatch({id:'s',kind:'Stockists',data:{District:'District 2'}},{route_ids:['route1'],district_ids:[]},territoryRows));
 const multiStock=await ok(await records.POST(request({kind:'Stockists',data:{Name:'Two district supplier','District IDs':JSON.stringify([geoA.id,geoC.id])}})));
 const multiRows=(await ok(await records.GET())).records,multiRow=multiRows.find(r=>r.id===multiStock.id);
 assert(stockMatch(multiRow,{route_ids:[],district_ids:[geoA.id]},multiRows));assert(stockMatch(multiRow,{route_ids:[],district_ids:[geoC.id]},multiRows));assert(!stockMatch(multiRow,{route_ids:[],district_ids:[geoB.id]},multiRows));
 await ok(await records.DELETE(request({id:geoC.id},'DELETE')),409);
 await ok(await records.POST(request({kind:'Stockists',data:{Name:'Invalid district supplier','District IDs':'["not-a-district"]'}})),400);
 await ok(await records.POST(request({kind:'Stockists',data:{Name:'Malformed district supplier','District IDs':'bad'}})),400);
 const legacyStock=await ok(await records.POST(request({kind:'Stockists',data:{Name:'Legacy district supplier',District:'Geography A'}})));assert.deepEqual(JSON.parse(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(legacyStock.id).data)['District IDs']),[geoA.id]);
 await ok(await records.POST(request({id:multiStock.id,kind:'Stockists',data:{Name:'Two district supplier','District IDs':JSON.stringify([geoC.id])}})));assert.deepEqual(JSON.parse(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(multiStock.id).data)['District IDs']),[geoC.id]);
 console.log('PASS: multi-district stockist coverage, matching either district, legacy migration, invalid IDs rejected and linked district deletion blocked.');
 console.log('PASS: one-character MR creation/login/change, empty-password rejection, Admin policy retained, routes do not assign MRs, and territory stockist matching.');
 browserCookie=null;identity=owner;
 await ok(await team.POST(request({username:'monthmr',password:'a',name:'Month Target MR',status:'active'})));
 const monthMR=sql.prepare('SELECT * FROM members WHERE email=?').get('monthmr@mr.vetmech.invalid');assert.equal(monthMR.target,0);assert.equal(monthMR.mr_type,'Medical Representative');
 await ok(await team.POST(request({email:monthMR.email,username:'monthmr',name:'Month Target MR',status:'active',target:777,mr_type:'Manager'})));assert.equal(sql.prepare('SELECT target FROM members WHERE email=?').get(monthMR.email).target,0);assert.equal(sql.prepare('SELECT mr_type FROM members WHERE email=?').get(monthMR.email).mr_type,'Medical Representative');
 const targetMonth='2030-11',targetReps=sql.prepare("SELECT email FROM members WHERE role='mr' AND status='active'").all(),targetLines=targetReps.map(r=>({email:r.email,target:100}));
 await ok(await reports.POST(request({month:targetMonth,targets:[targetLines[0],targetLines[0]]})),400);
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM records WHERE id LIKE 'monthly-target:%:2030-11'").get().n,0);
 await ok(await reports.POST(request({month:targetMonth,total:100*targetLines.length,targets:targetLines})));
 const monthSummary=await ok(await reports.GET(reportURL(monthMR.email,targetMonth,true)));assert(monthSummary.summaries.filter(s=>targetLines.some(t=>t.email===s.email)).every(s=>s.target===10000&&s.targetSaved));
 await ok(await reports.POST(request({month:targetMonth,email:monthMR.email,target:350000})));
 const independent=await ok(await reports.GET(reportURL(monthMR.email,targetMonth,true)));assert.equal(independent.summaries.find(s=>s.email===monthMR.email).target,35000000);assert(independent.summaries.filter(s=>s.email!==monthMR.email&&targetLines.some(t=>t.email===s.email)).every(s=>s.target===10000));
 await ok(await reports.POST(request({month:'2030-10',targets:[{email:monthMR.email,target:250000}]})));
 const nextSummary=await ok(await reports.GET(reportURL(monthMR.email,'2030-12',true)));assert(nextSummary.summaries.every(s=>s.target===0&&!s.targetSaved));
 identity=alice;await ok(await reports.POST(request({month:targetMonth,total:100*targetLines.length,targets:targetLines})),403);identity=owner;
 sql.prepare("INSERT INTO period_locks(month,closed,closure_id,updated,admin_email,reason) VALUES (?,1,'monthly-target-lock',?,?,?)").run(targetMonth,new Date().toISOString(),owner.email,'Monthly target test');
 await ok(await reports.POST(request({month:targetMonth,total:100*targetLines.length,targets:targetLines})),409);
 console.log('PASS: MR creation without profile target, MR type fixed, independent MR/month targets, partial saves without a shared total, atomic save, new-month no carry-forward, Admin authorization and closed-month protection.');
 identity=owner;browserCookie=null;
 const unpriced=await ok(await records.POST(request({kind:'Products',data:{Name:'Manual receipt product',Pack:'100 ml',MRP:'100',PTR:'50',PTS:'0'}})));
 const manualPrimary={id:crypto.randomUUID(),kind:'primary',stockistId:s1.id,date:'2031-01-03',invoiceValue:1234.56,lines:[{productId:unpriced.id,qty:10,freeQty:3,packing:'100 ml',retailSchemes:['5+1','10+3','10%'],discountPercent:10,batch:'MANUAL',expiry:'2035-12-31'},{productId:product.id,qty:3,freeQty:1,retailScheme:'15%',discountPercent:5,batch:'TEST-BATCH',expiry:'2035-12-31'}]};
 const originalQty=qty(s1.id,product.id);await ok(await commerce.POST(request(manualPrimary)));assert.equal(qty(s1.id,unpriced.id),13);assert.equal(qty(s1.id,product.id),originalQty+4);
 const manualSaved=sql.prepare('SELECT * FROM invoices WHERE id=?').get(manualPrimary.id);assert.equal(manualSaved.subtotal,123456);assert.equal(manualSaved.total,123456);const manualItems=JSON.parse(manualSaved.items);assert.equal(manualItems[0].free,3);assert.equal(manualItems[0].rate,0);assert.equal(manualItems[0].subtotal,0);assert.equal(manualItems[0].retailScheme,'5+1 / 10+3 / 10%');assert.equal(manualItems[1].retailScheme,'15%');
 await ok(await commerce.POST(request({...manualPrimary,id:crypto.randomUUID(),invoiceValue:undefined})),400);
 await ok(await commerce.POST(request({...manualPrimary,id:crypto.randomUUID(),lines:[{...manualPrimary.lines[0],discountPercent:101}]})),400);assert.equal(qty(s1.id,unpriced.id),13);
 identity=alice;const manualMR=(await ok(await commerce.GET())).invoices.find(i=>i.id===manualPrimary.id);assert.equal(manualMR.items[0].packing,'100 ml');assert.equal(manualMR.items[0].retailScheme,'5+1 / 10+3 / 10%');assert(!('discountPercent' in manualMR.items[0]));assert(!('rate' in manualMR.items[0]));identity=owner;
 console.log('PASS: manual primary invoice total, no PTS requirement or line pricing, explicit paid/free stock only, retail scheme references, discount validation and MR-visible references without internal rates.');
 const receiptEdit={action:'editPrimary',id:manualPrimary.id,revision:1,reason:'Correct supplier quantity',invoiceValue:1500,number:'MANUAL-EDIT',lines:[{...manualPrimary.lines[0],qty:20,freeQty:2}]};
 identity=alice;await ok(await commerce.PATCH(request(receiptEdit,'PATCH')),403);identity=owner;
 await ok(await commerce.PATCH(request(receiptEdit,'PATCH')));assert.equal(qty(s1.id,unpriced.id),22);assert.equal(qty(s1.id,product.id),originalQty);assert.equal(sql.prepare('SELECT subtotal FROM invoices WHERE id=?').get(manualPrimary.id).subtotal,150000);
 await ok(await commerce.PATCH(request(receiptEdit,'PATCH')),409);assert.equal(qty(s1.id,unpriced.id),22);
 sql.prepare("INSERT INTO period_locks(month,closed,closure_id,updated,admin_email,reason) VALUES (?,1,'receipt-lock',?,?,?)").run('2031-01',new Date().toISOString(),owner.email,'Receipt lock');
 const deleteReceipt={action:'deletePrimary',id:manualPrimary.id,revision:2,reason:'Supplier correction'};
 await ok(await commerce.PATCH(request(deleteReceipt,'PATCH')),409);await ok(await commerce.PATCH(request({...receiptEdit,revision:2},'PATCH')),409);sql.prepare('DELETE FROM period_locks WHERE month=?').run('2031-01');
 await ok(await commerce.PATCH(request(deleteReceipt,'PATCH')));assert.equal(qty(s1.id,unpriced.id),0);assert(!sql.prepare('SELECT * FROM invoices WHERE id=?').get(manualPrimary.id));assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE invoice_id=?').get(manualPrimary.id).n,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM admin_audit WHERE entity_id=?').get(manualPrimary.id).n,2);
 await ok(await commerce.PATCH(request(deleteReceipt,'PATCH')),404);assert.equal(qty(s1.id,unpriced.id),0);
 console.log('PASS: primary edits/deletion adjust stock, preserve audit, reject stale edits, MR access, locked months and approximate quantities; repeated deletion cannot deduct twice.');
 const extraSchemeProduct={Name:'Many schemes',Pack:'100 ml',MRP:'100',PTR:'50',PTS:'40','Scheme 4 enabled':'Yes','Scheme 4 paid':'5','Scheme 4 free':'2','Scheme 20 enabled':'Yes','Scheme 20 paid':'10','Scheme 20 free':'3'};
 await ok(await records.POST(request({kind:'Products',data:extraSchemeProduct})));
 const priceExtra=load(path.join(root,'lib/field-rules.ts')).priceLine;assert.equal(priceExtra(extraSchemeProduct,'extra',10,'4',false).free,4);assert.equal(priceExtra(extraSchemeProduct,'extra',20,'20',false).free,6);assert.equal(priceExtra(extraSchemeProduct,'extra',10,'none',false).free,0);
 await ok(await records.POST(request({kind:'Products',data:{...extraSchemeProduct,Name:'Invalid extra scheme','Scheme 4 paid':'0'}})),400);
 console.log('PASS: additional product schemes beyond three validate and calculate correctly; no scheme remains available.');
 // Newer records belonging to other MRs must not crowd this MR out of limited lists.
 const otherInvoice=sql.prepare('INSERT INTO invoices(id,kind,stockist_id,customer_id,mr_email,number,date,items,subtotal,total,visit_id,notes,created,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const otherMessage=sql.prepare('INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,created) VALUES (?,?,?,?,?,?,?)');
 for(let i=0;i<1001;i++){otherInvoice.run('scope-invoice-'+i,'secondary',s1.id,ownBob.id,bob.email,'SCOPE-'+i,fieldDate,'[]',0,0,'','','2099-01-01T00:00:00Z','Cancelled');otherMessage.run('scope-message-'+i,'scope-message-'+i,bob.email,'919876543210','synthetic scope test','sent','2099-01-01T00:00:00Z');}
 identity=alice;const scopedSales=await ok(await commerce.GET());assert(scopedSales.invoices.some(i=>i.id===order.id));assert(!scopedSales.invoices.some(i=>i.id.startsWith('scope-invoice-')));
 const scopedMessages=await ok(await whatsapp.GET());assert(scopedMessages.messages.length>0);assert(scopedMessages.messages.every(x=>x.mr_email===alice.email));
 sql.prepare("DELETE FROM invoices WHERE id LIKE 'scope-invoice-%'").run();sql.prepare("DELETE FROM whatsapp_outbox WHERE id LIKE 'scope-message-%'").run();
 identity=owner;
 sql.prepare('UPDATE members SET role=? WHERE email=?').run('admin',bob.email);
 await ok(await team.POST(request({email:bob.email,name:'Other admin',password:'x',status:'active'})),403);
 assert.equal(sql.prepare('SELECT role FROM members WHERE email=?').get(bob.email).role,'admin');sql.prepare('UPDATE members SET role=? WHERE email=?').run('mr',bob.email);
 const accountAudit=sql.prepare("SELECT after_data FROM admin_audit WHERE entity_kind='Team'").all();assert(accountAudit.length>0);assert(accountAudit.every(r=>!r.after_data.includes('Test-only-password')&&!r.after_data.includes('password_hash')));
 console.log('PASS: scope before list limits, forged route approval bypass blocked, legacy password upgrade, cross-site rejection and credential-free account audit.');
 // VETMECH MSG order workflow: all network and SMTP calls remain synthetic.
 sql.exec('DELETE FROM period_locks');identity=owner;
 const currentConfig=(await ok(await communications.GET())).config;
 const templates=load(path.join(root,'lib/message-templates.ts'));
 const newConfig={...currentConfig,whatsappEnabled:true,whatsappUrl:'https://msg.vetmechpharma.in',whatsappKey:'synthetic-vetmech-api-key',whatsappSession:'connected-session',smtpEnabled:false,adminPhone:'919876543210',templates:templates.defaultTemplates()};
 await ok(await communications.POST(request({action:'save',config:newConfig})));
 const messageProduct=await post('Products',{Name:'Message Product',Pack:'100 ml',MRP:'200',PTR:'100',PTS:'80','GST %':'5'});
 const messageProduct2=await post('Products',{Name:'Message Tablet',Pack:'10 tablets',MRP:'100',PTR:'50',PTS:'40','GST %':'0'});
 const messageCustomer=await post('Customers',{Name:'Dr. Message Customer','Mobile 1':'919876543219',Address:'Customer registered address',Route:'Uthukuli'},{assignedTo:alice.email});
 await post('Stockists',{...JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(s1.id).data),'Mobile 2':'919876543218','Order WhatsApp contact':'Mobile 2'},{id:s1.id});
 await ok(await commerce.POST(request(invoice('primary',s1.id,[{productId:messageProduct.id,qty:100,packing:'Receipt override'},{productId:messageProduct2.id,qty:100}]))));
 const messageReceipt=sql.prepare("SELECT items FROM invoices WHERE kind='primary' AND items LIKE ?").get('%'+messageProduct.id+'%');assert.equal(JSON.parse(messageReceipt.items)[0].packing,'Receipt override');
 await ok(await commerce.POST(request(invoice('company_receipt','company-stock',[{productId:messageProduct.id,qty:100},{productId:messageProduct2.id,qty:100}]))));
 let sent=[],remoteMessages=new Map(),nextGatewayStatus='submitted',getMode='',failPartTwo=false;
 const beforeMessageFetch=global.fetch;
 global.fetch=async(url,init={})=>{
  const u=new URL(String(url));assert.equal(u.origin,'https://msg.vetmechpharma.in');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization||init.headers.authorization,'Bearer synthetic-vetmech-api-key');
  if(init.method==='POST'){
   assert.equal(u.pathname,'/api/v1/messages/send');const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body).sort(),['phone','sessionId','text']);assert.equal(body.sessionId,'connected-session');assert(/^\d{10,15}$/.test(body.phone));assert(body.text.length<=4096);const key=init.headers['Idempotency-Key'];assert(key);sent.push({key,...body});
   if(failPartTwo&&key.includes(':agency:')&&key.endsWith(':part:2'))return new Response('{}',{status:403});
   const message={id:'gateway-'+sent.length,phone:body.phone,sessionId:body.sessionId,status:nextGatewayStatus};remoteMessages.set(message.id,message);return new Response(JSON.stringify(message),{status:202});
  }
  assert.equal(init.method,undefined);if(getMode==='forbidden')return new Response('{}',{status:403});const message=remoteMessages.get(decodeURIComponent(u.pathname.split('/').pop()));assert(message);return new Response(JSON.stringify(getMode==='mismatch'?{...message,sessionId:'other-session'}:message),{status:200});
 };
 try{
  identity=alice;
  const freshOrder=invoice('secondary',s1.id,[{productId:messageProduct.id,qty:2},{productId:messageProduct2.id,qty:3}],{customerId:messageCustomer.id,notes:'Private pricing adjustment ₹9999'});
  assert((await ok(await commerce.POST(request(freshOrder)))).pendingApproval);
  assert.equal(sent.length,1);assert(!sent.some(m=>m.phone==='919876543219'));assert(!sent.some(m=>m.key.includes(':agency:')));
  for(const m of sent){assert(m.text.startsWith('Dear Dr. Message Customer,'));assert(m.text.includes('Message Product · Packing: 100 ml · Qty: 2'));assert(m.text.includes('Message Tablet · Packing: 10 tablets · Qty: 3'));assert(m.text.includes(templates.messageDate(fieldDate)));assert(!/₹|9999|subtotal|order value|rate:/i.test(m.text));}
  assert.equal((await ok(await commerce.GET())).invoices.find(i=>i.id===freshOrder.id).stage,'Pending Admin approval');
  assert((await ok(await approvals.GET())).requests.some(r=>r.kind==='order_approval'&&r.record_id===freshOrder.id));
  await ok(await commerce.PATCH(request({id:freshOrder.id,requestId:crypto.randomUUID(),revision:1,action:'approveOrder'})),403);
  identity=bob;assert(!(await ok(await approvals.GET())).orders.some(o=>o.id===freshOrder.id));
  identity=owner;const approvalAction={id:freshOrder.id,requestId:crypto.randomUUID(),revision:1,action:'approveOrder'};
  await ok(await commerce.PATCH(request(approvalAction)));const afterFirstSend=sent.length;
  await ok(await commerce.PATCH(request(approvalAction)));assert.equal(sent.length,afterFirstSend);
  await ok(await commerce.PATCH(request({...approvalAction,requestId:crypto.randomUUID()})),409);
  const forwarded=sql.prepare('SELECT * FROM invoices WHERE id=?').get(freshOrder.id);assert.equal(forwarded.accepted,1);assert.equal(forwarded.forwarded_revision,2);assert.equal(forwarded.status,'Placed');assert.equal(qty(s1.id,messageProduct.id),98);
  assert.equal((await ok(await commerce.GET())).invoices.find(i=>i.id===freshOrder.id).stage,'Forwarded to stockist');
  const agencyMsg=sent.find(m=>m.key.includes(freshOrder.id)&&m.key.includes(':agency:'));assert.equal(agencyMsg.phone,'919876543218');assert(agencyMsg.text.includes('Customer registered address'));assert(agencyMsg.text.includes('919876543219'));
  assert(sql.prepare("SELECT id FROM notifications WHERE recipient=? AND title='Order forwarded to stockist' AND record_id=?").get(alice.email,freshOrder.id));
  await ok(await commerce.PATCH(request({id:freshOrder.id,requestId:crypto.randomUUID(),revision:2,action:'status',status:'Delivered'})),403);
  const agencyLog=sql.prepare('SELECT * FROM whatsapp_outbox WHERE id=?').get(agencyMsg.key);assert.equal(agencyLog.status,'submitted');assert(agencyLog.gateway_id);
  remoteMessages.get(agencyLog.gateway_id).status='read';await ok(await communications.POST(request({action:'status',id:agencyLog.id})));assert.equal(sent.length,afterFirstSend);assert.equal(sql.prepare('SELECT status FROM whatsapp_outbox WHERE id=?').get(agencyLog.id).status,'read');
  getMode='forbidden';await ok(await communications.POST(request({action:'status',id:agencyLog.id})),502);getMode='mismatch';await ok(await communications.POST(request({action:'status',id:agencyLog.id})),502);getMode='';assert.equal(sent.length,afterFirstSend);
  identity=alice;await ok(await communications.POST(request({action:'status',id:agencyLog.id})),403);
  const approvedChange={id:freshOrder.id,requestId:crypto.randomUUID(),revision:2,lines:[{productId:messageProduct.id,qty:1,scheme:'none'},{productId:messageProduct2.id,qty:3,scheme:'none'}]};assert((await ok(await commerce.PATCH(request(approvedChange)))).pendingApproval);assert.equal(sent.length,afterFirstSend);
  identity=owner;const priceBefore=JSON.parse(forwarded.items)[0].rate;await post('Products',{...JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(messageProduct.id).data),PTR:'125'},{id:messageProduct.id});const approveChange=await ok(await approvals.GET());await ok(await commerce.PATCH(request({action:'approve',requestId:approvedChange.requestId,hash:approveChange.hash})));assert.equal(JSON.parse(sql.prepare('SELECT items FROM invoices WHERE id=?').get(freshOrder.id).items)[0].rate,priceBefore);assert.equal(sql.prepare('SELECT forwarded_revision FROM invoices WHERE id=?').get(freshOrder.id).forwarded_revision,3);
  const forwardReport=await ok(await reports.GET(reportURL()));assert(forwardReport.tables.find(t=>t.title==='Approved stockist orders — forwarding detail').rows.some(r=>r[0]===forwarded.number));
  identity=alice;const companyOrder=invoice('secondary','company-stock',[{productId:messageProduct.id,qty:2},{productId:messageProduct2.id,qty:1}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(companyOrder)));
  identity=owner;await ok(await commerce.PATCH(request({id:companyOrder.id,requestId:crypto.randomUUID(),revision:1,action:'status',status:'Delivered'})),403);
  await ok(await commerce.PATCH(request({id:companyOrder.id,requestId:crypto.randomUUID(),revision:1,action:'approveOrder'})));
  identity=alice;await ok(await commerce.PATCH(request({id:companyOrder.id,requestId:crypto.randomUUID(),revision:2,action:'status',status:'Delivered'})),403);
  identity=owner;await ok(await commerce.PATCH(request({id:companyOrder.id,requestId:crypto.randomUUID(),revision:2,action:'status',status:'Delivered'})));assert.equal(qty('company-stock',messageProduct.id),100);assert.equal(qty(s1.id,messageProduct.id),99);
  assert.equal((await ok(await commerce.GET())).invoices.find(i=>i.id===companyOrder.id).stage,'Completed');assert(!sent.some(m=>m.key.includes(companyOrder.id)&&m.key.includes(':agency:')));assert(sent.some(m=>m.key.includes(companyOrder.id)&&m.key.endsWith(':completed')));
  await ok(await commerce.PATCH(request({id:companyOrder.id,requestId:crypto.randomUUID(),revision:3,action:'status',status:'Delivered'})),409);
  // Old unsent templates cannot bypass approval, even when retrying from Admin.
  const oldId='order:'+standardDirect.id+':1:agency';sql.prepare("INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,created) VALUES (?,?,?,?,?,'failed',?)").run(oldId,'order:'+standardDirect.id+':agency:'+s1.id,alice.email,'919876543218','Old value ₹100',new Date().toISOString());const beforeOldRetry=sent.length;await ok(await communications.POST(request({action:'retry',channel:'whatsapp',id:oldId})));assert.equal(sent.length,beforeOldRetry);assert.equal(sql.prepare('SELECT status FROM whatsapp_outbox WHERE id=?').get(oldId).status,'superseded');
  // Provider states remain truthful. Once an ID exists, retries query rather than resend.
  for(const mode of ['queued','uncertain','not_sent','demo_only']){nextGatewayStatus=mode;await ok(await communications.POST(request({action:'test',channel:'whatsapp'})));const sentTest=sent.at(-1),log=sql.prepare('SELECT * FROM whatsapp_outbox WHERE id=?').get(sentTest.key);assert.equal(log.status,mode==='queued'?'accepted':mode);const n=sent.length;await ok(await communications.POST(request({action:'retry',channel:'whatsapp',id:log.id})));assert.equal(sent.length,n);remoteMessages.get(log.gateway_id).status='submitted';await ok(await communications.POST(request({action:'status',id:log.id})));assert.equal(sent.length,n);assert.equal(sql.prepare('SELECT status FROM whatsapp_outbox WHERE id=?').get(log.id).status,'submitted');}
  nextGatewayStatus='submitted';
  // Multipart forwarding is complete only when EVERY part has gateway acceptance.
  const longTemplate=templates.messageTemplates.stockist_forward.body.padEnd(4050,' Information.');
  assert(longTemplate.length<=4096);await ok(await communications.POST(request({action:'save',config:{...newConfig,templates:{...newConfig.templates,stockist_forward:longTemplate}}})));
  await post('Customers',{...JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(messageCustomer.id).data),Address:'Customer address '+ 'A'.repeat(700)},{id:messageCustomer.id,assignedTo:alice.email});
  identity=alice;const multipartOrder=invoice('secondary',s1.id,[{productId:messageProduct.id,qty:1},{productId:messageProduct2.id,qty:1}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(multipartOrder)));identity=owner;failPartTwo=true;await ok(await commerce.PATCH(request({id:multipartOrder.id,requestId:crypto.randomUUID(),revision:1,action:'approveOrder'})));
  const partRows=sql.prepare("SELECT * FROM whatsapp_outbox WHERE visit_id=? ORDER BY id").all('order:'+multipartOrder.id+':agency:'+s1.id);assert(partRows.length>=2);assert(partRows.every(p=>p.message.length<=4096));assert.equal(sql.prepare('SELECT forwarded_revision FROM invoices WHERE id=?').get(multipartOrder.id).forwarded_revision,0);assert.equal((await ok(await commerce.GET())).invoices.find(i=>i.id===multipartOrder.id).stage,'Approved — forwarding needs attention');
  failPartTwo=false;for(const p of partRows.filter(p=>p.status==='failed'))await ok(await communications.POST(request({action:'retry',channel:'whatsapp',id:p.id})));assert.equal(sql.prepare('SELECT forwarded_revision FROM invoices WHERE id=?').get(multipartOrder.id).forwarded_revision,2);
  const newMonthLock=fieldDate.slice(0,7);sql.prepare("INSERT INTO period_locks(month,closed,closure_id,updated,admin_email,reason) VALUES (?,1,'communications-lock',?,?,?)").run(newMonthLock,new Date().toISOString(),owner.email,'Reviewed test');
  await ok(await commerce.PATCH(request({id:multipartOrder.id,requestId:crypto.randomUUID(),revision:2,action:'status',status:'Cancelled',reason:'Locked month test'})),409);
  await ok(await commerce.PATCH(request({id:standardDirect.id,requestId:crypto.randomUUID(),revision:1,action:'approveOrder'})),409);sql.prepare('DELETE FROM period_locks WHERE month=?').run(newMonthLock);
  // Each visit sends once, with optional order products and no prices; closing retry is idempotent.
  sql.prepare("DELETE FROM records WHERE kind='Attendance' AND assigned_to=? AND json_extract(data,'$.Date')=?").run(alice.email,fieldDate);
  identity=alice;await post('Attendance',attend('Check in'));const messageVisit=await post('Visits',{Customer:'Dr. Message Customer','Customer ID':messageCustomer.id,Date:fieldDate,Purpose:'Review'});
  const visitOrder=invoice('secondary',s1.id,[{productId:messageProduct.id,qty:1},{productId:messageProduct2.id,qty:2}],{customerId:messageCustomer.id,visitId:messageVisit.id});await ok(await commerce.POST(request(visitOrder)));
  await ok(await closeVisit.POST(request({id:messageVisit.id,gps:gps()})));const visitMsg=sent.find(m=>m.key==='visit:'+messageVisit.id);assert(visitMsg);assert(visitMsg.text.startsWith('Dear Dr. Message Customer,'));assert(visitMsg.text.includes('100 ml'));assert(visitMsg.text.includes('10 tablets'));assert(!/₹|rate|value/i.test(visitMsg.text));const afterVisitCount=sent.length;await ok(await closeVisit.POST(request({id:messageVisit.id,gps:gps()})));assert.equal(sent.length,afterVisitCount);
  identity=owner;const rejectPending=await ok(await commerce.PATCH(request({id:visitOrder.id,requestId:crypto.randomUUID(),revision:1,action:'status',status:'Cancelled',reason:'Customer changed plans'})));assert(rejectPending.ok);assert(!sent.some(m=>m.key.includes(visitOrder.id)&&m.key.includes(':agency:')));
  sql.prepare("UPDATE whatsapp_outbox SET created=? WHERE visit_id=?").run(new Date(Date.now()-31*86400000).toISOString(),'order:'+freshOrder.id+':agency:'+s1.id);await ok(await communications.GET());assert.equal((await ok(await commerce.GET())).invoices.find(i=>i.id===freshOrder.id).stage,'Forwarded to stockist');
 }finally{global.fetch=beforeMessageFetch;identity=owner;await ok(await communications.POST(request({action:'save',config:{...newConfig,whatsappEnabled:false}})));}
 console.log('PASS: new gateway payload/auth/idempotency/status checks; quantity-only customer/Admin templates; mandatory approval; scoped review; stockist forwarding and MR notification; no stockist completion; Admin company completion; saved rates; stale/duplicate actions; all multipart parts; month locks; visit-close once; 30-day log receipt retention. No external sends.');

 // Approximate stock and approved-order achievement are independent of batch/expiry or completion.
 identity=owner;
 const bulkProduct=await post('Products',{Name:'ZEBUCAL LIQ test',Pack:'1 litre',MRP:'200',PTR:'100',PTS:'75','Sample cost':'4','GST %':'5','Scheme 1 enabled':'Yes','Scheme 1 paid':'30','Scheme 1 free':'8'});
 const yesterday=new Date(Date.parse(fieldDate+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const expiredReceipt=(source)=>({...invoice(source==='company-stock'?'company_receipt':'primary',source,[{productId:bulkProduct.id,qty:5}]),date:yesterday,lines:[{productId:bulkProduct.id,qty:5,scheme:'none',batch:'EXPIRED',expiry:yesterday}]});
 await ok(await commerce.POST(request(expiredReceipt(s1.id))));await ok(await commerce.POST(request(expiredReceipt('company-stock'))));
 const baseAchievement=(await ok(await reports.GET(reportURL()))).summary.achieved;
 identity=alice;const productReference=(await ok(await records.GET())).records.find(r=>r.id===bulkProduct.id).data;
 assert.equal(productReference.PTS,'75');assert.equal(productReference.PTR,'100');assert(!('Sample cost' in productReference));
 const bulkAgency=invoice('secondary',s1.id,[{productId:bulkProduct.id,qty:30,scheme:'1'}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(bulkAgency)));
 let bulkView=(await ok(await commerce.GET())).stock.find(b=>b.stockist_id===s1.id&&b.product_id===bulkProduct.id);
 assert.equal(bulkView.quantity,5);assert.equal(bulkView.expired,0);assert.equal(bulkView.reserved,38);assert.equal(bulkView.shortage,33);
 assert.equal((await ok(await reports.GET(reportURL()))).summary.achieved,baseAchievement);
 identity=owner;const approveBulk={id:bulkAgency.id,revision:1,requestId:crypto.randomUUID(),action:'approveOrder'};
 await ok(await commerce.PATCH(request(approveBulk)));await ok(await commerce.PATCH(request(approveBulk)));
 assert.equal(qty(s1.id,bulkProduct.id),-33);assert(!sql.prepare('SELECT id FROM stock_reservations WHERE order_id=?').get(bulkAgency.id));
 let approvedSummary=(await ok(await reports.GET(reportURL()))).summary;assert.equal(approvedSummary.achieved,baseAchievement+300000);assert.equal(approvedSummary.pending,Math.max(0,approvedSummary.target-approvedSummary.achieved));assert.equal(approvedSummary.percentage,approvedSummary.target?approvedSummary.achieved/approvedSummary.target*100:0);
 await ok(await commerce.PATCH(request({id:bulkAgency.id,revision:2,requestId:crypto.randomUUID(),action:'status',status:'Delivered'})),403);
 const received=sql.prepare("SELECT message FROM whatsapp_outbox WHERE visit_id=? AND id LIKE ?").get('order:'+bulkAgency.id+':customer:'+messageCustomer.id,'%:approved');assert(received.message.includes('Your order has been received.'));assert.equal((received.message.match(/Dear Dr\./g)||[]).length,1);assert(received.message.endsWith('Regards\n*VETMECH PHARMA*'));assert(!/Customer:|Supply from:|Revision:|Status:|₹|rate:/i.test(received.message));assert(received.message.includes('Qty: 30 + Free qty: 8'));
 identity=alice;const approxEdit={id:bulkAgency.id,revision:2,requestId:crypto.randomUUID(),lines:[{productId:bulkProduct.id,qty:60,scheme:'1'}],notes:'Double the requested quantity'};
 assert((await ok(await commerce.PATCH(request(approxEdit)))).pendingApproval);assert.equal(qty(s1.id,bulkProduct.id),-33);
 const proposal=JSON.parse(sql.prepare('SELECT body FROM workflow_requests WHERE id=?').get(approxEdit.requestId).body);assert.equal(JSON.parse(proposal.beforeOrder.items)[0].qty,30);assert.equal(proposal.proposedItems[0].qty,60);assert.equal(proposal.proposedItems[0].free,16);
 identity=owner;let approxReview=await ok(await approvals.GET());await ok(await commerce.PATCH(request({action:'approve',requestId:approxEdit.requestId,hash:approxReview.hash})));
 assert.equal(qty(s1.id,bulkProduct.id),-71);assert.equal((await ok(await reports.GET(reportURL()))).summary.achieved,baseAchievement+600000);
 const editedMessage=sql.prepare('SELECT message FROM whatsapp_outbox WHERE id=?').get('order:'+bulkAgency.id+':3:customer:updated').message;assert(editedMessage.includes('Your order has been updated.'));assert(editedMessage.includes('Qty: 60 + Free qty: 16'));assert(!editedMessage.includes('Qty: 30'));
 approxReview=await ok(await approvals.GET());const approvedEdit=JSON.parse(approxReview.requests.find(r=>r.id===approxEdit.requestId).body);assert.equal(JSON.parse(approvedEdit.beforeOrder.items)[0].qty,30);assert.equal(JSON.parse(approvedEdit.afterOrder.items)[0].qty,60);
 identity=alice;const rejectedAmendment={...approxEdit,revision:3,requestId:crypto.randomUUID(),lines:[{productId:bulkProduct.id,qty:1,scheme:'none'}]};await ok(await commerce.PATCH(request(rejectedAmendment)));identity=owner;await ok(await commerce.PATCH(request({action:'reject',requestId:rejectedAmendment.requestId,reason:'Keep the approved quantity'})));assert.equal(qty(s1.id,bulkProduct.id),-71);
 identity=alice;const deleteApproved={id:bulkAgency.id,revision:3,requestId:crypto.randomUUID(),action:'delete',reason:'Customer withdrew order'};
 assert((await ok(await commerce.PATCH(request(deleteApproved)))).pendingApproval);assert.equal(qty(s1.id,bulkProduct.id),-71);
 identity=bob;await ok(await commerce.PATCH(request(deleteApproved)),403);identity=owner;approxReview=await ok(await approvals.GET());await ok(await commerce.PATCH(request({action:'approve',requestId:deleteApproved.requestId,hash:approxReview.hash})));
 assert.equal(qty(s1.id,bulkProduct.id),5);assert.equal((await ok(await reports.GET(reportURL()))).summary.achieved,baseAchievement);assert.equal(sql.prepare('SELECT status FROM invoices WHERE id=?').get(bulkAgency.id).status,'Cancelled');assert.equal(sql.prepare('SELECT status FROM workflow_requests WHERE id=?').get(deleteApproved.requestId).status,'Approved');
 assert(sql.prepare('SELECT message FROM whatsapp_outbox WHERE id=?').get('order:'+bulkAgency.id+':4:customer:cancelled').message.includes('Your order has been cancelled.'));
 await ok(await commerce.PATCH(request({action:'approve',requestId:deleteApproved.requestId,hash:approxReview.hash})),409);assert.equal(qty(s1.id,bulkProduct.id),5);
 // Direct company completion neither requires nor changes any company/agency balance.
 identity=alice;const bulkCompany=invoice('secondary','company-stock',[{productId:bulkProduct.id,qty:100,proposedRate:80}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(bulkCompany)));
 identity=owner;await ok(await commerce.POST(request({action:'approveDirect',requestId:bulkCompany.id})));assert.equal((await ok(await reports.GET(reportURL()))).summary.achieved,baseAchievement+800000);
 const completeBulk={id:bulkCompany.id,revision:1,requestId:crypto.randomUUID(),action:'status',status:'Delivered'};await ok(await commerce.PATCH(request(completeBulk)));await ok(await commerce.PATCH(request(completeBulk)));
 assert.equal(qty('company-stock',bulkProduct.id),5);assert.equal(qty(s1.id,bulkProduct.id),5);assert.equal((await ok(await reports.GET(reportURL()))).summary.achieved,baseAchievement+800000);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE invoice_id=?').get(bulkCompany.id).n,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM stock_reservations WHERE order_id=?').get(bulkCompany.id).n,0);
 assert(!JSON.parse(sql.prepare('SELECT items FROM invoices WHERE id=?').get(bulkCompany.id).items)[0].allocations);
 const zeroProduct=await post('Products',{Name:'Unstocked bulk product',Pack:'Box',PTR:'50',PTS:'40'});
 identity=alice;const zeroCompany=invoice('secondary','company-stock',[{productId:zeroProduct.id,qty:12}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(zeroCompany)));
 identity=owner;await ok(await commerce.PATCH(request({id:zeroCompany.id,revision:1,requestId:crypto.randomUUID(),action:'approveOrder'})));await ok(await commerce.PATCH(request({id:zeroCompany.id,revision:2,requestId:crypto.randomUUID(),action:'status',status:'Delivered'})));assert.equal(qty('company-stock',zeroProduct.id),0);
 identity=alice;const zeroOrder=invoice('secondary',s1.id,[{productId:zeroProduct.id,qty:12}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(zeroOrder)));
 identity=owner;await ok(await commerce.PATCH(request({id:zeroOrder.id,revision:1,requestId:crypto.randomUUID(),action:'approveOrder'})));assert.equal(qty(s1.id,zeroProduct.id),-12);
 const zeroStatement=(await ok(await statement.GET(new Request('https://example.test/api/stock-statement?from=2020-01-01&to=2099-12-31')))).summary.find(b=>b.stockistId===s1.id&&b.productId===zeroProduct.id);assert.equal(zeroStatement.shortage,12);
 // Primary stock can be added/edited/deleted without batch metadata despite negative approximate stock.
 const optionalReceipt={id:crypto.randomUUID(),kind:'primary',stockistId:s1.id,date:fieldDate,invoiceValue:400,lines:[{productId:zeroProduct.id,qty:3,freeQty:1}]};await ok(await commerce.POST(request(optionalReceipt)));assert.equal(qty(s1.id,zeroProduct.id),-8);
 await ok(await commerce.PATCH(request({id:optionalReceipt.id,revision:1,action:'editPrimary',reason:'Adjust received quantity',invoiceValue:200,lines:[{productId:zeroProduct.id,qty:2}]})));assert.equal(qty(s1.id,zeroProduct.id),-10);
 await ok(await commerce.PATCH(request({id:optionalReceipt.id,revision:2,action:'deletePrimary',reason:'Duplicate receipt'})));assert.equal(qty(s1.id,zeroProduct.id),-12);
 await ok(await commerce.PATCH(request({id:zeroOrder.id,revision:2,requestId:crypto.randomUUID(),action:'delete',reason:'Customer withdrew request'})));assert.equal(qty(s1.id,zeroProduct.id),0);
 identity=alice;const rejectOrder=invoice('secondary',s1.id,[{productId:zeroProduct.id,qty:2}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(rejectOrder)));identity=owner;
 await ok(await commerce.PATCH(request({id:rejectOrder.id,revision:1,requestId:crypto.randomUUID(),action:'rejectOrder',reason:'Order not approved'})));assert(sql.prepare('SELECT message FROM whatsapp_outbox WHERE id=?').get('order:'+rejectOrder.id+':2:customer:rejected').message.includes('Your order has been rejected.'));assert.equal(qty(s1.id,zeroProduct.id),0);
 identity=alice;const removePending=invoice('secondary',s1.id,[{productId:zeroProduct.id,qty:2}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(removePending)));await ok(await commerce.PATCH(request({id:removePending.id,revision:1,requestId:crypto.randomUUID(),action:'delete',reason:'Entered twice'})));assert.equal(sql.prepare('SELECT status FROM invoices WHERE id=?').get(removePending.id).status,'Cancelled');
 identity=owner;sql.prepare("INSERT INTO period_locks VALUES (?,1,'approx-lock',?,?,?)").run(fieldDate.slice(0,7),new Date().toISOString(),owner.email,'Monthly review');await ok(await commerce.PATCH(request({id:zeroCompany.id,revision:3,requestId:crypto.randomUUID(),action:'delete',reason:'Locked month'})),409);sql.exec('DELETE FROM period_locks');
 console.log('PASS: approved-order target recognition, quantity/free-unit deductions into negative approximate balances, edits/deletion and reversals, original/updated snapshots, concise customer messages, optional receipt batches, no company inventory or expiry gate, no double counting, ownership and month locks. No external sends.');

 // Calculator fields are server-validated and landing cost never reaches MR responses.
 identity=owner;
 const pricingData={Name:'GST pricing test',Pack:'100 ml',MRP:'105','GST %':'5','Retail margin %':'20','Stockist margin %':'10','Landing cost':'40',PTR:'999',PTS:'999','Scheme 1 enabled':'Yes','Scheme 1 paid':'10','Scheme 1 free':'3','Scheme 2 enabled':'Yes','Scheme 2 type':'Discount','Scheme 2 discount %':'5'};
 const pricingProduct=await post('Products',pricingData);let pricedData=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(pricingProduct.id).data);
 assert.equal(pricedData.PTR,'80.00');assert.equal(pricedData.PTS,'72.00');assert.equal(pricedData['Landing cost'],'40');
 await ok(await records.POST(request({kind:'Products',data:{...pricingData,Name:'Invalid pricing test','GST %':'101'}})),400);
 await ok(await records.POST(request({kind:'Products',data:{...pricingData,Name:'Invalid cost test','Landing cost':'-1'}})),400);
 identity=alice;let publicPrice=(await ok(await records.GET())).records.find(p=>p.id===pricingProduct.id);assert.equal(publicPrice.data.PTR,'80.00');assert(!('Landing cost' in publicPrice.data));
 await ok(await records.POST(request({kind:'Products',id:pricingProduct.id,data:{...pricingData,PTR:'1'}})),403);
 const schemeOrder=invoice('secondary',s1.id,[{productId:pricingProduct.id,qty:10,scheme:'1'}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(schemeOrder)));
 let pricedOrder=sql.prepare('SELECT * FROM invoices WHERE id=?').get(schemeOrder.id);let pricedLine=JSON.parse(pricedOrder.items)[0];assert.equal(pricedLine.subtotal,80000);assert.equal(pricedLine.total,84000);assert.equal(pricedLine.free,3);assert(!JSON.stringify(pricedLine).includes('Landing cost'));
 const discountOrder=invoice('secondary',s1.id,[{productId:pricingProduct.id,qty:10,scheme:'2'}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(discountOrder)));
 const discountLine=JSON.parse(sql.prepare('SELECT items FROM invoices WHERE id=?').get(discountOrder.id).items)[0];assert.equal(discountLine.rate,7600);assert.equal(discountLine.total,79800);
 identity=owner;await post('Products',{...pricingData,MRP:'210','Scheme 2 discount %':'20'},{id:pricingProduct.id});
 identity=alice;await ok(await commerce.PATCH(request({id:discountOrder.id,revision:1,requestId:crypto.randomUUID(),lines:[{productId:pricingProduct.id,qty:12,scheme:'2'}],notes:'Quantity correction'})));
 const preservedPrice=JSON.parse(sql.prepare('SELECT items FROM invoices WHERE id=?').get(discountOrder.id).items)[0];assert.equal(preservedPrice.rate,7600);assert.equal(preservedPrice.schemeDiscount,5);assert.equal(preservedPrice.total,95760);
 identity=owner;assert.equal((await ok(await records.GET())).records.find(p=>p.id===pricingProduct.id).data['Landing cost'],'40');
 console.log('PASS: product calculator API validation, derived-price tamper resistance, MR cost isolation, scheme order totals and unchanged saved prices after catalogue updates.');

 // Product-scheme references and stockist bulk terms are separate on primary receipts.
 const schemeReceipt={id:crypto.randomUUID(),kind:'primary',stockistId:s1.id,date:fieldDate,invoiceValue:7000,lines:[{productId:pricingProduct.id,qty:100,freeQty:20,retailSchemeIds:['1','2'],retailSchemes:['forged retail text'],stockistOffer:'10 cases plus 2 cases private deal',discountPercent:17,batch:'RETAIL-SCHEME',expiry:'2035-12-31'}]};
 await ok(await commerce.POST(request(schemeReceipt)));
 let receiptStored=sql.prepare('SELECT * FROM invoices WHERE id=?').get(schemeReceipt.id),receiptLineSaved=JSON.parse(receiptStored.items)[0];
 assert.deepEqual(receiptLineSaved.retailSchemeIds,['1','2']);assert.deepEqual(receiptLineSaved.retailSchemes,['10 + 3','20% discount']);assert.equal(receiptLineSaved.free,20);assert.equal(qty(s1.id,pricingProduct.id),120);assert.equal(receiptStored.subtotal,700000);assert.equal(receiptLineSaved.discountPercent,17);
 await ok(await commerce.POST(request({...schemeReceipt,id:crypto.randomUUID(),lines:[{...schemeReceipt.lines[0],retailSchemeIds:['3']}]})),400);assert.equal(qty(s1.id,pricingProduct.id),120);
 await post('Products',{...pricingData,MRP:'210','Scheme 1 enabled':'No','Scheme 2 discount %':'25'},{id:pricingProduct.id});
 await ok(await commerce.PATCH(request({action:'editPrimary',id:schemeReceipt.id,revision:1,reason:'Correct bulk units',invoiceValue:8000,lines:[{...schemeReceipt.lines[0],qty:110,freeQty:25}]},'PATCH')));
 receiptStored=sql.prepare('SELECT * FROM invoices WHERE id=?').get(schemeReceipt.id);receiptLineSaved=JSON.parse(receiptStored.items)[0];assert.deepEqual(receiptLineSaved.retailSchemes,['10 + 3','20% discount']);assert.equal(qty(s1.id,pricingProduct.id),135);
 identity=alice;const publicReceipt=(await ok(await commerce.GET())).invoices.find(i=>i.id===schemeReceipt.id);assert.deepEqual(publicReceipt.items[0].retailSchemes,['10 + 3','20% discount']);assert(!('stockistOffer' in publicReceipt.items[0]));assert(!('discountPercent' in publicReceipt.items[0]));
 const schemeReport=await ok(await reports.GET(reportURL(alice.email,schemeReceipt.date.slice(0,7)))),primaryTable=schemeReport.tables.find(t=>t.title==='Primary sales — linked agencies');assert(!primaryTable.columns.some(c=>/discount|bulk offer/i.test(c)));assert(!JSON.stringify(schemeReport).includes('10 cases plus 2 cases private deal'));assert(primaryTable.rows.every(r=>r.length===primaryTable.columns.length));
 identity=owner;const adminSchemeReport=await ok(await reports.GET(reportURL(alice.email,schemeReceipt.date.slice(0,7)))),adminPrimary=adminSchemeReport.tables.find(t=>t.title==='Primary sales — linked agencies');assert(adminPrimary.columns.includes('Stockist bulk offer'));assert(JSON.stringify(adminPrimary).includes('10 cases plus 2 cases private deal'));assert(adminPrimary.rows.every(r=>r.length===adminPrimary.columns.length));
 console.log('PASS: primary catalogue scheme validation and snapshots, independent bulk/free stock, invoice totals and Admin-only stockist offers in live and printable MR data.');


 // Custom schemes are reviewed before an invoice can enter the order approval queue.
 identity=owner;
 const customProductData={Name:'Custom offer product',Pack:'100 ml',MRP:'105',PTR:'80',PTS:'72','GST %':'5'};
 const customProduct=await post('Products',customProductData),customSecond=await post('Products',{Name:'Standard companion product',Pack:'Box',MRP:'60',PTR:'50',PTS:'40'});
 for(const source of [s1.id,'company-stock'])await ok(await commerce.POST(request(invoice(source==='company-stock'?'company_receipt':'primary',source,[{productId:customProduct.id,qty:100},{productId:customSecond.id,qty:50}]))));
 const customOrder=()=>invoice('secondary',s1.id,[{productId:customProduct.id,qty:20,scheme:'other',customPaid:10,customFree:4},{productId:customSecond.id,qty:2,scheme:'none'}],{customerId:messageCustomer.id,notes:'Special bulk offer requested'});
 const agencyMessages=id=>sql.prepare('SELECT * FROM whatsapp_outbox WHERE visit_id LIKE ?').all('order:'+id+':agency:%');
 const getOrder=id=>sql.prepare('SELECT * FROM invoices WHERE id=?').get(id);
 identity=alice;
 const customRequest=customOrder(),pendingCustom=await ok(await commerce.POST(request(customRequest)));assert(pendingCustom.pendingSchemeApproval);assert(!getOrder(customRequest.id));assert(!sql.prepare('SELECT id FROM stock_reservations WHERE order_id=?').get(customRequest.id));assert.equal(agencyMessages(customRequest.id).length,0);
 const customRequestRow=sql.prepare('SELECT * FROM workflow_requests WHERE id=?').get(customRequest.id);assert.equal(customRequestRow.kind,'custom_scheme');assert.equal(JSON.parse(customRequestRow.body).items[0].free,8);
 const retryCustom=await ok(await commerce.POST(request({...customRequest,lines:[{productId:customProduct.id,qty:1,scheme:'none'}]})));assert(retryCustom.pendingSchemeApproval);assert(!getOrder(customRequest.id));
 await ok(await commerce.POST(request({action:'approveCustomScheme',requestId:customRequest.id})),403);
 identity=bob;assert(!(await ok(await planning.GET())).requests.some(r=>r.id===customRequest.id));await ok(await commerce.POST(request(customRequest)),403);
 identity=owner;await ok(await commerce.POST(request({action:'approveDirect',requestId:customRequest.id})),409);
 await ok(await commerce.PATCH(request({id:customRequest.id,requestId:crypto.randomUUID(),revision:1,action:'approveOrder'})),403);
 await post('Products',{...customProductData,PTR:'96'},{id:customProduct.id});
 await ok(await commerce.POST(request({action:'approveCustomScheme',requestId:customRequest.id})));await ok(await commerce.POST(request({action:'approveCustomScheme',requestId:customRequest.id})),409);
 let customStored=getOrder(customRequest.id);assert.equal(customStored.accepted,0);assert.equal(customStored.status,'Placed');assert.equal(JSON.parse(customStored.items)[0].rate,8000);assert.equal(sql.prepare('SELECT quantity FROM stock_reservations WHERE order_id=? AND product_id=?').get(customRequest.id,customProduct.id).quantity,28);assert.equal(qty(s1.id,customProduct.id),100);assert.equal(agencyMessages(customRequest.id).length,0);
 assert((await ok(await approvals.GET())).requests.some(r=>r.kind==='order_approval'&&r.record_id===customRequest.id));
 await ok(await commerce.PATCH(request({id:customRequest.id,requestId:crypto.randomUUID(),revision:1,action:'approveOrder'})));customStored=getOrder(customRequest.id);assert.equal(customStored.accepted,1);assert.equal(customStored.revision,2);assert.equal(agencyMessages(customRequest.id).length,1);assert(agencyMessages(customRequest.id)[0].message.includes('Free qty: 8'));assert(!/₹|rate|value/i.test(agencyMessages(customRequest.id)[0].message));
 // A custom amendment cannot be approved as an order or forwarded before scheme review.
 identity=alice;const customEditId=crypto.randomUUID(),customEdit={id:customRequest.id,requestId:customEditId,revision:2,lines:[{productId:customProduct.id,qty:20,scheme:'other',customPaid:10,customFree:5},{productId:customSecond.id,qty:2,scheme:'none'}],notes:'Request one extra free unit per group'};
 assert((await ok(await commerce.PATCH(request(customEdit)))).pendingSchemeApproval);assert.equal(getOrder(customRequest.id).revision,2);assert.equal(JSON.parse(getOrder(customRequest.id).items)[0].free,8);assert((await ok(await commerce.GET())).invoices.find(i=>i.id===customRequest.id).schemeApprovalPending);
 await ok(await commerce.PATCH(request({...customEdit,requestId:crypto.randomUUID()})),409);
 identity=owner;await ok(await commerce.PATCH(request({id:customRequest.id,revision:2,requestId:crypto.randomUUID(),action:'approveOrder'})),409);
 let customReview=await ok(await approvals.GET());await ok(await commerce.PATCH(request({action:'approve',requestId:customEditId,hash:customReview.hash})));customStored=getOrder(customRequest.id);assert.equal(customStored.accepted,0);assert.equal(customStored.revision,3);assert.equal(JSON.parse(customStored.items)[0].free,10);assert.equal(JSON.parse(customStored.items)[0].rate,8000);assert.equal(agencyMessages(customRequest.id).length,1);
 const reapprovalCard=(await ok(await approvals.GET())).requests.find(r=>r.kind==='order_approval'&&r.record_id===customRequest.id);const reviewedComparison=JSON.parse(reapprovalCard.body).editComparison;assert.equal(JSON.parse(reviewedComparison.beforeOrder.items)[0].free,8);assert.equal(reviewedComparison.proposedItems[0].free,10);
 await ok(await commerce.PATCH(request({id:customRequest.id,revision:3,requestId:crypto.randomUUID(),action:'approveOrder'})));assert.equal(getOrder(customRequest.id).accepted,1);assert.equal(agencyMessages(customRequest.id).length,2);
 // A not-yet-approved standard order must not bypass a subsequently requested custom offer.
 identity=alice;const waitingCustom=invoice('secondary',s1.id,[{productId:customProduct.id,qty:10,scheme:'none'}],{customerId:messageCustomer.id});await ok(await commerce.POST(request(waitingCustom)));const waitingCustomEdit=crypto.randomUUID();await ok(await commerce.PATCH(request({id:waitingCustom.id,revision:1,requestId:waitingCustomEdit,lines:[{productId:customProduct.id,qty:10,scheme:'other',customPaid:10,customFree:3}]})));
 identity=owner;const waitingBlock=await ok(await commerce.PATCH(request({id:waitingCustom.id,revision:1,requestId:crypto.randomUUID(),action:'approveOrder'})),409);assert(waitingBlock.error.includes('custom scheme'));assert.equal(getOrder(waitingCustom.id).accepted,0);assert.equal(agencyMessages(waitingCustom.id).length,0);assert(!(await ok(await approvals.GET())).requests.some(r=>r.kind==='order_approval'&&r.record_id===waitingCustom.id));await ok(await commerce.PATCH(request({id:waitingCustom.id,revision:1,requestId:crypto.randomUUID(),action:'status',status:'Cancelled',reason:'Withdraw pending test offer'})));
 // Direct company proposals with a special rate still require the separate order approval.
 identity=alice;const customCompany={...customOrder(),stockistId:'company-stock',lines:[{productId:customProduct.id,qty:10,scheme:'other',customPaid:10,customFree:3,proposedRate:70}]};await ok(await commerce.POST(request(customCompany)));
 identity=owner;await ok(await commerce.POST(request({action:'approveCustomScheme',requestId:customCompany.id})));assert.equal(getOrder(customCompany.id).accepted,0);assert.equal(JSON.parse(getOrder(customCompany.id).items)[0].rate,7000);
 await ok(await commerce.PATCH(request({id:customCompany.id,revision:1,requestId:crypto.randomUUID(),action:'status',status:'Delivered'})),403);
 await ok(await commerce.PATCH(request({id:customCompany.id,revision:1,requestId:crypto.randomUUID(),action:'approveOrder'})));
 await ok(await commerce.PATCH(request({id:customCompany.id,revision:2,requestId:crypto.randomUUID(),action:'status',status:'Delivered'})));assert.equal(qty('company-stock',customProduct.id),100);assert.equal(qty(s1.id,customProduct.id),70);assert.equal(agencyMessages(customCompany.id).length,0);
 identity=alice;await ok(await commerce.PATCH(request({id:customCompany.id,revision:3,requestId:crypto.randomUUID(),lines:[{productId:customProduct.id,qty:10,scheme:'other',customPaid:10,customFree:5}],notes:'Change completed offer'})),409);
 // Rejection keeps the existing offer, and cancellation resolves any outstanding request.
 identity=alice;const rejectedEditId=crypto.randomUUID();await ok(await commerce.PATCH(request({...customEdit,revision:4,requestId:rejectedEditId})));
 identity=owner;await ok(await commerce.PATCH(request({action:'reject',requestId:rejectedEditId})),400);await ok(await commerce.PATCH(request({action:'reject',requestId:rejectedEditId,reason:'Retain the current approved scheme'})));assert.equal(getOrder(customRequest.id).revision,4);assert.equal(getOrder(customRequest.id).accepted,1);await ok(await commerce.PATCH(request({action:'reject',requestId:rejectedEditId,reason:'Duplicate review'})),409);
 identity=alice;const cancelledEditId=crypto.randomUUID();await ok(await commerce.PATCH(request({...customEdit,revision:4,requestId:cancelledEditId})));identity=owner;await ok(await commerce.PATCH(request({id:customRequest.id,revision:4,requestId:crypto.randomUUID(),action:'status',status:'Cancelled',reason:'Customer withdrew the order'})));assert.equal(sql.prepare('SELECT status FROM workflow_requests WHERE id=?').get(cancelledEditId).status,'Rejected');assert(!sql.prepare('SELECT id FROM stock_reservations WHERE order_id=?').get(customRequest.id));
 identity=alice;
 // An MR can withdraw a custom company offer after scheme review, before order approval.
 const withdrawOffer={...customCompany,id:crypto.randomUUID()};await ok(await commerce.POST(request(withdrawOffer)));identity=owner;await ok(await commerce.POST(request({action:'approveCustomScheme',requestId:withdrawOffer.id})));assert.equal(getOrder(withdrawOffer.id).accepted,0);identity=alice;
 await ok(await commerce.PATCH(request({id:withdrawOffer.id,revision:1,requestId:crypto.randomUUID(),action:'delete',reason:'Customer withdrew before order approval'})));assert.equal(getOrder(withdrawOffer.id).status,'Cancelled');assert(!(await ok(await reports.GET(reportURL(alice.email,fieldDate.slice(0,7))))).tables.find(t=>t.title==='Agency stock reconciliation at month end').rows.some(r=>String(r[0]).includes('Direct company')));assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE invoice_id=?').get(withdrawOffer.id).n,0);
 // Validation, draft persistence, rejection, month locks and replay resistance.
 const badCustom=customOrder();for(const bad of [{customPaid:0},{customFree:0},{customFree:1.5},{customFree:undefined},{proposedFree:1}])await ok(await commerce.POST(request({...badCustom,id:crypto.randomUUID(),lines:[{...badCustom.lines[0],...bad}]})),400);
 const rejectedCustom=customOrder();await ok(await commerce.POST(request(rejectedCustom)));identity=owner;await ok(await commerce.POST(request({action:'rejectCustomScheme',requestId:rejectedCustom.id})),400);await ok(await commerce.POST(request({action:'rejectCustomScheme',requestId:rejectedCustom.id,reason:'Offer exceeds permitted free units'})));assert.equal(sql.prepare('SELECT status FROM workflow_requests WHERE id=?').get(rejectedCustom.id).status,'Rejected');assert(!getOrder(rejectedCustom.id));assert.equal(agencyMessages(rejectedCustom.id).length,0);await ok(await commerce.POST(request({action:'approveCustomScheme',requestId:rejectedCustom.id})),409);
 identity=alice;await ok(await commerce.POST(request(rejectedCustom)),409);
 const lockedCustom=customOrder();await ok(await commerce.POST(request(lockedCustom)));sql.prepare("INSERT INTO period_locks VALUES (?,1,'custom-lock',?,?,?)").run(fieldDate.slice(0,7),new Date().toISOString(),owner.email,'Test custom scheme lock');identity=owner;await ok(await commerce.POST(request({action:'approveCustomScheme',requestId:lockedCustom.id})),409);assert(!getOrder(lockedCustom.id));sql.exec('DELETE FROM period_locks');await ok(await commerce.POST(request({action:'rejectCustomScheme',requestId:lockedCustom.id,reason:'Request withdrawn'})));
 identity=alice;const draftCustom=customOrder(),draftPayload={customerId:messageCustomer.id,customerName:'Doctor',stockistId:s1.id,date:fieldDate,notes:'Custom offer',visitId:'',lines:draftCustom.lines,promises:[]};
 await ok(await draftsAPI.POST(request({id:draftCustom.id,kind:'order',revision:0,payload:draftPayload})));const savedCustomDraft=(await ok(await draftsAPI.GET())).drafts.find(d=>d.id===draftCustom.id);assert.equal(savedCustomDraft.payload.lines[0].customFree,4);await ok(await commerce.POST(request(draftCustom)));assert(!(await ok(await draftsAPI.GET())).drafts.some(d=>d.id===draftCustom.id));
 identity=owner;await ok(await commerce.POST(request({action:'rejectCustomScheme',requestId:draftCustom.id,reason:'Test request withdrawn'})));
 // The month-end review includes custom requests even before an invoice exists.
 const oldCustomId=crypto.randomUUID(),oldCustomBody=JSON.parse(customRequestRow.body);oldCustomBody.input.id=oldCustomId;oldCustomBody.input.date='2020-01-15';
 sql.prepare("INSERT INTO workflow_requests(id,kind,mr_email,record_id,body,status,created) VALUES (?,'custom_scheme',?,?,?,'Pending',?)").run(oldCustomId,alice.email,oldCustomId,JSON.stringify(oldCustomBody),new Date().toISOString());
 const customCloseReview=await ok(await periods.POST(request({action:'review',month:'2020-01'})));assert(customCloseReview.checklist.find(c=>c.title==='Pending approvals through this month').items.some(i=>i.id===oldCustomId));await ok(await periods.POST(request({action:'close',month:'2020-01',hash:customCloseReview.hash})),409);sql.prepare('DELETE FROM workflow_requests WHERE id=?').run(oldCustomId);

 console.log('PASS: custom scheme request before order approval for both channels, frozen rates, multi-product quantities, MR permissions, draft persistence, pending-edit forwarding block, separate reapproval, rejection, replay and month locks. No external sends.');


 // Existing installations migrate once, atomically, without rewriting invoices or approved reports.
 const modelMigration=process.env.MONGO_TEST_MODE==='model'?require('./mongo-model.cjs')():null;
 const migrationDB=modelMigration?.db||testClient.db(process.env.MONGODB_DB+'_migration'),migrationClient=modelMigration?.client||testClient;
 try{
  await (await import('../scripts/mongo-common.mjs')).setup(migrationDB);
  const migrationOrders=[
   {id:'old-approved',stockist_id:'agency',accepted:1,status:'Placed',product:'approved',qty:30,free:8},
   {id:'old-delivered',stockist_id:'agency',accepted:1,status:'Delivered',product:'delivered',qty:4,free:1},
   {id:'old-company',stockist_id:'company-stock',accepted:1,status:'Delivered',product:'company',qty:3,free:1},
   {id:'old-pending',stockist_id:'agency',accepted:0,status:'Placed',product:'pending',qty:6,free:2},
   {id:'old-cancelled',stockist_id:'agency',accepted:1,status:'Cancelled',product:'cancelled',qty:2,free:0},
   {id:'old-no-balance',stockist_id:'agency',accepted:1,status:'Placed',product:'missing',qty:7,free:0},
  ].map(({product,qty,free,...o})=>({...o,kind:'secondary',date:'2020-01-15',items:JSON.stringify([{productId:product,qty,free}])}));
  await migrationDB.collection('invoices').insertMany(migrationOrders);
  await migrationDB.collection('stock_balances').insertMany([['agency','approved',10],['agency','delivered',5],['company-stock','company',6],['agency','pending',2],['agency','cancelled',8]].map(([stockist_id,product_id,quantity])=>({id:stockist_id+'|'+product_id,stockist_id,product_id,quantity})));
  await migrationDB.collection('stock_movements').insertMany([['old-delivered','agency','delivered',-5],['old-company','company-stock','company',-4],['old-cancelled','agency','cancelled',-2]].map(([invoice_id,stockist_id,product_id,quantity])=>({id:invoice_id,invoice_id,stockist_id,product_id,quantity})));
  await migrationDB.collection('stock_reservations').insertMany(migrationOrders.map(o=>({id:o.id+'|'+JSON.parse(o.items)[0].productId,order_id:o.id,stockist_id:o.stockist_id,product_id:JSON.parse(o.items)[0].productId,quantity:999})));
  await migrationDB.collection('report_snapshots').insertOne({id:'closed-report',month:'2020-01',payload:'Approved report must remain byte-for-byte unchanged'});
  const originalMigrationOrders=await migrationDB.collection('invoices').find().toArray(),originalReport=await migrationDB.collection('report_snapshots').findOne({id:'closed-report'}),beforeMigration=await migrationDB.collection('stock_balances').find().toArray();
  const reconcile=load(path.join(root,'lib/mongo/order-inventory.ts')).reconcileOrderInventory;
  async function migrate(fail=false){const s=migrationClient.startSession();try{await s.withTransaction(async()=>{await reconcile(migrationDB,s);if(fail)throw Error('Injected migration rollback');},{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});}finally{await s.endSession();}}
  await assert.rejects(migrate(true),/Injected migration rollback/);
  assert.deepEqual(await migrationDB.collection('stock_balances').find().toArray(),beforeMigration);assert.equal(await migrationDB.collection('stock_movements').countDocuments(),3);assert.equal((await migrationDB.collection('_control').findOne({_id:'ledger'})).order_inventory_policy,undefined);
  if(modelMigration)await migrate();else await Promise.all([migrate(),migrate()]);
  const migratedQty=async(s,p)=>(await migrationDB.collection('stock_balances').findOne({stockist_id:s,product_id:p})).quantity;
  assert.equal(await migratedQty('agency','approved'),-28);assert.equal(await migratedQty('agency','delivered'),5);assert.equal(await migratedQty('company-stock','company'),10);assert.equal(await migratedQty('agency','pending'),2);assert.equal(await migratedQty('agency','cancelled'),10);assert.equal(await migratedQty('agency','missing'),-7);
  const retainedReservations=await migrationDB.collection('stock_reservations').find().toArray();assert.equal(retainedReservations.length,1);assert.equal(retainedReservations[0].order_id,'old-pending');assert.equal(retainedReservations[0].quantity,8);
  assert.equal(await migrationDB.collection('stock_movements').countDocuments(),7);await migrate();assert.equal(await migrationDB.collection('stock_movements').countDocuments(),7);
  assert.deepEqual(await migrationDB.collection('invoices').find().toArray(),originalMigrationOrders);assert.deepEqual(await migrationDB.collection('report_snapshots').findOne({id:'closed-report'}),originalReport);
  console.log('PASS: inventory policy migration corrects legacy approved/company/cancelled effects, preserves completed deductions, allows missing balances, retains pending demand, rolls back failures, is idempotent, and preserves invoices and closed reports.');
 }finally{if(!modelMigration)await migrationDB.dropDatabase();}

 if(process.env.MONGO_TEST_MODE!=='model'){
  const native=load(path.join(root,'lib/mongo/database.ts')).mongoDatabase;
  await native.prepare('INSERT INTO stock_balances(id,stockist_id,product_id,quantity) VALUES (?,?,?,?)').bind('race|p','race','p',10).run();
  const reserve=(id)=>native.batch([native.prepare('UPDATE stock_balances SET quantity=quantity-? WHERE stockist_id=? AND product_id=?').bind(7,'race','p'),native.prepare('INSERT INTO stock_movements(id,invoice_id,stockist_id,product_id,quantity,created) VALUES (?,?,?,?,?,?)').bind(id,id,'race','p',-7,new Date().toISOString())]);
  const outcomes=await Promise.allSettled([reserve('race-a'),reserve('race-b')]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,2);
  assert.equal(await mongo.collection('stock_movements').countDocuments({stockist_id:'race'}),2);
  assert.equal((await mongo.collection('stock_balances').findOne({id:'race|p'})).quantity,-4);
  console.log('PASS: real replica-set concurrent approximate deductions both commit without lost updates or a stock-shortage gate.');
 }


 await require('./daily-map-integration.cjs')({load,root,sql,ok,request,owner,alice,bob,who:u=>{identity=u}});

 // Admin-only full reset is tested last, against synthetic data in this isolated database.
 const resetAPI=load(path.join(root,'app/api/admin-reset/route.ts')),resetLib=load(path.join(root,'lib/mongo/data-reset.ts')),nativeLayer=load(path.join(root,'lib/mongo/database.ts')),passwordTools=load(path.join(root,'lib/passwords.ts'));
 const resetPassword='Synthetic reset password only',resetHash=await passwordTools.passwordHash(resetPassword);
 sql.prepare('UPDATE credentials SET password_hash=? WHERE email=?').run(resetHash,owner.email);
 const adminUsername=sql.prepare('SELECT username FROM credentials WHERE email=?').get(owner.email).username;
 identity=null;await ok(await resetAPI.POST(request({action:'preview'})),401);
 identity=alice;await ok(await resetAPI.POST(request({action:'preview'})),403);await ok(await resetAPI.POST(request({action:'reset'})),403);
 identity=owner;await ok(await resetAPI.POST(request({action:'preview'},'POST','https://untrusted.test')),403);
 const resetBody=preview=>({action:'reset',token:preview.token,confirmation:'DELETE ALL DATA',understood:true,password:resetPassword,reason:'Remove synthetic test records'});
 let resetPreview=await ok(await resetAPI.POST(request({action:'preview'})));
 assert(resetPreview.total>0);assert(resetPreview.items.some(i=>i.label==='Orders and primary invoices'));assert(!JSON.stringify(resetPreview).includes('password_hash'));assert(!JSON.stringify(resetPreview).includes('whatsappKey'));
 const countBeforeReset=sql.prepare('SELECT COUNT(*) AS n FROM invoices').get().n;
 await ok(await resetAPI.POST(request({...resetBody(resetPreview),confirmation:'delete all data'})),400);await ok(await resetAPI.POST(request({...resetBody(resetPreview),understood:false})),400);await ok(await resetAPI.POST(request({...resetBody(resetPreview),password:''})),400);await ok(await resetAPI.POST(request({...resetBody(resetPreview),database:'unrelated'})),400);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM invoices').get().n,countBeforeReset);
 for(let attempt=0;attempt<5;attempt++){resetPreview=await ok(await resetAPI.POST(request({action:'preview'})));await ok(await resetAPI.POST(request({...resetBody(resetPreview),password:'wrong-password'})),400);}
 resetPreview=await ok(await resetAPI.POST(request({action:'preview'})));await ok(await resetAPI.POST(request(resetBody(resetPreview))),429);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM invoices').get().n,countBeforeReset);
 sql.prepare('DELETE FROM login_limits WHERE key=?').run('data-reset:'+owner.email);
 resetPreview=await ok(await resetAPI.POST(request({action:'preview'})));await nativeLayer.mongoDatabase.prepare('INSERT INTO notifications(id,recipient,title,body,module,record_id,created) VALUES (?,?,?,?,?,?,?)').bind('reset-stale',owner.email,'New entry','','Orders',null,new Date().toISOString()).run();await pullResults();await ok(await resetAPI.POST(request(resetBody(resetPreview))),409);
 resetPreview=await ok(await resetAPI.POST(request({action:'preview'})));const resetClock=clockOffset;clockOffset+=600001;await ok(await resetAPI.POST(request(resetBody(resetPreview))),409);clockOffset=resetClock;
 sql.prepare("INSERT INTO email_outbox(id,mr_email,recipient,subject,message,status,error,created) VALUES (?,?,?,?,?,'sending','',?)").run('reset-sending',owner.email,'nobody@example.test','Test','No actual send',new Date().toISOString());await ok(await resetAPI.POST(request({action:'preview'})),409);sql.prepare('DELETE FROM email_outbox WHERE id=?').run('reset-sending');
 sql.prepare("INSERT INTO period_locks(month,closed,closure_id,updated,admin_email,reason) VALUES ('2019-01',1,'reset-closed',?,?,?)").run(new Date().toISOString(),owner.email,'Synthetic closed month');
 sql.prepare('INSERT INTO period_reports(id,closure_id,month,mr_email,report,created) VALUES (?,?,?,?,?,?)').run('reset-closed-report','reset-closed','2019-01',alice.email,'{"saved":true}',new Date().toISOString());
 sql.prepare('INSERT OR REPLACE INTO employee_photos(email,image_base64,updated) VALUES (?,?,?)').run(owner.email,'synthetic-admin-avatar',new Date().toISOString());
 const preservedSettings=sql.prepare('SELECT * FROM communication_settings ORDER BY id').all(),preservedAdmin=sql.prepare('SELECT * FROM credentials WHERE email=?').get(owner.email),preservedLegacy=sql.prepare("SELECT * FROM records WHERE id='whatsapp-settings'").get();
 identity=owner;await sessionHeaders();const oldAdminCookie=(await sessionHeaders()).get('cookie');browserCookie=oldAdminCookie;
 resetPreview=await ok(await resetAPI.POST(request({action:'preview'})));assert(resetPreview.items.some(i=>i.label==='Closed monthly reports'&&i.count>0));
 const resetActor=sql.prepare('SELECT * FROM members WHERE email=?').get(owner.email),resetSession=passwordTools.readToken(oldAdminCookie),resetTokenHash=await passwordTools.digest(resetPreview.token);
 const beforeResetRecords=sql.prepare('SELECT COUNT(*) AS n FROM records').get().n;
 // Inject a failure after several deletes: the entire reset, including accounts/sessions, must roll back.
 await assert.rejects(nativeLayer.transaction(c=>resetLib.resetApplicationData({...c,db:{collection(name){const collection=c.db.collection(name);return name==='stock_balances'?new Proxy(collection,{get(target,key){if(key==='deleteMany')return async()=>{throw Error('Injected reset failure')};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}}):collection;}}},resetActor,resetSession,resetTokenHash,resetHash,'Rollback test')),/Injected reset failure/);
 await pullResults();assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM records').get().n,beforeResetRecords);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM invoices').get().n,countBeforeReset);assert(sql.prepare('SELECT * FROM sessions WHERE token_hash=?').get(await passwordTools.digest(resetSession)));assert(sql.prepare('SELECT * FROM members WHERE email=?').get(alice.email));
 const unrelated=process.env.MONGO_TEST_MODE==='model'?require('./mongo-model.cjs')().db:testClient.db(process.env.MONGODB_DB+'_unrelated');await unrelated.collection('records').insertOne({id:'other-application',data:'Must remain intact'});
 try{
  const resetResponse=await resetAPI.POST(request(resetBody(resetPreview))),resetResult=await ok(resetResponse);assert(resetResponse.headers.get('set-cookie').includes('Max-Age=0'));assert(resetResult.total>0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM members WHERE role<>'admin'").get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM credentials').get().n,sql.prepare("SELECT COUNT(*) AS n FROM members WHERE role='admin'").get().n);assert.deepEqual(sql.prepare('SELECT * FROM credentials WHERE email=?').get(owner.email),preservedAdmin);
  assert.deepEqual(sql.prepare('SELECT * FROM communication_settings ORDER BY id').all(),preservedSettings);assert.deepEqual(sql.prepare("SELECT * FROM records WHERE id='whatsapp-settings'").get(),preservedLegacy);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM records WHERE id<>?').get('whatsapp-settings').n,0);
  for(const table of Object.keys((await import('../scripts/mongo-common.mjs')).schema).filter(t=>!['records','members','credentials','employee_photos','communication_settings','login_limits','admin_audit'].includes(t)))assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0,table+' was not cleared');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM employee_photos WHERE email<>?').get(owner.email).n,0);assert(sql.prepare('SELECT * FROM employee_photos WHERE email=?').get(owner.email));const resetReceipt=sql.prepare('SELECT * FROM admin_audit').all();assert.equal(resetReceipt.length,1);assert.equal(resetReceipt[0].action,'Application data reset');assert(!JSON.stringify(resetReceipt).includes(resetPassword));
  assert.equal((await unrelated.collection('records').findOne({id:'other-application'})).data,'Must remain intact');assert.equal((await mongo.collection('_control').findOne({_id:'ledger'})).order_inventory_policy,'approved-approximate-v1');
  await ok(await session.GET(),401);await ok(await resetAPI.POST(request(resetBody(resetPreview))),401);
  // An old authenticated request must not recreate data after the session purge.
  await assert.rejects(nativeLayer.mongoDatabase.prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').bind('stale-after-reset',owner.id,'Customers','{}',new Date().toISOString(),'').run(),/session has ended/);assert(!await mongo.collection('records').findOne({id:'stale-after-reset'}));
  const loginAPI=load(path.join(root,'app/api/auth/login/route.ts'));const resetLogin=await loginAPI.POST(request({username:adminUsername,password:resetPassword}));await ok(resetLogin);browserCookie=resetLogin.headers.get('set-cookie').split(';')[0];assert.equal((await ok(await session.GET())).member.role,'admin');await ok(await resetAPI.POST(request(resetBody(resetPreview))),409);
  if(process.env.MONGO_TEST_MODE!=='model'){
   const concurrentPreview=await ok(await resetAPI.POST(request({action:'preview'}))),token=passwordTools.readToken(browserCookie),hash=await passwordTools.digest(concurrentPreview.token);
   const race=await Promise.allSettled([1,2].map(()=>nativeLayer.transaction(c=>resetLib.resetApplicationData(c,resetActor,token,hash,resetHash,'Concurrent reset test'))));assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(await mongo.collection('admin_audit').countDocuments({action:'Application data reset'}),1);await pullResults();
  }
  console.log('PASS: Admin reset preview, role/origin/password/phrase/acknowledgement gates, rate limit, stale/expired review, sending-message protection, atomic rollback, all business data including closed reports, Admin/config preservation, unrelated database isolation, session revocation and stale-write rejection. No live data or messages touched.');
 }finally{if(process.env.MONGO_TEST_MODE!=='model')await unrelated.dropDatabase();browserCookie=null;}

})().catch(e=>{console.error(e);process.exitCode=1}).finally(stopMongo);

