 'use client';
import {useEffect,useRef,useState} from 'react';
import {request,ErrorNote} from './field-ui';
import {today} from '../lib/ui-config';
import type {Member} from '../lib/permissions';
export function MonthlyTargetSetup({team,refresh}:{team:Member[];refresh:()=>Promise<void>}){
 const [current,setCurrent]=useState(today().slice(0,7)),[month,setMonth]=useState(today().slice(0,7)),[targets,setTargets]=useState<Record<string,string>>({}),[closed,setClosed]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[loadFailed,setLoadFailed]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const saving=useRef(false);
 const [saved,setSaved]=useState<Record<string,number|null>>({}),[revision,setRevision]=useState(0);
 const reps=team.filter(m=>m.role==='mr'&&m.status==='active');const repKey=reps.map(m=>m.email).sort().join('|');
 useEffect(()=>{const id=setInterval(()=>setCurrent(today().slice(0,7)),60000);return()=>clearInterval(id)},[]);
 useEffect(()=>{setMonth(current)},[current]);
 useEffect(()=>{let live=true;setLoading(true);setLoadFailed(false);setMessage('');setTargets({});request<any>(`/api/monthly-report?summary=1&month=${month}`).then(d=>{if(!live)return;const values:Record<string,string>={};for(const m of reps){const summary=d.summaries.find((s:any)=>s.email===m.email);values[m.email]=summary?.targetSaved?String(summary.target/100):''}setTargets(values);setSaved(Object.fromEntries(reps.map(m=>[m.email,values[m.email]?Number(values[m.email]):null])));setClosed(!!d.closed);setError('')}).catch(e=>{if(live){setError(e.message);setLoadFailed(true)}}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[month,repKey,revision]);
 async function save(email:string){
  if(saving.current)return;
  const target=Number(targets[email]);if(!Number.isFinite(target)||target<1||target>100000000){setError('Enter a target between ₹1 and ₹10,00,00,000 for this MR.');return}
  saving.current=true;setBusy(true);setError('');setMessage('');
  try{
   const result=await request<{month:string;targets:{email:string;target:number}[]}>('/api/monthly-report',{month,email,target,expectedTarget:saved[email]??null});
   const confirmed=result.targets?.find(t=>t.email===email);
   if(result.month!==month||!confirmed||!Number.isFinite(confirmed.target))throw new Error('Save confirmation is unavailable. Reload targets to check before retrying.');
   setSaved(v=>({...v,[email]:confirmed.target}));setTargets(v=>({...v,[email]:String(confirmed.target)}));
   setMessage(`Saved ₹${confirmed.target.toLocaleString('en-IN')} for ${reps.find(m=>m.email===email)?.name} — ${month}.`);
   window.dispatchEvent(new Event('monthly-targets-updated'));
   try{await refresh()}catch{setError('Target was saved, but the workspace could not refresh. Reload the page to see the updated figures.')}
  }catch(e){setError((e as Error).message)}finally{saving.current=false;setBusy(false)}
 }
 if(!reps.length)return null;
 return <section className="panel monthly-setup"><div className="panel-heading"><div><h2>MR monthly targets</h2><p>Set each MR’s target independently for the selected month. Targets are not shared or carried forward.</p></div><label>Target month<input type="month" disabled={busy} value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}}/></label></div><button type="button" className="secondary" disabled={busy||loading} onClick={()=>setRevision(r=>r+1)}>Reload saved targets</button><ErrorNote error={error}/>{message&&<p role="status">{message}</p>}{loading?<p>Loading monthly targets…</p>:<fieldset disabled={busy||closed||loadFailed}><div className="monthly-allocations">{reps.map(m=><div key={m.email}><label>{m.name}<input aria-label={`Monthly target for ${m.name}`} type="number" min="1" max="100000000" step="0.01" value={targets[m.email]||''} onChange={e=>setTargets({...targets,[m.email]:e.target.value})}/></label><small>{saved[m.email]==null?'Not set for this month':`Saved: ₹${saved[m.email]!.toLocaleString('en-IN')}`}{saved[m.email]!=null&&Number(targets[m.email])!==saved[m.email]?' · Unsaved change':''}</small><button type="button" className="primary" onClick={()=>save(m.email)} aria-label={`Save target for ${m.name}`}>{busy?'Saving…':'Save target'}</button></div>)}</div></fieldset>}{closed&&<p>This month is closed. Targets cannot be edited.</p>}</section>
}
