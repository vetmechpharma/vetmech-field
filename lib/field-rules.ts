import {primaryRetailReferences,type RetailReferences} from './primary-schemes';
import {productScheme,roundMoney,applyPercentage,type ProductData} from './product-pricing';
import type {Member,StoredRecord} from './permissions';
export function idList(raw:string|undefined):string[]{try{const a=JSON.parse(raw||'[]');return Array.isArray(a)?[...new Set(a.filter(v=>typeof v==='string'))]:[]}catch{return []}}
export function customerVisible(m:Member,r:StoredRecord){if(m.role==='admin')return true;const d=JSON.parse(r.data),routes=idList(m.route_ids);if(idList(d['Blocked MRs']).includes(m.email))return false;if(idList(d['Outside route MRs']).includes(m.email))return true;if(r.owner===m.user_id)return true;let access='';try{access=JSON.parse(d['MR route access']||'{}')[m.email]||''}catch{}if(access&&routes.includes(access))return true;const routeOK=routes.includes(d['Route ID'])||(!routes.length&&(!m.route||d.Route===m.route));return routeOK&&(r.assigned_to===m.email||d['Route access']==='Yes');}
export type GPSPoint={lat:number;lng:number;accuracy:number;capturedAt:string};
export function validGPS(g:unknown):g is GPSPoint{if(!g||typeof g!=='object')return false;const p=g as GPSPoint;const time=Date.parse(p.capturedAt);return Number.isFinite(p.lat)&&p.lat>=-90&&p.lat<=90&&Number.isFinite(p.lng)&&p.lng>=-180&&p.lng<=180&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&Number.isFinite(time)&&Date.now()-time<=180000&&time<=Date.now()+30000;}
export function gpsString(p:GPSPoint){return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)} (±${Math.round(p.accuracy)} m)`;}
export async function captureGPS():Promise<GPSPoint>{if(!navigator.geolocation)throw new Error('GPS is unavailable. Use a device with location access.');const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000})).catch(()=>{throw new Error('GPS is required. Allow location access and try again.');});return {lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:new Date(p.timestamp).toISOString()};}
export function legacyGPS(data:Record<string,string>){try{return JSON.parse(data['GPS data']||'null')}catch{return null}}
export type PricedLine={baseRate?:number;schemeType?:string;schemePaid?:number;schemeFree?:number;schemeDiscount?:number;schemeLabel?:string;customRate?:boolean;packing?:string;stockistOffer?:string;retailSchemeIds?:string[];retailSchemes?:string[];retailScheme?:string;discountPercent?:number;manualInvoice?:boolean;batch?:string;expiry?:string;allocations?:import("./batch-stock").BatchAllocation[];productId:string;name:string;qty:number;free:number;scheme:string;schemeNote?:string;rate:number;mrp:number;ptr:number;gst:number;subtotal:number;total:number};
export function priceLine(product:Record<string,string>,productId:string,qty:number,scheme:string,primary:boolean):PricedLine{
 const base=Number(primary?product.PTS:product['Retail offer enabled']==='Yes'?product['Retail offer rate']:product.PTR),gst=Number(product['GST %']||0);
 if(!Number.isFinite(base)||base<=0||base>10000000)throw new Error(`Set a valid ${primary?'PTS':'PTR / retail offer'} for ${product.Name}.`);
 if(!Number.isFinite(gst)||gst<0||gst>100)throw new Error('GST must be between 0 and 100%.');
 if(!Number.isInteger(qty)||qty<1||qty>100000)throw new Error('Enter a whole quantity between 1 and 100000.');
 const offer=productScheme(product,scheme),free=Math.floor(qty/offer.paid)*offer.free;
 if(!Number.isSafeInteger(free)||free>10000000)throw new Error('Scheme free quantity is too large.');
 const baseRate=Math.round(roundMoney(base)*100),rate=applyPercentage(baseRate,offer.discount);
 const subtotal=rate*qty,total=applyPercentage(subtotal,gst,true);
 return {productId,name:product.Name,qty,free,scheme,rate,baseRate,schemeType:offer.type,schemePaid:offer.paid,schemeFree:offer.free,schemeDiscount:offer.discount,schemeLabel:offer.label,mrp:Math.round(Number(product.MRP||0)*100),ptr:Math.round(Number(product.PTR||0)*100),gst,subtotal,total};
}

/** Preserve the original base price and same-scheme terms unless Admin approves repricing. */
export function orderLine(product:ProductData,productId:string,qty:number,scheme:string,saved?:PricedLine,reprice=false):PricedLine{
 if(!saved||reprice)return priceLine(product,productId,qty,scheme,false);
 if(saved.qty===qty&&saved.scheme===scheme)return {...saved};
 const data={...product,PTR:String((saved.baseRate??saved.rate)/100),'Retail offer enabled':'No','GST %':String(saved.gst)};
 if(saved.scheme===scheme&&scheme!=='none'&&saved.schemeType){
  Object.assign(data,{[`Scheme ${scheme} enabled`]:'Yes',[`Scheme ${scheme} type`]:saved.schemeType,[`Scheme ${scheme} paid`]:String(saved.schemePaid??1),[`Scheme ${scheme} free`]:String(saved.schemeFree??0),[`Scheme ${scheme} discount %`]:String(saved.schemeDiscount??0)});
 }
 const q=priceLine(data,productId,qty,scheme,false);
 return {...q,mrp:saved.mrp,ptr:saved.ptr,packing:saved.packing,customRate:saved.customRate};
}

export function receiptLine(product:Record<string,string>,productId:string,line:RetailReferences&{qty:number;freeQty?:number;packing?:string;stockistOffer?:string;discountPercent?:number},saved?:PricedLine):PricedLine{
 const free=line.freeQty??0,discount=line.discountPercent??0;
 if(!Number.isInteger(line.qty)||line.qty<1||line.qty>100000||!Number.isInteger(free)||free<0||free>100000)throw new Error('Enter valid quantity and free quantity.');
 if(!Number.isFinite(discount)||discount<0||discount>100)throw new Error('Discount must be between 0 and 100%.');
 return {productId,name:product.Name,qty:line.qty,free,packing:line.packing?.trim()||product.Pack||'',...primaryRetailReferences(product,line,saved),stockistOffer:line.stockistOffer?.trim()||'',discountPercent:discount,manualInvoice:true,scheme:'none',rate:0,mrp:Math.round(Number(product.MRP||0)*100),ptr:Math.round(Number(product.PTR||0)*100),gst:0,subtotal:0,total:0};
}
