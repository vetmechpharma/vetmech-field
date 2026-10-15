type Row={id:string;kind:string;data:Record<string,string>};
export function headquartersDistrictIDs(data:Record<string,string>,rows:Row[]):string[]{
 if(data['District IDs']){try{const ids=JSON.parse(data['District IDs']);return Array.isArray(ids)?[...new Set(ids.filter((id:unknown)=>typeof id==='string'))] as string[]:[]}catch{return []}}
 return rows.filter(r=>r.kind==='Districts'&&r.data.Name===data.District).map(r=>r.id);
}
export function headquartersCovers(data:Record<string,string>,district:string,rows:Row[]){return headquartersDistrictIDs(data,rows).some(id=>rows.some(r=>r.id===id&&r.kind==='Districts'&&r.data.Name===district))}
export function districtState(district:string,rows:Row[]){return rows.find(r=>r.kind==='Districts'&&r.data.Name===district)?.data.State||''}
export function stateOptions(rows:Row[]){return [...new Set(rows.filter(r=>r.kind==='Districts').map(r=>r.data.State?.trim()).filter(Boolean))].sort()}
