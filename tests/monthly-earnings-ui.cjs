const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {JSDOM}=require('jsdom'),React=require('react'),{act}=React;
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=require('react-dom/client'),cache=new Map();
function load(p){p=path.resolve(p);if(cache.has(p))return cache.get(p).exports;const m={exports:{}};cache.set(p,m);const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(n=>n.startsWith('.')?load(path.resolve(path.dirname(p),n+(fs.existsSync(path.resolve(path.dirname(p),n+'.tsx'))?'.tsx':'.ts'))):require(n),m,m.exports);return m.exports;}
const {MonthlyProductPlan}=load('components/monthly-product-plan.tsx'),{MonthlyTargets}=load('components/monthly-report.tsx');
let body=null,plan=null,closed=false,fail=false,saved=0,events=0,lastProgressURL='';
window.addEventListener('monthly-targets-updated',()=>events++);
global.fetch=async(url,init={})=>{
 if(init.method==='POST'){body=JSON.parse(init.body);if(fail)return Response.json({error:'Plan changed; reload.'},{status:409});plan={version:2,revision:(plan?.revision||0)+1,savedAt:'2026-11-01T09:00:00Z',products:body.products.map(p=>({...p,name:'Brand',packing:'100 ml',target:p.targetQty===null?0:p.targetQty*p.expectedRate,targetRate:p.expectedRate,salaryBps:p.salaryPercent*100})),slabs:body.slabs.map(s=>({above:s.above*100,rateBps:s.percent*100})),target:body.products.reduce((n,p)=>n+(p.targetQty||0)*p.expectedRate,0),salaryBudget:body.salaryBudget===null?null:body.salaryBudget*100};return Response.json({month:body.month,email:body.email,revision:plan.revision,target:plan.target/100});}
 if(String(url).startsWith('/api/monthly-report')){lastProgressURL=String(url);return Response.json({summaries:[{email:'a@test',name:'MR A',target:40000000,achieved:50000000,pending:0,percentage:125,targetSaved:true,exceeded:10000000,productTargets:[{productId:'p',name:'Brand',packing:'100 ml',target:40000000,achieved:50000000,percentage:125,pending:0,targetQty:100,achievedQty:130,paidQty:100,freeQty:30,pendingQty:0,quantityPercentage:130},{productId:'unplanned',name:'No target product',packing:'500 ml',target:null,achieved:60000,pending:null,percentage:null,targetQty:null,achievedQty:10,paidQty:8,freeQty:2,pendingQty:null,quantityPercentage:null}]}]});}
 return Response.json({email:'a@test',month:'2026-11',closed,expectedTarget:plan?plan.target/100:400000,plan,products:[{id:'p',name:'Brand',packing:'100 ml',pts:10000},{id:'p2',name:'Brand',packing:'500 ml',pts:20000}],history:[]});
};
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,20))});
const change=async(el,v)=>act(async()=>{const proto=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
const button=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text);
const byLabel=text=>document.querySelector('[aria-label="'+text+'"]');
(async()=>{
 const root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(MonthlyProductPlan,{email:'a@test',name:'MR A',month:'2026-11',onSaved:async()=>{saved++}})));await settle();
 assert(document.body.textContent.includes('Brand · 100 ml'));assert(document.body.textContent.includes('Brand · 500 ml'));
 await change(byLabel('Choose target product'),'p');await act(async()=>button('Add product').click());
 assert(button('Save monthly product plan').disabled);
 await change(byLabel('Target quantity for Brand · 100 ml'),'4000');await change(byLabel('Salary percentage for Brand · 100 ml'),'11.25');
 assert(document.body.textContent.includes('45,000'));assert(!button('Save monthly product plan').disabled);
 await act(async()=>button('Add slab').click());await change(byLabel('Incentive threshold 1'),'400000');await change(byLabel('Incentive percentage 1'),'1');
 await act(async()=>button('Add slab').click());await change(byLabel('Incentive threshold 2'),'500000');await change(byLabel('Incentive percentage 2'),'2');
 await act(async()=>button('Save monthly product plan').click());await settle();
 assert.equal(saved,1);assert.equal(events,1);assert.equal(body.expectedRevision,0);assert.equal(body.expectedTarget,400000);assert.equal(body.products[0].salaryPercent,11.25);assert.equal(body.products[0].targetQty,4000);assert.equal(body.products[0].expectedRate,10000);assert.equal(body.target,undefined);assert.equal(plan.target,40000000);assert.equal(body.slabs[1].percent,2);assert(document.querySelector('[role=status]').textContent.includes('revision 1'));
 fail=true;await change(byLabel('Salary percentage for Brand · 100 ml'),'15');await change(document.querySelector('textarea'),'Increased weight');
 await act(async()=>button('Save monthly product plan').click());assert.equal(byLabel('Salary percentage for Brand · 100 ml').value,'15');assert(document.querySelector('[role=alert]').textContent.includes('Plan changed'));assert.equal(saved,1);assert.equal(body.expectedRevision,1);
 closed=true;await act(async()=>button('Reload plan').click());await settle();assert(document.querySelector('fieldset').disabled);
 plan={...plan,version:1,products:plan.products.map(({targetQty,targetRate,...p})=>({...p,pts:10000}))};await act(async()=>button('Reload plan').click());await settle();assert(document.body.textContent.includes('This plan has value targets only'));assert(document.querySelector('.earnings-preview').textContent.includes('45,000'));assert.equal(byLabel('Target quantity for Brand · 100 ml').value,'');assert(document.querySelector('.quantity-price-preview').textContent.includes('4,00,000'));
 await act(async()=>root.render(React.createElement(MonthlyTargets)));await settle();
 assert(document.querySelector('.product-target-progress').textContent.includes('100 ml'));assert(document.querySelector('.product-target-progress').textContent.includes('125.0%'));assert(!document.body.textContent.includes('Salary'));assert(!document.body.textContent.includes('profit'));assert(document.querySelector('.product-target-progress').textContent.includes('130.0%'));assert(document.querySelector('.product-progress-mobile').textContent.includes('8 paid + 2 free'));assert(document.body.textContent.includes('Qty target not set'));assert(document.body.textContent.includes('₹600.00'));
 await change(byLabel('Target performance month'),'2026-10');await settle();assert.equal(byLabel('Target performance up to date').value,'2026-10-31');
 await change(byLabel('Target performance up to date'),'2026-10-12');await settle();assert(lastProgressURL.includes('through=2026-10-12'));assert(document.querySelector('.product-progress-heading').textContent.includes('2026-10-01 to 2026-10-12'));
 await act(async()=>button('Month end').click());await settle();assert(lastProgressURL.includes('through=2026-10-31'));assert(button('Export CSV'));assert(button('Print / Save PDF'));
 await act(async()=>root.unmount());
 console.log('PASS: quantity target editor, packing and PTS preview, salary and incentives, save/lock states, mobile progress, untargeted achievements, date/month controls and report export actions.');
})().catch(e=>{console.error(e);process.exit(1)});
