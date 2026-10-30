'use client';
import {orderCompanyProfit, formatPrice as money, orderSchemePreview, withGST, effectiveRates, hasPricingMargins, previewProductPricing, productScheme, profitOnCost, schemeLabel, schemeSlots, type ProductData} from '../lib/product-pricing';
import type {PricedLine} from '../lib/field-rules';

function RatePair({label, exGST, inclGST, tone = 'ptr'}: {label: string; exGST: number | null; inclGST: number | null; tone?: string}) {
  return <div className={`pricing-pair pricing-${tone}`}>
    <h4>{label}</h4>
    <div><span>Excl. GST</span><strong>{exGST === null ? '—' : money(exGST)}</strong></div>
    <div className="pricing-tax"><span>Incl. GST</span><strong>{inclGST === null ? '—' : money(inclGST)}</strong></div>
  </div>;
}
function Profit({pts, cost, label}: {pts: number; cost?: string; label: string}) {
  const profit = profitOnCost(pts, cost);
  return <div className={`pricing-profit ${profit && profit.amount < 0 ? 'pricing-loss' : ''}`}>
    <span>{label} · profit / supplied unit</span><strong>{profit ? money(profit.amount) : '—'}</strong>
    <span>Profit % on landing cost</span><strong>{profit?.percent == null ? 'Unavailable' : `${profit.percent.toFixed(2)}%`}</strong>
    {!profit && <small>Enter landing cost to calculate profit.</small>}
    {profit?.percent === null && <small>Percentage is unavailable for zero cost.</small>}
    {profit && profit.amount < 0 && <small>Below landing cost</small>}
  </div>;
}
export function ProductPricing({value, onChange, admin, existing = false}: {value: ProductData; onChange: (v: ProductData) => void; admin: boolean; existing?: boolean}) {
  const preview = previewProductPricing(value), data = preview.data, gst = Number(data['GST %'] || 0);
  const ptr = !preview.error && data.PTR?.trim() ? Number(data.PTR) : null;
  const pts = !preview.error && data.PTS?.trim() ? Number(data.PTS) : null;
  const change = (key: string, v: string) => {
    const next = {'GST %': '0', ...value, [key]: v};
    const result = previewProductPricing(next);
    onChange(!result.error && hasPricingMargins(next) ? result.data : next);
  };
  return <section className="full-field product-pricing" aria-label="Product pricing">
    <h3>Product pricing</h3>
    {admin && <div className="form-grid pricing-inputs">
      <label>MRP · incl. GST (₹)<input required type="number" min="0" max="10000000" step="0.01" value={value.MRP || ''} onChange={e => change('MRP', e.target.value)}/></label>
      <label>GST %<input required type="number" min="0" max="100" step="0.01" value={value['GST %'] ?? '0'} onChange={e => change('GST %', e.target.value)}/></label>
      <label>Retail margin %<input required={!existing || hasPricingMargins(value)} type="number" min="0" max="100" step="0.01" value={value['Retail margin %'] ?? ''} onChange={e => change('Retail margin %', e.target.value)}/></label>
      <label>Stockist margin %<input required={!existing || hasPricingMargins(value)} type="number" min="0" max="100" step="0.01" value={value['Stockist margin %'] ?? ''} onChange={e => change('Stockist margin %', e.target.value)}/></label>
      <label className="pricing-cost-input">Landing cost / unit · excl. GST (₹)<input type="number" min="0" max="10000000" step="0.01" value={value['Landing cost'] ?? ''} onChange={e => change('Landing cost', e.target.value)}/><small>Cost of one packed unit, including units supplied free.</small></label>
    </div>}
    {preview.error && <p className="field-help" role="status">{preview.error}</p>}
    {admin && existing && !hasPricingMargins(value) && <p className="field-help">Saved rates retained. Enter both margins to calculate new rates from MRP.</p>}
    <div className="pricing-grid" aria-live="polite">
      <RatePair label="PTR / unit" exGST={ptr} inclGST={ptr === null ? null : withGST(ptr, gst)}/>
      {admin && <RatePair label="PTS / unit" exGST={pts} inclGST={pts === null ? null : withGST(pts, gst)} tone="pts"/>}
      {admin && ptr !== null && <Profit label="Direct · PTR reference" pts={ptr} cost={value['Landing cost']}/>}
      {admin && pts !== null && <Profit label="Stockist · PTS" pts={pts} cost={value['Landing cost']}/>}
    </div>
    {admin && <p className="field-help">MRP ÷ GST factor → deduct retail margin → deduct stockist margin. Rates save to 2 decimals. Profit is before other business expenses.</p>}
  </section>;
}

