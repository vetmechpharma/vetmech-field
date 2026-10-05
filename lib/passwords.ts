const encoder=new TextEncoder();
export const SESSION_COOKIE='__Host-vetmech-session';
const hex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(bytes instanceof Uint8Array?bytes.buffer:bytes)).map(v=>v.toString(16).padStart(2,'0')).join('');
export async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
export function randomToken(){return hex(crypto.getRandomValues(new Uint8Array(32)));}
export async function passwordHash(password:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bytes=Uint8Array.from(salt.match(/../g)!.map(v=>parseInt(v,16)));
 const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-512',salt:bytes,iterations:100000},key,256);
 return `pbkdf2-sha512$100000$${salt}$${hex(derived)}`;
}
export async function verifyPassword(password:string,stored:string){
 const parts=stored.split('$');if(parts.length!==4||parts[0]!=='pbkdf2-sha512'||parts[1]!=='100000'||!/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;
 const actual=await passwordHash(password,parts[2]);let diff=actual.length^stored.length;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^stored.charCodeAt(i);return diff===0;
}
export function sessionCookie(token:string,maxAge=43200){return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
export function readToken(cookie:string|null){return cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1)||'';}
