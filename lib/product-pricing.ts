/** Catalogue amounts are rupees excluding GST, except MRP (GST-inclusive). */
export type ProductData = Record<string, string>;
export const schemeSlots = Array.from({length: 20}, (_, i) => i + 1);
export const privateProductFields = ['Landing cost', 'Unit cost', 'Sample cost'];
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const formatPrice = (value: number) => new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2}).format(value);

// Exact decimal fractions avoid half-paise errors (e.g. ₹0.45 less 30% = ₹0.32).
function decimalFraction(value: number): [bigint, bigint] {
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const places = (mantissa.split('.')[1]?.length || 0) - Number(exponent);
  return [BigInt(mantissa.replace('.', '')) * BigInt(10) ** BigInt(Math.max(0, -places)), BigInt(10) ** BigInt(Math.max(0, places))];
}
function percentageFactor(percent: number, add: boolean): [bigint, bigint] {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Percentage must be between 0 and 100.');
  const [n, d] = decimalFraction(percent);
  return [BigInt(100) * d + (add ? n : -n), BigInt(100) * d];
}
function roundedFraction(n: bigint, d: bigint) { return Number((n + d / BigInt(2)) / d); }
export function applyPercentage(paise: number, percent: number, add = false) {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error('Invalid monetary amount.');
  const [n, d] = percentageFactor(percent, add);
  return roundedFraction(BigInt(paise) * n, d);
}
export const withGST = (rupees: number, gst: number) => applyPercentage(Math.round(rupees * 100), gst, true) / 100;

function numberField(data: ProductData, key: string, max: number, required = false) {
  const raw = data[key]?.trim() || '';
  if (!raw) { if (required) throw new Error(`Enter ${key}.`); return null; }
  if (!/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) > max)
    throw new Error(`${key} must be between 0 and ${max}.`);
  return Number(raw);
}

export function hasPricingMargins(data: ProductData) {
  return !!(data['Retail margin %']?.trim() || data['Stockist margin %']?.trim());
}

/** Always recalculate on the server; client-supplied derived rates are not trusted. */
export function normalizeProductPricing(data: ProductData): ProductData {
  const next = {...data};
  const mrp = numberField(data, 'MRP', 10000000, hasPricingMargins(data));
  const gst = numberField(data, 'GST %', 100, hasPricingMargins(data)) ?? 0;
  numberField(data, 'Landing cost', 10000000);
  if (hasPricingMargins(data)) {
    const retail = numberField(data, 'Retail margin %', 100, true)!;
    const stockist = numberField(data, 'Stockist margin %', 100, true)!;
    const [mrpN, mrpD] = decimalFraction(mrp!);
    const [gstN, gstD] = percentageFactor(gst, true);
    const [retailN, retailD] = percentageFactor(retail, false);
    const [stockistN, stockistD] = percentageFactor(stockist, false);
    const numerator = mrpN * BigInt(100) * gstD * retailN, denominator = mrpD * gstN * retailD;
    next.PTR = (roundedFraction(numerator, denominator) / 100).toFixed(2);
    next.PTS = (roundedFraction(numerator * stockistN, denominator * stockistD) / 100).toFixed(2);
    next['Price mode'] = 'PTR';
    next['Retail offer enabled'] = 'No';
  } else {
    numberField(data, 'PTR', 10000000);
    numberField(data, 'PTS', 10000000);
  }
  return next;
}

export function previewProductPricing(data: ProductData) {
  try { return {data: normalizeProductPricing(data), error: ''}; }
  catch (e) { return {data, error: (e as Error).message}; }
}

export function productForMR(data: ProductData) {
  const copy = {...data};
  for (const key of privateProductFields) delete copy[key];
  return copy;
}

