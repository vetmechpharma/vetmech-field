'use client';
import {useEffect,useState} from 'react';
import {Download,Printer,Filter,LoaderCircle} from 'lucide-react';
import {captureView,downloadViewCSV,snapshotReport} from '../lib/view-export';
import {printReport} from '../lib/report-print';

export function ViewTools({title,nativePrint=false,disabled=false}:{title:string;nativePrint?:boolean;disabled?:boolean}) {
  const [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [error,setError] = useState(false);
  useEffect(()=>{setMessage('');setError(false)},[title]);
  async function run(kind:'csv'|'print') {
    const root = document.getElementById('workspace-content');if(!root) return;
    setBusy(true);setMessage('');setError(false);
    try {
      const snapshot = captureView(root,title);
      if(kind === 'csv') { downloadViewCSV(snapshot);setMessage('CSV downloaded for the current selection.'); }
      else {
        const native = root.querySelector<HTMLElement>('.monthly-report');
        await printReport(native || snapshotReport(snapshot),`VETMECH-${title}`);
        setMessage('Print preview opened. Choose Save as PDF to download a PDF.');
      }
    } catch(e) {setError(true);setMessage((e as Error).message)} finally {setBusy(false)}
  }
  return <section className="view-tools no-print" aria-label="Print and export current view">
    <span className="view-tools-context"><Filter size={15} aria-hidden="true"/>Current view · loaded records</span>
    <div className="view-tools-actions">
      {!nativePrint && <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>run('print')}><Printer size={17}/>Print / PDF</button>}
      <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>run('csv')}>{busy?<LoaderCircle className="spin" size={17}/>:<Download size={17}/>}Export CSV</button>
    </div>
    {message && <p role={error?'alert':'status'} className={`view-tools-message${error?' error':''}`}>{message}</p>}
  </section>;
}
