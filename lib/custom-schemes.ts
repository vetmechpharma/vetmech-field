import {orderLine, type PricedLine} from './field-rules';
import type {ProductData} from './product-pricing';

export type SchemeInput = {productId: string; qty: number; scheme: string; customPaid?: number; customFree?: number; proposedFree?: number};
export const hasCustomScheme = (lines: readonly {scheme?: string}[] = []) => lines.some(line => line.scheme === 'other');

/** Custom offers use the same whole-group rule as catalogue buy/free schemes. */
export function requestedOrderLine(product: ProductData, input: SchemeInput, saved?: PricedLine, reprice = false): PricedLine {
  if (input.scheme !== 'other') {
    if (input.customPaid !== undefined || input.customFree !== undefined) throw new Error('Choose Other / Custom scheme to request paid and free quantities.');
    return orderLine(product, input.productId, input.qty, input.scheme, saved, reprice);
  }
  const paid = input.customPaid, free = input.customFree;
  if (!Number.isInteger(paid) || !paid || paid < 1 || paid > 100000 || !Number.isInteger(free) || !free || free < 1 || free > 100000) throw new Error('Enter custom scheme paid and free quantities as whole numbers from 1 to 100000.');
  if (input.proposedFree !== undefined) throw new Error('Use the custom scheme quantities instead of a separate free quantity.');
  const base = orderLine(product, input.productId, input.qty, 'none', saved, reprice);
  const earned = Math.floor(input.qty / paid) * free;
  if (!Number.isSafeInteger(earned) || earned > 10000000) throw new Error('Custom scheme free quantity is too large.');
  return {...base, scheme: 'other', schemeType: 'Buy + free', schemePaid: paid, schemeFree: free, schemeDiscount: 0, schemeLabel: `Custom ${paid} + ${free}`, schemeNote: undefined, free: earned};
}

export function customSchemeChanged(before: PricedLine[], after: PricedLine[]) {
  return after.filter(line => line.scheme === 'other').some(line => {
    const old = before.find(item => item.productId === line.productId);
    return !old || ['scheme', 'schemePaid', 'schemeFree', 'qty', 'free', 'rate', 'gst'].some(key => old[key as keyof PricedLine] !== line[key as keyof PricedLine]);
  });
}

export function pendingCustomEdit(requests: {status: string; body: string; record_id: string}[], orderId: string) {
  return requests.some(request => request.record_id === orderId && request.status === 'Pending' && hasCustomScheme(JSON.parse(request.body).lines));
}
