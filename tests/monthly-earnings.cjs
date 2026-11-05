const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n+'.ts')):require(n),m,m.exports);return m.exports;}
const e=load('lib/monthly-earnings.ts'),{buildReport,totals}=load('lib/monthly-report.ts'),{mrReport}=load('lib/benefit-visibility.ts'),{canRead,canWrite}=load('lib/permissions.ts');
const slabs=[{above:40000000,rateBps:100},{above:50000000,rateBps:200}];
for(const [sales,rate,amount]of [[39999999,0,0],[40000000,0,0],[40000001,100,400000],[50000000,100,500000],[50000001,200,1000000],[100000000,200,2000000]]){const bonus=e.incentiveFor(sales,slabs);assert.equal(bonus.rateBps,rate);assert.equal(bonus.amount,amount);}
assert.deepEqual(e.allocateProportionally(2,[1,1,1]),[1,1,0]);assert.deepEqual(e.allocateProportionally(500001,[500000,250000,250000]),[250001,125000,125000]);
assert.equal(e.percentAmount(101,1250),13);
const input={target:400000,salaryBudget:45000,products:[{productId:'a',target:200000,salaryPercent:10},{productId:'b',target:200000,salaryPercent:12.5}],slabs:[{above:400000,percent:1},{above:500000,percent:2}]};
const normalized=e.validateEarningsInput(input);assert.equal(normalized.products.reduce((n,p)=>n+e.percentAmount(p.target,p.salaryBps),0),4500000);
for(const bad of [{...input,target:400001},{...input,products:[input.products[0],input.products[0]]},{...input,products:[{...input.products[0],target:400000,salaryPercent:101}]},{...input,products:[{...input.products[0],target:400000,salaryPercent:NaN}]},{...input,slabs:[{above:300000,percent:1}]},{...input,slabs:[{above:400000,percent:2},{above:500000,percent:1}]},{...input,slabs:[{above:400000,percent:1},{above:400000,percent:2}]},{...input,target:'400000'},{...input,salaryBudget:1.001}])assert.throws(()=>e.validateEarningsInput(bad));
const member={email:'a@test',user_id:'a',name:'A',role:'mr',route_ids:'[]',district_ids:'[]',stockist_ids:'[]'};
const plan={version:1,revision:1,month:'2026-10',mrEmail:member.email,target:100000,salaryBudget:10000,products:[{productId:'p',name:'Same brand',packing:'100 ml',target:100000,salaryBps:1000,pts:7200,cost:4000}],slabs:[{above:100000,rateBps:100}],savedAt:'2026-10-01',savedBy:'admin',reason:'Initial setup'};
const record={created:'2026-10-01',id:e.earningsID(member.email,plan.month),kind:e.earningsKind,data:plan,assigned_to:member.email};
const target={id:'monthly-target:a@test:2026-10',kind:'Settings',data:{'MR monthly target':1000,Month:plan.month}};
const line={productId:'p',name:'Same brand',packing:'100 ml',qty:10,free:3,subtotal:80000,total:84000,schemeDiscount:0,gst:5};
const order={id:'o',number:'O',kind:'secondary',accepted:1,status:'Placed',mr_email:member.email,date:'2026-10-01',stockist_id:'agency',items:[line],subtotal:80000,total:84000};
let report=e.monthlyEarnings(member.email,member.user_id,plan.month,[record,target],[order]);
assert.equal(report.salary,8000);assert.equal(report.products[0].stockistRevenue,72000);assert.equal(report.products[0].landingCost,52000);assert.equal(report.products[0].profit,12000);
const direct={...order,id:'d',stockist_id:'company-stock'};report=e.monthlyEarnings(member.email,member.user_id,plan.month,[record,target],[direct]);assert.equal(report.products[0].directRevenue,80000);assert.equal(report.profit,20000);
const special={...direct,items:[{...line,subtotal:70000,total:73500,free:8}],subtotal:70000,total:73500};
report=e.monthlyEarnings(member.email,member.user_id,plan.month,[record,target],[special]);assert.equal(report.salary,7000);assert.equal(report.products[0].landingCost,72000);assert.equal(report.profit,-9000);
const discount={...order,items:[{...line,schemeDiscount:10,subtotal:72000,total:75600}],subtotal:72000,total:75600};
report=e.monthlyEarnings(member.email,member.user_id,plan.month,[record,target],[discount]);assert.equal(report.products[0].stockistRevenue,64800);assert.equal(report.salary,7200);
const both=[order,direct,{...order,id:'pending',accepted:0},{...order,id:'cancelled',status:'Cancelled'},{...order,id:'other',mr_email:'other@test'},{...order,id:'next',date:'2026-11-01'},{...order,id:'primary',kind:'primary'}];
report=e.monthlyEarnings(member.email,member.user_id,plan.month,[record,target],both);assert.equal(report.sales,160000);assert.equal(report.salary,16000);assert.equal(report.incentive.amount,1600);assert.equal(report.totalAllocation,17600);assert.equal(report.profit,30400);
assert.equal(totals(member,plan.month,[record,target],both).achieved,report.sales);
assert.equal(report.products[0].percentage,160);assert.equal(report.products[0].pending,0);
assert.equal(e.monthlyEarnings('other@test','other',plan.month,[record,target],both),null);
assert.equal(e.monthlyEarnings(member.email,member.user_id,'2026-11',[record,target],both),null);
const catalogue={id:'p',kind:'Products',data:{Name:'Same brand',Pack:'100 ml',PTS:'999', 'Landing cost':'999'}};
assert.equal(e.monthlyEarnings(member.email,member.user_id,plan.month,[record,target,catalogue],[direct]).profit,20000);
const missing={...record,data:{...plan,products:[{...plan.products[0],cost:null}]}};
assert.equal(e.monthlyEarnings(member.email,member.user_id,plan.month,[missing],[direct]).profit,null);
const unplanned={...direct,id:'u',items:[{...line,productId:'other-pack',packing:'500 ml'}]};
report=e.monthlyEarnings(member.email,member.user_id,plan.month,[record],[direct,unplanned]);assert.equal(report.unallocatedSales,80000);assert.equal(report.salary,8000);assert.equal(report.incentive.amount,1600);assert.equal(report.profit,null);
const legacy={id:'legacy',kind:'Secondary sales',assigned_to:member.email,data:{Date:'2026-10-03',Product:'Same brand',Quantity:'2',Rate:'80'}};
report=e.monthlyEarnings(member.email,member.user_id,plan.month,[record,catalogue,legacy],[direct]);assert.equal(report.sales,96000);assert.equal(report.salary,9600);assert.equal(report.profit,null);
const duplicateName={...catalogue,id:'p2',data:{...catalogue.data,Pack:'500 ml'}};
report=e.monthlyEarnings(member.email,member.user_id,plan.month,[record,catalogue,duplicateName,legacy],[direct]);assert.equal(report.unallocatedSales,16000);
const adminReport=buildReport(member,plan.month,[record,target],both,[],[],[],true),publicReport=buildReport(member,plan.month,[record,target],both,[],[],[],false);
assert(adminReport.tables.some(t=>t.title==='Product salary allocation'));
assert(publicReport.tables.some(t=>t.title==='Product targets and achievement'));
for(const data of [publicReport,mrReport(adminReport)]){assert(!JSON.stringify(data).includes('salaryBps'));assert(!data.tables.some(t=>t.adminOnly||/salary|incentive|profit after/i.test(t.title)));}
const progress=e.productTargetProgress(member.email,member.user_id,plan.month,[record],both);assert.deepEqual(Object.keys(progress[0]).sort(),['productId','name','packing','target','achieved','pending','percentage'].sort());
for(const kind of [e.earningsKind,e.earningsHistoryKind]){assert(!canRead(member,{...record,kind}));assert(!canWrite(member,{...record,kind}));assert(!canWrite({...member,role:'admin'},{...record,kind}));}
console.log('PASS: uncapped earnings, strict incentive boundaries, highest slab on total sales, exact allocation, product salary budgets, channel profit, schemes/free units, isolation, frozen cost basis and MR privacy.');
