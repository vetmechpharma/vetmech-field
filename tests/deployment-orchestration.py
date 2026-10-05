"""Test the real deployment shell's control flow with isolated command doubles.
Does not call systemctl, GitHub, pnpm, MongoDB or the actual /opt installation.
Run inside an isolated root test container (the script itself requires root).
"""
import io, os, pathlib, subprocess, tarfile, tempfile
if os.geteuid()!=0:
    raise SystemExit('Run this orchestration test in an isolated root test container.')
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='vetmech-deploy-test-') as tmp:
    base=pathlib.Path(tmp); app=base/'app'; bin=base/'bin'; bin.mkdir()
    for d in ['repository/.git','shared','releases']: (app/d).mkdir(parents=True,exist_ok=True)
    (app/'shared/.env').write_text('PORT=3010\n')
    log=base/'commands.log'
    def exe(name,body):
        p=bin/name;p.write_text(body);p.chmod(0o755)
    exe('runuser','#!/bin/bash\nwhile [[ "$1" != -- ]]; do shift; done\nshift\nexec "$@"\n')
    exe('install','#!/bin/bash\nmkdir -p "${@: -1}"\n')
    exe('git','''#!/usr/bin/env python3
import os,sys,tarfile,io
a=sys.argv[3:]
if a[0]=='status': print(' M dirty' if os.environ.get('DIRTY') else '',end='')
elif a[0]=='branch': print('main')
elif a[0]=='rev-parse': print(os.environ['FAKE_SHA'])
elif a[0]=='pull': pass
elif a[0]=='archive':
 with tarfile.open(fileobj=sys.stdout.buffer,mode='w|') as t:
  for name in ['package.json','scripts/mongo-preflight.mjs','scripts/wait-healthy.mjs']:
   v=b'fixture'; i=tarfile.TarInfo(name);i.size=len(v);t.addfile(i,io.BytesIO(v))
else: raise SystemExit('Unexpected git call '+str(a))
''')
    exe('pnpm','''#!/bin/bash
if [[ "$1" == build ]]; then
 [[ "${FAIL_BUILD:-}" != 1 ]] || exit 7
 mkdir -p .next/standalone
 touch .next/standalone/server.js
fi
''')
    exe('node','''#!/bin/bash
if [[ "$*" == *'-e '* ]]; then printf 3010
elif [[ "$1" == *wait-healthy.mjs && "$3" == "${FAIL_HEALTH_SHA:-never}" ]]; then exit 9
fi
''')
    exe('systemctl','#!/bin/bash\nprintf "%s\\n" "$*" >> "$FAKE_LOG"\n')
    script=base/'deploy.sh';source=(root/'deploy/deploy-from-github.sh').read_text()
    script.write_text(source.replace('APP_ROOT=/opt/vetmech-field',f'APP_ROOT={app}').replace('/run/lock/vetmech-field-deploy.lock',str(base/'lock')))
    env={**os.environ,'PATH':str(bin)+':'+os.environ['PATH'],'FAKE_LOG':str(log)}
    def run(sha,*args,**extra):
        return subprocess.run(['bash',str(script),*args],env={**env,'FAKE_SHA':sha,**extra},capture_output=True,text=True)
    first='a'*40;second='b'*40;third='c'*40
    r=run(first);assert r.returncode==0,r.stderr;old=(app/'current').resolve()
    r=run(second);assert r.returncode==0,r.stderr;live=(app/'current').resolve();assert live!=old
    assert (app/'previous').resolve()==old
    calls=log.read_text()
    r=run(third,FAIL_BUILD='1');assert r.returncode!=0;assert (app/'current').resolve()==live;assert log.read_text()==calls
    # New commit ID avoids reusing the failed staging directory from the prior test.
    fourth='d'*40
    r=run(fourth,FAIL_HEALTH_SHA=fourth);assert r.returncode!=0,r.stdout;assert (app/'current').resolve()==live
    assert 'Previous application release restored' in r.stderr
    r=run(second,'--rollback');assert r.returncode==0,r.stderr;assert (app/'current').resolve()==old
    calls=log.read_text();r=run(third,DIRTY='1');assert r.returncode!=0;assert log.read_text()==calls
    assert '8001' not in log.read_text()
    print('PASS: initial deploy, update, previous release, failed-build isolation, failed-health rollback, manual rollback and dirty-checkout refusal. Service/dependencies were simulated.')