export type ProductScheme = {type: 'Buy + free' | 'Discount'; paid: number; free: number; discount: number; label: string};
export function productScheme(data: ProductData, slot: number | string): ProductScheme {
  if (slot === 'none') return {type: 'Buy + free', paid: 1, free: 0, discount: 0, label: 'No scheme'};
  if (!schemeSlots.includes(Number(slot)) || data[`Scheme ${slot} enabled`] !== 'Yes') throw new Error(`Scheme ${slot} is unavailable.`);
  const type = data[`Scheme ${slot} type`] || 'Buy + free';
  if (type === 'Discount') {
    const discount = numberField(data, `Scheme ${slot} discount %`, 100, true)!;
    return {type, paid: 1, free: 0, discount, label: `${discount}% discount`};
  }
  if (type !== 'Buy + free') throw new Error(`Choose a valid type for scheme ${slot}.`);
  const paid = numberField(data, `Scheme ${slot} paid`, 100000, true)!;
  const free = numberField(data, `Scheme ${slot} free`, 100000, true)!;
  if (!Number.isInteger(paid) || paid < 1 || !Number.isInteger(free) || free < 1)
    throw new Error(`Scheme ${slot} needs positive whole buy and free quantities.`);
  return {type, paid, free, discount: 0, label: `${paid} + ${free}`};
}
export function schemeLabel(data: ProductData, slot: number | string) {
  try { return productScheme(data, slot).label; } catch { return `Scheme ${slot} · incomplete`; }
}

/** Effective unit prices divide billed amounts by every supplied unit, including free units. */
export function effectiveRates(rateExGST: number, gst: number, paid: number, free: number, discount = 0) {
  if (![rateExGST, gst, paid, free, discount].every(Number.isFinite) || rateExGST < 0 || gst < 0 || gst > 100 || paid <= 0 || free < 0 || discount < 0 || discount > 100) return null;
  const billedUnit = applyPercentage(Math.round(rateExGST * 100), discount);
  const subtotal = Math.round(billedUnit * paid);
  const total = applyPercentage(subtotal, gst, true);
  return {exGST: subtotal / 100 / (paid + free), inclGST: total / 100 / (paid + free)};
}

/** Scheme reference price is independent of the current order quantity. */
export function orderSchemePreview(line: {
  scheme: string; schemeType?: string; schemePaid?: number; schemeFree?: number; schemeDiscount?: number;
  schemeLabel?: string; baseRate?: number; rate: number; gst: number; qty: number; schemeNote?: string;
}) {
  if (line.scheme === 'none' || !line.schemeType || line.baseRate === undefined) return null;
  const paid = line.schemeType === 'Discount' ? 1 : line.schemePaid ?? 0;
  const free = line.schemeType === 'Discount' ? 0 : line.schemeFree ?? 0;
  if (!Number.isInteger(paid) || paid < 1 || !Number.isInteger(free) || free < 0) return null;
  const rates = effectiveRates(line.baseRate / 100, line.gst, paid, free, line.schemeDiscount || 0);
  if (!rates) return null;
  const nextQuantity = free > 0 && !line.schemeNote && line.qty % paid !== 0 ? Math.ceil(line.qty / paid) * paid : null;
  return {rates, paid, free, label: line.schemeLabel || `${paid} + ${free}`, qualifies: line.qty >= paid, nextQuantity: nextQuantity && nextQuantity <= 100000 ? nextQuantity : null};
}

export function profitOnCost(netPTS: number, cost: string | undefined) {
  if (!cost?.trim() || !Number.isFinite(Number(cost)) || Number(cost) < 0) return null;
  const amount = netPTS - Number(cost);
  return {amount, percent: Number(cost) > 0 ? amount / Number(cost) * 100 : null};
}

/** Admin estimate: amounts exclude GST; cost covers paid AND free packed units.
 * Catalogue PTS/cost are current inputs, not historical accounting snapshots. */
export function orderCompanyProfit(line: {qty:number; free:number; subtotal:number; schemeDiscount?:number}, product: ProductData, direct:boolean) {
  const units=line.qty+line.free, rawCost=product['Landing cost'];
  if (!rawCost?.trim() || !Number.isFinite(Number(rawCost)) || Number(rawCost)<0 || !Number.isInteger(line.qty) || line.qty<1 || !Number.isInteger(line.free) || line.free<0) return null;
  let revenue=line.subtotal;
  if (!direct) {
    if (!product.PTS?.trim() || !Number.isFinite(Number(product.PTS)) || Number(product.PTS)<0) return null;
    revenue=applyPercentage(Math.round(Number(product.PTS)*100),line.schemeDiscount||0)*line.qty;
  }
  if (!Number.isSafeInteger(revenue) || revenue<0) return null;
  const cost=Math.round(Number(rawCost)*100)*units, amount=revenue-cost;
  return {revenue:revenue/100,cost:cost/100,amount:amount/100,perUnit:amount/100/units,percent:cost>0?amount/cost*100:null};
}
