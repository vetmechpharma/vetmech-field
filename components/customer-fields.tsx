'use client';
import {useEffect,useRef,useState} from 'react';
import {Stethoscope,Building2,Tractor,UserRound,MapPin,LoaderCircle,ExternalLink,CheckCircle2} from 'lucide-react';
import {customerCategories,customerCategory,stockistIDs,areaAddress,type CustomerCategory,type CustomerData,type GeocodeResult} from '../lib/customers';
import {parseGPS} from '../lib/business';
import {today,type FieldRecord} from '../lib/ui-config';
type Props={value:CustomerData;onChange:(data:CustomerData)=>void;rows:FieldRecord[];onBusyChange:(busy:boolean)=>void;admin?:boolean;readOnly?:boolean};
export function CustomerFields({value,onChange,rows,onBusyChange,readOnly=false,admin=false}:Props){
 const category=customerCategory(value),medical=category==='Medical / Clinic',farm=category==='Farmer',doctor=category==='Doctor',inspector=category==='Livestock Inspector';
 const [gpsBusy,setGpsBusy]=useState(false),[geoMessage,setGeoMessage]=useState('');const alive=useRef(true),controller=useRef<AbortController|null>(null),current=useRef(value);current.current=value;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort()}},[]);
 const set=(field:string,text:string)=>{const next={...value,[field]:text};if(field==='District'){next.Headquarters='';next.Route=''}if(field==='Headquarters')next.Route='';onChange(next)};
 function selectCategory(next:CustomerCategory){const data:CustomerData={...value,'Customer category':next,Type:next==='Doctor'?'Veterinary Doctor':next};if(!data.Prefix&&next==='Doctor')data.Prefix='Dr.';if(next!==category){data.Work='';if(!value.Name)data.Prefix=next==='Doctor'?'Dr.':'';}onChange(data)}
 function text(field:string,label=field,type='text',required=false){return <label key={field} className={['Address','Location address','Notes'].includes(field)?'full-field':''}>{label}{required&&<span className="required-dot"> *</span>}{['Address','Location address','Notes'].includes(field)?<textarea value={value[field]||''} onChange={e=>set(field,e.target.value)} rows={3}/>:<input required={required} type={type} value={value[field]||''} onChange={e=>set(field,e.target.value)} max={type==='date'?today():undefined} inputMode={field==='Pincode'?'numeric':undefined} pattern={field==='Pincode'?'[1-9][0-9]{5}':undefined} maxLength={field==='Pincode'?6:undefined}/>}</label>}
 function select(field:string,values:string[],label=field){return <label key={field}>{label}<select required={field==='Route'} value={value[field]||''} onChange={e=>set(field,e.target.value)}><option value="">Select {label.toLowerCase()}</option>{value[field]&&!values.includes(value[field])&&<option value={value[field]}>{value[field]} (existing)</option>}{values.map(v=><option key={v}>{v}</option>)}</select></label>}
 async function capture(){
  if(!navigator.geolocation){setGeoMessage('GPS is unavailable on this device. You can enter the location address manually.');return}
  setGpsBusy(true);onBusyChange(true);setGeoMessage('Getting your current position…');
  try{
   const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000,maximumAge:0}));if(!alive.current)return;
   const coordinates=`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)} (±${Math.round(position.coords.accuracy)} m)`;
   const point={Location:coordinates,'Location captured at':new Date().toISOString(),'Location name':'','Location address':'','Location source':''};
   onChange({...current.current,...point});setGeoMessage('GPS captured. Looking up the area address…');
   controller.current=new AbortController();const timeout=setTimeout(()=>controller.current?.abort(),12000);
   try{
    const params=new URLSearchParams({latitude:String(position.coords.latitude),longitude:String(position.coords.longitude),localityLanguage:'en'});
    // Free endpoint is called only by the browser, only for fresh device GPS, on user action.
    const response=await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`,{signal:controller.current.signal,referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error('Address lookup unavailable');const result=await response.json() as GeocodeResult;const area=areaAddress(result);
    if(result.error||!area.address)throw new Error('No area address returned');
    if(alive.current){onChange({...current.current,Location:coordinates,'Location captured at':point['Location captured at'],'Location name':area.name,'Location address':area.address,'Location source':'BigDataCloud · area-level address'});setGeoMessage('GPS and area address captured. Check and complete street or door details below.');}
   }catch{if(alive.current)setGeoMessage('GPS captured. Address lookup is unavailable; enter the location name and secondary address below.');}finally{clearTimeout(timeout)}
  }catch(e){if(alive.current)setGeoMessage((e as GeolocationPositionError).code===1?'Location permission was denied. Allow GPS access in your browser to capture this location.':'Could not obtain GPS. Try again outdoors, or enter the address manually.');}
  finally{if(alive.current)setGpsBusy(false);onBusyChange(false)}
 }
 const stocks=rows.filter(r=>r.kind==='Stockists'),selected=stockistIDs(value),gps=parseGPS(value.Location||'');
 const categoryIcons=[Stethoscope,Building2,Tractor,UserRound,UserRound];
 return <div className="customer-fields"><div className="customer-type-picker" role="group" aria-label="Customer category">{customerCategories.map((name,i)=>{const Icon=categoryIcons[i];return <button key={name} type="button" disabled={gpsBusy||readOnly} className={name===category?'selected':''} aria-pressed={name===category} onClick={()=>selectCategory(name)}><Icon size={19}/><span>{name==='Medical / Clinic'?'Medical / Clinic':name==='Livestock Inspector'?'Livestock Inspector':name}</span></button>})}</div>
 <section className="customer-form-section"><h3>{doctor?'Doctor details':medical?'Medical / clinic details':farm?'Farm & owner details':inspector?'Livestock Inspector details':'Customer details'}</h3><div className="form-grid">
 {doctor&&select('Prefix',['Dr.','Prof.','Mr.','Mrs.','Ms.'])}
 {text('Name',farm?'Farm name':medical?'Medical / clinic name':'Name','text',true)}
 {doctor&&text('Registration no','Registration number')}
 {medical&&text('Proprietor','Proprietor name')}
 {farm&&text('Owner name')}
 {(doctor||inspector)&&select('Work',doctor?['Private','Government']:['Private','Aavin','Self Employed'],'Work')}
 {doctor&&text('Position')}
 {medical&&text('Drug licence','Drug licence number')}
 {!farm&&text('Date of birth',medical?'Proprietor date of birth':'Date of birth','date')}
 </div></section>
 <section className="customer-form-section"><h3>Contact & address</h3><div className="form-grid">
 {text('Mobile 1',medical?'Mobile 1 · WhatsApp':inspector?'Mobile 1 · WhatsApp':doctor?'Mobile number':'Mobile 1','tel')}
 {!doctor&&text('Mobile 2',medical?'Mobile 2 · Store number':'Mobile 2','tel')}
 {(doctor||medical)&&text('Email','Email address','email')}
 {text('Address','Primary address')}
 {text('Pincode','Pincode')}
 {select('District',rows.filter(r=>r.kind==='Districts').map(r=>r.data.Name))}
 {select('Headquarters',rows.filter(r=>r.kind==='Headquarters'&&(!value.District||r.data.District===value.District)).map(r=>r.data.Name))}
 {select('Route',rows.filter(r=>r.kind==='Routes'&&(!value.District||r.data.District===value.District)&&(!value.Headquarters||r.data.Headquarters===value.Headquarters)).map(r=>r.data.Name))}
 </div></section>
 {admin&&<label className="route-share-toggle"><input type="checkbox" checked={value['Route access']==='Yes'} onChange={e=>set('Route access',e.target.checked?'Yes':'No')}/>Allow all MRs assigned to this customer’s route to access this customer</label>}
 {medical&&<section className="customer-form-section"><h3>Supplying stockists <span>{selected.length} selected</span></h3><p className="field-help">Select every stockist that can supply this medical / clinic. Orders will use only these stockists.</p><div className="stockist-checkboxes">{stocks.map(r=><label key={r.id}><input type="checkbox" checked={selected.includes(r.id)} onChange={e=>set('Stockist IDs',JSON.stringify(e.target.checked?[...selected,r.id]:selected.filter(id=>id!==r.id)))}/><span><b>{r.data.Name}</b><small>{r.data.District||r.data.Headquarters||'Stockist'}</small></span>{selected.includes(r.id)&&<CheckCircle2 size={17}/>}</label>)}</div>{!stocks.length&&<p className="field-help">Add a stockist in the Stockists section first. You can save this profile now and link stockists later.</p>}{selected.some(id=>!stocks.some(s=>s.id===id))&&<p className="form-error">A previously linked stockist is unavailable. Review the stockist selection.</p>}</section>}
 {(medical||farm)&&<section className="customer-form-section geo-section"><h3><MapPin size={19}/>Premises geo tag</h3><p className="field-help">Capture while at this clinic or farm. Uses this device’s current GPS. The fetched area address is saved separately from the primary address.</p><button type="button" className="gps-button" disabled={gpsBusy||readOnly} onClick={capture}>{gpsBusy?<LoaderCircle size={18} className="spin"/>:<MapPin size={18}/>} {gpsBusy?'Capturing location…':gps?'Recapture GPS & area address':'Capture GPS & area address'}</button>{geoMessage&&<p className="geo-status" role="status">{geoMessage}</p>}<div className="form-grid geo-fields"><label className="full-field">GPS coordinates<input value={value.Location||''} readOnly placeholder="Capture GPS at the premises"/>{gps&&<a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}>View recorded point <ExternalLink size={13}/></a>}</label>{text('Location name')}{text('Location address','Secondary address · location')}
 </div>{value['Location captured at']&&<p className="field-help">Captured {new Date(value['Location captured at']).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</p>}<p className="geo-attribution">Area lookup by <a href="https://www.bigdatacloud.com/" target="_blank" rel="noopener noreferrer">BigDataCloud</a>. Coordinates are sent only when you tap capture. Verify street and door details.</p></section>}
 </div>
}
