'use client';
import {useState,useEffect} from 'react';
import {formatPrice as money} from '../lib/product-pricing';
import {COMPANY_STOCK_ID} from '../lib/supply';

export function DirectProposals({admin,refresh,showReviewed=false,refreshVersion=0}:{admin:boolean;refresh:()=>Promise<void>;showReviewed?:boolean;refreshVersion?:number}){
 const [requests,R]=useState<any[]>([]),[error,E]=useState(''),[busy,B]=useState(''),[reasons,setReasons]=useState<Record<string,string>>({});
 async function load(){const r=await fetch('/api/field-planning'),d=await r.json() as any;if(!r.ok)throw Error(d.error);R((d.requests||[]).filter((r:any)=>['direct_order','custom_scheme'].includes(r.kind)));E('')}
 useEffect(()=>{load().catch(e=>E(e.message))},[refreshVersion]);
 async function review(request:any,approve:boolean){B(request.id);E('');try{
  const custom=request.kind==='custom_scheme',reason=reasons[request.id]?.trim()||'';
  if(custom&&!approve&&reason.length<3)throw Error('Enter a rejection reason of at least 3 characters.');
  const action=custom?(approve?'approveCustomScheme':'rejectCustomScheme'):(approve?'approveDirect':'rejectDirect');
  const r=await fetch('/api/commerce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,requestId:request.id,reason})}),d=await r.json() as any;if(!r.ok)throw Error(d.error);await load();await refresh()
 }catch(e){E((e as Error).message)}finally{B('')}}
 const visible=requests.filter(r=>showReviewed||r.status==='Pending');if(!visible.length&&!error)return null;
 return <section className="direct-proposals" aria-label="Scheme and pricing requests"><h3>Scheme & pricing requests · {visible.length}</h3>{error&&<p className="form-error" role="alert">{error}</p>}{visible.map(r=>{
  const custom=r.kind==='custom_scheme',company=r.body.input.stockistId===COMPANY_STOCK_ID||!r.body.input.stockistId;
  return <details className="panel invoice-card" key={r.id}><summary><span><b>{custom?'Custom scheme':'Direct pricing proposal'} · {r.body.customer}</b><small>{r.body.input.number||`ORD-${r.body.input.date.replaceAll('-','')}-${r.id.slice(0,8).toUpperCase()}`} · {r.body.input.date} · {r.body.mr}</small></span><b className="badge">{custom&&r.status==='Pending'?'Custom scheme pending':r.status}</b></summary>
   <div className="invoice-lines"><p>{r.body.mr} · {r.body.input.date} · {company?'Direct company':r.body.supply||'Selected stockist'}</p>
    <div className="table-scroll"><table><thead><tr><th>Product / packing</th><th>Requested scheme</th><th>Paid qty</th><th>Free qty</th><th>Base → proposed rate<br/>excl. GST</th><th>Units to reserve</th></tr></thead><tbody>{r.body.items.map((l:any,i:number)=><tr key={l.productId}><td>{l.name}<small>{l.packing||''}</small></td><td>{l.schemeLabel||l.schemeNote||'No scheme'}</td><td>{l.qty}</td><td>{r.body.original[i].free} → <b>{l.free}</b></td><td>{money(r.body.original[i].rate/100)} → <b>{money(l.rate/100)}</b></td><td>{l.qty+l.free}</td></tr>)}</tbody></table></div>
    <p>Order total including GST: {money(r.body.original.reduce((n:number,l:any)=>n+l.total,0)/100)} → <b>{money(r.body.items.reduce((n:number,l:any)=>n+l.total,0)/100)}</b></p>
    {custom?<p className="info-box">Scheme approval is step 1. Separate order approval is still required before {company?'company completion':'forwarding to the stockist'}. No stock is reserved until the scheme is approved.</p>:<p>No agency stock changes. Approval records the requested quantities. Unexpired company stock is checked when completing supply.</p>}
    {r.body.input.notes&&<p>Request note: {r.body.input.notes}</p>}
    {admin&&r.status==='Pending'&&<><label>Review note<input maxLength={1000} value={reasons[r.id]||''} placeholder="Reason required when rejecting a custom scheme" onChange={e=>setReasons({...reasons,[r.id]:e.target.value})}/></label><div className="field-actions"><button className="primary" disabled={!!busy} onClick={()=>review(r,true)}>{custom?'Approve custom scheme':'Approve company order & pricing'}</button><button className="secondary" disabled={!!busy} onClick={()=>review(r,false)}>Reject</button></div></>}
    {r.reason&&<p>{r.reason}</p>}{custom&&r.status==='Rejected'&&<p>Revise the offer in a new order request, or select an approved product scheme.</p>}
   </div>
  </details>
 })}</section>
}
export function OrderHistory({customerId}:{customerId:string}){const [data,D]=useState<any>(null),[error,E]=useState('');useEffect(()=>{let active=true;D(null);E('');fetch('/api/customer-history?customer='+encodeURIComponent(customerId)).then(async r=>{const d=await r.json() as any;if(!r.ok)throw Error(d.error);if(active)D(d)}).catch(e=>{if(active)E(e.message)});return()=>{active=false}},[customerId]);return <details className="panel invoice-card"><summary>Previous orders · company & stockists</summary><div className="invoice-lines">{error?<p>{error}</p>:!data?<p>Loading history…</p>:data.orders.length?<div className="table-scroll"><table><thead><tr><th>Date</th><th>Order</th><th>Supply</th><th>Products / rates</th><th>Status</th><th>Total</th></tr></thead><tbody>{data.orders.map((o:any)=><tr key={o.id}><td>{o.date}</td><td>{o.number}</td><td>{o.agency}</td><td>{o.items.map((l:any)=>`${l.name}: ${l.qty} + ${l.free} free @ ${money(l.rate/100)}`).join('; ')}</td><td>{o.stage||o.status}</td><td>{money(o.total/100)}</td></tr>)}</tbody></table></div>:<p>No previous orders.</p>}</div></details>}
