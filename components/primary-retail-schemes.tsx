'use client';
import {schemeLabel, schemeSlots, type ProductData} from '../lib/product-pricing';
import type {RetailReferences} from '../lib/primary-schemes';

export function PrimaryRetailSchemes({product, value, saved, onChange}: {
  product?: ProductData; value: RetailReferences; saved?: RetailReferences; onChange: (value: RetailReferences) => void;
}) {
  const ids = value.retailSchemeIds ?? [];
  const legacy = (value.retailSchemes ?? [value.retailScheme || '']).filter(Boolean);
  const available = product ? schemeSlots.filter(i => product[`Scheme ${i} enabled`] === 'Yes').map(String) : [];
  const options = [...new Set([...available, ...(saved?.retailSchemeIds || [])])];
  return <fieldset className="primary-retail-schemes">
    <legend>Retail schemes for MR</legend>
    <p>Choose product schemes to reference on this invoice. These do not add free stock or change the invoice value.</p>
    {!product ? <small>Select a product to load its schemes.</small> : value.retailSchemeIds === undefined && legacy.length ? <>
      <div className="retail-scheme-list">{legacy.map((label, i) => <span className="badge" key={i}>{label}</span>)}</div>
      <small>Saved references retained from this invoice.</small>
      <button type="button" className="secondary" onClick={() => onChange({retailSchemeIds: [], retailSchemes: [], retailScheme: ''})}>Replace with product schemes</button>
    </> : <>
      <div className="retail-scheme-list">{options.map(id => {
        const previous = saved?.retailSchemeIds?.indexOf(id) ?? -1;
        const original = previous >= 0 ? saved?.retailSchemes?.[previous] : undefined;
        const current = available.includes(id) ? schemeLabel(product, id) : '';
        const historic = original && original !== current;
        return <label key={id}><input type="checkbox" checked={ids.includes(id)} onChange={e => onChange({retailSchemeIds: e.target.checked ? [...ids, id] : ids.filter(i => i !== id), retailSchemes: [], retailScheme: ''})}/><span>{original || current}{historic ? ' (saved)' : ''}</span></label>;
      })}</div>
      {!options.length && <small>No retail schemes in Product Pricing.</small>}
      {options.length > 0 && <div className="retail-scheme-actions"><button type="button" className="secondary" onClick={() => onChange({retailSchemeIds: [...available], retailSchemes: [], retailScheme: ''})}>Select all product schemes</button><button type="button" className="secondary" disabled={!ids.length} onClick={() => onChange({retailSchemeIds: [], retailSchemes: [], retailScheme: ''})}>No retail scheme</button></div>}
    </>}
    <small>Bulk stockist offers are recorded separately. MR orders use the selected order scheme from Product Pricing.</small>
  </fieldset>;
}
