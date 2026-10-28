const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();function load(p){p=path.resolve(p);if(cache.has(p))return cache.get(p);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n.startsWith('.')?load(path.resolve(path.dirname(p),n+'.ts')):require(n),m,m.exports);cache.set(p,m.exports);return m.exports;}
const {dailyPoints,validDay,routeChunks}=load('lib/daily-map.ts');
assert(validDay('2028-02-29'));assert(!validDay('2026-02-29'));assert(!validDay('2026-13-01'));assert(!validDay('2026-1-01'));
const day='2030-04-10',g=(hour,lat=11,lng=77)=>({lat,lng,accuracy:12,capturedAt:`${day}T${hour}:00:00+05:30`});
const rows=[{id:'v',kind:'Visits',created:g('09').capturedAt,data:{Customer:'Dr Example','GPS data':JSON.stringify(g('10')),'Closing GPS':JSON.stringify(g('11',11.01)),'Opening location address':'Opening place','Location address':'Closing place'}},{id:'out',kind:'Attendance',created:g('18').capturedAt,data:{Action:'Check out','GPS data':JSON.stringify(g('18',11.1))}},{id:'in',kind:'Attendance',created:g('08').capturedAt,data:{Action:'Check in','GPS data':JSON.stringify(g('08'))}},{id:'bad',kind:'Visits',created:g('09').capturedAt,data:{Location:'91,77'}}];
const d=dailyPoints(rows,day);assert.deepEqual(d.points.map(p=>p.kind),['Check in','Visit','Visit close','Check out']);assert.equal(d.visits,1);assert.equal(d.missingGPS,1);assert.equal(d.points[1].address,'Opening place');assert.equal(d.points[2].address,'Closing place');assert(d.straightKm>11&&d.straightKm<12);
const old=dailyPoints([{...rows[0],data:{...rows[0].data,'Opening location address':''}}],day);assert.equal(old.points[0].address,'');
assert.equal(dailyPoints([{...rows[0],data:{...rows[0].data,'Closing GPS':JSON.stringify(g('10'))}}],day).points.length,1);
assert.equal(dailyPoints([{id:'legacy',kind:'Attendance',created:'2030-04-09T18:45:00Z',data:{Location:'11,77'}}],day).points.length,1);
assert.equal(dailyPoints([{id:'wrong-day',kind:'Attendance',created:'2030-04-09T18:29:00Z',data:{Location:'11,77'}}],day).points.length,0);
assert.equal(dailyPoints([{id:'same',kind:'Attendance',created:g('08').capturedAt,data:{'GPS data':JSON.stringify(g('08'))}}],day).straightKm,0);
const many=Array.from({length:60},(_,i)=>i),chunks=routeChunks(many);assert.deepEqual(chunks.map(c=>c.length),[27,27,8]);assert.equal(chunks[0].at(-1),chunks[1][0]);assert.equal(chunks[1].at(-1),chunks[2][0]);assert.equal(chunks.reduce((sum,c)=>sum+c.length-1,0),59);
console.log('PASS: daily GPS chronology, IST boundaries, invalid GPS, separate opening/closing addresses, duplicate capture suppression, straight-line distance and complete multi-request route coverage.');

const captures=dailyPoints([...rows,{id:'customer-capture',kind:'Customer GPS capture',created:g('12').capturedAt,data:{Customer:'New customer','Customer ID':'c1',Location:'11.05, 77','Location captured at':g('12').capturedAt,'Legacy attribution':'Yes'}}],day);
assert.equal(captures.points.length,5);assert.equal(captures.visits,1);assert.equal(captures.points[3].kind,'Customer capture');assert.equal(captures.points[3].name,'New customer');assert(captures.points[3].legacyAttribution);
assert.equal(dailyPoints([{id:'c',kind:'Customer GPS capture',created:g('12').capturedAt,data:{Location:'11,77','Location captured at':'2030-04-09T10:00:00Z'}}],day).points.length,0);

const {customerPhone}=load('lib/customer-phone.ts');
for(const input of ['9876543210','919876543210','+91 98765 43210','00919876543210','91919876543210','09876543210'])assert.equal(customerPhone(input),'+919876543210');
assert.equal(customerPhone('9123456789'),'+919123456789');assert.equal(customerPhone(''),'');assert.equal(customerPhone('+442079460958'),'+442079460958');assert.equal(customerPhone('123'), '123');
