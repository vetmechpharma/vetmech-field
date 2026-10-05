'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {X,MapPin} from 'lucide-react';
export async function request<T=any>(url:string,body?:unknown):Promise<T>{const r=await fetch(url,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json() as T&{error?:string};if(!r.ok)throw new Error(data.error||'Unable to save. Please try again.');return data;}
export function Sheet({title,close,children,busy=false}:{title:string;close:()=>void;children:ReactNode;busy?:boolean}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close()},[]);return <dialog ref={ref} className="dialog workflow-dialog" onCancel={e=>{e.preventDefault();if(!busy)close()}}><div className="dialog-inner"><div className="dialog-header"><h2>{title}</h2><button type="button" className="icon-button" onClick={close} disabled={busy} aria-label="Close"><X/></button></div>{children}</div></dialog>}
export function ErrorNote({error}:{error:string}){return error?<div className="form-error" role="alert">{error}</div>:null}
export function GPSNote(){return <p className="gps-required"><MapPin size={17}/>Fresh GPS is captured when you save. Allow location access on your phone.</p>}
