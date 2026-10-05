import type {Member,StoredRecord} from './permissions';
export function idList(raw:string|undefined):string[]{try{const a=JSON.parse(raw||'[]');return Array.isArray(a)?[...new Set(a.filter(v=>typeof v==='string'))]:[]}catch{return []}}
export function customerVisible(m:Member,r:StoredRecord){if(m.role==='admin')return true;const d=JSON.parse(r.data),routes=idList(m.route_ids);if(idList(d['Blocked MRs']).includes(m.email))return false;if(r.owner===m.user_id)return true;let access='';try{access=JSON.parse(d['MR route access']||'{}')[m.email]||''}catch{}if(access&&routes.includes(access))return true;const routeOK=routes.includes(d['Route ID'])||(!routes.length&&(!m.route||d.Route===m.route));return routeOK&&(r.assigned_to===m.email||d['Route access']==='Yes');}
export type GPSPoint={lat:number;lng:number;accuracy:number;capturedAt:string};
export function validGPS(g:unknown):g is GPSPoint{if(!g||typeof g!=='object')return false;const p=g as GPSPoint;const time=Date.parse(p.capturedAt);return Number.isFinite(p.lat)&&p.lat>=-90&&p.lat<=90&&Number.isFinite(p.lng)&&p.lng>=-180&&p.lng<=180&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&Number.isFinite(time)&&Date.now()-time<=180000&&time<=Date.now()+30000;}
export function gpsString(p:GPSPoint){return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)} (±${Math.round(p.accuracy)} m)`;}
export async function captureGPS():Promise<GPSPoint>{if(!navigator.geolocation)throw new Error('GPS is unavailable. Use a device with location access.');const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000})).catch(()=>{throw new Error('GPS is required. Allow location access and try again.');});return {lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:new Date(p.timestamp).toISOString()};}
export function legacyGPS(data:Record<string,string>){try{return JSON.parse(data['GPS data']||'null')}catch{return null}}
export type PricedLine={productId:string;name:string;qty:number;free:number;scheme:string;rate:number;mrp:number;ptr:number;gst:number;subtotal:number;total:number};
export function priceLine(product:Record<string,string>,productId:string,qty:number,scheme:string,primary:boolean):PricedLine{
 const rate=Number(primary?product.PTS:product['Retail offer enabled']==='Yes'?product['Retail offer rate']:product.PTR),gst=Number(product['GST %']||0);
 if(!Number.isFinite(rate)||rate<=0||rate>10000000)throw new Error(`Set a valid ${primary?'PTS':'PTR / retail offer'} for ${product.Name}.`);
 let free=0;if(scheme!=='none'){const paid=Number(product[`Scheme ${scheme} paid`]||0),bonus=Number(product[`Scheme ${scheme} free`]||0);if(product[`Scheme ${scheme} enabled`]!=='Yes'||paid<=0||bonus<=0)throw new Error(`Scheme ${scheme} is unavailable for ${product.Name}.`);free=Math.floor(qty/paid)*bonus;}
 if(!Number.isSafeInteger(free)||free>10000000)throw new Error('Scheme free quantity is too large.');
 const subtotal=Math.round(rate*qty*100),total=Math.round(subtotal*(1+gst/100));
 return {productId,name:product.Name,qty,free,scheme,rate:Math.round(rate*100),mrp:Math.round(Number(product.MRP||0)*100),ptr:Math.round(Number(product.PTR||0)*100),gst,subtotal,total};
}
