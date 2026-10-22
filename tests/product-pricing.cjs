const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file).exports;
  const m = {exports: {}}; cache.set(file, m);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  new Function('require', 'exports', 'module', code)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name), m.exports, m);
  return m.exports;
}
const pricing = load('lib/product-pricing.ts'), {priceLine, orderLine, receiptLine} = load('lib/field-rules.ts'), {proposedLine} = load('lib/supply.ts');
const base = {Name: 'Pricing fixture', MRP: '105', 'GST %': '5', 'Retail margin %': '20', 'Stockist margin %': '10', 'Landing cost': '40', PTR: '999', PTS: '999', 'Scheme 1 enabled': 'Yes', 'Scheme 1 paid': '10', 'Scheme 1 free': '3', 'Scheme 2 enabled': 'Yes', 'Scheme 2 type': 'Discount', 'Scheme 2 discount %': '5'};
const p = pricing.normalizeProductPricing(base);
assert.equal(p.PTR, '80.00'); assert.equal(p.PTS, '72.00'); assert.equal(base.PTR, '999');
const example = pricing.normalizeProductPricing({...base, MRP: '100', 'Retail margin %': '15', 'Stockist margin %': '50'});
assert.equal(example.PTR, '80.95'); assert.equal(example.PTS, '40.48');
assert.equal(pricing.normalizeProductPricing({...base, 'Retail margin %': '0', 'Stockist margin %': '0'}).PTS, '100.00');
assert.equal(pricing.normalizeProductPricing({...base, 'Retail margin %': '100'}).PTR, '0.00');
assert.equal(pricing.normalizeProductPricing({...base, 'Stockist margin %': '100'}).PTS, '0.00');
assert.equal(pricing.normalizeProductPricing({MRP: '100', PTR: '73.55', PTS: '64.21'}).PTR, '73.55');
for (const [key, value] of [['GST %', '101'], ['Retail margin %', '-1'], ['Stockist margin %', 'Infinity'], ['Landing cost', '-2'], ['Landing cost', 'abc'], ['MRP', '10000001'], ['Stockist margin %', '']]) assert.throws(() => pricing.normalizeProductPricing({...base, [key]: value}));
const close = (value, expected) => assert(Math.abs(value - expected) < 1e-9, `${value} != ${expected}`);
let q = priceLine(p, 'product', 10, '1', false);
assert.equal(q.free, 3); assert.equal(q.subtotal, 80000); assert.equal(q.total, 84000);
close(q.subtotal / 100 / (q.qty + q.free), 800 / 13);
const pts = pricing.effectiveRates(72, 5, 10, 3), profit = pricing.profitOnCost(pts.exGST, '40');
close(pts.exGST, 720 / 13); close(pts.inclGST, 756 / 13);
close(profit.amount, 720 / 13 - 40); close(profit.percent, (720 / 13 - 40) / 40 * 100);
assert.equal(pricing.profitOnCost(50, ''), null); assert.equal(pricing.profitOnCost(50, '0').percent, null);
assert.equal(pricing.profitOnCost(30, '40').percent, -25);
assert.equal(priceLine(p, 'product', 9, '1', false).free, 0);
assert.equal(priceLine(p, 'product', 11, '1', false).free, 3);
assert.equal(priceLine(p, 'product', 20, '1', false).free, 6);
assert.equal(priceLine(p, 'product', 10, 'none', false).free, 0);
q = priceLine(p, 'product', 10, '2', false);
assert.equal(q.rate, 7600); assert.equal(q.baseRate, 8000); assert.equal(q.free, 0); assert.equal(q.total, 79800);
assert.equal(priceLine({...p, 'Scheme 2 discount %': '100'}, 'product', 10, '2', false).total, 0);
assert.throws(() => priceLine({...p, 'Scheme 2 discount %': '101'}, 'product', 10, '2', false));
const changed = {...p, PTR: '120', 'GST %': '18', 'Scheme 2 discount %': '20'};
assert.deepEqual(orderLine(changed, 'product', 10, '2', q), q);
const edited = orderLine(changed, 'product', 12, '2', q);
assert.equal(edited.rate, 7600); assert.equal(edited.gst, 5); assert.equal(edited.schemeDiscount, 5); assert.equal(edited.subtotal, 91200);
assert.equal(orderLine(changed, 'product', 12, '2', q, true).rate, 9600);
assert.equal(orderLine(changed, 'product', 12, 'none', q).rate, 8000);
const direct = proposedLine(q, {proposedRate: 60}); assert.equal(direct.rate, 5700); assert.equal(direct.total, 59850);
assert.equal(orderLine(changed, 'product', 12, '2', direct).rate, 5700);
const publicProduct = pricing.productForMR({...p, 'Unit cost': '1', 'Sample cost': '2'});
for (const key of pricing.privateProductFields) assert(!(key in publicProduct));
assert.equal(publicProduct.PTR, p.PTR); assert.equal(p['Landing cost'], '40');
console.log('PASS: GST extraction, margin boundaries, server-derived prices, actual free-unit pricing, percentage schemes, profit on cost, saved-rate preservation, direct proposals and cost privacy.');

