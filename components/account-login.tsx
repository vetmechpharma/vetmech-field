'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {ShieldCheck,BriefcaseBusiness,Eye,EyeOff,LoaderCircle,LockKeyhole,ArrowRight} from 'lucide-react';
import {APP_NAME,COMPANY_NAME,BRAND_TAGLINE} from '../lib/branding';
export function AccountLogin(){
 const [role,setRole]=useState<'admin'|'mr'>('mr'),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [resetNotice,setResetNotice]=useState(false);
 useEffect(()=>{const url=new URL(window.location.href);if(url.searchParams.get('reset')==='complete'){setRole('admin');setResetNotice(true);url.searchParams.delete('reset');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}},[]);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const j=await r.json() as {error?:string};if(!r.ok)throw new Error(j.error||'Unable to log in.');location.reload()}catch(e){setError((e as Error).message);setBusy(false)}}
 return <div className="login-page branded-login minimal-login">
  <header className="login-brand brand-header" aria-label={APP_NAME}>
    <div className="brand-identity"><strong>VETMECH <span>Field Force</span></strong><small>MR App <span aria-hidden="true">·</span> {BRAND_TAGLINE}</small></div>
  </header>
  <div className="login-layout">
    <section className="login-intro" aria-labelledby="login-headline">
      <h1 id="login-headline">Every visit.<br/>Every opportunity.<br/><em>Move forward.</em></h1>
    </section>
    <section className="login-panel" aria-labelledby="signin-heading">
      <h2 id="signin-heading">{role==='admin'?'Admin sign in':'MR sign in'}</h2>
      <div className="account-tabs" role="group" aria-label="Choose workspace">
        <button type="button" disabled={busy} aria-pressed={role==='mr'} className={role==='mr'?'primary':'secondary'} onClick={()=>{setRole('mr');setError('')}}><BriefcaseBusiness size={18}/>MR workspace</button>
        <button type="button" disabled={busy} aria-pressed={role==='admin'} className={role==='admin'?'primary':'secondary'} onClick={()=>{setRole('admin');setError('')}}><ShieldCheck size={18}/>Admin</button>
      </div>
      {resetNotice&&<p className="info-box" role="status">Application data reset completed. Sign in with your existing Admin account.</p>}
      <form onSubmit={submit} className="account-form">
        <label htmlFor="login-username">Username<input id="login-username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={50} value={username} onChange={e=>setUsername(e.target.value)} placeholder={role==='admin'?'Enter your Admin username':'Enter your MR username'}/></label>
        <label htmlFor="login-password">Password<div className="password-input"><input id="login-password" type={show?'text':'password'} autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/><button className="icon-button" type="button" aria-label={show?'Hide password':'Show password'} aria-pressed={show} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
        {error&&<div className="form-error" role="alert">{error}</div>}
        <button className="primary full-button login-submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:<LockKeyhole size={17}/>}<span>{busy?'Signing in…':'Sign in to workspace'}</span>{!busy&&<ArrowRight size={18}/>}</button>
      </form>
    </section>
  </div>
  <footer><span>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</span><span>Developed with Love <strong>ANIMItra Softwares</strong></span></footer>
 </div>
}
export function PasswordForm({isMR=false}:{isMR?:boolean}){
 const [currentPassword,setCurrent]=useState(''),[newPassword,setNew]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setError('');if(newPassword!==confirm){setError('New passwords do not match.');return}setBusy(true);try{const r=await fetch('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword,newPassword})});const j=await r.json() as {error?:string};if(!r.ok)throw new Error(j.error||'Unable to change password.');location.reload()}catch(e){setError((e as Error).message);setBusy(false)}}
 return <form className="account-form" onSubmit={submit}><label>Current password<input type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={e=>setCurrent(e.target.value)}/></label><label>New password<input type="password" autoComplete="new-password" required minLength={isMR?1:12} maxLength={128} value={newPassword} onChange={e=>setNew(e.target.value)}/><small>{isMR?'Any non-empty password, up to 128 characters.':'At least 12 characters. A memorable phrase works well.'}</small></label><label>Confirm new password<input type="password" autoComplete="new-password" required minLength={isMR?1:12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><p>After saving, log in again with your new password. All existing sessions will end.</p>{error&&<div className="form-error" role="alert">{error}</div>}<button className="primary" disabled={busy}>{busy?'Saving…':'Change password'}</button></form>
}
