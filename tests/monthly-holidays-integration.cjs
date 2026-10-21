// Shared monthly calendars and MR-specific exceptions through authenticated HTTP handlers.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(c){
 const {load,root,sql,ok,request,records,fieldDate,owner,alice,bob,r1,r2,r3,shared,assigned,who,setClock}=c;
 const api=load(path.join(root,'app/api/monthly-tour/route.ts')),logic=load(path.join(root,'lib/monthly-tour.ts')),attendance=load(path.join(root,'app/api/attendance/route.ts'));
 const month=load(path.join(root,'lib/route-insights.ts')).shiftMonth(fieldDate.slice(0,7),2),days=logic.monthDates(month),sunday=days.find(d=>new Date(d+'T12:00:00Z').getUTCDay()===0),festival=days.find(d=>d!==sunday&&!logic.dayOff(d,logic.emptyCalendar(month))),otherSunday=days.find(d=>d>sunday&&new Date(d+'T12:00:00Z').getUTCDay()===0);
 const call=(b,status=200)=>api.POST(request(b)).then(r=>ok(r,status));
 const get=(email=alice.email)=>api.GET(new Request('https://app.test/api/monthly-tour?month='+month+'&email='+encodeURIComponent(email))).then(r=>ok(r));
 const work=(date=sunday,extra={},status=200)=>call({action:'request-holiday-work',date,routes:[r1.id],reason:'Customers requested a holiday appointment',...extra},status);
 const readCal=()=>JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(logic.calendarID(month)).data);
 const programme=()=>JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(logic.programmeID(alice.email,month)).data);
 const publish=(extra={},status=200)=>call({action:'calendar',month,revision:readCal().revision,holidays:readCal().holidays,reason:'Monthly company holiday review',...extra},status);
 who(alice);await work(sunday,{},409);await work(sunday,{email:bob.email},403);
 who(owner);const existingRevision=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(logic.calendarID(fieldDate.slice(0,7))).data).revision;
 await call({action:'calendar',month,revision:0,holidays:[...logic.emptyCalendar(month).holidays,{date:festival,name:'Company festival',note:'Office closed; holiday applies to every MR'}],reason:'Published before month end'});
 assert.equal(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(logic.calendarID(fieldDate.slice(0,7))).data).revision,existingRevision);
 await publish({holidays:[...readCal().holidays,{date:fieldDate,name:'Outside this month'}]},400);
 await publish({holidays:[...readCal().holidays,readCal().holidays.at(-1)]},400);
 who(alice);let overview=await get();assert(overview.calendar.confirmed);assert(overview.calendar.holidays.some(h=>h.note.includes('every MR')));assert.equal(overview.programme,null);
 await work(festival,{routes:[r2.id]},400);const rejected=await work(festival);who(owner);await call({action:'reject-change',id:rejected.id,reason:'Observe the company holiday'});who(alice);assert.equal((await get()).holidayWork.length,0);
 const stale=await work(festival);who(owner);await publish({holidays:readCal().holidays.map(h=>h.date===festival?{...h,note:'Updated holiday notice'}:h)});await call({action:'approve-change',id:stale.id},409);await call({action:'reject-change',id:stale.id,reason:'Please review the updated notice'});
 who(alice);const pending=await work();await work(sunday,{},409);await call({action:'approve-change',id:pending.id},403);
 who(bob);await call({action:'cancel-change',id:pending.id},403);const bobView=await get(bob.email);assert(!bobView.requests.some(r=>r.id===pending.id));assert(bobView.calendar.holidays.some(h=>h.date===festival));
 who(owner);await call({action:'approve-change',id:pending.id});await call({action:'approve-change',id:pending.id},409);
 who(alice);overview=await get();assert.equal(overview.holidayWork[0].date,sunday);assert.equal(overview.holidayWork[0].status,'Approved');
 setClock(sunday+'T06:00:00Z');assert.equal((await ok(await records.GET())).tourGate.allowed,false); // Holiday permission alone cannot bypass monthly approval.
 setClock(null);const monthDays=logic.workingDates(month,readCal()).map(date=>({date,type:'visit',routes:[r1.id],reason:''}));await call({action:'submit',month,email:alice.email,revision:0,days:monthDays});
 who(owner);await call({action:'approve',month,email:alice.email,revision:programme().revision});
 who(alice);setClock(sunday+'T06:00:00Z');let output=await ok(await records.GET());assert.equal(output.tourGate.allowed,true);assert.deepEqual(output.tourGate.routeIds,[r1.id]);
 assert(!output.records.some(r=>r.kind===logic.holidayWorkKind));const planned=output.records.filter(r=>r.kind==='Tour plan'&&r.data.Date===sunday&&r.data.Status==='Planned');assert(planned.some(r=>r.data['Customer ID']===shared.id));assert.equal(planned.length,new Set(planned.map(r=>r.data['Customer ID'])).size);
 await ok(await records.POST(request({kind:'Visits',data:{Customer:'Shared doctor','Customer ID':shared.id,Date:sunday}})),409); // Attendance still required.
 const gps={lat:11.17,lng:77.46,accuracy:12,capturedAt:new Date().toISOString()};const checkin=await ok(await records.POST(request({kind:'Attendance',data:{Date:sunday,Action:'Check in','GPS data':JSON.stringify(gps)}})));
 await ok(await records.POST(request({kind:'Visits',data:{Customer:'Assigned doctor','Customer ID':assigned.id,Date:sunday}})),409);
 const visit=await ok(await records.POST(request({kind:'Visits',data:{Customer:'Shared doctor','Customer ID':shared.id,Date:sunday}})));
 await work(sunday,{mode:'cancel'},409); // Cannot strand an open visit.
 sql.prepare('DELETE FROM records WHERE id=?').run(visit.id);sql.prepare('DELETE FROM records WHERE id=?').run(checkin.id);
 who(bob);assert.equal((await ok(await records.GET())).tourGate.allowed,false);
 who(alice);let att=(await ok(await attendance.GET(new Request('https://app.test/api/attendance?month='+month)))).attendance[0];assert.equal(att.days.find(d=>d.date===festival).status,'holiday');assert.equal(att.days.find(d=>d.date===sunday).status,'missing');assert.equal(att.summary.leave,0);
 // Actual recorded work remains green with duration, while an ordinary holiday is not a missing day.
 const fixtureRows=sql.prepare('SELECT * FROM records').all().map(r=>({...r,data:JSON.parse(r.data)}));const attUser=sql.prepare('SELECT * FROM members WHERE email=?').get(alice.email);
 for(const [action,time] of [['Check in','03:30'],['Check out','11:30']])fixtureRows.push({kind:'Attendance',assigned_to:alice.email,created:sunday+'T'+time+':00Z',data:{Date:sunday,Action:action,'GPS data':JSON.stringify({...gps,capturedAt:sunday+'T'+time+':00Z'})}});
 const actual=load(path.join(root,'lib/attendance.ts')).attendanceMonth(attUser,month,fixtureRows,sunday);const worked=actual.days.find(d=>d.date===sunday);assert.equal(worked.status,'complete');assert.equal(worked.duration,'8h 0m');assert.equal(actual.summary.holidayWorking,1);
 setClock(null);const change=await work(sunday,{routes:[r3.id],reason:'Customer requested another holiday route'});who(owner);await call({action:'approve-change',id:change.id});
 who(alice);setClock(sunday+'T06:00:00Z');assert.deepEqual((await ok(await records.GET())).tourGate.routeIds,[r3.id]);setClock(null);
 const cancel=await work(sunday,{mode:'cancel',reason:'Appointment cancelled; observe holiday'});assert.equal((await get()).holidayWork[0].status,'Approved');who(owner);await call({action:'approve-change',id:cancel.id});
 who(alice);setClock(sunday+'T06:00:00Z');output=await ok(await records.GET());assert.equal(output.tourGate.allowed,false);assert(!output.records.some(r=>r.kind==='Tour plan'&&r.data.Date===sunday&&r.data.Status==='Planned'));setClock(null);
 const withdrawn=await work(otherSunday);await call({action:'cancel-change',id:withdrawn.id});const locked=await work(otherSunday);
 sql.prepare("INSERT INTO period_locks VALUES (?,1,'holiday-test',?,?,?)").run(month,new Date().toISOString(),owner.email,'Closed month');await work(festival,{},409);who(owner);await publish({},409);await call({action:'approve-change',id:locked.id},409);sql.exec('DELETE FROM period_locks');
 setClock(month+'-28T06:00:00Z');await call({action:'approve-change',id:locked.id},409);setClock(null);await call({action:'reject-change',id:locked.id,reason:'Request withdrawn after review'});
 await ok(await records.DELETE(request({id:logic.holidayWorkID(alice.email,sunday)},'DELETE')),403);
 const report=await ok(await load(path.join(root,'app/api/monthly-report/route.ts')).GET(new Request('https://app.test/api/monthly-report?month='+month+'&mr='+alice.email)));assert(report.tables.some(t=>t.title==='Holiday work approvals'));assert(report.tables.find(t=>t.title==='Attendance - daily completion and GPS').rows.some(r=>r[0]===festival&&r[2].includes('Holiday')));
 who(alice);const removed=await work(festival);who(owner);await call({action:'approve-change',id:removed.id});await publish({holidays:readCal().holidays.filter(h=>h.date!==festival)});assert.equal((await get()).holidayWork.find(w=>w.date===festival).status,'Cancelled');
 // Upgrade retains already-reviewed history but requires a new publication for future months.
 const legacy=[{id:logic.calendarID(month.slice(0,4)),kind:logic.calendarKind,data:{year:month.slice(0,4),confirmed:true,revision:2,holidays:[],name:'Annual legacy'}}];assert.equal(logic.calendarFor(legacy,month,fieldDate).confirmed,false);assert.equal(logic.calendarFor(legacy,month,month+'-01').confirmed,false);legacy.push({id:'existing-approved',kind:logic.programmeKind,data:{month,status:'Approved'}});assert.equal(logic.calendarFor(legacy,month,month+'-01').confirmed,true);
 who(alice);console.log('PASS: monthly shared holidays, notes, isolated calendar revisions, pre-programme holiday work, individual permission, approval/rejection/cancellation, stale calendar, attendance/route gates, Sunday work hours, history, reports and period protection.');
};
