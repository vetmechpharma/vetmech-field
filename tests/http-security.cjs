const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{pbkdf2Sync}=require('node:crypto');
function load(file){const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m);return m.exports;}
const {readJSON}=load('lib/http-input.ts'),passwords=load('lib/passwords.ts');
const req=(body,headers={})=>new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json',...headers},body});
async function rejects(request,status,limit){await assert.rejects(()=>readJSON(request,limit),e=>e.status===status);}
(async()=>{
 assert.deepEqual(await readJSON(req('{"name":"தமிழ்"}')), {name:'தமிழ்'});
 await rejects(req('null'),400);await rejects(req('[]'),400);await rejects(req('{'),400);
 await rejects(req('{}',{'content-type':'text/plain'}),415);
 await rejects(req('{}',{'content-length':'10000'}),413,100);
 await rejects(req(' '.repeat(101),{'content-length':'1'}),413,100);
 let cancelled=false;
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"a":"'));c.enqueue(new Uint8Array(200));},cancel(){cancelled=true;}});
 await rejects(new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'}),413,100);assert(cancelled);
 await rejects(req(new Uint8Array([123,255,125])),400);
 const secret='synthetic-test-only',salt='00112233445566778899aabbccddeeff';
 const legacy='pbkdf2-sha512$100000$'+salt+'$'+pbkdf2Sync(secret,Buffer.from(salt,'hex'),100000,32,'sha512').toString('hex');
 assert(await passwords.verifyPassword(secret,legacy));assert(passwords.needsPasswordUpgrade(legacy));
 const current=await passwords.passwordHash(secret);assert(current.startsWith('pbkdf2-sha512$220000$'));assert(await passwords.verifyPassword(secret,current));assert(!await passwords.verifyPassword('wrong',current));assert(!passwords.needsPasswordUpgrade(current));
 assert(!await passwords.verifyPassword(secret,current.replace('$220000$','$999999999$')));
 console.log('PASS: malformed/non-object JSON, content type, streamed byte limits with absent/forged lengths, cancellation, UTF-8 and backward-compatible password hashing.');
})().catch(e=>{console.error(e);process.exitCode=1});
