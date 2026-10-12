import type {Member} from './permissions';
export function accessRoute(m:Member,d:Record<string,string>){try{const routes=JSON.parse(m.route_ids||'[]'),id=JSON.parse(d['MR route access']||'{}')[m.email];return typeof id==='string'&&routes.includes(id)?id:''}catch{return ''}}
