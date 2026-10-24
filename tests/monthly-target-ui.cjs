const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {JSDOM}=require('jsdom'),React=require('react'),{act}=React;
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=require('react-dom/client'),cache=new Map();function load(p){p=path.resolve(p);if(cache.has(p))return cache.get(p).exports;const m={exports:{}};cache.set(p,m);const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(n=>n.startsWith('.')?load(path.resolve(path.dirname(p),n+(fs.existsSync(path.resolve(path.dirname(p),n+'.tsx'))?'.tsx':'.ts'))):require(n),m,m.exports);return m.exports;}
const {MonthlyTargetSetup}=load('components/monthly-target-setup.tsx');
const {AdminHub}=load('components/admin-hub.tsx');
const {MonthlyTargets}=load('components/monthly-report.tsx');
let calls=[],closed=false,fail=false,refreshFail=false,hubGets=0,summaryGets=0;
const saved={'a@test':400000,'b@test':200000};
const team=[{email:'a@test',name:'MR A',role:'mr',status:'active'},{email:'b@test',name:'MR B',role:'mr',status:'active'}];
global.fetch=async(url,init={})=>{
 if(init.method==='POST'){const b=JSON.parse(init.body);calls.push(b);if(fail)return Response.json({error:'Test: month locked'},{status:409});saved[b.email]=Math.round(b.target*100)/100;return Response.json({ok:true,month:b.month,targets:[{email:b.email,target:saved[b.email]}]})}
 if(String(url).startsWith('/api/admin-hub')){hubGets++;return Response.json({comparison:team.map(m=>({...m,districts:[],target:saved[m.email]*100,achieved:0,pending:saved[m.email]*100,percentage:0,visits:0,repeatVisits:0,orderingCustomers:0,sampleCost:0,giftCost:0})),stock:[],overdue:[],samples:[],months:[]})}
 summaryGets++;return Response.json({closed,summaries:team.map(m=>({...m,targetSaved:true,target:saved[m.email]*100,achieved:0,pending:saved[m.email]*100,percentage:0,exceeded:0}))});
};
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,20))});
const input=async(el,v)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))});
(async()=>{
 let root=createRoot(document.getElementById('root'));const render=()=>React.createElement(React.Fragment,null,React.createElement(MonthlyTargetSetup,{team,refresh:async()=>{if(refreshFail)throw Error('offline')}}),React.createElement(AdminHub,{mode:'Dashboard',user:{role:'admin'},team,go:()=>{},refresh:async()=>{}}),React.createElement(MonthlyTargets));
 await act(async()=>root.render(render()));await settle();assert(!document.body.textContent.includes('Distribute equally'));assert(!document.body.textContent.includes('Total target'));
 const a=()=>document.querySelector('[aria-label="Monthly target for MR A"]'),b=()=>document.querySelector('[aria-label="Monthly target for MR B"]'),saveA=()=>document.querySelector('[aria-label="Save target for MR A"]');
 assert.equal(a().value,'400000');await input(b(),'210000');await input(a(),'350000.25');const beforeHub=hubGets,beforeSummaries=summaryGets;
 await act(async()=>saveA().click());await settle();assert.equal(calls[0].expectedTarget,400000);assert.equal(calls[0].email,'a@test');assert(!('total' in calls[0]));assert(!('targets' in calls[0]));assert.equal(b().value,'210000');assert.equal(saved['b@test'],200000);assert(hubGets>beforeHub);assert(summaryGets>beforeSummaries);assert(document.querySelector('.admin-hub').textContent.includes('3,50,000.25'));assert(document.querySelector('[role=status]').textContent.includes('Saved ₹3,50,000.25'));
 await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await act(async()=>root.render(render()));await settle();assert.equal(a().value,'350000.25');
 fail=true;await input(a(),'360000');await act(async()=>saveA().click());assert.equal(a().value,'360000');assert.equal(saved['a@test'],350000.25);assert(document.querySelector('[role=alert]').textContent.includes('month locked'));assert(!document.querySelector('[role=status]'));
 fail=false;refreshFail=true;await act(async()=>saveA().click());assert.equal(saved['a@test'],360000);assert(document.querySelector('[role=status]').textContent.includes('Saved ₹3,60,000'));assert(document.querySelector('[role=alert]').textContent.includes('Target was saved'));
 closed=true;await act(async()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Reload saved targets').click());await settle();assert(document.querySelector('.monthly-setup fieldset').disabled);await act(async()=>root.unmount());
 console.log('PASS: target save confirmation, saved-page reopen, independent unsaved MR inputs, immediate comparison/performance refresh, stale expected value, failed-save retention, refresh failure distinction and locked-month UI.');
})().catch(e=>{console.error(e);process.exit(1)});
