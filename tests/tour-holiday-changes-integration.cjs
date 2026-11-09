// Late Admin holidays reconcile submissions without erasing recorded work.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(c){
 const {load,root,sql,ok,request,records,fieldDate,owner,alice,bob,r1,r2,shared,who,setClock}=c;
 const api=load(path.join(root,'app/api/monthly-tour/route.ts')),logic=load(path.join(root,'lib/monthly-tour.ts'));
 const shift=load(path.join(root,'lib/route-insights.ts')).shiftMonth,month=shift(fieldDate.slice(0,7),4);
 const originalRecords=new Set(sql.prepare('SELECT id FROM records').all().map(r=>r.id)),originalRequests=new Set(sql.prepare('SELECT id FROM workflow_requests').all().map(r=>r.id));
 const read=id=>{const r=sql.prepare('SELECT data FROM records WHERE id=?').get(id);return r?JSON.parse(r.data):null};
 const cal=()=>read(logic.calendarID(month))||logic.emptyCalendar(month),plan=u=>read(logic.programmeID(u.email,month));
 const dates=logic.workingDates(month,cal()),[first,second,third,fourth]=dates;
 const day=(date,u)=>({date,type:'visit',routes:[u===alice?r1.id:r2.id],reason:''});
 const call=(b,status=200)=>api.POST(request(b)).then(r=>ok(r,status));
 const publish=(holidays=cal().holidays,extra={},status=200)=>call({action:'calendar',month,revision:cal().revision,holidays,reason:'Company holiday adjustment after tour submission',...extra},status);
 const monthly=(action,u,status=200)=>call({action,email:u.email,month,revision:plan(u)?.revision||0,days:logic.workingDates(month,cal(),first).map(d=>day(d,u))},status);
 const get=u=>api.GET(new Request('https://app.test/api/monthly-tour?month='+month+'&email='+u.email)).then(r=>ok(r));
 who(owner);await publish();setClock(first+'T06:00:00Z');
 who(alice);await monthly('submit',alice);who(owner);await monthly('approve',alice);const approved=plan(alice);
 who(bob);await call({action:'submit-day',date:first,month,revision:0,days:[day(first,bob)]});
 who(alice);const change=await call({action:'request-change',type:'routes',from:first,routes:[r1.id],reason:'Change the visit schedule on this date'});
 // A completed visit and GPS attendance must survive a late holiday assignment.
 const put=(id,kind,data,time)=>sql.prepare('INSERT INTO records(id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').run(id,alice.id,kind,JSON.stringify(data),first+'T'+time+':00Z',alice.email);
 put('late-holiday-visit','Visits',{Date:first,Status:'Closed','Customer ID':shared.id,Customer:'Shared doctor'},'10:00');
 for(const [action,time] of [['Check in','03:30'],['Check out','11:30']])put('late-holiday-'+action,'Attendance',{Date:first,Action:action,'GPS data':JSON.stringify({lat:11.17,lng:77.46,accuracy:12,capturedAt:first+'T'+time+':00Z'})},time);
 const recorded=sql.prepare("SELECT * FROM records WHERE id LIKE 'late-holiday-%'").all();
 const newHoliday=[...cal().holidays,{date:first,name:'Company holiday',note:'Applies after planning'}];
 await publish(newHoliday,{},403);who(owner);await publish(newHoliday,{reason:''},400);
 setClock(second+'T06:00:00Z');const staleRevision=cal().revision;await publish(newHoliday);
 assert.deepEqual(plan(alice),approved,'Approved snapshots remain intact');
 assert.deepEqual(sql.prepare("SELECT * FROM records WHERE id LIKE 'late-holiday-%'").all(),recorded);
 const rejected=read(logic.dailyProgrammeID(bob.email,first));assert.equal(rejected.status,'Rejected');assert.match(rejected.reason,/Admin marked/);
 assert.equal(sql.prepare('SELECT status FROM workflow_requests WHERE id=?').get(change.id).status,'Rejected');
 await publish(cal().holidays,{revision:staleRevision},409);
 const attendance=await ok(await load(path.join(root,'app/api/attendance/route.ts')).GET(new Request('https://app.test/api/attendance?month='+month)));
 const worked=attendance.attendance.find(a=>a.email===alice.email).days.find(d=>d.date===first);assert.equal(worked.status,'complete');assert.equal(worked.duration,'8h 0m');assert.equal(worked.holiday,'Company holiday');
 const bobDay=attendance.attendance.find(a=>a.email===bob.email).days.find(d=>d.date===first);assert.equal(bobDay.status,'holiday');
 who(alice);const output=await ok(await records.GET()),tasks=output.records.filter(r=>r.kind==='Tour plan'&&r.data.Date===first);assert(tasks.length);assert(tasks.every(r=>r.data.Status==='Cancelled'));
 assert.equal(load(path.join(root,'lib/tour-planning.ts')).planState(tasks.find(r=>r.data['Customer ID']===shared.id),output.records,second),'Completed');
 setClock(first+'T06:00:00Z');assert.equal((await ok(await records.GET())).tourGate.allowed,false);
 // MRs can still request Admin permission for work on the newly assigned holiday.
 const work=await call({action:'request-holiday-work',date:first,routes:[r1.id],reason:'Keep the confirmed customer appointment'});who(owner);await call({action:'approve-change',id:work.id});who(alice);assert.equal((await ok(await records.GET())).tourGate.allowed,true);
 // Removing a holiday must not strand a visit opened with holiday-work permission.
 put('late-holiday-open','Visits',{Date:first,Status:'Open','Customer ID':shared.id},'07:00');who(owner);await publish(cal().holidays.filter(h=>h.date!==first),{},409);sql.prepare('DELETE FROM records WHERE id=?').run('late-holiday-open');
 // Pending monthly plans drop the holiday and keep unrelated dates ready for review.
 who(bob);await monthly('submit',bob);const before=plan(bob);who(owner);await publish([...cal().holidays,{date:second,name:'Regional closure'}]);
 assert.equal(plan(bob).status,'Pending');assert(!plan(bob).days.some(d=>d.date===second));assert.equal(plan(bob).calendarRevision,cal().revision);assert(plan(bob).history.some(h=>h.before.some(d=>d.date===second)));
 await call({action:'approve',email:bob.email,month,revision:before.revision},409);
 // Removing a holiday requires a new route for that working date, not silent approval.
 await publish(cal().holidays.filter(h=>h.date!==second));assert.equal(plan(bob).status,'Draft');assert.match(plan(bob).reason,/unplanned working day/);
 who(bob);await monthly('submit',bob);who(owner);await monthly('approve',bob);
 // Approved future route tasks become holidays and incompatible changes are declined.
 who(alice);const pending=await call({action:'request-change',type:'postpone',from:third,to:fourth,reason:'Swap the two future route dates'});who(owner);
 await publish([...cal().holidays,{date:third,name:'Office closure'}]);assert.equal(sql.prepare('SELECT status FROM workflow_requests WHERE id=?').get(pending.id).status,'Rejected');
 setClock(third+'T06:00:00Z');who(bob);assert.equal((await ok(await records.GET())).tourGate.allowed,false);
 // Admin can correct an earlier open month; MR history stays read-only and closing wins.
 setClock(shift(month,1)+'-01T06:00:00Z');who(owner);await publish([...cal().holidays,{date:fourth,name:'Retrospective company holiday'}]);
 sql.prepare("INSERT INTO period_locks VALUES (?,1,'late-holiday-test',?,?,?)").run(month,new Date().toISOString(),owner.email,'Reviewed month');
 assert.equal((await get(alice)).periodClosed,true);await publish(cal().holidays.filter(h=>h.date!==fourth),{},409);
 who(alice);await publish(cal().holidays,{},403);sql.prepare('DELETE FROM period_locks WHERE month=?').run(month);
 assert(sql.prepare("SELECT * FROM admin_audit WHERE entity_id=?").all(logic.calendarID(month)).some(a=>a.actor_email===owner.email&&a.reason.includes('after tour submission')));
 for(const r of sql.prepare('SELECT id FROM records').all())if(!originalRecords.has(r.id))sql.prepare('DELETE FROM records WHERE id=?').run(r.id);
 for(const r of sql.prepare('SELECT id FROM workflow_requests').all())if(!originalRequests.has(r.id))sql.prepare('DELETE FROM workflow_requests WHERE id=?').run(r.id);
 setClock(null);who(alice);
 console.log('PASS: Admin late holidays, pending daily/monthly reconciliation, unchanged approved snapshots and actual work, holiday attendance, route gates, request history, stale edits and closed-month protection.');
};
