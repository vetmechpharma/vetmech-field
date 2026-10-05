export type Data = Record<string,string>;
export function quoteProduct(product:Data,quantity:number,kind='Orders') {
 const mode=kind==='Primary sales'?'PTS':product['Price mode']||'PTR';
 const rate=Number(product[mode]||0);
 const paid=Number(product['Scheme paid quantity']||0),free=Number(product['Scheme free quantity']||0);
 const enabled=product['Scheme enabled']==='Yes';
 const freeQuantity=enabled&&paid>0?Math.floor(quantity/paid)*free:0;
 const subtotal=Math.round(quantity*rate*100)/100,gst=Number(product['GST %']||0);
 return {mode,rate,freeQuantity,subtotal,total:Math.round(subtotal*(1+gst/100)*100)/100,effectiveRate:quantity+freeQuantity>0?subtotal/(quantity+freeQuantity):0,gst};
}
export function sampleDelta(data:Data){const qty=Number(data.Quantity||0);return data.Movement==='Issued to rep'?qty:-qty;}
export function parseGPS(raw:string){const match=raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);if(!match)return null;const lat=Number(match[1]),lng=Number(match[2]);if(lat< -90||lat>90||lng< -180||lng>180)return null;const accuracy=raw.match(/±\s*(\d+(?:\.\d+)?)\s*m/);return {lat,lng,accuracy:accuracy?Number(accuracy[1]):null};}
export const masterLinks:Record<string,string>={Customers:'Customer',Stockists:'Stockist',Products:'Product',Districts:'District',Headquarters:'Headquarters',Routes:'Route','MR types':'MR type'};
export const memberLinks:Record<string,string>={Districts:'district',Headquarters:'headquarters',Routes:'route','MR types':'mr_type'};
