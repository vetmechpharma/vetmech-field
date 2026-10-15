export type ProductRow={id:string;kind:string;data:Record<string,string>};
export const productHeaders=['Product Name','Packing','MRP','PTR','PTS','Offer Schemes'];
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
export function offerText(data:Record<string,string>){return Array.from({length:20},(_,n)=>n+1).filter(i=>data[`Scheme ${i} enabled`]==='Yes').map(i=>`${data[`Scheme ${i} paid`]}+${data[`Scheme ${i} free`]}`).join('; ')}
export function productCSV(rows:ProductRow[],admin:boolean){const headers=productHeaders.filter(h=>admin||h!=='PTS');return writeCSV([headers,...rows.filter(r=>r.kind==='Products').map(r=>[r.data.Name||'',r.data.Pack||'',r.data.MRP||'0',r.data.PTR||'0',...(admin?[r.data.PTS||'0']:[]),offerText(r.data)])])}
export type ProductImport={row:number;name:string;id?:string;data:Record<string,string>;before?:Record<string,string>;error:string};
export function previewProducts(text:string,existing:ProductRow[]):ProductImport[]{
 const csv=readCSV(text);if(csv.length<2)throw Error('The CSV must contain a header and at least one product.');if(csv.length>501)throw Error('Import a maximum of 500 products at a time.');
 const header=csv[0].map(s=>s.trim());if(header.length!==6||new Set(header).size!==6||productHeaders.some(h=>!header.includes(h)))throw Error('Use the template columns: '+productHeaders.join(', '));
 const seen=new Set<string>();return csv.slice(1).map((cells,index)=>{const get=(h:string)=>{const v=(cells[header.indexOf(h)]||'').trim();return /^'[\s]*[=+\-@]/.test(v)?v.slice(1):v},name=get('Product Name'),key=name.toLowerCase(),matches=existing.filter(r=>r.kind==='Products'&&r.data.Name?.trim().toLowerCase()===key),old=matches[0];let error='';const data:Record<string,string>={...old?.data,Name:name,Pack:get('Packing'),MRP:get('MRP'),PTR:get('PTR'),PTS:get('PTS')};
 try{if(cells.length!==6)throw Error('Expected 6 columns.');if(!name||name.length>200)throw Error('Enter a product name of up to 200 characters.');if(seen.has(key))throw Error('Duplicate product name in this file.');if(matches.length>1)throw Error('Multiple catalogue matches; correct duplicate names first.');if(!data.Pack||data.Pack.length>100)throw Error('Enter packing (up to 100 characters).');for(const k of ['MRP','PTR','PTS'])if(!/^\d+(\.\d{1,2})?$/.test(data[k])||Number(data[k])>10000000)throw Error(k+' must be a nonnegative amount with up to 2 decimals.');
 const schemes=get('Offer Schemes').split(';').map(s=>s.trim()).filter(Boolean);if(schemes.length>20)throw Error('Maximum 20 schemes.');const unique=new Set<string>();for(let i=1;i<=20;i++){data[`Scheme ${i} enabled`]='No';delete data[`Scheme ${i} paid`];delete data[`Scheme ${i} free`]}
 schemes.forEach((s,n)=>{const m=s.match(/^(\d+)\s*\+\s*(\d+)$/);if(!m||Number(m[1])<1||Number(m[2])<1||Number(m[1])>100000||Number(m[2])>100000)throw Error('Use buy+free schemes, separated by semicolons, e.g. 5+1; 10+3.');const canonical=Number(m[1])+'+'+Number(m[2]);if(unique.has(canonical))throw Error('Duplicate offer scheme.');unique.add(canonical);data[`Scheme ${n+1} enabled`]='Yes';data[`Scheme ${n+1} paid`]=String(Number(m[1]));data[`Scheme ${n+1} free`]=String(Number(m[2]));});
 }catch(e){error=(e as Error).message}seen.add(key);return {row:index+2,name,id:old?.id,data,before:old?.data,error};});
}
