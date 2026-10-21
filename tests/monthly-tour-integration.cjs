// Runs against the same real route handlers / MongoDB adapter as the main integration suite.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(c){
 const {load,root,sql,ok,request,records,fieldDate,owner,alice,bob,r1,r2,r3,assigned,who,setClock}=c;
 const api=load(path.join(root,'app/api/monthly-tour/route.ts')),logic=load(path.join(root,'lib/monthly-tour.ts'));
 const drafts=load(path.join(root,'app/api/drafts/route.ts')),attendance=load(path.join(root,'app/api/attendance/route.ts'));
 const month=fieldDate.slice(0,7),year=month.slice(0,4),nextMonth=load(path.join(root,'lib/route-insights.ts')).shiftMonth(month,1);
 const get=(email='',m=month)=>api.GET(new Request('https://app.test/api/monthly-tour?month='+m+(email?'&email='+encodeURIComponent(email):'')));
 const read=(u=alice,m=month)=>JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(logic.programmeID(u.email,m)).data);
 const calendar=(y=year)=>JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(logic.calendarID(y)).data);
 const call=(body,status=200)=>api.POST(request(body)).then(r=>ok(r,status));
 const monthAct=(action,extra={},status=200,u=alice,m=month)=>call({action,email:u.email,month:m,revision:sql.prepare('SELECT data FROM records WHERE id=?').get(logic.programmeID(u.email,m))?read(u,m).revision:0,...extra},status);
 const daysFor=(m=month,ids=[r1.id],start=m===month?fieldDate:m+'-01')=>logic.workingDates(m,calendar(m.slice(0,4)),start).map(date=>({date,type:'visit',routes:ids,reason:''}));
 who(null);await ok(await get(),401);
 who(alice);await ok(await get(bob.email),403);assert.equal((await ok(await records.GET())).tourGate.allowed,false);
 await call({action:'calendar',year,revision:0,holidays:logic.nationalHolidays(year),reason:'Calendar review'},403);
 await monthAct('save',{days:[{date:fieldDate,type:'visit',routes:[r2.id],reason:''}]},400);
 await monthAct('save',{days:[{date:fieldDate,type:'visit',routes:[r1.id],reason:''}]});
 await monthAct('submit',{days:read().days},409); // Calendar has not been confirmed.
 await ok(await records.POST(request({kind:'Visits',data:{Customer:'Shared doctor',Date:fieldDate}})),409);
 await ok(await drafts.POST(request({id:crypto.randomUUID(),kind:'visit',revision:0,payload:{form:{Customer:'Shared doctor',Date:fieldDate}}})),409);
 who(owner);await ok(await api.POST(request({action:'calendar'},'POST','https://evil.test')),403);
 // First calendar setup is allowed even with earlier months closed; it cannot rewrite old programmes.
 const pastMonth=load(path.join(root,'lib/route-insights.ts')).shiftMonth(month,-1);
 sql.prepare("INSERT INTO period_locks VALUES (?,1,'calendar-test',?,?,?)").run(pastMonth,new Date().toISOString(),owner.email,'Prior approved report');
 const oldHoliday=year+'-01-05',holidays=[...logic.nationalHolidays(year),{date:oldHoliday,name:'Regional holiday reference'}];
 await call({action:'calendar',year,revision:0,holidays,reason:'Reviewed government and state dates'});sql.exec('DELETE FROM period_locks');
 who(alice);await monthAct('submit',{days:read().days},400); // Missing working days.
 const sunday=logic.monthDates(month).find(d=>d>=fieldDate&&new Date(d+'T12:00:00Z').getUTCDay()===0);
 await monthAct('submit',{days:[...daysFor(),{date:sunday,type:'visit',routes:[r1.id],reason:''}]},400);
 await monthAct('submit',{days:daysFor()});assert.equal(read().status,'Pending');
 assert.equal((await ok(await records.GET())).tourGate.allowed,false);
 await monthAct('approve',{},403);await monthAct('save',{days:daysFor()},409);
 who(owner);
 const futureHoliday=logic.workingDates(month,calendar(),fieldDate)[4];
 await call({action:'calendar',year,revision:calendar().revision,holidays:[...calendar().holidays,{date:futureHoliday,name:'Local government holiday'}],reason:'Regional notification confirmed'});
 await monthAct('approve',{},409); // An intervening holiday requires resubmission.
 await monthAct('reject',{reason:'Review the newly confirmed regional holiday'});
 who(alice);await monthAct('submit',{days:daysFor()});who(owner);await monthAct('approve');
 assert.equal(read().status,'Approved');await monthAct('approve',{},409);
 who(alice);let output=await ok(await records.GET());assert(output.tourGate.allowed);assert.deepEqual(output.tourGate.routeIds,[r1.id]);
 assert(!output.records.some(r=>['Tour programme','Tour calendar'].includes(r.kind)));
 const tasks=output.records.filter(r=>r.kind==='Tour plan'&&r.data.Date===fieldDate);assert(tasks.length);assert.equal(new Set(tasks.map(r=>r.data['Customer ID'])).size,tasks.length);
 assert(!output.records.some(r=>r.kind==='Tour plan'&&r.data.Date===futureHoliday));
 await ok(await records.POST(request({kind:'Visits',data:{Customer:'Assigned doctor','Customer ID':assigned.id,Date:fieldDate}})),409);
 await monthAct('save',{days:daysFor()},409);
 const draftId=crypto.randomUUID();await ok(await drafts.POST(request({id:draftId,kind:'visit',revision:0,payload:{form:{Customer:'Shared doctor',Date:fieldDate}}})));
 await ok(await drafts.DELETE(request({id:draftId,revision:1},'DELETE')));
 const rejected=await call({action:'request-change',type:'routes',from:fieldDate,routes:[r3.id],reason:'Request a different route'});
 assert.deepEqual(read().days.find(d=>d.date===fieldDate).routes,[r1.id]);
 await call({action:'request-change',type:'leave',from:fieldDate,to:fieldDate,reason:'Duplicate pending request'},409);
 who(bob);await call({action:'approve-change',id:rejected.id},403);await call({action:'cancel-change',id:rejected.id},403);
 who(owner);await call({action:'reject-change',id:rejected.id,reason:'Keep the planned route'});
 who(alice);const change=await call({action:'request-change',type:'routes',from:fieldDate,routes:[r1.id,r3.id],reason:'Include both assigned routes'});
 who(owner);await call({action:'approve-change',id:change.id});assert.deepEqual(read().days.find(d=>d.date===fieldDate).routes,[r1.id,r3.id]);
 await call({action:'approve-change',id:change.id},409);
 who(alice);const working=logic.workingDates(month,calendar(),fieldDate),from=working[1],to=working[2];
 const routeChange=await call({action:'request-change',type:'routes',from,routes:[r3.id],reason:'Prepare the alternate route'});who(owner);await call({action:'approve-change',id:routeChange.id});
 who(alice);const swap=await call({action:'request-change',type:'postpone',from,to,reason:'Customer appointment postponed'});assert.deepEqual(read().days.find(d=>d.date===from).routes,[r3.id]);
 who(owner);await call({action:'approve-change',id:swap.id});assert.deepEqual(read().days.find(d=>d.date===from).routes,[r1.id]);assert.deepEqual(read().days.find(d=>d.date===to).routes,[r3.id]);
 output=await ok(await records.GET());assert(output.records.some(r=>r.kind==='Tour plan'&&r.data.Date===from&&r.data['Customer ID']===assigned.id&&r.data.Status==='Rescheduled'&&r.data['Rescheduled to']===to));
 const schedule=read();assert(schedule.history.some(h=>h.id===swap.id&&h.before.length===2&&h.after.length===2));
 // Open visit cannot be stranded by a route or holiday change.
 sql.prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').run('open-tour-test',alice.id,'Visits',JSON.stringify({Date:fieldDate,Status:'Open'}),new Date().toISOString(),alice.email);
 who(alice);await call({action:'request-change',type:'routes',from:fieldDate,routes:[r1.id],reason:'Open visit must be closed'},409);
 who(owner);await call({action:'calendar',year,revision:calendar().revision,holidays:[...calendar().holidays,{date:fieldDate,name:'Unscheduled holiday'}],reason:'Test open visit protection'},409);
 sql.prepare('DELETE FROM records WHERE id=?').run('open-tour-test');
 who(alice);const leave=await call({action:'request-change',type:'leave',from,to,reason:'Two days personal leave'});who(owner);await call({action:'approve-change',id:leave.id});
 who(alice);let cal=await ok(await attendance.GET(new Request('https://app.test/api/attendance?month='+month)));assert.equal(cal.attendance[0].days.find(d=>d.date===from).status,'leave');assert.equal(cal.attendance[0].days.find(d=>d.date===to).status,'leave');
 setClock(from+'T06:00:00Z');assert.equal((await ok(await records.GET())).tourGate.allowed,false);
 setClock(null);const workAgain=await call({action:'request-change',type:'routes',from,routes:[r1.id,r3.id],reason:'Return to route work'});who(owner);await call({action:'approve-change',id:workAgain.id});
 who(alice);cal=await ok(await attendance.GET(new Request('https://app.test/api/attendance?month='+month)));assert.equal(cal.attendance[0].days.find(d=>d.date===from).leave,false);assert.equal(cal.attendance[0].days.find(d=>d.date===to).leave,true);
 // New month never inherits the prior approval; Sundays and holidays remain blocked.
 setClock(nextMonth+'-01T06:00:00Z');assert.equal((await ok(await records.GET())).tourGate.allowed,false);
 setClock(sunday+'T06:00:00Z');assert.equal((await ok(await records.GET())).tourGate.allowed,false);
 setClock(futureHoliday+'T06:00:00Z');assert.equal((await ok(await records.GET())).tourGate.allowed,false);
 setClock(null);
 await monthAct('save',{days:[]},409,alice,pastMonth);
 const withdraw=await call({action:'request-change',type:'routes',from:fieldDate,routes:[r1.id],reason:'Request then withdraw'});await call({action:'cancel-change',id:withdraw.id});assert.deepEqual(read().days.find(d=>d.date===fieldDate).routes,[r1.id,r3.id]);
 sql.prepare("INSERT INTO period_locks VALUES (?,1,'tour-test',?,?,?)").run(month,new Date().toISOString(),owner.email,'Lock protection');
 await call({action:'request-change',type:'routes',from:fieldDate,routes:[r1.id],reason:'Locked month change'},409);sql.exec('DELETE FROM period_locks');
 // Clear future leave for the remaining application tests and approve Bob's normal programme.
 const restore=await call({action:'request-change',type:'routes',from:to,routes:[r1.id,r3.id],reason:'Restore the normal field schedule'});who(owner);await call({action:'approve-change',id:restore.id});
 // Cross-month postponement retains the actual destination in each month's history.
 if(nextMonth.slice(0,4)!==year)await call({action:'calendar',year:nextMonth.slice(0,4),revision:0,holidays:logic.nationalHolidays(nextMonth.slice(0,4)),reason:'Next year holiday review'});
 who(alice);await monthAct('submit',{days:daysFor(nextMonth,[r3.id])},200,alice,nextMonth);who(owner);await monthAct('approve',{},200,alice,nextMonth);
 const crossFrom=working.at(-1),crossTo=daysFor(nextMonth)[0].date;who(alice);const cross=await call({action:'request-change',type:'postpone',from:crossFrom,to:crossTo,reason:'Move appointment to the next month'});who(owner);await call({action:'approve-change',id:cross.id});
 assert.deepEqual(read().days.find(d=>d.date===crossFrom).routes,[r3.id]);assert.deepEqual(read(alice,nextMonth).days.find(d=>d.date===crossTo).routes,[r1.id]);
 const crossTasks=(await ok(await records.GET())).records;assert(crossTasks.some(r=>r.kind==='Tour plan'&&r.data.Date===crossFrom&&r.data['Customer ID']===c.shared.id&&r.data.Status==='Rescheduled'&&r.data['Rescheduled to']===crossTo));
 assert(crossTasks.some(r=>r.kind==='Tour plan'&&r.data.Date===crossTo&&r.data['Customer ID']===assigned.id&&r.data.Status==='Rescheduled'&&r.data['Rescheduled to']===crossFrom));
 who(bob);await monthAct('submit',{days:daysFor(month,[r2.id])},200,bob);who(owner);await monthAct('approve',{},200,bob);
 await ok(await records.DELETE(request({id:logic.programmeID(alice.email,month)},'DELETE')),403);
 await ok(await records.DELETE(request({id:logic.calendarID(year)},'DELETE')),403);
 const stored=await ok(await get(alice.email));assert.equal(stored.programme.status,'Approved');assert(stored.requests.every(r=>r.status!=='Pending'));
 const report=await ok(await load(path.join(root,'app/api/monthly-report/route.ts')).GET(new Request('https://app.test/api/monthly-report?month='+month+'&mr='+alice.email)));
 assert.equal(report.tables.find(t=>t.title==='Monthly tour programme').rows.length,logic.monthDates(month).length);assert(report.tables.find(t=>t.title==='Approved tour changes').rows.length);
 // A state change between validation and transaction must invalidate the earlier guard.
 const server=load(path.join(root,'lib/monthly-tour-server.ts')),database=load(path.join(root,'lib/server.ts')).db();
 const member=sql.prepare('SELECT * FROM members WHERE email=?').get(alice.email),guards=await server.approvedTourGuards(member,fieldDate);
 await database.prepare('UPDATE records SET data=? WHERE id=?').bind(JSON.stringify({...calendar(),revision:calendar().revision+1}),logic.calendarID(year)).run();
 await assert.rejects(()=>database.batch(guards));
 // The next route call mirrors fixture state again, so the race fixture doesn't leak.
 who(alice);await ok(await get());
 console.log('PASS: monthly tour approval, role/origin ownership, government holiday confirmation, complete working-day coverage, stale-calendar rejection, visit/draft gating, route changes, postponement history, leave attendance, month rollover, protected history, reports and transaction conflict checks.');
};
