'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera,LoaderCircle,Trash2} from 'lucide-react';
import {type Member} from '../lib/permissions';
import {initials} from '../lib/ui-config';

type Employee=Pick<Member,'name'|'email'|'photo_version'>;

export function EmployeeAvatar({employee,large=false,preview}:{employee:Employee;large?:boolean;preview?:string|null}){
 const [failed,setFailed]=useState('');
 const src=preview!==undefined?preview:employee.photo_version?`/api/team/photo?email=${encodeURIComponent(employee.email)}&v=${encodeURIComponent(employee.photo_version)}`:null;
 return <span className={`avatar employee-avatar${large?' large-avatar':''}`}>
  {src&&src!==failed?<img src={src} alt={`${employee.name||'Employee'} profile photo`} width={256} height={256} onError={()=>setFailed(src)}/>:initials(employee.name||'MR')}
 </span>;
}

/** Compress before uploading so phone camera images never reach the server at full size. */
async function preparePhoto(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG or WebP photo.');
 if(file.size>10*1024*1024)throw new Error('Choose a photo smaller than 10 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Unable to read this photo. Choose another image.'));img.src=url;});
  const size=Math.min(img.naturalWidth,img.naturalHeight);
  if(!size)throw new Error('The selected photo is empty.');
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Photo preview is unavailable in this browser.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,256,256);
  ctx.drawImage(img,(img.naturalWidth-size)/2,(img.naturalHeight-size)/2,size,size,0,0,256,256);
  const data=canvas.toDataURL('image/jpeg',0.85);
  if(!data.startsWith('data:image/jpeg;base64,')||data.length>175000)throw new Error('Unable to resize this photo. Choose another image.');
  return data;
 }finally{URL.revokeObjectURL(url)}
}

export function EmployeePhotoPicker({employee,value,onChange,onBusyChange,disabled=false}:{employee:Employee;value?:string|null;onChange:(photo:string|null|undefined)=>void;onBusyChange:(busy:boolean)=>void;disabled?:boolean}){
 const input=useRef<HTMLInputElement>(null),generation=useRef(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>{generation.current++},[]);
 const hasPhoto=value!==undefined?!!value:!!employee.photo_version;
 async function choose(file?:File){
  if(!file)return;
  const id=++generation.current;setError('');setBusy(true);onBusyChange(true);
  try{const photo=await preparePhoto(file);if(id===generation.current)onChange(photo)}catch(e){if(id===generation.current)setError((e as Error).message)}
  finally{if(id===generation.current){setBusy(false);onBusyChange(false)}}
 }
 return <div className="employee-photo-picker full-field">
  <EmployeeAvatar employee={employee} large preview={value}/>
  <div className="employee-photo-controls"><b>Employee photo</b><p>JPG, PNG or WebP · up to 10 MB. A small square preview is saved.</p>
   <div className="employee-photo-actions">
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Employee photo file" hidden style={{display:'none'}} disabled={disabled||busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void choose(file)}}/>
    <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>input.current?.click()}>{busy?<LoaderCircle size={16} className="spin"/>:<Camera size={16}/>} {busy?'Preparing photo…':hasPhoto?'Change photo':'Add photo'}</button>
    {hasPhoto&&<button type="button" className="text-button" disabled={disabled||busy} onClick={()=>{setError('');onChange(null)}}><Trash2 size={16}/>Remove photo</button>}
    {value!==undefined&&<button type="button" className="text-button" disabled={disabled||busy} onClick={()=>{setError('');onChange(undefined)}}>Undo photo change</button>}
   </div>
   {value!==undefined&&<small role="status">{value===null?'Photo will be removed when you save.':'New photo ready. Save representative to apply it.'}</small>}
   {error&&<div className="form-error" role="alert">{error}</div>}
  </div>
 </div>;
}