export function SchemePricing({value, slot, admin}: {value: ProductData; slot: number; admin: boolean}) {
  const preview = previewProductPricing(value);
  if (preview.error) return <p className="field-help">Complete product pricing to see scheme rates.</p>;
  let scheme; try { scheme = productScheme(value, slot); } catch { return <p className="field-help">Complete this scheme to see its net rates.</p>; }
  const gst = Number(preview.data['GST %'] || 0);
  const ptr = preview.data.PTR?.trim() ? effectiveRates(Number(preview.data.PTR), gst, scheme.paid, scheme.free, scheme.discount) : null;
  const pts = preview.data.PTS?.trim() ? effectiveRates(Number(preview.data.PTS), gst, scheme.paid, scheme.free, scheme.discount) : null;
  return <div className="scheme-pricing">
    <p className="pricing-caption">{scheme.label} · net rate per supplied unit{scheme.free ? ` (${scheme.paid} paid + ${scheme.free} free)` : ''}</p>
    <div className="pricing-grid">
      <RatePair label="Net PTR" exGST={ptr?.exGST ?? null} inclGST={ptr?.inclGST ?? null}/>
      {admin && <RatePair label="Net PTS" exGST={pts?.exGST ?? null} inclGST={pts?.inclGST ?? null} tone="pts"/>}
      {admin && ptr && <Profit label="Direct · net PTR reference" pts={ptr.exGST} cost={value['Landing cost']}/>}
      {admin && pts && <Profit label="Stockist · net PTS" pts={pts.exGST} cost={value['Landing cost']}/>}
    </div>
  </div>;
}

export function ProductPriceCell({data, field, admin}: {data: ProductData; field: string; admin: boolean}) {
  if (field === 'Product category') return <span className="product-category-badge">{data[field]?.trim() || 'Uncategorised'}</span>;
  if (field === 'Scheme') {
    const slots = schemeSlots.filter(i => data[`Scheme ${i} enabled`] === 'Yes');
    return slots.length ? <details className="catalogue-scheme-rates"><summary>{slots.map(i => schemeLabel(data, i)).join(' / ')}<small>View net rates{admin ? ' & profit' : ''}</small></summary>{slots.map(slot => <SchemePricing key={slot} value={data} slot={slot} admin={admin}/>)}</details> : <>No scheme</>;
  }
  if (field === 'GST %') return <>{data[field] || '0'}%</>;
  if (field === 'PTR' || field === 'PTS') {
    const rate = data[field]?.trim() ? Number(data[field]) : null;
    return <div className={`catalogue-rate pricing-${field.toLowerCase()}`}><b>{rate === null ? '—' : money(rate)} <small>excl. GST</small></b><span>{rate === null ? '—' : money(withGST(rate, Number(data['GST %'] || 0)))} incl. GST</span></div>;
  }
  if (field === 'Landing cost') return admin ? <span className="catalogue-cost">{data[field]?.trim() ? money(Number(data[field])) : '—'}<small>excl. GST / unit</small></span> : null;
  if (field === 'MRP') return <>{money(Number(data.MRP || 0))}<small>incl. GST</small></>;
  return <>{data[field] || '—'}</>;
}

