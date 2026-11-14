const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file){const m={exports:{}};new Function('require','exports','module',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith('./')?load('lib/'+name.slice(2)+'.ts'):require(name),m.exports,m);return m.exports;}
const {readCSV,writeCSV,previewProducts,productCSV,productHeaders,legacyProductHeaders}=load('lib/product-csv.ts');
const row={id:'p',kind:'Products',data:{Name:'Product, "A"\nTamil தமிழ்',Pack:'100 ml',MRP:'100',PTR:'80',PTS:'65','Sample cost':'20','Scheme 4 enabled':'Yes','Scheme 4 paid':'5','Scheme 4 free':'1'}};
const csv=productCSV([row],true),preview=previewProducts(csv,[row]);assert.equal(preview.length,1);assert.equal(preview[0].error,'');assert.equal(preview[0].id,'p');assert.equal(preview[0].data['Sample cost'],'20');assert.equal(preview[0].data['Scheme 1 paid'],'5');assert.equal(preview[0].data['Scheme 4 enabled'],'No');assert(!readCSV(productCSV([row],false))[0].includes('PTS'));assert(!productCSV([row],false).includes('Sample cost'));
const input=(name='Test',price='10',offers='5+1; 10+3')=>[name,'100 ml',price,'8','6',offers];
assert(previewProducts(writeCSV([legacyProductHeaders,input(),input('test')]),[])[1].error.includes('Duplicate'));
assert(previewProducts(writeCSV([legacyProductHeaders,input('Test','-1')]),[])[0].error.includes('MRP'));
assert(previewProducts(writeCSV([legacyProductHeaders,input('Test','10','5+0')]),[])[0].error.includes('buy+free'));
assert(previewProducts(writeCSV([legacyProductHeaders,input('Test','10','5+1;5+1')]),[])[0].error.includes('Duplicate'));
assert.equal(previewProducts(writeCSV([legacyProductHeaders,input('Test','10','')]),[])[0].data['Scheme 1 enabled'],'No');
assert.throws(()=>readCSV('"unclosed'),/Unclosed/);assert.throws(()=>previewProducts('Bad,Header\na,b',[]),/template/);
const formula=productCSV([{...row,data:{...row.data,Name:'=DANGEROUS()'}}],true);assert(formula.includes("'=DANGEROUS()"));assert.equal(previewProducts(formula,[])[0].name,'=DANGEROUS()');
console.log('PASS: product CSV round-trip, Unicode/quotes/newlines, preview updates, duplicate and price/scheme validation, formula escaping and MR PTS exclusion.');

const calculated={...row,data:{...row.data,MRP:'105',PTR:'80',PTS:'72','GST %':'5','Retail margin %':'20','Stockist margin %':'10','Landing cost':'40','Scheme 2 enabled':'Yes','Scheme 2 type':'Discount','Scheme 2 discount %':'5'}};
const roundtrip=previewProducts(productCSV([calculated],true),[])[0];assert.equal(roundtrip.error,'');assert.equal(roundtrip.data['Landing cost'],'40');assert.equal(roundtrip.data.PTR,'80.00');assert.equal(roundtrip.data.PTS,'72.00');assert.equal(roundtrip.data['Scheme 1 discount %'],'5');
const publicCSV=productCSV([calculated],false);assert(!publicCSV.includes('Landing cost'));assert(!publicCSV.includes('PTS'));assert(readCSV(publicCSV)[0].includes('GST %'));assert(readCSV(publicCSV)[0].includes('PTR incl GST'));
const extended=readCSV(productCSV([calculated],true));extended[1][productHeaders.indexOf('PTR')]='999';extended[1][productHeaders.indexOf('PTS')]='999';assert.equal(previewProducts(writeCSV(extended),[])[0].data.PTR,'80.00');
const legacyUpdate=previewProducts(writeCSV([legacyProductHeaders,input(calculated.data.Name)]),[calculated])[0];assert.equal(legacyUpdate.data['Landing cost'],'40');assert.equal(legacyUpdate.data['GST %'],'5');
assert(previewProducts(writeCSV([legacyProductHeaders,input('Test','10','101%')]),[])[0].error.includes('100'));
console.log('PASS: new pricing CSV, legacy six-column imports, percentage offers, derived-rate recalculation and private MR exports.');

const catalogue=load('lib/product-catalogue.ts');
const categorized={...calculated,data:{...calculated.data,'Product category':'  Mineral   Supplements  '}};
assert.equal(previewProducts(productCSV([categorized],true),[])[0].data['Product category'],'Mineral Supplements');
assert.equal(previewProducts(writeCSV([legacyProductHeaders,input(categorized.data.Name)]),[categorized])[0].data['Product category'],'Mineral Supplements');
const cleared=readCSV(productCSV([categorized],true));cleared[1][productHeaders.indexOf('Product category')]='';
assert.equal(previewProducts(writeCSV(cleared),[categorized])[0].data['Product category'],'');
cleared[1][productHeaders.indexOf('Product category')]='x'.repeat(101);assert(previewProducts(writeCSV(cleared),[])[0].error.includes('100 characters'));
const formulaCategory={...row,data:{...row.data,'Product category':'=SUM(1,2)'}};
assert(productCSV([formulaCategory],true).includes("'=SUM(1,2)"));assert.equal(previewProducts(productCSV([formulaCategory],true),[])[0].data['Product category'],'=SUM(1,2)');
assert(readCSV(productCSV([categorized],false))[0].includes('Product category'));assert(productCSV([categorized],false).includes('Mineral'));
const products=[['z','Zebucal','Minerals'],['a10','alpha 10','minerals'],['a2','Alpha 2',''],['b','Beta','Antibiotics']].map(([id,Name,category])=>({id,kind:'Products',data:{Name,'Product category':category}}));
assert.deepEqual(catalogue.sortProducts(products).map(p=>p.id),['a2','a10','b','z']);assert.deepEqual(catalogue.sortProducts(products,'desc').map(p=>p.id),['z','b','a10','a2']);assert.equal(products[0].id,'z');
assert.deepEqual(catalogue.productCategories([...products,{kind:'Expenses',data:{Category:'Fuel','Product category':'Must not appear'}}]),['Antibiotics','Minerals']);
assert.deepEqual(products.filter(p=>catalogue.matchesProductCategory(p.data,'category:minerals')).map(p=>p.id),['z','a10']);
assert.deepEqual(products.filter(p=>catalogue.matchesProductCategory(p.data,'uncategorised')).map(p=>p.id),['a2']);
assert(catalogue.matchesProductCategory({'Product category':'uncategorised'},'category:uncategorised'));assert(!catalogue.matchesProductCategory({'Product category':'uncategorised'},'uncategorised'));
assert.deepEqual(readCSV(productCSV(products,true)).slice(1).map(p=>p[0]),['Alpha 2','alpha 10','Beta','Zebucal']);
console.log('PASS: category CSV round-trip, legacy preservation, explicit clearing, length limits, formula safety, MR exports, natural A–Z/Z–A sorting, case-insensitive category grouping and uncategorised filtering.');

