import {productScheme, type ProductData} from './product-pricing';

export type RetailReferences = {retailSchemeIds?: string[]; retailSchemes?: string[]; retailScheme?: string};

/** Primary retail references are catalogue selections, never extra received stock. */
export function primaryRetailReferences(product: ProductData, input: RetailReferences, saved?: RetailReferences): RetailReferences & {retailSchemes: string[]; retailScheme: string} {
  if (input.retailSchemeIds === undefined) {
    // Preserve invoices entered before catalogue selection was introduced.
    const labels = [...new Set((input.retailSchemes ?? [input.retailScheme || '']).map(s => s.trim()).filter(Boolean))];
    return {retailSchemes: labels, retailScheme: labels.join(' / ')};
  }
  const ids = input.retailSchemeIds;
  if (ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => !/^(?:[1-9]|1[0-9]|20)$/.test(id)))
    throw new Error('Select each product retail scheme once, up to 20 alternatives.');
  const labels = ids.map(id => {
    const previous = saved?.retailSchemeIds?.indexOf(id) ?? -1;
    if (previous >= 0 && saved?.retailSchemes?.[previous]) return saved.retailSchemes[previous];
    return productScheme(product, id).label;
  });
  return {retailSchemeIds: [...ids], retailSchemes: labels, retailScheme: labels.join(' / ')};
}
