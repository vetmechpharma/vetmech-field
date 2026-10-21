// Exercise the real monthly planner and Admin review controls without live requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {JSDOM}=require('jsdom'),React=require('react'),{act}=React;
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,HTMLSelectElement:dom.window.HTMLSelectElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const NativeDate=Date;global.Date=new Proxy(NativeDate,{construct(target,args){return Reflect.construct(target,args.length?args:['2026-11-04T06:00:00Z'])},get(target,key){return key==='now'?()=>NativeDate.parse('2026-11-04T06:00:00Z'):Reflect.get(target,key)}});
const {createRoot}=require('react-dom/client'),base=path.resolve(__dirname,'..'),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(!name.startsWith('.'))return require(name);let p=path.resolve(path.dirname(file),name);if(!path.extname(p))p+=fs.existsSync(p+'.tsx')?'.tsx':'.ts';return load(p)},module,module.exports);return module.exports}
const {MonthlyTour,TourApprovals}=load(path.join(base,'components/monthly-tour.tsx'));
const {monthDates,workingDates}=load(path.join(base,'lib/monthly-tour.ts'));
const user={role:'mr',email:'mr@example.test',name:'Test MR',status:'active'},admin={role:'admin',email:'admin@example.test',name:'Admin'};
const calendar={year:'2026',name:'Reviewed field holidays',revision:1,confirmed:true,holidays:[{date:'2026-11-06',name:'Regional government holiday'}]};
let programme=null,requests=[],posted=[],rejectNext=false;
const routes=[{id:'erode',name:'Erode route'},{id:'tirupur',name:'Tirupur route'}];
global.fetch=async(url,init)=>{if(init?.method==='POST'){const b=JSON.parse(init.body);posted.push(b);if(rejectNext){rejectNext=false;return new Response(JSON.stringify({error:'Programme changed. Refresh and review again.'}),{status:409})}
 if(['save','submit'].includes(b.action))programme={month:b.month,startsOn:'2026-11-04',days:b.days,status:b.action==='save'?'Draft':'Pending',revision:(programme?.revision||0)+1,history:[]};
 if(b.action==='withdraw')programme={...programme,status:'Draft',revision:programme.revision+1};
 if(b.action==='approve')programme={...programme,status:'Approved',revision:programme.revision+1};
 if(b.action==='request-change')requests.push({id:'request-one',mr_email:user.email,status:'Pending',body:{...b,programmes:[{month:programme.month,before:[programme.days.find(d=>d.date===b.from)],after:[{date:b.from,type:'leave',routes:[],reason:b.reason}]}]}});
 if(b.action==='approve-change')requests=requests.map(r=>({...r,status:'Approved'}));
 return new Response(JSON.stringify({ok:true}));}
 return new Response(JSON.stringify({calendar,programme,requests,routes,leave:[],programmes:programme?[{id:'programme',assigned_to:user.email,data:programme}]:[]}));};
const errors=[],originalError=console.error;console.error=(...a)=>errors.push(a.join(' '));
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,5))});
async function click(text,scope=document){const button=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert(button,'Missing '+text);assert(!button.disabled,'Disabled '+text);await act(async()=>button.click());await settle();}
async function input(element,value){assert(element);await act(async()=>{const p=element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}))});await settle();}
let root;
(async()=>{
 root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(MonthlyTour,{user,team:[],refresh(){}})));await settle();
 assert.equal(document.querySelectorAll('.monthly-tour-day').length,monthDates('2026-11').length);
 assert(!document.querySelector('.tour-holidays'));assert(document.body.textContent.includes('Regional government holiday'));
 const submit=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Submit month for approval'));assert(submit().disabled);
 await act(async()=>document.querySelector('.tour-fill input[type=checkbox]').click());await click('Fill working days with these routes');assert(!submit().disabled);
 const leaveRow=[...document.querySelectorAll('.monthly-tour-day')].find(d=>d.querySelector('select[aria-label="Day type 2026-11-05"]'));
 await input(leaveRow.querySelector('select'),'leave');assert(submit().disabled);await input(leaveRow.querySelector('input'),'Family appointment');assert(!submit().disabled);
 await click('Save draft');let body=posted.at(-1);assert.equal(body.action,'save');assert.equal(body.days.length,workingDates('2026-11',calendar,'2026-11-04').length);assert(body.days.every(d=>!['2026-11-06','2026-11-08'].includes(d.date)));assert.equal(body.days.find(d=>d.date==='2026-11-05').reason,'Family appointment');
 await click('Submit month for approval');assert.equal(posted.at(-1).action,'submit');assert(!document.querySelector('.monthly-tour-day select'));assert(!document.body.textContent.includes('Approve monthly programme'));
 await click('Withdraw to edit');assert(document.querySelector('.monthly-tour-day select'));
 rejectNext=true;await click('Save draft');assert(document.querySelector('[role=alert]').textContent.includes('Programme changed'));
 await click('Submit month for approval');programme.status='Approved';await click('Refresh programme');
 await click('Request change');const form=document.querySelector('.tour-change-form');await input(form.querySelector('select'),'leave');await input(form.querySelector('textarea'),'Unable to attend this route today');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await settle();assert.equal(posted.at(-1).action,'request-change');assert.equal(posted.at(-1).type,'leave');assert.equal(posted.at(-1).from,'2026-11-04');assert(document.body.textContent.includes('Withdraw request'));assert(document.querySelector('.tour-change-preview').textContent.includes('Erode route'));assert(document.querySelector('.tour-change-preview').textContent.includes('Leave'));
 await act(async()=>root.unmount());
 // Admin sees the full monthly programme and side-by-side original/requested date plan.
 programme.status='Pending';root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(TourApprovals,{team:[user],rows:routes.map(r=>({id:r.id,kind:'Routes',data:{Name:r.name}})),refresh(){}})));await settle();
 assert.equal([...document.querySelectorAll('button')].filter(b=>b.textContent==='Approve month').length,1);assert(document.body.textContent.includes('Family appointment'));assert(document.querySelector('.tour-change-preview').textContent.includes('Erode route'));assert(document.querySelector('.tour-change-preview').textContent.includes('Leave'));
 await click('Approve month');assert.equal(posted.at(-1).action,'approve');assert.equal(posted.at(-1).email,user.email);assert(!document.body.textContent.includes('Approve month'));
 await click('Approve date change');assert.equal(posted.at(-1).action,'approve-change');assert(document.body.textContent.includes('No monthly programmes or date changes awaiting approval.'));
 await act(async()=>root.unmount());
 root=createRoot(document.getElementById('root'));calendar.confirmed=false;await act(async()=>root.render(React.createElement(MonthlyTour,{user:admin,team:[user],refresh(){}})));await settle();assert(document.querySelector('.tour-holidays'));assert(document.body.textContent.includes('Admin review required'));assert(document.body.textContent.includes('state and local holidays'));await act(async()=>root.unmount());
 assert(!errors.some(e=>/same key|unique.*key|not wrapped|error occurred/i.test(e)),errors.join('\n'));console.error=originalError;console.log('PASS: monthly tour forms, multi-route fill, Sunday/holiday exclusion, leave reasons, submission/withdrawal, stale-state feedback, route/leave request payloads and Admin comparison/approval controls.');dom.window.close();
})().catch(e=>{console.error=originalError;console.error(e);process.exitCode=1;dom.window.close()});
