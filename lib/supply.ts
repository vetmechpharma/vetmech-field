import type {PricedLine} from './field-rules';
export const COMPANY_STOCK_ID='company-stock';
export const COMPANY_NAME='VETMECH · Direct company';
export const supplyChannel=(id:string)=>id===COMPANY_STOCK_ID?'Direct company':'Stockist';
export function proposedLine(base:PricedLine,input:{proposedRate?:number;proposedFree?:number}):PricedLine{const rate=input.proposedRate===undefined?base.rate:Math.round(input.proposedRate*100),free=input.proposedFree===undefined?base.free:input.proposedFree,subtotal=Math.round(rate*base.qty);return {...base,schemeNote:input.proposedFree!==undefined?'Custom free quantity':base.schemeNote,rate,free,subtotal,total:Math.round(subtotal*(1+base.gst/100))};}
