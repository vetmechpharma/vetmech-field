const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {JSDOM}=require('jsdom'),React=require('react'),{act}=React;
const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test'});
Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
const {createRoot}=require('react-dom/client'),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(n=>n==='./use-draft'?{useDraft:()=>({save:async()=>{},complete(){},status:''})}:n==='./direct-supply'?{DirectProposals:()=>null,OrderHistory:()=>null}:n.startsWith('.')?load(path.resolve(path.dirname(file),n+(fs.existsSync(path.resolve(path.dirname(file),n+'.tsx'))?'.tsx':'.ts'))):require(n),m,m.exports);return m.exports;}
const {CommercePanel}=load('components/commerce-panel.tsx'),{useOrderProductTargets,OrderProductTarget}=load('components/order-product-target.tsx');
const month=load('lib/ui-config.ts').today().slice(0,7);
const base={kind:'Products',created:month+'-01',data:{Name:'REGULAN',Pack:'5 ml',MRP:'105',PTR:'90',PTS:'80','GST %':'5','Scheme 1 enabled':'Yes','Scheme 1 paid':'10','Scheme 1 free':'3'}};
const rows=[{...base,id:'a'},{...base,id:'b',data:{...base.data,Pack:'10 ml'}},{...base,id:'c',data:{...base.data,Name:'Untargeted'}},{...base,id:'d',data:{...base.data,Name:'No sales'}},{id:'customer',kind:'Customers',data:{Name:'Doctor','Customer category':'Doctor'}},{id:'agency',kind:'Stockists',data:{Name:'Agency'}}];
const progress=(productId,targetQty,achievedQty)=>({productId,name:'REGULAN',packing:productId==='b'?'10 ml':'5 ml',targetQty,achievedQty,paidQty:achievedQty-3,freeQty:3,pendingQty:targetQty===null?null:Math.max(0,targetQty-achievedQty),quantityPercentage:targetQty?achievedQty/targetQty*100:null,target:targetQty===null?null:targetQty*8000,achieved:achievedQty*6000,pending:targetQty===null?null:Math.max(0,targetQty*8000-achievedQty*6000),percentage:null});
let targetRows=[progress('a',30,13),progress('b',100,50),progress('c',null,7)],invoices=[],defer=true,fail=false,reads=[],pending=[];
const response=(m=month,products=targetRows)=>({month:m,summaries:[{email:'mr@test',productTargets:products}]});
global.fetch=async(url,init={})=>{
 assert(!init.method||init.method==='GET','Target guidance must never post an order or change a target');
 if(String(url).startsWith('/api/monthly-report')){reads.push(String(url));const m=new URL(url,'https://app.test').searchParams.get('month');if(defer)return new Promise(resolve=>pending.push({month:m,resolve}));if(fail)return Response.json({error:'temporarily unavailable'},{status:503});return Response.json(response(m));}
 if(url==='/api/commerce')return Response.json({stock:[],invoices,commitments:[]});
 return Response.json({});
};
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,15))});
const click=async(text,scope=document)=>{const button=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert(button,'Missing button '+text);await act(async()=>button.click());await settle()};
const change=async(el,value)=>{assert(el);await act(async()=>{const proto=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))});};
const productSelect=n=>document.querySelectorAll('.invoice-line-editor>label:first-child select')[n];
const card=id=>document.querySelector(`.order-product-target[data-product-id="${id}"]`);
const values=id=>[...card(id).querySelectorAll('dd')].map(e=>e.textContent);
function Harness({month:reportMonth,productId='a',enabled=true,editingApproved=false}){const state=useOrderProductTargets(enabled,reportMonth);return React.createElement(OrderProductTarget,{state,month:reportMonth,productId,editingApproved});}
(async()=>{
 const root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(CommercePanel,{tab:'Orders',rows,admin:false,refresh:async()=>{}})));await settle();assert.equal(reads.length,0);
 await click('Take order');assert.equal(reads.length,1);assert(reads[0].includes('month='+month));assert(!document.querySelector('.order-product-target'));
 assert([...productSelect(0).options].some(o=>o.text==='REGULAN · 5 ml'));assert([...productSelect(0).options].some(o=>o.text==='REGULAN · 10 ml'));
 await change(productSelect(0),'a');assert(card('a').textContent.includes('Loading target quantities'));assert.equal(card('a').querySelectorAll('dd').length,0);
 await act(async()=>pending.shift().resolve(Response.json(response())));await settle();assert.deepEqual(values('a'),['30','13','17']);assert(card('a').textContent.includes('Paid + free units'));assert(card('a').textContent.includes('This draft is not counted'));
 await change(productSelect(0),'b');assert.deepEqual(values('b'),['100','50','50']);assert(!card('a'));assert.equal(reads.length,1);
 await change(productSelect(0),'a');await click('Add another product');await change(productSelect(1),'b');assert.equal(reads.length,1,'Product lines share one scoped monthly request');assert.deepEqual(values('a'),['30','13','17']);assert.deepEqual(values('b'),['100','50','50']);
 await change(document.querySelector('.invoice-line-editor input[type=number]'),'50');assert.deepEqual(values('a'),['30','13','17'],'Draft units must not be added to achievement');
 await change(document.querySelectorAll('.invoice-line-editor select')[1],'1');assert.deepEqual(values('a'),['30','13','17'],'Draft free units also wait for approval');
 await change(productSelect(0),'c');assert.deepEqual(values('c'),['Not set','7','—']);await change(productSelect(0),'d');assert.deepEqual(values('d'),['Not set','0','—']);
 defer=false;fail=true;await act(async()=>card('d').querySelector('button[aria-label="Refresh product targets"]').click());await settle();assert(card('d').textContent.includes('Target progress unavailable'));assert.equal(card('d').querySelectorAll('dd').length,0,'Fetch errors must not masquerade as zero sales or no target');
 fail=false;targetRows=[progress('a',30,35),progress('b',100,50)];await click('Retry',card('d'));await change(productSelect(0),'a');assert.deepEqual(values('a'),['30','35','0']);assert(card('a').textContent.includes('Qty target met'));assert.equal(card('a').querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'100');assert(card('a').querySelector('[role=progressbar]').getAttribute('aria-valuetext').includes('116.7%'));
 assert(!card('a').textContent.match(/salary|incentive|landing cost|profit/i));
 const count=reads.length;await act(async()=>root.render(React.createElement(CommercePanel,{key:'admin-primary',tab:'Primary sales',rows,admin:true,refresh:async()=>{}})));await settle();await click('New primary invoice');await change(productSelect(0),'a');assert.equal(reads.length,count);assert(!document.querySelector('.order-product-target'));
 // Slow responses from a previous order month must not replace the current month.
 defer=true;pending=[];await act(async()=>root.render(React.createElement(Harness,{month:'2026-01'})));await settle();const january=pending.shift();
 await act(async()=>root.render(React.createElement(Harness,{month:'2026-02'})));await settle();const february=pending.shift();assert.equal(january.month,'2026-01');assert.equal(february.month,'2026-02');
 await act(async()=>february.resolve(Response.json(response('2026-02',[progress('a',80,10)]))));await settle();assert.deepEqual(values('a'),['80','10','70']);
 await act(async()=>january.resolve(Response.json(response('2026-01',[progress('a',999,900)]))));await settle();assert.deepEqual(values('a'),['80','10','70']);assert(card('a').textContent.includes('Feb 2026'));
 defer=false;targetRows=[progress('a',30,13)];await act(async()=>root.render(React.createElement(Harness,{month:'2026-02',editingApproved:true})));await act(async()=>window.dispatchEvent(new Event('focus')));await settle();assert.deepEqual(values('a'),['30','13','17']);assert(card('a').textContent.includes('Includes this approved order'));
 targetRows=[progress('a',40,20)];await act(async()=>window.dispatchEvent(new Event('monthly-targets-updated')));await settle();assert.deepEqual(values('a'),['40','20','20']);
 // An old archive may have value achievements but no captured unit totals.
 targetRows=[{productId:'a',target:10000,achieved:2000,pending:8000}];await act(async()=>card('a').querySelector('button').click());await settle();assert.deepEqual(values('a'),['Not set','Not recorded','—']);
 await act(async()=>root.unmount());
 console.log('PASS: MR order product/packing target highlights, paid + free approved units, independent draft quantities, shared fetch, missing targets, overachievement, primary/Admin isolation, retry, stale-month responses and refresh.');
})().catch(e=>{console.error(e);process.exit(1)});
