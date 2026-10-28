module.exports=async({load,root,sql,ok,request,owner,alice,who})=>{
 const assert=require('node:assert/strict'),path=require('node:path'),api=load(path.join(root,'app/api/customer-messages/route.ts')),lib=load(path.join(root,'lib/customer-messages.ts')),comm=load(path.join(root,'lib/communication-settings.ts'));
 const old=sql.prepare("SELECT data FROM communication_settings WHERE id='main'").get();
 const key='synthetic-key',config={whatsappEnabled:true,whatsappUrl:'https://msg.vetmechpharma.in/api/v1/messages/send',whatsappSession:'test',whatsappKey:await comm.seal(key)};
 sql.prepare("INSERT INTO communication_settings(id,data,updated) VALUES ('main',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(JSON.stringify(config),new Date().toISOString());
 const customer='broadcast-customer',phone='919876543210';sql.prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').run(customer,alice.id,'Customers',JSON.stringify({Name:'Dr. Example','Mobile 1':phone,Route:'Erode'}),new Date().toISOString(),alice.email);
 who(alice);await ok(await api.GET(),403);await ok(await api.POST(request({action:'send'})),403);who(owner);await ok(await api.POST(request({action:'send'},'POST','https://evil.test')),403);
 const list=await ok(await api.GET());assert(list.customers.some(c=>c.id===customer&&c.phone===phone));assert(!JSON.stringify(list).includes(key));
 await ok(await api.POST(request({action:'templates',templates:[{name:'Greeting',text:'Dear Dr. {{customer_name}}, *Welcome*'}]})));assert.equal((await ok(await api.GET())).templates[0].name,'Greeting');
 assert.throws(()=>lib.messageAttachment({name:'bad.pdf',type:'application/pdf',base64:Buffer.from('<script>').toString('base64')}));assert.throws(()=>lib.messageText('{{unknown}}','X'));
 const b={action:'send',campaign:crypto.randomUUID(),customerId:customer,phone,template:'Dear Dr. {{customer_name}}, *Welcome*'};
 const original=global.fetch,calls=[];global.fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify({id:'gateway-'+calls.length,status:'submitted'}),{status:202});};
 try{
  await ok(await api.POST(request({...b,phone:'919000000000'})),409);assert.equal(calls.length,0);
  const sent=await ok(await api.POST(request(b)));assert.equal(sent.status,'submitted');assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].init.body).text,'Dear Dr. Example, *Welcome*');assert(calls[0].init.headers['Idempotency-Key']);
  assert((await ok(await api.POST(request(b)))).reused);assert.equal(calls.length,1);await ok(await api.POST(request({...b,template:'Changed'})),409);
  const file={name:'brochure.pdf',type:'application/pdf',base64:Buffer.from('%PDF-1.4\nsynthetic test').toString('base64')};
  await ok(await api.POST(request({...b,campaign:crypto.randomUUID(),attachment:file})));assert(calls[1].url.endsWith('/send-media'));assert.equal(calls[1].init.body.get('file').type,'application/pdf');assert.equal(calls[1].init.body.get('caption'),'Dear Dr. Example, *Welcome*');
  global.fetch=async()=>{throw Error('timeout')};const uncertain={...b,campaign:crypto.randomUUID()};assert.equal((await ok(await api.POST(request(uncertain)))).status,'uncertain');assert((await ok(await api.POST(request(uncertain)))).reused);
  await ok(await api.POST(request({...b,campaign:crypto.randomUUID(),attachment:file,template:'x'.repeat(1025)})),400);
 }finally{global.fetch=original;if(old)sql.prepare("UPDATE communication_settings SET data=? WHERE id='main'").run(old.data);else sql.prepare("DELETE FROM communication_settings WHERE id='main'").run();}
 console.log('PASS: Admin-only customer sends, recipient validation, templates, formatting, attachment signature/caption limits, text/media gateway payloads, idempotency, uncertain no-resend and delivery logging. No live messages.');
};
