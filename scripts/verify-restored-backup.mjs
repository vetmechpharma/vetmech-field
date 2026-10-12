// Verify restored files before importing to a NEW database. Never restores production.
import {readFile,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const dir=await realpath(process.argv[2]||'');const m=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
if(m.format!==1||m.database!=='vetmech_field')throw Error('Unexpected backup format');
const required=['source.tar','application.env','service.txt','nginx.conf','database.archive.gz'];
for(const f of required){if(!/^[a-f0-9]{64}$/.test(m.checksums?.[f]||''))throw Error('Missing checksum: '+f);const p=await realpath(path.join(dir,f));if(path.dirname(p)!==dir||!(await stat(p)).isFile())throw Error('Invalid restored file');if(createHash('sha256').update(await readFile(p)).digest('hex')!==m.checksums[f])throw Error('Checksum mismatch: '+f);}
console.log('All required restored files match their manifest. Release '+m.revision+'. Next: restore database into an isolated test database and verify app workflows. This is not yet a complete recovery drill.');
