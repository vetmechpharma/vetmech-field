type CatalogueRow = {kind: string; data: Record<string, string>};
export type ProductSort = 'asc' | 'desc';
const alphabet = new Intl.Collator('en-IN', {sensitivity: 'base', numeric: true});

export function productCategory(data: Record<string, string>): string {
  return (data['Product category'] || '').trim().replace(/\s+/g, ' ');
}

export function normalizeProductCategory(data: Record<string, string>): Record<string, string> {
  const category = productCategory(data);
  if (category.length > 100) throw Error('Product category must be 100 characters or fewer.');
  return {...data, 'Product category': category};
}

export function productCategories(rows: CatalogueRow[]): string[] {
  const categories = new Map<string, string>();
  for (const row of rows) {
    if (row.kind !== 'Products') continue;
    const label = productCategory(row.data);
    if (label && !categories.has(label.toLowerCase())) categories.set(label.toLowerCase(), label);
  }
  return [...categories.values()].sort(alphabet.compare);
}

export function categoryFilterValue(category: string): string {
  return `category:${category.toLowerCase()}`;
}

export function matchesProductCategory(data: Record<string, string>, filter: string): boolean {
  const category = productCategory(data);
  return !filter || (filter === 'uncategorised' ? !category : categoryFilterValue(category) === filter);
}

export function sortProducts<T extends {data: Record<string, string>}>(rows: T[], direction: ProductSort = 'asc'): T[] {
  const sign = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => sign * (alphabet.compare(a.data.Name?.trim() || '', b.data.Name?.trim() || '') || alphabet.compare(a.data.Pack || '', b.data.Pack || '')));
}