// A brand can have multiple independent packs. Imports must never update the first name match.
const pack50={id:'pack50',kind:'Products',data:{Name:'X-TRAZ (Amitraz)',Pack:'50 ML',MRP:'200',PTR:'120',PTS:'90','Landing cost':'45','Sample cost':'7'}},
 pack15={id:'pack15',kind:'Products',data:{Name:'X-TRAZ (Amitraz)',Pack:'15 ml',MRP:'100',PTR:'60',PTS:'45','Landing cost':'20','Sample cost':'3'}};
const variants=previewProducts(productCSV([pack50,pack15],true),[pack15,pack50]);
assert(variants.every(v=>!v.error));assert.equal(new Set(variants.map(v=>v.id)).size,2);
for(const v of variants){const original=[pack50,pack15].find(p=>p.id===v.id);assert.equal(v.data.Pack,original.data.Pack);assert.equal(v.data['Landing cost'],original.data['Landing cost']);assert.equal(v.data['Sample cost'],original.data['Sample cost']);}
const packImport=(name,pack)=>[name,pack,'100','60','45','5+1'];
const newVariant=previewProducts(writeCSV([legacyProductHeaders,packImport('X-TRAZ (Amitraz)','15 ml')]),[pack50])[0];
assert.equal(newVariant.error,'');assert.equal(newVariant.id,undefined);assert.equal(newVariant.data['Sample cost'],undefined);assert.notEqual(newVariant.data['Landing cost'],'45');
const bothNew=previewProducts(writeCSV([legacyProductHeaders,packImport('X-TRAZ (Amitraz)','50 ML'),packImport('X-TRAZ (Amitraz)','15 ml')]),[]);assert(bothNew.every(v=>!v.error&&!v.id));
const samePack=previewProducts(writeCSV([legacyProductHeaders,packImport('X-TRAZ (Amitraz)','15 ml'),packImport(' x-traz (amitraz) ',' 15 ML ')]),[]);assert.match(samePack[1].error,/Duplicate product name and packing/);
const matched=previewProducts(writeCSV([legacyProductHeaders,packImport(' x-traz (amitraz) ',' 15 ML ')]),[pack50,pack15])[0];assert.equal(matched.id,'pack15');assert.equal(matched.data['Sample cost'],'3');
assert.match(previewProducts(productCSV([pack15],true),[pack15,{...pack15,id:'duplicate'}])[0].error,/Multiple catalogue matches/);
assert.equal(catalogue.productIdentity({Name:'Legacy'}),catalogue.productIdentity({Name:' legacy ',Pack:' '}));
assert.equal(catalogue.productLabel(pack15.data),'X-TRAZ (Amitraz) · 15 ml');assert.equal(catalogue.catalogueLabel(pack50),'X-TRAZ (Amitraz) · 50 ML');assert.equal(catalogue.catalogueLabel({kind:'Customers',data:{Name:'Doctor',Pack:'Not a product'}}),'Doctor');
console.log('PASS: same-brand pack variants import/export separately, exact-pack updates preserve private costs, new packs do not inherit another pack’s data, and duplicate name+pack pairs are rejected.');

const netCSV=previewProducts(writeCSV([legacyProductHeaders,input('Net offers','100','30+10; Direct 100 @ 25; Direct 200 @ 23.50')]),[])[0];
assert.equal(netCSV.error,'');assert.equal(netCSV.data['Scheme 2 type'],'Direct net rate');assert.equal(netCSV.data['Scheme 2 minimum qty'],'100');assert.equal(netCSV.data['Scheme 2 net rate'],'25');
const netRoundTrip=previewProducts(productCSV([{id:'net',kind:'Products',data:netCSV.data}],true),[])[0];assert.equal(netRoundTrip.error,'');assert.equal(netRoundTrip.data['Scheme 3 net rate'],'23.5');
assert(productCSV([{id:'net',kind:'Products',data:netCSV.data}],false).includes('Direct 100 @ 25'));
for(const offer of ['Direct 0 @ 25','Direct 100 @ 0','Direct 100 @ 25.001','Direct 100001 @ 25','Direct 100 @ 25; direct 0100 @ 25.00'])assert(previewProducts(writeCSV([legacyProductHeaders,input('Invalid offer','100',offer)]),[])[0].error);
console.log('PASS: direct net-rate CSV round-trip, multiple quantity tiers, MR-visible offer terms and minimum/rate/duplicate validation.');
