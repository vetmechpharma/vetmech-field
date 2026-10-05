// Offline export of a D1 SQL dump or SQLite file. Never connects to production.
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile} from 'node:fs/promises';
import {schema} from './mongo-common.mjs';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/export-sqlite.mjs export.sql data.json (also accepts .sqlite)');
const sql=new DatabaseSync(input.endsWith('.sql')?':memory:':input,{readOnly:!input.endsWith('.sql')});
try{if(input.endsWith('.sql'))sql.exec(await readFile(input,'utf8'));const collections={};for(const [name,cols]of Object.entries(schema)){if(['sessions','login_limits'].includes(name)){collections[name]=[];continue}const existing=sql.prepare('PRAGMA table_info('+name+')').all().map(c=>c.name);if(cols.some(c=>!existing.includes(c.name)))throw Error('Source schema is incomplete: '+name);collections[name]=sql.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()}await writeFile(output,JSON.stringify({format:'vetmech-mongo-v1',exportedAt:new Date().toISOString(),collections}),{mode:0o600,flag:'wx'});console.log('Export saved. Keep it private: it includes customer data and password hashes. All users will sign in again.')}finally{sql.close()}
