const [port,release]=process.argv.slice(2);
if(!/^\d+$/.test(port||'')||+port<1024||+port>65535||!/^[a-f0-9]{40}$/.test(release||''))throw Error('Expected internal port and full release SHA');
for(let attempt=0;attempt<30;attempt++){
 try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(3000),redirect:'error'});const d=await r.json();if(r.ok&&d.status==='ok'&&d.release===release){console.log('Release health check passed.');process.exit(0)}}catch{}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
console.error('Release health check failed.');process.exit(1);
