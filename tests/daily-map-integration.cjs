module.exports=async({load,root,sql,ok,request,owner,alice,bob,who})=>{
 const assert=require('node:assert/strict'),path=require('node:path'),api=load(path.join(root,'app/api/daily-map/route.ts')),day='2030-04-10',get=(mr=alice.email,date=day)=>new Request('https://app.test/api/daily-map?'+new URLSearchParams({date,mr}));
 const gps=i=>({lat:11+i/1000,lng:77,accuracy:10,capturedAt:`${day}T${String(8+Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}:00+05:30`});
 for(let i=0;i<30;i++)sql.prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').run('daily-map:'+i,alice.id,i===0||i===29?'Attendance':'Visits',JSON.stringify({Date:day,Action:i===29?'Check out':'Check in',Customer:'Customer '+i,'GPS data':JSON.stringify(gps(i)),'Location address':'Recorded place '+i}),gps(i).capturedAt,alice.email);
 sql.prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').run('daily-map:other',alice.id,'Visits',JSON.stringify({Date:day,Customer:'Other MR private','GPS data':JSON.stringify(gps(15))}),gps(15).capturedAt,bob.email);
 who(null);await ok(await api.GET(get()),401);who(alice);await ok(await api.GET(get(bob.email)),403);await ok(await api.GET(new Request('https://app.test/api/daily-map?settings=1')),403);
 const mine=await ok(await api.GET(get()));assert.equal(mine.points.length,30);assert.equal(mine.visits,28);assert.equal(mine.reps.length,1);assert(!JSON.stringify(mine).includes('Other MR private'));assert(!JSON.stringify(mine).includes('sealedKey'));await ok(await api.GET(get(alice.email,'2030-02-30')),400);
 who(owner);assert.equal((await ok(await api.GET(get(bob.email)))).points.length,1);
 // Customer captures are separate from visits and remain tied to the capturing MR.
 const history=load(path.join(root,'lib/customer-gps-history.ts')),server=load(path.join(root,'lib/server.ts'));
 const captureDay='2030-04-12',stamp='2030-04-12T06:30:00.000Z',customer={Name:'Captured customer',Location:'11.1, 77.1','Location captured at':stamp,'Location address':'Customer premises'};
 sql.prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').run('daily-customer',alice.id,'Customers',JSON.stringify(customer),stamp,alice.email);
 who(alice);const legacy=await ok(await api.GET(get(alice.email,captureDay)));assert.equal(legacy.points.length,1);assert.equal(legacy.visits,0);assert.equal(legacy.points[0].kind,'Customer capture');assert(legacy.points[0].legacyAttribution);
 // Persist the actual capture, then move the customer to Bob. Alice retains her history.
 const event=history.customerGPSSnapshot('daily-customer',customer,alice.id,alice.email);
 sql.prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').run(event.id,event.owner,event.kind,JSON.stringify(event.data),event.created,event.assigned_to);
 // Sync the Mongo-backed writes into the test fixture using a route before editing SQL.
 const real=await api.GET(get(alice.email,captureDay));const actual=await ok(real);assert.equal(actual.points.length,1);assert.equal(actual.points[0].legacyAttribution,false);
 sql.prepare('UPDATE records SET assigned_to=? WHERE id=?').run(bob.email,'daily-customer');
 who(owner);assert.equal((await ok(await api.GET(get(bob.email,captureDay)))).points.length,0);assert.equal((await ok(await api.GET(get(alice.email,captureDay)))).points.length,1);
 const later={...customer,Location:'11.2, 77.2','Location captured at':'2030-04-12T07:30:00.000Z'};
 const snapshot=history.customerGPSSnapshot('daily-customer',later,alice.id,alice.email);assert(snapshot);assert.notEqual(snapshot.id,actual.points[0].recordId);
 assert.equal(history.customerGPSSnapshot('c',{...customer,'Location source':'Latest MR visit GPS'},alice.id,alice.email),null);
 assert.equal(history.customerGPSSnapshot('c',{...customer,'Location captured at':''},alice.id,alice.email),null);
 // Exercise snapshot persistence through the actual customer save handler.
 who(owner);const recordsAPI=load(path.join(root,'app/api/records/route.ts'));
 const routeRow=sql.prepare("SELECT id,data FROM records WHERE kind='Routes' LIMIT 1").get();assert(routeRow);
 const created=await ok(await recordsAPI.POST(request({kind:'Customers',assignedTo:alice.email,data:{...customer,Name:'Snapshot integration unique','Mobile 1':'9770000123','Mobile 2':'+91 9770000124','Route ID':routeRow.id,'Customer category':'Doctor'}})));
 let captures=sql.prepare("SELECT * FROM records WHERE kind='Customer GPS capture'").all().filter(r=>JSON.parse(r.data)['Customer ID']===created.id);assert.equal(captures.length,1);assert.equal(captures[0].assigned_to,owner.email);
 const savedCustomer=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(created.id).data);assert.equal(savedCustomer['Mobile 1'],'+919770000123');assert.equal(savedCustomer.Phone,'+919770000123');assert.equal(savedCustomer['Mobile 2'],'+919770000124');
 await ok(await recordsAPI.POST(request({id:created.id,kind:'Customers',assignedTo:alice.email,data:{...savedCustomer,...later,Name:'Snapshot integration unique'}})));
 captures=sql.prepare("SELECT * FROM records WHERE kind='Customer GPS capture'").all().filter(r=>JSON.parse(r.data)['Customer ID']===created.id);assert.equal(captures.length,2);assert(captures.every(r=>r.assigned_to===owner.email));
 // Admin captures must not be presented as the assigned MR's own travel.
 assert(!(await ok(await api.GET(get(alice.email,captureDay)))).points.some(p=>p.customerId===created.id));
 const browserKey='Browser-key-synthetic-123456',serverKey='Server-key-synthetic-987654';
 const config={enabled:true,browserKey,mapId:'test-map-id',serverKey};
 who(alice);await ok(await api.POST(request({action:'settings',config})),403);who(owner);await ok(await api.POST(request({action:'settings',config},'POST','https://evil.test')),403);
 await ok(await api.POST(request({action:'settings',config:{...config,browserKey:''}})),400);
 const saved=await ok(await api.POST(request({action:'settings',config})));assert(saved.config.hasServerKey);assert(!JSON.stringify(saved).includes(serverKey));const raw=sql.prepare("SELECT data FROM communication_settings WHERE id='daily-map'").get().data;assert(raw.includes('v1:'));assert(!raw.includes(serverKey));assert(!JSON.stringify(sql.prepare("SELECT * FROM admin_audit WHERE entity_id='daily-map'").all()).includes(serverKey));
 const originalFetch=global.fetch,calls=[];global.fetch=async(url,init={})=>{calls.push({url:String(url),init});if(String(url).startsWith('https://routes.googleapis.com/'))return new Response(JSON.stringify({routes:[{distanceMeters:12500,polyline:{encodedPolyline:'test-path'}}]}));if(String(url).startsWith('https://maps.googleapis.com/maps/api/geocode/json?'))return new Response(JSON.stringify({status:'OK',results:[{formatted_address:'Google approximate place'}]}));throw Error('Unexpected external URL');};
 try{
  who(alice);const route=await ok(await api.POST(request({action:'route',date:day,mr:alice.email})));assert.equal(route.km,25);assert.equal(route.segments,2);assert.equal(calls.length,2);const a=JSON.parse(calls[0].init.body),b=JSON.parse(calls[1].init.body);assert.equal(a.intermediates.length,25);assert.deepEqual(a.destination,b.origin);assert.equal(calls[0].init.headers['X-Goog-Api-Key'],serverKey);assert.equal(a.travelMode,'DRIVE');assert(!('optimizeWaypointOrder' in a));
  const address=await ok(await api.POST(request({action:'address',date:day,mr:alice.email,pointId:'daily-map:1:start'})));assert.equal(address.address,'Google approximate place');assert(!sql.prepare("SELECT data FROM records WHERE id='daily-map:1'").get().data.includes('Google approximate place'));
  const before=calls.length;await ok(await api.POST(request({action:'route',date:day,mr:bob.email})),403);await ok(await api.POST(request({action:'address',date:day,mr:alice.email,pointId:'daily-map:other:start'})),404);await ok(await api.POST(request({action:'route',date:day,mr:alice.email,points:[{lat:1,lng:2}]})),400);assert.equal(calls.length,before);
  global.fetch=async()=>new Response('{}',{status:403});const failure=await ok(await api.POST(request({action:'route',date:day,mr:alice.email})),502);assert(!JSON.stringify(failure).includes(serverKey));
  let segment=0;global.fetch=async()=>new Response(JSON.stringify(++segment===1?{routes:[{distanceMeters:100,polyline:{encodedPolyline:'first'}}]}:{routes:[]}));await ok(await api.POST(request({action:'route',date:day,mr:alice.email})),422);
  global.fetch=async()=>new Response(JSON.stringify({status:'ZERO_RESULTS'}));for(let i=0;i<8;i++)await ok(await api.POST(request({action:'address',date:day,mr:alice.email,pointId:'daily-map:1:start'})));await ok(await api.POST(request({action:'address',date:day,mr:alice.email,pointId:'daily-map:1:start'})),429);
 }finally{global.fetch=originalFetch;who(owner);}
 await ok(await api.POST(request({action:'settings',config:{...config,serverKey:'',clearServerKey:false}})));assert(JSON.parse(sql.prepare("SELECT data FROM communication_settings WHERE id='daily-map'").get().data).serverKey);
 await ok(await api.POST(request({action:'settings',config:{...config,enabled:false,serverKey:'',clearServerKey:true}})));assert.equal((await ok(await api.GET(get()))).config.hasServerKey,false);await ok(await api.POST(request({action:'route',date:day,mr:alice.email})),400);
 sql.prepare("DELETE FROM communication_settings WHERE id='daily-map'").run();
 console.log('PASS: daily map real API ownership/date scope, Admin-only encrypted configuration, no secret leakage, saved-coordinate-only Google requests, route batching and totals, address non-persistence, provider failures, no partial totals and rate limits. No live Google calls.');
};