export function OrderNetRates({line, proposed = false, saved = false, onUseSchemeQuantity}: {line: PricedLine; proposed?: boolean; saved?: boolean; onUseSchemeQuantity?: (qty: number) => void}) {
  const units = line.qty + line.free, scheme = orderSchemePreview(line);
  const actual = {exGST: units > 0 ? line.subtotal / 100 / units : null, inclGST: units > 0 ? line.total / 100 / units : null};
  const different = scheme && (actual.exGST === null || actual.inclGST === null || money(scheme.rates.exGST) !== money(actual.exGST) || money(scheme.rates.inclGST) !== money(actual.inclGST));
  return <section className="order-net-rates" aria-label="Order net rates" aria-live="polite">
    <div className="pricing-grid">
      {scheme ? <RatePair label={`${proposed ? 'Proposed scheme' : 'Scheme'} net / unit · ${scheme.label}`} exGST={scheme.rates.exGST} inclGST={scheme.rates.inclGST}/> : <RatePair label={proposed ? 'Proposed order net / supplied unit' : 'Order net / supplied unit'} exGST={actual.exGST} inclGST={actual.inclGST}/>}
      {different && <RatePair label="Current quantity · net / supplied unit" exGST={actual.exGST} inclGST={actual.inclGST} tone="actual"/>}
    </div>
    {scheme && scheme.free > 0 && !line.schemeNote && <div className={`scheme-quantity-note${scheme.qualifies ? '' : ' below-scheme-minimum'}`}>
      <span>{!scheme.qualifies ? `This scheme needs ${scheme.paid} paid units. Current quantity ${line.qty} earns no free units.` : `Scheme: ${scheme.paid} paid + ${scheme.free} free per complete group.`}{different ? ' Order totals use the actual paid and free quantities below.' : ''}</span>
      {scheme.nextQuantity && onUseSchemeQuantity && <button type="button" className="secondary" onClick={() => onUseSchemeQuantity(scheme.nextQuantity!)}>Use {scheme.nextQuantity} paid units</button>}
    </div>}
    <p>{saved ? 'Saved' : 'Order'} base: <b>{money((line.baseRate ?? line.rate) / 100)}</b> / paid unit excl. GST · Before scheme discount</p>
    <p>{line.qty} paid + {line.free} free = {units} units · GST {line.gst}%{line.schemeDiscount ? ` · ${line.schemeDiscount}% discount` : ''}</p>
    <p>Line total: <b>{money(line.subtotal / 100)}</b> excl. GST · <b>{money(line.total / 100)}</b> incl. GST{proposed ? ' · Subject to Admin approval' : ''}</p>
  </section>;
}

export function OrderCompanyProfit({line, product, direct, proposed=false}: {line:PricedLine; product:ProductData; direct:boolean; proposed?:boolean}) {
 const p=orderCompanyProfit(line,product,direct);
 return <section className={`pricing-profit ${p && p.amount<0?'pricing-loss':''}`} aria-label="Company profit estimate">
 <b>{direct?'Direct company':'Stockist'} · {proposed?'Proposed':'Estimated'} profit</b>
 {p ? <><span>Company revenue excl. GST</span><strong>{money(p.revenue)}</strong><span>Landing cost · {line.qty+line.free} supplied units</span><strong>{money(p.cost)}</strong><span>Profit excl. GST</span><strong>{money(p.amount)}</strong><span>Profit % on cost</span><strong>{p.percent===null?'Unavailable':`${p.percent.toFixed(2)}%`}</strong></> : <span>Set valid landing cost{direct?'':' and PTS'} to calculate profit.</span>}
 <small>Current catalogue landing cost{direct?'; actual order net selling amount, with no stockist margin deduction.':' and PTS; selected order discount and free units applied. Estimate, not agency invoice profit.'} Before other business expenses.{proposed?' Subject to Admin approval.':''}</small>
 </section>;
}
