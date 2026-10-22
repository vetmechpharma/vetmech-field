import type {PricedLine} from './field-rules';
import {applyPercentage} from './product-pricing';
export const COMPANY_STOCK_ID='company-stock';
export const COMPANY_NAME='VETMECH · Direct company';
export const supplyChannel=(id:string)=>id===COMPANY_STOCK_ID?'Direct company':'Stockist';
export function proposedLine(base:PricedLine,input:{proposedRate?:number;proposedFree?:number}):PricedLine{
 const proposedBase=input.proposedRate===undefined?undefined:Math.round(input.proposedRate*100);
 const rate=proposedBase===undefined?base.rate:applyPercentage(proposedBase,base.schemeDiscount||0);
 const free=input.proposedFree===undefined?base.free:input.proposedFree,subtotal=Math.round(rate*base.qty);
 return {...base,...(proposedBase===undefined?{}:{baseRate:proposedBase,customRate:true}),schemeNote:input.proposedFree!==undefined?'Custom free quantity':base.schemeNote,rate,free,subtotal,total:applyPercentage(subtotal,base.gst,true)};
}
