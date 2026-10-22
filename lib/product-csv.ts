import {normalizeProductPricing,schemeLabel,schemeSlots,productScheme,withGST} from './product-pricing';
export type ProductRow={id:string;kind:string;data:Record<string,string>};
export const legacyProductHeaders=['Product Name','Packing','MRP','PTR','PTS','Offer Schemes'];
export const productHeaders=['Product Name','Packing','MRP','GST %','Retail margin %','Stockist margin %','Landing cost','PTR','PTS','PTR incl GST','PTS incl GST','Offer Schemes'];
export function readCSV(input:string):string[][]{
 const text=input.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
 if(c==='"'){if(cell||closed)throw Error('Invalid CSV quotation. Save as CSV UTF-8.');quoted=true}
 else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[]}}
 else{if(closed)throw Error('Unexpected text after a quoted CSV value.');cell+=c}
 }if(quoted)throw Error('Unclosed CSV quotation.');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
function safeCell(v:string){const safe=/^[\s]*[=+\-@]/.test(v)?"'"+v:v;return '"'+safe.replaceAll('"','""')+'"'}
export function writeCSV(rows:string[][]){return '\uFEFF'+rows.map(r=>r.map(safeCell).join(',')).join('\r\n')+'\r\n'}
export function offerText(data:Record<string,string>){return schemeSlots.filter(i=>data[`Scheme ${i} enabled`]==='Yes').map(i=>schemeLabel(data,i).replace(' discount','').replaceAll(' ','')).join('; ')}
export function productCSV(rows:ProductRow[],admin:boolean){
 const headers=productHeaders.filter(h=>admin||!['PTS','PTS incl GST','Landing cost','Retail margin %','Stockist margin %'].includes(h));
 return writeCSV([headers,...rows.filter(r=>r.kind==='Products').map(r=>headers.map(h=>{
  const d=r.data,gst=Number(d['GST %']||0);
  if(h==='Product Name')return d.Name||'';if(h==='Packing')return d.Pack||'';if(h==='Offer Schemes')return offerText(d);
  if(h==='PTR incl GST'||h==='PTS incl GST')return withGST(Number(d[h.startsWith('PTR')?'PTR':'PTS']||0),gst).toFixed(2);
  return d[h]||(['MRP','PTR','PTS','GST %'].includes(h)?'0':'');
 }))]);
}
export type ProductImport={row:number;name:string;id?:string;data:Record<string,string>;before?:Record<string,string>;error:string};
export function previewProducts(text:string,existing:ProductRow[]):ProductImport[]{
 const csv=readCSV(text);if(csv.length<2)throw Error('The CSV must contain a header and at least one product.');if(csv.length>501)throw Error('Import a maximum of 500 products at a time.');
 const header=csv[0].map(s=>s.trim());if(new Set(header).size!==header.length||header.some(h=>!productHeaders.includes(h))||legacyProductHeaders.some(h=>!header.includes(h)))throw Error('Use the template columns: '+productHeaders.join(', '));
 const seen=new Set<string>();return csv.slice(1).map((cells,index)=>{const get=(h:string)=>{const v=(cells[header.indexOf(h)]||'').trim();return /^'[\s]*[=+\-@]/.test(v)?v.slice(1):v},name=get('Product Name'),key=name.toLowerCase(),matches=existing.filter(r=>r.kind==='Products'&&r.data.Name?.trim().toLowerCase()===key),old=matches[0];let error='';const data:Record<string,string>={...old?.data,Name:name,Pack:get('Packing'),MRP:get('MRP'),PTR:get('PTR'),PTS:get('PTS')};
 try{if(cells.length!==header.length)throw Error('Row column count does not match the header.');for(const k of ['GST %','Retail margin %','Stockist margin %','Landing cost'])if(header.includes(k))data[k]=get(k);Object.assign(data,normalizeProductPricing(data));if(!name||name.length>200)throw Error('Enter a product name of up to 200 characters.');if(seen.has(key))throw Error('Duplicate product name in this file.');if(matches.length>1)throw Error('Multiple catalogue matches; correct duplicate names first.');if(!data.Pack||data.Pack.length>100)throw Error('Enter packing (up to 100 characters).');for(const k of ['MRP','PTR','PTS'])if(!/^\d+(\.\d{1,2})?$/.test(data[k])||Number(data[k])>10000000)throw Error(k+' must be a nonnegative amount with up to 2 decimals.');
 const schemes=get('Offer Schemes').split(';').map(s=>s.trim()).filter(Boolean);if(schemes.length>20)throw Error('Maximum 20 schemes.');const unique=new Set<string>();for(let i=1;i<=20;i++){data[`Scheme ${i} enabled`]='No';delete data[`Scheme ${i} paid`];delete data[`Scheme ${i} free`];delete data[`Scheme ${i} type`];delete data[`Scheme ${i} discount %`]}
 schemes.forEach((s,n)=>{const m=s.match(/^(\d+)\s*\+\s*(\d+)$/),discount=s.match(/^(\d+(?:\.\d{1,2})?)\s*%$/);if(!m&&!discount)throw Error('Use buy+free or percentage schemes, e.g. 5+1; 10+3; 5%.');
 if(m&&(Number(m[1])<1||Number(m[2])<1||Number(m[1])>100000||Number(m[2])>100000))throw Error('Use positive buy+free quantities up to 100000.');
 const canonical=discount?Number(discount[1])+'%':Number(m![1])+'+'+Number(m![2]);if(unique.has(canonical))throw Error('Duplicate offer scheme.');unique.add(canonical);
 const slot=n+1;data[`Scheme ${slot} enabled`]='Yes';data[`Scheme ${slot} type`]=discount?'Discount':'Buy + free';
 if(discount)data[`Scheme ${slot} discount %`]=String(Number(discount[1]));else{data[`Scheme ${slot} paid`]=String(Number(m![1]));data[`Scheme ${slot} free`]=String(Number(m![2]));}productScheme(data,slot);});

 }catch(e){error=(e as Error).message}seen.add(key);return {row:index+2,name,id:old?.id,data,before:old?.data,error};});
}
