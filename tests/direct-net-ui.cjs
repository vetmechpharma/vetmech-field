const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {JSDOM}=require('jsdom'),React=require('react'),{act}=React;
const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test'});
Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
const {createRoot}=require('react-dom/client'),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(n=>n==='./use-draft'?{useDraft:()=>({save:async()=>{},complete(){},status:''})}:n==='./direct-supply'?{DirectProposals:()=>null,OrderHistory:()=>null}:n.startsWith('.')?load(path.resolve(path.dirname(file),n+(fs.existsSync(path.resolve(path.dirname(file),n+'.tsx'))?'.tsx':'.ts'))):require(n),m,m.exports);return m.exports;}
const {ProductSchemes}=load('components/product-schemes.tsx'),{CommercePanel}=load('components/commerce-panel.tsx');
const product={Name:'Example product',Pack:'15 ml',MRP:'105',PTR:'80',PTS:'72','GST %':'5','Landing cost':'20','Scheme 1 enabled':'Yes','Scheme 1 paid':'30','Scheme 1 free':'10','Scheme 2 enabled':'Yes','Scheme 2 type':'Direct net rate','Scheme 2 minimum qty':'100','Scheme 2 net rate':'25'};
const rows=[{id:'p',kind:'Products',data:product},{id:'s',kind:'Stockists',data:{Name:'Agency'}},{id:'c',kind:'Customers',data:{Name:'Doctor','Customer category':'Doctor'}}];
let posted,productDraft;
global.fetch=async(url,init={})=>{
 if(url==='/api/commerce'){if(init.method==='POST'){posted=JSON.parse(init.body);return Response.json({pendingApproval:true});}return Response.json({invoices:[],stock:[],commitments:[]});}
 if(String(url).startsWith('/api/monthly-report'))return Response.json({summaries:[]});
 return Response.json({});
};
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,10))});
const click=async(text,scope=document)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert(b,'Missing button '+text);await act(async()=>b.click());await settle();};
const change=async(el,value)=>{assert(el);await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
const control=(label,selector='select',scope=document)=>[...scope.querySelectorAll('label')].find(l=>l.childNodes[0]?.textContent===label)?.querySelector(selector);
function Catalogue(){const [value,setValue]=React.useState(product);productDraft=value;return React.createElement(ProductSchemes,{value,onChange:setValue,admin:true});}
(async()=>{
 const root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(Catalogue)));
 let editors=document.querySelectorAll('.product-scheme-editor');assert.equal(editors.length,2);
 assert(![...editors[0].querySelector('select').options].some(o=>o.value==='Discount'));
 assert(editors[1].textContent.includes('Minimum order quantity'));assert(editors[1].textContent.includes('Final net rate / unit'));
 assert(editors[1].textContent.includes('25.00'));assert(editors[1].textContent.includes('26.25'));assert(editors[1].textContent.includes('5.00'));assert(!editors[1].textContent.includes('Net PTS'));
 await change(control('Minimum order quantity','input',editors[1]),'150');await change(control('Final net rate / unit · excl. GST (₹)','input',editors[1]),'24.50');
 assert.equal(productDraft['Scheme 2 minimum qty'],'150');assert.equal(productDraft['Scheme 2 net rate'],'24.50');assert(editors[1].textContent.includes('25.73'));
 await click('Add scheme');editors=document.querySelectorAll('.product-scheme-editor');await change(editors[2].querySelector('select'),'Direct net rate');assert(control('Minimum order quantity','input',editors[2]));assert(!control('Discount %','input',editors[2]));
 await act(async()=>root.render(React.createElement(CommercePanel,{key:'mr',tab:'Orders',rows,admin:false,refresh:async()=>{}})));await settle();await click('Take order');
 await change(control('Customer'),'c');await change(control('Supply from'),'s');await change(control('Product'),'p');
 let scheme=control('Scheme');assert(scheme.querySelector('option[value="2"]').disabled);assert(scheme.querySelector('option[value="2"]').textContent.includes('Direct company only'));
 await change(control('Supply from'),'company-stock');assert(!control('Scheme').querySelector('option[value="2"]').disabled);
 await change(control('Special proposed rate ₹ · excl. GST (optional)','input'),'10');await change(control('Scheme'),'2');
 assert(!control('Special proposed rate ₹ · excl. GST (optional)','input'));assert(document.querySelector('.direct-net-offer').textContent.includes('Add 99 more units'));
 assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Place order').disabled);await change(control('Quantity','input'),'99');assert(document.querySelector('.direct-net-offer').textContent.includes('Add 1 more unit to qualify'));
 await click('Use 100 units');assert.equal(control('Quantity','input').value,'100');const rate=document.querySelector('.order-net-rates');assert(rate.textContent.includes('25.00'));assert(rate.textContent.includes('26.25'));assert(rate.textContent.includes('100 paid + 0 free'));assert(rate.textContent.includes('2,500.00'));assert(rate.textContent.includes('2,625.00'));assert(!document.querySelector('dialog').textContent.match(/Landing cost|profit/i));
 await change(control('Supply from'),'s');assert.equal(control('Scheme').value,'none');assert(control('Scheme').querySelector('option[value="2"]').disabled);
 await change(control('Scheme'),'1');assert(document.querySelector('.order-net-rates').textContent.includes('100 paid + 30 free'));
 await change(control('Supply from'),'company-stock');await change(control('Scheme'),'2');await click('Place order');assert.equal(posted.stockistId,'company-stock');assert.deepEqual(posted.lines,[{productId:'p',qty:100,scheme:'2',stockistOffer:'',retailSchemeIds:[],retailScheme:'',retailSchemes:[],discountPercent:0,freeQty:0}]);
 await act(async()=>root.render(React.createElement(CommercePanel,{key:'primary',tab:'Primary sales',rows,admin:true,refresh:async()=>{}})));await settle();await click('New primary invoice');await change(control('Product'),'p');
 const refs=document.querySelector('.primary-retail-schemes');assert(refs.textContent.includes('30 + 10'));assert(!refs.textContent.includes('25.00'));assert.equal(refs.querySelectorAll('input[type=checkbox]').length,1);
 await act(async()=>root.unmount());
 console.log('PASS: direct net-rate editor, GST and profit display, no new discount option, MR channel/minimum controls, explicit quantity change, no proposal stacking, clean order payload, privacy and primary exclusion.');
})().catch(e=>{console.error(e);process.exit(1)});
