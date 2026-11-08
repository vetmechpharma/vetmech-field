'use client';
import {useEffect,useState} from 'react';
import {RefreshCw,Target} from 'lucide-react';
import type {ProductProgress} from '../lib/monthly-earnings';
import {request} from './field-ui';

type Loaded={month:string;rows:ProductProgress[];closed:boolean};
type TargetState={status:'disabled'|'loading'|'ready'|'error';rows:ProductProgress[];closed:boolean;refresh:()=>void};

/** One scoped request per open order/month, shared by all of its product lines. */
export function useOrderProductTargets(enabled:boolean,month:string):TargetState {
 const [loaded,setLoaded]=useState<Loaded|null>(null),[failed,setFailed]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!enabled)return;
  const refresh=()=>setRevision(n=>n+1);
  window.addEventListener('focus',refresh);
  window.addEventListener('monthly-targets-updated',refresh);
  return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('monthly-targets-updated',refresh)};
 },[enabled]);
 useEffect(()=>{
  let live=true;setLoaded(null);setFailed('');
  if(!enabled)return()=>{live=false};
  request<{month:string;summaries:{productTargets?:ProductProgress[]}[];closed?:boolean}>(`/api/monthly-report?summary=1&month=${encodeURIComponent(month)}`).then(data=>{
   if(!live)return;
   // The authenticated MR endpoint must return only this MR, never a team aggregate.
   if(data.month!==month||!Array.isArray(data.summaries)||data.summaries.length!==1||!Array.isArray(data.summaries[0].productTargets))throw new Error('Target progress unavailable');
   setLoaded({month,rows:data.summaries[0].productTargets,closed:!!data.closed});
  }).catch(()=>{if(live)setFailed(month)});
  return()=>{live=false};
 },[enabled,month,revision]);
 return {status:!enabled?'disabled':failed===month?'error':loaded?.month===month?'ready':'loading',rows:enabled&&loaded?.month===month?loaded.rows:[],closed:!!loaded?.closed,refresh:()=>setRevision(n=>n+1)};
}

export function OrderProductTarget({state,productId,month,editingApproved=false}:{state:TargetState;productId:string;month:string;editingApproved?:boolean}) {
 if(!productId||state.status==='disabled')return null;
 const p=state.rows.find(p=>p.productId===productId),target=p?.targetQty??null,achieved=p?p.achievedQty??null:0;
 const pending=target==null||achieved==null?null:Math.max(0,target-achieved),percentage=target&&achieved!=null?achieved/target*100:null;
 const complete=target!=null&&pending===0;
 const monthLabel=/^\d{4}-\d{2}$/.test(month)?new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN',{month:'short',year:'numeric',timeZone:'Asia/Kolkata'}):month;
 return <section className={'order-product-target'+(complete?' target-met':'')} aria-label="Monthly product quantity target" data-product-id={productId}>
  <div className="order-target-heading"><strong><Target size={15}/>Your target · {monthLabel}</strong>{state.status==='ready'&&<span className="order-target-badge">{target==null?'No quantity target':complete?'Qty target met':'Qty target pending'}</span>}<button type="button" className="order-target-refresh" aria-label="Refresh product targets" disabled={state.status==='loading'} onClick={state.refresh}><RefreshCw size={15}/></button></div>
  <div aria-live="polite">
   {state.status==='loading'?<p className="order-target-message">Loading target quantities…</p>:state.status==='error'?<p className="order-target-message">Target progress unavailable. <button type="button" onClick={state.refresh}>Retry</button></p>:<>
    <dl className="order-target-quantities"><div className="order-target-goal"><dt>Target qty</dt><dd>{target==null?'Not set':target.toLocaleString('en-IN')}</dd></div><div className="order-target-achieved"><dt>Achieved qty</dt><dd>{achieved==null?'Not recorded':achieved.toLocaleString('en-IN')}</dd></div><div className="order-target-pending"><dt>Pending qty</dt><dd>{pending==null?'—':pending.toLocaleString('en-IN')}</dd></div></dl>
    {percentage!=null&&<div className="order-target-bar" role="progressbar" aria-label="Quantity target achievement" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.max(0,percentage))} aria-valuetext={`${achieved} of ${target} units; ${percentage.toFixed(1)}%`}><i style={{width:Math.min(100,Math.max(0,percentage))+'%'}}/></div>}
    <p className="order-target-note">Paid + free units · Approved orders only.{state.closed?' Locked month.':editingApproved?' Includes this approved order; edits count after approval.':' This draft is not counted.'}</p>
   </>}
  </div>
 </section>;
}
