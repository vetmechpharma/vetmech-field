'use client';
import {useState,type FormEvent} from 'react';
import {Trash2,ShieldAlert,RotateCcw} from 'lucide-react';
import {request,ErrorNote} from './field-ui';

type Preview={token:string;expires:number;total:number;adminAccountsKept:number;items:{label:string;count:number}[]};
const confirmationText='DELETE ALL DATA';
export function DataResetPanel({onReset}:{onReset:()=>void}){
 const [preview,setPreview]=useState<Preview|null>(null),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[reason,setReason]=useState(''),[understood,setUnderstood]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 function clear(){setPreview(null);setPassword('');setConfirmation('');setUnderstood(false);}
 async function review(){setBusy(true);setError('');clear();try{setPreview(await request<Preview>('/api/admin-reset',{action:'preview'}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function reset(e:FormEvent){
  e.preventDefault();if(!preview||!understood||confirmation!==confirmationText||!password||reason.trim().length<3)return;
  setBusy(true);setError('');try{await request('/api/admin-reset',{action:'reset',token:preview.token,password,reason,confirmation,understood});clear();setDone(true);onReset();}
  catch(e){clear();setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel field-panel data-reset-panel no-print" aria-labelledby="data-reset-heading">
  <div className="panel-heading"><div><h2 id="data-reset-heading"><ShieldAlert size={21}/>Reset application data</h2><p>Start Field Force again with empty business records.</p></div></div>
  <ErrorNote error={error}/>
  {done?<p className="info-box" role="status">Application data cleared. All sessions have ended. Sign in again with your existing Admin username and password.</p>:<>
   <div className="reset-scope"><div><strong>Will be deleted</strong><p>All MR accounts and photos, customers, products, stockists, territories, orders, stock, samples, gifts, visits, attendance, tours, targets, drafts, approvals, communication logs and old activity history.</p></div><div><strong>Will be kept</strong><p>Admin accounts and passwords, WhatsApp/SMTP configuration and templates, backup settings, security controls and one reset receipt. Other applications and databases are unaffected.</p></div></div>
   <p className="reset-warning">Closed months, saved monthly reports and month locks are included. This cannot be undone in the app. Recovery requires an existing external backup. Messages already sent cannot be recalled.</p>
   {!preview?<button type="button" className="secondary reset-review-button" disabled={busy} onClick={review}><Trash2 size={17}/>{busy?'Loading counts…':'Review all data for reset'}</button>:<form onSubmit={reset}>
    <div className="reset-review-heading"><h3>Deletion preview · {preview.total.toLocaleString('en-IN')} stored entries</h3><span>{preview.adminAccountsKept} Admin account{preview.adminAccountsKept===1?'':'s'} kept</span></div>
    <div className="reset-counts" aria-label="Records to delete">{preview.items.map((item,index)=><div key={item.label+index}><span>{item.label}</span><strong>{item.count.toLocaleString('en-IN')}</strong></div>)}</div>
    <p className="footnote">Each stored entry is counted separately. Review expires in 10 minutes; any data change requires a fresh review. All users, including Admin, will be signed out.</p>
    <div className="form-grid"><label>Reason for reset<input required minLength={3} maxLength={500} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Clear test entries before launch"/></label><label>Current Admin password<input type="password" required maxLength={128} autoComplete="current-password" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/></label></div>
    <label>Type DELETE ALL DATA to confirm<input className="reset-confirmation" required autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
    <label className="reset-acknowledgement"><input type="checkbox" checked={understood} disabled={busy} onChange={e=>setUnderstood(e.target.checked)}/><span>I understand that all listed data, including closed reports, will be permanently deleted.</span></label>
    <div className="reset-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>{clear();setError('');}}>Cancel</button><button type="button" className="secondary" disabled={busy} onClick={review}><RotateCcw size={16}/>Refresh counts</button><button className="reset-delete-button" disabled={busy||!password||reason.trim().length<3||confirmation!==confirmationText||!understood}>{busy?'Resetting…':'Permanently delete all application data'}</button></div>
   </form>}
  </>}
 </section>;
}
