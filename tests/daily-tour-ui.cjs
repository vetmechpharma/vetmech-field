const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {JSDOM}=require('jsdom'),React=require('react'),{act}=React;
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,HTMLSelectElement:dom.window.HTMLSelectElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const NativeDate=Date;global.Date=new Proxy(NativeDate,{construct(target,args){return Reflect.construct(target,args.length?args:['2026-11-04T06:00:00Z'])},get(target,key){return key==='now'?()=>NativeDate.parse('2026-11-04T06:00:00Z'):Reflect.get(target,key)}});
const {createRoot}=require('react-dom/client'),base=path.resolve(__dirname,'..'),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(!name.startsWith('.'))return require(name);let p=path.resolve(path.dirname(file),name);if(!path.extname(p))p+=fs.existsSync(p+'.tsx')?'.tsx':'.ts';return load(p)},module,module.exports);return module.exports}
const {MonthlyTour,TourApprovals}=load(path.join(base,'components/monthly-tour.tsx'));
const user={role:'mr',email:'mr@example.test',name:'Test MR',status:'active'},admin={role:'admin',email:'admin@example.test',name:'Admin'};
const calendar={year:'2026',month:'2026-11',name:'Published holidays',revision:1,confirmed:true,holidays:[]};
const routes=[{id:'erode',name:'Erode route'},{id:'karur',name:'Karur route'}];
let plans=[],programme=null,posted=[],requests=[],failNext=false,periodClosed=false;
global.fetch=async(url,init)=>{
 if(init?.method==='POST'){
  const b=JSON.parse(init.body);posted.push(b);if(failNext){failNext=false;return new Response(JSON.stringify({error:'Programme changed. Refresh and review again.'}),{status:409})}
  if(b.action.endsWith('-day')){
   const old=plans.find(p=>p.startsOn===b.date),action=b.action.slice(0,-4);
   assert.equal(b.revision,old?.revision||0,'Must submit the daily revision, not the monthly revision');
   const p={scope:'day',month:b.month,startsOn:b.date,history:[],...old,revision:(old?.revision||0)+1,status:action==='submit'?'Pending':action==='approve'?'Approved':action==='reject'?'Rejected':'Draft',days:['save','submit'].includes(action)?b.days:old.days,reason:action==='reject'?b.reason:''};
   plans=[...plans.filter(p=>p.startsOn!==b.date),p];
  }
  if(b.action==='save'||b.action==='submit')programme={month:b.month,startsOn:'2026-11-04',status:b.action==='submit'?'Pending':'Draft',revision:(programme?.revision||0)+1,days:b.days,history:[]};
  if(b.action==='withdraw')programme={...programme,status:'Draft',revision:programme.revision+1};
  if(b.action==='calendar')Object.assign(calendar,{holidays:b.holidays,confirmed:true,revision:calendar.revision+1});
  if(b.action==='request-holiday-work')requests.push({id:'holiday',status:'Pending',body:{...b,type:'holiday_work',from:b.date,programmes:[{month:b.month,before:[],after:[{date:b.date,type:'visit',routes:b.routes,reason:b.reason}]}]}});
  return new Response(JSON.stringify({ok:true}));
 }
 return new Response(JSON.stringify({calendar,periodClosed,programme,dailyProgrammes:plans,routes,requests,holidayWork:[],leave:[],programmes:[...(programme?[{id:'month',assigned_to:user.email,data:programme}]:[]),...plans.map(p=>({id:p.startsOn,assigned_to:user.email,data:p}))]}));
};
const errors=[],originalError=console.error;console.error=(...a)=>errors.push(a.join(' '));
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,5))});
async function click(text,scope=document){const b=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert(b,'Missing '+text);assert(!b.disabled,'Disabled '+text);await act(async()=>b.click());await settle()}
async function input(element,value){assert(element);await act(async()=>{const proto=element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}))});await settle()}
const selectedDate=()=>document.querySelector('input[aria-label="Daily plan date"]');
const row=date=>document.querySelector(`.monthly-tour-day[data-date="${date}"]`);
let root;
async function mount(Component,props){root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(Component,props)));await settle()}
(async()=>{
 // The monthly calendar itself can submit one date while every other date stays incomplete.
 await mount(MonthlyTour,{user,team:[],refresh(){}});
 assert(!document.body.textContent.includes('Mark holiday'));
 assert([...row('2026-11-04').querySelectorAll('button')].find(b=>b.textContent.includes('Submit this day')).disabled);
 await act(async()=>{row('2026-11-04').querySelector('input[type=checkbox]').click();row('2026-11-06').querySelectorAll('input[type=checkbox]')[1].click()});
 assert([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Submit month for approval')).disabled);
 await click('Submit this day',row('2026-11-04'));assert.equal(posted.at(-1).action,'submit-day');assert.equal(posted.at(-1).date,'2026-11-04');assert.equal(posted.at(-1).days.length,1);
 assert(row('2026-11-04').textContent.includes('Daily approval pending'));assert(!row('2026-11-04').querySelector('select'));
 assert(row('2026-11-06').querySelectorAll('input[type=checkbox]')[1].checked,'Submitting one day must preserve other unsaved route choices');
 await click('Review day',row('2026-11-04'));assert.equal(selectedDate().value,'2026-11-04');await click('Withdraw daily submission');assert(document.querySelector('.daily-tour-fields'));
 await act(async()=>root.unmount());plans=[];posted=[];
 await mount(MonthlyTour,{user,team:[],refresh(){}});await click('Single day');assert.equal(document.querySelectorAll('.monthly-tour-day').length,0);assert(document.body.textContent.includes('Upcoming days can be planned later'));
 await input(selectedDate(),'2026-11-05');await act(async()=>document.querySelector('.daily-tour-fields input[type=checkbox]').click());
 await click('Save daily draft');assert.equal(posted.at(-1).action,'save-day');assert.equal(posted.at(-1).date,'2026-11-05');assert.equal(selectedDate().value,'2026-11-05');
 await click('Submit day for approval');assert.equal(posted.at(-1).revision,1);assert.equal(posted.at(-1).days.length,1);assert.deepEqual(posted.at(-1).days[0].routes,['erode']);assert(!document.body.textContent.includes('Approve day'));assert(document.body.textContent.includes('Waiting for Admin'));assert.equal(selectedDate().value,'2026-11-05');
 await click('Withdraw daily submission');await input(document.querySelector('select[aria-label="Daily plan type"]'),'leave');
 assert([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Submit day for approval')).disabled);await input(document.querySelector('textarea[aria-label="Daily leave reason"]'),'Family appointment');await click('Submit day for approval');assert.equal(posted.at(-1).days[0].type,'leave');
 await act(async()=>root.unmount());
 await mount(TourApprovals,{team:[user],rows:routes.map(r=>({id:r.id,kind:'Routes',data:{Name:r.name}})),refresh(){}});
 assert(document.body.textContent.includes('Daily plan'));assert(document.body.textContent.includes('Family appointment'));assert(!document.body.textContent.includes('Approve month'));
 await input(document.querySelector('.tour-review-card input'),'Choose a working route instead');await click('Reject day');assert.equal(posted.at(-1).action,'reject-day');assert.equal(posted.at(-1).date,'2026-11-05');await act(async()=>root.unmount());
 await mount(MonthlyTour,{user,team:[],refresh(){}});await click('Single day');await input(selectedDate(),'2026-11-05');assert(document.body.textContent.includes('Choose a working route instead'));
 await input(document.querySelector('select[aria-label="Daily plan type"]'),'visit');await act(async()=>document.querySelector('.daily-tour-fields input[type=checkbox]').click());
 failNext=true;await click('Submit day for approval');assert(document.querySelector('[role=alert]').textContent.includes('Programme changed'));assert.equal(selectedDate().value,'2026-11-05');await click('Submit day for approval');
 await act(async()=>root.unmount());await mount(TourApprovals,{team:[user],rows:routes.map(r=>({id:r.id,kind:'Routes',data:{Name:r.name}})),refresh(){}});await click('Approve day');assert.equal(plans[0].status,'Approved');await act(async()=>root.unmount());
 await mount(MonthlyTour,{user,team:[],refresh(){}});await click('Single day');await input(selectedDate(),'2026-11-05');assert(document.body.textContent.includes('Erode route'));assert(!document.querySelector('.daily-tour-fields'));await click('Request change');assert(document.querySelector('.tour-change-form'));
 // A different date remains editable; a Sunday uses the separate holiday-work request.
 await input(selectedDate(),'2026-11-08');assert(!document.querySelector('.tour-change-form'),'Selecting another day must close the previous date change form');assert(document.body.textContent.includes('Sunday'));assert(!document.body.textContent.includes('Submit day for approval'));await click('Request to work');const form=document.querySelector('.tour-holiday-work-form');await act(async()=>form.querySelector('input[type=checkbox]').click());await input(form.querySelector('textarea'),'Confirmed Sunday customer appointment');await click('Send holiday work request');assert.equal(posted.at(-1).action,'request-holiday-work');assert.equal(posted.at(-1).date,'2026-11-08');assert.equal(selectedDate().value,'2026-11-08');
 await input(selectedDate(),'2026-11-06');assert(document.querySelector('.daily-tour-fields'));await input(selectedDate(),'2026-11-03');assert(document.body.textContent.includes('Past dates are read-only'));assert(!document.querySelector('.daily-tour-fields'));
 await click('Full month');const approvedRow=[...document.querySelectorAll('.monthly-tour-day')].find(r=>r.textContent.includes('Thu, 5 Nov'));assert(approvedRow);assert(approvedRow.textContent.includes('Daily approved'));assert(!approvedRow.querySelector('select'));assert(approvedRow.textContent.includes('Erode route'));
 await act(async()=>document.querySelectorAll('.tour-fill input[type=checkbox]')[1].click());await click('Fill working days with these routes');assert(approvedRow.textContent.includes('Erode route'));await click('Save draft');assert.deepEqual(posted.at(-1).days.find(d=>d.date==='2026-11-05').routes,['erode']);
 await act(async()=>root.unmount());
 // A pending month provides an actionable way to switch to one-day submission.
 plans=[];programme={month:'2026-11',startsOn:'2026-11-04',status:'Pending',revision:12,history:[],days:[{date:'2026-11-04',type:'visit',routes:['erode'],reason:''}]};
 await mount(MonthlyTour,{user,team:[],refresh(){}});await click('Single day');assert(!document.querySelector('.daily-tour-fields'));await click('Withdraw month to plan this day');assert.equal(posted.at(-1).revision,12);
 assert(document.querySelector('.daily-tour-fields input[type=checkbox]').checked);await click('Submit day for approval');assert.equal(posted.at(-1).date,'2026-11-04');await act(async()=>root.unmount());
 // Admin's per-date action works after approval and accepts earlier dates in the open month.
 programme.status='Approved';await mount(MonthlyTour,{user:admin,team:[user],refresh(){}});
 await input(document.querySelector('.admin-filters select'),user.email);await click('Mark holiday',row('2026-11-05'));
 assert(document.querySelector('.tour-holidays').open);assert.equal(document.querySelector('[aria-label="Holiday 1 date"]').value,'2026-11-05');
 await input(document.querySelector('[aria-label="Holiday 1 name"]'),'Company holiday');await input(document.querySelector('[aria-label="Holiday 1 note"]'),'Office closed for all MRs');await input(document.querySelector('.tour-holidays form>label input'),'Holiday announced after tour approval');await click('Publish holidays for all MRs');
 assert.equal(posted.at(-1).action,'calendar');assert.equal(posted.at(-1).holidays[0].date,'2026-11-05');assert(row('2026-11-05').classList.contains('day-off'));assert(row('2026-11-05').textContent.includes('Office closed for all MRs'));
 await click('Mark holiday',row('2026-11-02'));const pastDate=document.querySelector('[aria-label="Holiday 2 date"]');assert.equal(pastDate.min,'2026-11-01');assert(!pastDate.disabled);assert.equal(pastDate.value,'2026-11-02');
 await input(document.querySelector('[aria-label="Holiday 2 name"]'),'Earlier company holiday');await input(document.querySelector('.tour-holidays form>label input'),'Correct the earlier holiday notice');await click('Publish holidays for all MRs');assert.equal(posted.at(-1).holidays.length,2);
 periodClosed=true;await click('Refresh programme');assert(document.querySelector('[aria-label="Holiday 1 date"]').disabled);assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Assign holiday').disabled);
 await click('Single day');assert(!document.querySelector('.daily-tour-fields'));assert(document.body.textContent.includes('Plans are read-only'));await act(async()=>root.unmount());
 assert(!errors.some(e=>/same key|unique.*key|not wrapped|error occurred|Maximum update/i.test(e)),errors.join('\n'));console.error=originalError;console.log('PASS: single-day controls, persistent selected date, daily revisions, incomplete future dates, leave, withdrawal, rejection/approval, stale errors, Sunday work, calendar-row submission, preserved draft routes, pending-month withdrawal, Admin late holidays and closed-month controls.');dom.window.close();
})().catch(e=>{console.error=originalError;console.error(e);process.exitCode=1;dom.window.close()});