assert.equal(pricing.applyPercentage(45,30),32);assert.equal(pricing.applyPercentage(150,33),101);assert.equal(pricing.applyPercentage(10,5,true),11);
assert.equal(pricing.effectiveRates(.45,5,1,0,30).exGST,.32);assert.equal(priceLine({...p,PTR:'.45','Scheme 2 discount %':'30'},'p',1,'2',false).rate,32);
assert.equal(pricing.applyPercentage(100000000000000,100,true),200000000000000);
console.log('PASS: exact half-paise discount/GST rounding and high-value integer amounts.');

// Primary selling references must not become stockist bulk/free terms.
const receipt = receiptLine(p, 'product', {qty:100,freeQty:20,retailSchemeIds:['1','2'],retailSchemes:['forged'],stockistOffer:'10 cases + 2 cases',discountPercent:12});
assert.deepEqual(receipt.retailSchemes,['10 + 3','5% discount']);assert.equal(receipt.free,20);assert.equal(receipt.qty+receipt.free,120);assert.equal(receipt.subtotal,0);assert.equal(receipt.stockistOffer,'10 cases + 2 cases');
assert.equal(receiptLine(p,'product',{qty:100,freeQty:20,retailSchemeIds:[]}).retailScheme,'');
for(const ids of [['1','1'],['21'],['3']])assert.throws(()=>receiptLine(p,'product',{qty:100,retailSchemeIds:ids}));
const changedReferences={...p,'Scheme 1 enabled':'No','Scheme 2 discount %':'25'};
const receiptEdit=receiptLine(changedReferences,'product',{qty:150,freeQty:30,retailSchemeIds:['1','2']},receipt);
assert.deepEqual(receiptEdit.retailSchemes,receipt.retailSchemes);assert.equal(receiptEdit.free,30);
assert.equal(receiptLine(p,'product',{qty:1,retailSchemes:['old custom offer']}).retailScheme,'old custom offer');
const many={...p};for(let i=1;i<=20;i++)Object.assign(many,{[`Scheme ${i} enabled`]:'Yes',[`Scheme ${i} type`]:'Discount',[`Scheme ${i} discount %`]:String(i)});
assert.equal(receiptLine(many,'product',{qty:1,retailSchemeIds:Array.from({length:20},(_,i)=>String(i+1))}).retailSchemes.length,20);
const {mrReport}=load('lib/benefit-visibility.ts'),oldPrimaryReport={tables:[{title:'Primary sales — linked agencies',columns:['Product','Retail scheme / reference','Discount %','Stockist bulk offer','Stockist discount %'],rows:[['P','10 + 3','12%','10 cases + 2 cases','12%']]}]};
assert.deepEqual(mrReport(oldPrimaryReport).tables[0].rows,[['P','10 + 3']]);assert.equal(oldPrimaryReport.tables[0].rows[0].length,5);
console.log('PASS: catalogue primary scheme selection, exact stock separation, saved and legacy references, 20 alternatives and archived MR bulk-offer privacy.');

const screenshotProduct={Name:'ZEBUCAL LIQ',PTR:'864','GST %':'0','Scheme 1 enabled':'Yes','Scheme 1 paid':'5','Scheme 1 free':'1','Scheme 2 enabled':'Yes','Scheme 2 paid':'20','Scheme 2 free':'5','Scheme 3 enabled':'Yes','Scheme 3 paid':'30','Scheme 3 free':'8'};
for(const [slot,expected,free] of [['1',720,2],['2',691.2,0],['3',25920/38,0]]){
 const l=priceLine(screenshotProduct,'p',10,slot,false),preview=pricing.orderSchemePreview(l);close(preview.rates.exGST,expected);close(preview.rates.inclGST,expected);assert.equal(l.free,free);assert.equal(l.subtotal,864000);
}
const partialScheme=pricing.orderSchemePreview(priceLine(screenshotProduct,'p',35,'3',false));assert.equal(partialScheme.nextQuantity,60);
const savedScheme=priceLine(screenshotProduct,'p',10,'3',false);assert.equal(pricing.orderSchemePreview(orderLine({...screenshotProduct,'Scheme 3 free':'30'},'p',10,'3',savedScheme)).rates.exGST,25920/38);
assert.equal(pricing.orderSchemePreview({...savedScheme,schemeType:undefined}),null);assert.equal(pricing.orderSchemePreview(priceLine(screenshotProduct,'p',10,'none',false)),null);
const taxedScheme=pricing.orderSchemePreview(priceLine({...screenshotProduct,'GST %':'5'},'p',10,'2',false));close(taxedScheme.rates.exGST,691.2);close(taxedScheme.rates.inclGST,725.76);
console.log('PASS: scheme reference prices are quantity-independent, while stock and order totals use whole earned free groups; saved scheme terms and GST stay consistent.');
