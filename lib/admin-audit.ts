import {db} from './server';
import type {Member} from './permissions';
export function audit(actor:Member,action:string,kind:string,id:string,before:unknown,after:unknown,reason:string){return db().prepare('INSERT INTO admin_audit(id,actor_email,actor_name,action,entity_kind,entity_id,before_data,after_data,reason,created) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor.email,actor.name,action,kind,id,JSON.stringify(before??null),JSON.stringify(after??null),reason,new Date().toISOString())}
