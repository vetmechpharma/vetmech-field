import {headquartersDistrictIDs} from './geography';
type Row={id:string;kind:string;data:Record<string,string>};
export function stockistMatchesTerritory(stock:Row,value:{route_ids:string[];district_ids:string[];headquarters?:string},rows:Row[]){
 const routes=rows.filter(r=>r.kind==='Routes'&&value.route_ids.includes(r.id));
 const districts=new Set([...rows.filter(r=>r.kind==='Districts'&&value.district_ids.includes(r.id)).map(r=>r.data.Name),...routes.map(r=>r.data.District)]);
 const headquarters=new Set([value.headquarters,...routes.map(r=>r.data.Headquarters)].filter(Boolean));
 const stockRoute=rows.find(r=>r.kind==='Routes'&&r.data.Name===stock.data.Route);
 return !!((stock.data.Route&&routes.some(r=>r.data.Name===stock.data.Route))||headquartersDistrictIDs(stock.data,rows).some(id=>rows.some(r=>r.id===id&&districts.has(r.data.Name)))||(stock.data.Headquarters&&headquarters.has(stock.data.Headquarters))||(stockRoute&&districts.has(stockRoute.data.District)));
}
