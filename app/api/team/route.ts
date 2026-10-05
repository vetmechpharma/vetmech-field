import {z} from 'zod';
import {admin,db,json,failure,sameOrigin,notification,HttpError} from '../../../lib/server';
import {passwordHash} from '../../../lib/passwords';
import {OWNER_EMAIL,type Member} from '../../../lib/permissions';
const ids=z.array(z.string().min(1).max(100)).max(200).optional();
const short=z.string().trim().max(100).default('');
const schema=z.object({route_ids:ids,district_ids:ids,stockist_ids:ids,email:z.string().email().transform(s=>s.toLowerCase().trim()).or(z.literal('')).optional(),username:z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/).optional(),password:z.string().min(12).max(128).or(z.literal('')).optional(),name:z.string().trim().min(2).max(100),territory:short,target:z.number().int().min(1).max(100000000),status:z.enum(['active','disabled']),mr_type:short,district:short,headquarters:short,route:short,phone:z.string().max(30).default(''),employee_code:short});
export async function GET(){try{await admin();return json({members:(await db().prepare('SELECT m.*, c.username FROM members m LEFT JOIN credentials c ON c.email=m.email ORDER BY m.role, m.name').all()).results})}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 sameOrigin(req);await admin();const parsed=schema.safeParse(await req.json());if(!parsed.success)throw new HttpError(400,'Enter a name, valid username, password of at least 12 characters and a positive monthly target.');const b=parsed.data;const email=b.email|| (b.username?b.username+'@mr.vetmech.invalid':'');if(!email)throw new HttpError(400,'Enter an MR username.');if(email===OWNER_EMAIL)throw new HttpError(400,'The owner account cannot be changed here.');
 const old=await db().prepare('SELECT * FROM members WHERE email = ?').bind(email).first<Member>();
 const login=await db().prepare('SELECT username FROM credentials WHERE email=?').bind(email).first<{username:string}>();
 if(!login&&(!b.username||!b.password))throw new HttpError(400,'A new MR needs a username and password of at least 12 characters.');
 if(b.username){const used=await db().prepare('SELECT email FROM credentials WHERE username=? AND email<>?').bind(b.username,email).first();if(used)throw new HttpError(409,'This username is already in use.');}
 const all=(await db().prepare("SELECT id,kind,data FROM records WHERE kind IN ('Routes','Districts','Stockists')").all<{id:string;kind:string;data:string}>()).results;
 const chosenRoutes=b.route_ids??JSON.parse(old?.route_ids||'[]'),chosenDistricts=b.district_ids??JSON.parse(old?.district_ids||'[]'),chosenStockists=b.stockist_ids??JSON.parse(old?.stockist_ids||'[]');
 for(const [chosen,kind] of [[chosenRoutes,'Routes'],[chosenDistricts,'Districts'],[chosenStockists,'Stockists']] as [string[],string][]){if(chosen.some(id=>!all.some(r=>r.id===id&&r.kind===kind)))throw new HttpError(400,`Select valid ${kind.toLowerCase()}.`);}
 const derivedDistricts=all.filter(r=>r.kind==='Districts'&&chosenRoutes.some((id:string)=>{const route=all.find(x=>x.id===id);return route&&JSON.parse(route.data).District===JSON.parse(r.data).Name})).map(r=>r.id);
 const districtIds=[...new Set([...chosenDistricts,...derivedDistricts])];
 const statements=[db().prepare('INSERT INTO members (email,name,role,status,territory,target,created,mr_type,district,headquarters,route,phone,employee_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,status=excluded.status,territory=excluded.territory,target=excluded.target,mr_type=excluded.mr_type,district=excluded.district,headquarters=excluded.headquarters,route=excluded.route,phone=excluded.phone,employee_code=excluded.employee_code').bind(email,b.name,'mr',b.status,b.territory,b.target,new Date().toISOString(),b.mr_type||'Medical Representative',b.district,b.headquarters,b.route,b.phone,b.employee_code)];
 statements.push(db().prepare('UPDATE members SET route_ids=?,district_ids=?,stockist_ids=? WHERE email=?').bind(JSON.stringify(chosenRoutes),JSON.stringify(districtIds),JSON.stringify(chosenStockists),email));
 statements.push(db().prepare('UPDATE members SET user_id=? WHERE email=? AND user_id IS NULL').bind(crypto.randomUUID(),email));
 if(b.password)statements.push(db().prepare('INSERT INTO credentials (email,username,password_hash,updated) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash,updated=excluded.updated').bind(email,b.username||login!.username,await passwordHash(b.password),new Date().toISOString()));
 else if(b.username)statements.push(db().prepare('UPDATE credentials SET username=? WHERE email=?').bind(b.username,email));
 if(b.password||b.status==='disabled')statements.push(db().prepare('DELETE FROM sessions WHERE email=?').bind(email));
 if(old&&old.name!==b.name)statements.push(db().prepare("UPDATE records SET data = json_set(data,'$.Representative',?) WHERE assigned_to = ?").bind(b.name,email));
 if(b.status==='active')statements.push(notification(email,old?'Profile updated':'Welcome to VETMECH Field',old?'Your Admin updated your profile, route or target.':'Your MR account is ready. Start with your assigned doctors.','Dashboard'));
 await db().batch(statements);return json({ok:true})
}catch(e){return failure(e)}}
