import type {PricedLine} from './field-rules';
import {applyPercentage,DIRECT_NET_SCHEME} from './product-pricing';
export const COMPANY_STOCK_ID='company-stock';
export const COMPANY_NAME='VETMECH · Direct company';
export const supplyChannel=(id:string)=>id===COMPANY_STOCK_ID?'Direct company':'Stockist';
export function proposedLine(base:PricedLine,input:{proposedRate?:number;proposedFree?:number}):PricedLine{
 if(base.schemeType===DIRECT_NET_SCHEME&&(input.proposedRate!==undefined||input.proposedFree!==undefined))throw new Error('Choose No scheme or Other / Custom to propose a different offer. A direct net-rate offer cannot be combined with a special rate or free quantity.');
 const proposedBase=input.proposedRate===undefined?undefined:Math.round(input.proposedRate*100);
 const rate=proposedBase===undefined?base.rate:applyPercentage(proposedBase,base.schemeDiscount||0);
 const free=input.proposedFree===undefined?base.free:input.proposedFree,subtotal=Math.round(rate*base.qty);
 return {...base,...(proposedBase===undefined?{}:{baseRate:proposedBase,customRate:true}),schemeNote:input.proposedFree!==undefined?'Custom free quantity':base.schemeNote,rate,free,subtotal,total:applyPercentage(subtotal,base.gst,true)};
}
