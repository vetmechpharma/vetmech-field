export const customerCategories=['Doctor','Medical / Clinic','Farmer','Livestock Inspector','Other'] as const;
export type CustomerCategory=typeof customerCategories[number];
export type CustomerData=Record<string,string>;
export function customerCategory(data:CustomerData):CustomerCategory {
 const explicit=data['Customer category'];if(customerCategories.includes(explicit as CustomerCategory))return explicit as CustomerCategory;
 const type=data.Type||'';
 if(['Doctor','Veterinary Doctor'].includes(type))return 'Doctor';
 if(['Medical / Clinic','Clinic / Hospital','Pharmacy','Pet Clinic'].includes(type))return 'Medical / Clinic';
 if(['Farmer','Dairy Farm','Poultry Farm','Sheep / Goat Farm'].includes(type))return 'Farmer';
 if(['Livestock Inspector','Live stock Inspector'].includes(type))return 'Livestock Inspector';
 return 'Other';
}
export function stockistIDs(data:CustomerData):string[]{try{const parsed=JSON.parse(data['Stockist IDs']||'[]');return Array.isArray(parsed)?Array.from(new Set(parsed.filter((v):v is string=>typeof v==='string'))):[]}catch{return []}}
export function normalizeCustomer(data:CustomerData):CustomerData{return {...data,'Customer category':customerCategory(data),'Mobile 1':data['Mobile 1']||data.Phone||'','Mobile 2':data['Mobile 2']||'',Email:data.Email||'','Stockist IDs':JSON.stringify(stockistIDs(data))};}
export function customerDisplayName(data:CustomerData){const prefix=customerCategory(data)==='Doctor'?data.Prefix?.trim():undefined,name=data.Name||'';return prefix&&!name.toLowerCase().startsWith(prefix.toLowerCase())?`${prefix} ${name}`:name;}
export function validateCustomer(data:CustomerData,today:string):string|null{
 if(data['Customer category']&&!customerCategories.includes(data['Customer category'] as CustomerCategory))return 'Choose a valid customer category.';
 if(data.Email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.Email))return 'Enter a valid email address.';
 if(data.Pincode&&!/^[1-9]\d{5}$/.test(data.Pincode))return 'Pincode must contain six digits.';
 for(const field of ['Mobile 1','Mobile 2'])if(data[field]){const digits=data[field].replace(/\D/g,'');if(!/^[+\d\s()-]+$/.test(data[field])||digits.length<7||digits.length>15)return `${field} must contain a valid phone number.`}
 const dob=data['Date of birth'];if(dob&&(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||Number.isNaN(Date.parse(dob))||new Date(dob).toISOString().slice(0,10)!==dob||dob>today))return 'Enter a valid date of birth that is not in the future.';
 const category=customerCategory(data);if(category==='Doctor'&&data.Work&&!['Private','Government'].includes(data.Work))return 'Doctor work must be Private or Government.';
 if(category==='Livestock Inspector'&&data.Work&&!['Private','Aavin','Self Employed'].includes(data.Work))return 'Select Private, Aavin or Self Employed.';
 if(data['Stockist IDs']){try{const ids=JSON.parse(data['Stockist IDs']);if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'))return 'Choose stockists from the available list.'}catch{return 'Choose stockists from the available list.'}}
 return null;
}
export type GeocodeResult={locality?:string;city?:string;principalSubdivision?:string;countryName?:string;postcode?:string;localityLanguageRequested?:string;error?:string;description?:string};
export function areaAddress(result:GeocodeResult){const parts=[result.locality,result.city,result.principalSubdivision,result.postcode,result.countryName].filter((s):s is string=>typeof s==='string'&&s.trim().length>0);return {name:result.locality||result.city||result.principalSubdivision||'',address:Array.from(new Set(parts)).join(', ')};}
