const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file){const m={exports:{}};new Function('require','exports','module',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='./product-pricing'?load('lib/product-pricing.ts'):require(name),m.exports,m);return m.exports;}
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
