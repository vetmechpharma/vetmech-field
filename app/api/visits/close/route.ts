import {periodGuard} from '../../../../lib/periods';
import {z} from 'zod';
import {member,db,json,failure,sameOrigin,HttpError} from '../../../../lib/server';
import {record,customer,requireGPS,activeDay,issueStatements,ledgerFailure,indiaDay,guard} from '../../../../lib/operations';
import {gpsString} from '../../../../lib/field-rules';
import {sendWhatsApp} from '../../../../lib/whatsapp';
const item=z.object({itemId:z.string(),qty:z.number().int().min(1).max(10000),commitmentId:z.string().optional()});
const schema=z.object({id:z.string(),gps:z.unknown(),gifts:z.array(item).max(10).default([]),samples:z.array(item).max(10).default([]),notes:z.string().max(2000).default('')});
export async function POST(req:Request){try{
 sameOrigin(req);const m=await member();if(m.role!=='mr')throw new HttpError(403,'The MR must close their own visit.');const parsed=schema.safeParse(await req.json());if(!parsed.success)throw new HttpError(400,'Check the visit closing details.');const b=parsed.data;
 const visit=await record(b.id,'Visits');if(visit.assigned_to!==m.email)throw new HttpError(403,'This visit belongs to another MR.');
 if(visit.details.Status==='Closed')return json({ok:true,alreadyClosed:true});
 if(visit.details.Date!==indiaDay())throw new HttpError(400,'Close the visit on the same day. Contact Admin for a correction.');
 const c=await customer(m,visit.details['Customer ID']),gps=requireGPS(b.gps);await activeDay(m);
 const now=new Date().toISOString();const statements=[periodGuard(visit.details.Date),guard('attendance',"COALESCE((SELECT json_extract(data,'$.Action') FROM records WHERE kind='Attendance' AND (assigned_to=? OR (assigned_to='' AND owner=?)) AND json_extract(data,'$.Date')=? ORDER BY created DESC,rowid DESC LIMIT 1),'')='Check in'",[m.email,m.user_id,indiaDay()]),db().prepare('INSERT INTO visit_closures(id,mr_email,closed_at,gps) VALUES (?,?,?,?)').bind(b.id,m.email,now,JSON.stringify(gps))];
 for(const [kind,items] of [['gift',b.gifts],['sample',b.samples]] as const){if(new Set(items.map(x=>x.itemId)).size!==items.length)throw new HttpError(400,'Select each sample or gift once and combine its quantity.');for(const i of items){
  statements.push(...await issueStatements(m,kind,i.itemId,i.qty,c.id,b.id,gps,`${b.id}:${kind}:${i.itemId}`));
  if(kind==='sample'&&i.commitmentId){const p=await db().prepare('SELECT * FROM commitments WHERE id=? AND customer_id=? AND mr_email=? AND product_id=?').bind(i.commitmentId,c.id,m.email,i.itemId).first<{quantity:number;fulfilled:number}>();if(!p||p.quantity-p.fulfilled<i.qty)throw new HttpError(400,'This quantity exceeds the remaining sample commitment.');statements.push(db().prepare('UPDATE commitments SET fulfilled=fulfilled+? WHERE id=?').bind(i.qty,i.commitmentId));statements.push(guard('commitment','COALESCE((SELECT fulfilled>=0 AND fulfilled<=quantity FROM commitments WHERE id=?),0)',[i.commitmentId]));}
 }}
 const orders=(await db().prepare("SELECT number,items,total FROM invoices WHERE visit_id=? AND kind='secondary' AND status<>'Cancelled'").bind(b.id).all<{number:string;items:string;total:number}>()).results;
 let phone=(c.details['Mobile 1']||c.details.Phone||'').replace(/\D/g,'');if(phone.length===10)phone='91'+phone;if(phone.length<10||phone.length>15)phone='';
 const orderText=orders.map(o=>`${o.number}: ${JSON.parse(o.items).map((l:any)=>`${l.name} ${l.qty}${l.free?` + ${l.free} free`:''}`).join(', ')}. Bill ₹${(o.total/100).toFixed(2)}`).join('\n');
 const message=`Thank you ${c.details.Prefix||''} ${c.details.Name} for giving your time to ${m.name} from VETMECH Pharmaceuticals.${orderText?'\n\nYour order:\n'+orderText:''}\n\nWe appreciate your support.`,outboxId=`visit:${b.id}`;
 statements.push(db().prepare("UPDATE records SET data=json_set(data,'$.Status','Closed','$.\"Closed at\"',?,'$.\"Closing notes\"',?,'$.\"Closing GPS\"',?,'$.Location',?,'$.\"Location captured at\"',?) WHERE id=?").bind(now,b.notes,JSON.stringify(gps),gpsString(gps),gps.capturedAt,b.id));
 statements.push(db().prepare('INSERT INTO whatsapp_outbox(id,visit_id,mr_email,phone,message,status,created) VALUES (?,?,?,?,?,?,?)').bind(outboxId,b.id,m.email,phone,message,phone?'awaiting_setup':'missing_phone',now));
 try{await db().batch(statements)}catch(e){ledgerFailure(e)}
 try{await sendWhatsApp(outboxId)}catch{}return json({ok:true});
}catch(e){return failure(e)}}
