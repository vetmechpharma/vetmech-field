'use client';
import {useEffect,useRef,useState} from 'react';
import {request,ErrorNote} from './field-ui';
import {rupees} from '../lib/monthly-report';
import {percentAmount,type EarningsPlan} from '../lib/monthly-earnings';
type Choice={id:string;name:string;packing:string;pts:number|null};
type ProductInput={productId:string;targetQty:string;salaryPercent:string};
type SlabInput={above:string;percent:string};
type Loaded={month:string;email:string;closed:boolean;plan:EarningsPlan|null;expectedTarget:number|null;products:Choice[];history:{revision:number;savedAt:string;savedBy:string;reason:string}[]};
export function MonthlyProductPlan({email,name,month,onSaved}:{email:string;name:string;month:string;onSaved:()=>Promise<void>}) {
 const [data,setData]=useState<Loaded|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reload,setReload]=useState(0);
 const [budget,setBudget]=useState(''),[products,setProducts]=useState<ProductInput[]>([]),[slabs,setSlabs]=useState<SlabInput[]>([]),[reason,setReason]=useState(''),[refreshCosts,setRefreshCosts]=useState(false),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
 const saving=useRef(false);
 useEffect(()=>{let live=true;setLoading(true);setData(null);setError('');
  request<Loaded>('/api/monthly-earnings?mr='+encodeURIComponent(email)+'&month='+month).then(d=>{
   if(!live)return;setData(d);setBudget(d.plan?.salaryBudget==null?'':String(d.plan.salaryBudget/100));
   setProducts((d.plan?.products||[]).map(p=>({productId:p.productId,targetQty:p.targetQty==null?'':String(p.targetQty),salaryPercent:String(p.salaryBps/100)})));
   setSlabs((d.plan?.slabs||[]).map(s=>({above:String(s.above/100),percent:String(s.rateBps/100)})));setReason('');setRefreshCosts(false);setSelected('');
  }).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false};
 },[email,month,reload]);
 const label=(id:string)=>{const c=data?.products.find(p=>p.id===id)||data?.plan?.products.find(p=>p.productId===id);return c?c.name+(c.packing?' · '+c.packing:''):id};
 const rateFor=(id:string)=>{const p=data?.plan?.products.find(p=>p.productId===id);return p&&data?.plan?.version===2&&!refreshCosts?p.targetRate??null:data?.products.find(p=>p.id===id)?.pts??null};
 const valueFor=(p:ProductInput)=>{const qty=Number(p.targetQty),rate=rateFor(p.productId);return Number.isSafeInteger(qty)&&qty>0&&rate!=null&&Number.isSafeInteger(qty*rate)?qty*rate:0};
 const targetPaise=products.reduce((n,p)=>n+valueFor(p),0);
 const plannedSalary=products.reduce((n,p)=>{const amount=valueFor(p),rate=Math.round(Number(p.salaryPercent||0)*100);return n+(Number.isSafeInteger(rate)&&rate>=0&&rate<=10000?percentAmount(amount,rate):0)},0);
 const choices=(data?.products||[]).filter(p=>!products.some(x=>x.productId===p.id)&&(p.name+' '+p.packing).toLowerCase().includes(search.toLowerCase()));
 function changeProduct(index:number,key:'targetQty'|'salaryPercent',value:string){setProducts(rows=>rows.map((p,i)=>i===index?{...p,[key]:value}:p))}
 async function save(){
  if(saving.current||!data)return;
  if(products.some(p=>p.salaryPercent==='')||slabs.some(s=>s.above===''||s.percent==='')){setError('Complete the salary percentages and incentive fields. Leave quantity blank only when no product target is needed.');return}
  saving.current=true;setBusy(true);setError('');setMessage('');
  try{
   const result=await request<{month:string;email:string;revision:number;target:number}>('/api/monthly-earnings',{month,email,salaryBudget:budget===''?null:Number(budget),products:products.map(p=>({productId:p.productId,targetQty:p.targetQty===''?null:Number(p.targetQty),expectedRate:rateFor(p.productId),salaryPercent:Number(p.salaryPercent)})),slabs:slabs.map(s=>({above:Number(s.above),percent:Number(s.percent)})),reason,refreshCostBasis:refreshCosts,expectedRevision:data.plan?.revision||0,expectedTarget:data.expectedTarget});
   if(result.month!==month||result.email!==email||!result.revision)throw new Error('Save confirmation is unavailable. Reload to check before retrying.');
   setMessage('Saved monthly plan revision '+result.revision+' for '+name+' — '+month+'.');window.dispatchEvent(new Event('monthly-targets-updated'));setReload(n=>n+1);
   try{await onSaved()}catch{setError('Plan saved. Refresh the workspace to see the new figures.')}
  }catch(e){setError((e as Error).message)}finally{saving.current=false;setBusy(false)}
 }
 return <section className="monthly-product-plan" aria-label={'Product plan for '+name}>
  <div className="panel-heading"><div><h3>{name} · {month}</h3><p>Quantity targets, salary allocation and incentives. Admin only.</p></div><button type="button" className="secondary" disabled={busy||loading} onClick={()=>setReload(n=>n+1)}>Reload plan</button></div>
  <ErrorNote error={error}/>{message&&<p role="status">{message}</p>}{loading?<p>Loading monthly plan…</p>:data&&<>
   {data.closed&&<p className="closed-report-banner">Month locked. This plan is read-only.</p>}
   {data.plan&&<p className="footnote">Saved revision {data.plan.revision} · {new Date(data.plan.savedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · Saved target {rupees(data.plan.target)}</p>}
   {data.plan?.version===1&&<p className="target-legacy-note">This plan has value targets only. {data.closed?'Its original values are preserved.':'Enter quantities to convert it. Saving replaces the monthly target with the total quantity × PTS value shown below.'}</p>}
   <fieldset disabled={busy||data.closed}>
    <div className="earnings-fields"><div className="quantity-plan-total"><span>MR monthly target · excl. GST</span><strong aria-label="Product plan monthly target">{rupees(data.closed&&data.plan?.version===1?data.plan.target:targetPaise)}</strong><small>Sum of product quantity × saved PTS</small></div><label>Planned salary budget (₹, optional)<input type="number" min="0" max="100000000" step="0.01" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="Planning reference, no earnings cap"/></label></div>
    {data.expectedTarget!=null&&Math.round(data.expectedTarget*100)!==targetPaise&&!data.closed&&<p className="footnote">Current saved monthly target: {rupees(Math.round(data.expectedTarget*100))}. Saving this plan updates it to {rupees(targetPaise)}.</p>}
    <div className="earnings-preview"><div><span>Salary at product targets</span><strong>{rupees(plannedSalary)}</strong></div>{budget!==''&&<div><span>Salary above / below budget</span><strong>{rupees(plannedSalary-Math.round(Number(budget)*100))}</strong></div>}</div>
    <p className="footnote">Paid + free units count toward quantity. Actual approved order net value, excluding GST, counts toward value. Salary % applies to that actual value, without an earnings cap.</p>
    <div className="earnings-add"><label>Find product<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Product name or packing"/></label><label>Product and packing<select aria-label="Choose target product" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select product</option>{choices.map(p=><option key={p.id} value={p.id}>{p.name}{p.packing?' · '+p.packing:''}</option>)}</select></label><button type="button" className="secondary" disabled={!selected||products.some(p=>p.productId===selected)} onClick={()=>{setProducts(p=>[...p,{productId:selected,targetQty:'',salaryPercent:'0'}]);setSelected('')}}>Add product</button></div>
    <div className="earnings-products">{products.map((p,index)=>{const rate=rateFor(p.productId);return <article key={p.productId} className="earnings-product"><div className="earnings-product-heading"><strong>{label(p.productId)}</strong><button type="button" className="secondary" aria-label={'Remove '+label(p.productId)} onClick={()=>setProducts(rows=>rows.filter((_,i)=>i!==index))}>Remove</button></div><div className="earnings-fields"><label>Target quantity · total units<input aria-label={'Target quantity for '+label(p.productId)} type="number" min="1" max="1000000000" step="1" value={p.targetQty} placeholder="Not set" onChange={e=>changeProduct(index,'targetQty',e.target.value)}/></label><label>Salary allocation (%)<input aria-label={'Salary percentage for '+label(p.productId)} type="number" min="0" max="100" step="0.01" value={p.salaryPercent} onChange={e=>changeProduct(index,'salaryPercent',e.target.value)}/></label></div><div className="quantity-price-preview"><div><span>PTS · excl. GST</span><b>{rate==null?'Not configured':rupees(rate)}</b></div><div><span>Target value · excl. GST</span><b>{p.targetQty===''?'Not set':rupees(valueFor(p))}</b></div></div>{data.plan?.version===1&&<small>Previous value target: {rupees(data.plan.products.find(v=>v.productId===p.productId)?.target||0)}</small>}{p.targetQty!==''&&(rate==null||rate<=0)&&<p className="error-note">Set a positive PTS on this product before saving its quantity target.</p>}</article>})}</div>
    {!products.length&&<p>Add products and enter their target units. Monthly value is calculated automatically.</p>}
    <div className="panel-heading"><h3>Additional incentives</h3><button type="button" className="secondary" disabled={slabs.length>=20} onClick={()=>setSlabs(s=>[...s,{above:'',percent:''}])}>Add slab</button></div>
    <p className="footnote">Only the highest qualifying rate applies to total monthly secondary sales. Sales must be strictly above the threshold. Rates are not added together.</p>
    {slabs.map((s,index)=><div className="earnings-slab" key={index}><label>Sales above (₹)<input aria-label={'Incentive threshold '+(index+1)} type="number" min={targetPaise/100} max="100000000" step="0.01" value={s.above} onChange={e=>setSlabs(rows=>rows.map((v,i)=>i===index?{...v,above:e.target.value}:v))}/></label><label>Incentive on total sales (%)<input aria-label={'Incentive percentage '+(index+1)} type="number" min="0.01" max="100" step="0.01" value={s.percent} onChange={e=>setSlabs(rows=>rows.map((v,i)=>i===index?{...v,percent:e.target.value}:v))}/></label><button type="button" className="secondary" aria-label={'Remove incentive slab '+(index+1)} onClick={()=>setSlabs(rows=>rows.filter((_,i)=>i!==index))}>Remove</button></div>)}
    {!slabs.length&&<p className="footnote">No additional incentive configured.</p>}
    <label>Change reason{data.plan?' (required)':''}<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why are these monthly allocations being set or revised?"/></label>
    {data.plan&&<label className="earnings-check"><input type="checkbox" checked={refreshCosts} onChange={e=>setRefreshCosts(e.target.checked)}/>Refresh saved target PTS and profit cost / PTS from current product pricing</label>}
    <p className="footnote">Saving applies this revision to all eligible orders in the open month. Saved PTS keeps target values fixed unless explicitly refreshed. Revisions stay in Admin history; month closing freezes reports.</p>
    <button type="button" className="primary" disabled={busy||!products.length||targetPaise<100||targetPaise>10000000000} onClick={save}>{busy?'Saving…':'Save monthly product plan'}</button>
   </fieldset>
   {!!data.history.length&&<details><summary>Plan revision history ({data.history.length})</summary><ol>{data.history.map(h=><li key={h.revision}><b>Revision {h.revision}</b> · {new Date(h.savedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · {h.savedBy}<p>{h.reason}</p></li>)}</ol></details>}
  </>}
 </section>;
}
