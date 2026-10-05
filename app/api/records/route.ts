import {visitDraft} from '../../../lib/drafts';
import {audit} from '../../../lib/admin-audit';
import {duplicateRequest,accessRoute} from '../../../lib/customer-access';
import {periodGuard,assertOpen} from '../../../lib/periods';
import {idList,validGPS,legacyGPS,gpsString} from '../../../lib/field-rules';
import {z} from 'zod';
import {member,db,json,failure,sameOrigin,HttpError,notification} from '../../../lib/server';
import {OWNER_EMAIL,kinds,sharedKinds,adminKinds,masterKinds,canRead,canWrite,validateMRFields,type StoredRecord,type Member} from '../../../lib/permissions';
import {quoteProduct,sampleDelta,masterLinks,memberLinks} from '../../../lib/business';
import {customerCategory,stockistIDs,validateCustomer} from '../../../lib/customers';
const schema=z.object({draftId:z.string().uuid().optional(),id:z.string().max(100).optional(),kind:z.enum(kinds as [string,...string[]]),assignedTo:z.string().max(200).optional(),data:z.record(z.string().max(100),z.string().max(5000))});
const attendanceActionSQL="SELECT json_extract(data,'$.Action') FROM records WHERE kind='Attendance' AND json_extract(data,'$.Date')=? AND (assigned_to=? OR (assigned_to='' AND owner=?)) ORDER BY created DESC, rowid DESC LIMIT 1";
const numbers=['Quantity','Free quantity','Rate','MRP','PTR','PTS','GST %','Amount','Unit cost','Monthly target','Visit sequence','Scheme paid quantity','Scheme free quantity','Offer rate','Special rate'];
const balanceSQL="SELECT COALESCE(SUM(CASE WHEN json_extract(data,'$.Movement') = 'Issued to rep' THEN CAST(json_extract(data,'$.Quantity') AS REAL) ELSE -CAST(json_extract(data,'$.Quantity') AS REAL) END),0) FROM records WHERE kind = 'Samples' AND assigned_to = ? AND json_extract(data,'$.Product') = ? AND id <> ?";

export async function GET(){try{
 const m=await member();
 const result=await db().prepare('SELECT * FROM records ORDER BY created DESC, rowid DESC').all<StoredRecord>();
 return json({records:result.results.filter(r=>canRead(m,r)).map(r=>{const data=JSON.parse(r.data);if(m.role==='mr'&&r.kind==='Customers'){const routeId=accessRoute(m,data);if(routeId){const route=result.results.find(x=>x.id===routeId);if(route){data['Route ID']=routeId;data.Route=JSON.parse(route.data).Name;data.District=JSON.parse(route.data).District||'';}}delete data['MR route access'];delete data['Blocked MRs'];}if(m.role==='mr'&&r.kind==='Products'){delete data.PTS;delete data['Unit cost'];}return {...r,data};})});
}catch(e){return failure(e)}}

export async function POST(req:Request){try{
 sameOrigin(req);const m=await member();const parsed=schema.safeParse(await req.json());
 if(!parsed.success)throw new HttpError(400,'Invalid record. Check the form and retry.');const b=parsed.data;
 if(JSON.stringify(b.data).length>20000)throw new HttpError(400,'This record is too long.');
 if(m.role!=='admin'&&adminKinds.includes(b.kind))throw new HttpError(403,'Only Admin can change these records.');
 if(['Orders','Secondary sales','Primary sales','Samples'].includes(b.kind))throw new HttpError(400,'Use the invoice, order or allotment screen to keep stock balances correct.');
 if(b.draftId){if(m.role!=='mr'||b.kind!=='Visits'||b.id)throw new HttpError(400,'Drafts can create a new MR visit only.');await visitDraft(m,b.draftId);const submitted=await db().prepare("SELECT id FROM records WHERE id=? AND kind='Visits' AND assigned_to=?").bind(b.draftId,m.email).first();if(submitted)return json({ok:true,id:b.draftId,alreadySaved:true});}
 const existing=b.id?await db().prepare('SELECT * FROM records WHERE id = ?').bind(b.id).first<StoredRecord>():null;
 if(b.id&&!existing)throw new HttpError(404,'Record not found.');
 if(existing&&(existing.kind!==b.kind||!canWrite(m,existing)))throw new HttpError(403,'You cannot edit this record.');
 const fieldDay=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 if(m.role==='mr'&&['Visits','Attendance'].includes(b.kind)){
  if(existing&&JSON.parse(existing.data).Date!==fieldDay)throw new HttpError(403,'Previous-day visits require an Admin correction.');
  if(b.data.Date!==fieldDay)throw new HttpError(400,'Record visits and attendance for today only. Ask Admin for past-date corrections.');
  if(b.kind==='Attendance'){
   if(existing)throw new HttpError(403,'Attendance entries cannot be edited by an MR. Ask Admin for a correction.');
   if(!['Check in','Check out'].includes(b.data.Action))throw new HttpError(400,'Choose check in or check out.');
   const gps=legacyGPS(b.data);if(!validGPS(gps))throw new HttpError(400,'Fresh GPS is required for check-in and checkout. Capture your location again.');b.data.Location=gpsString(gps);b.data['Location captured at']=gps.capturedAt;
   b.data.Time=new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Kolkata'});
  }
 }
 const old=existing?JSON.parse(existing.data) as Record<string,string>:null;const dates=[b.data.Date,old?.Date,...(existing?.id.startsWith('monthly-target:')?[old?.Month]:[])].filter(Boolean) as string[];for(const d of dates)await assertOpen(d);
 for(const k of numbers)if(b.data[k]!==undefined&&b.data[k]!==''&&(!Number.isFinite(Number(b.data[k]))||Number(b.data[k])<0))throw new HttpError(400,`${k} must be zero or greater.`);

 if(b.kind==='Customers'){
  if(m.role==='mr'&&existing)throw new HttpError(403,'Only Admin can edit customer details.');
  const route=await db().prepare("SELECT id,data FROM records WHERE kind='Routes' AND json_extract(data,'$.Name')=?").bind(b.data.Route||'').first<{id:string;data:string}>();
  if(!route)throw new HttpError(400,'Select the customer route.');
  if(m.role==='mr'&&!idList(m.route_ids).includes(route.id)&&b.data.Route!==m.route)throw new HttpError(403,'Choose one of your assigned routes.');
  b.data['Route ID']=route.id;b.data.District=JSON.parse(route.data).District||'';if(m.role==='mr'){delete b.data['Route access'];delete b.data['MR route access'];delete b.data['Blocked MRs'];}
  if(!b.data.Name?.trim())throw new HttpError(400,'Name is required.');const customerError=validateCustomer(b.data,fieldDay);if(customerError)throw new HttpError(400,customerError);const duplicate=await duplicateRequest(m,b.data,b.id);if(duplicate)return duplicate;
  const invalid=validateCustomer(b.data,new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}));if(invalid)throw new HttpError(400,invalid);
  if(b.data['Mobile 1']!==undefined)b.data.Phone=b.data['Mobile 1'];
  if(customerCategory(b.data)==='Medical / Clinic'){
   const ids=stockistIDs(b.data);for(const stockist of ids){const row=await db().prepare("SELECT id FROM records WHERE kind = 'Stockists' AND id = ?").bind(stockist).first();if(!row)throw new HttpError(400,'A selected stockist is unavailable. Update the clinic’s stockist selection.');}
   b.data['Stockist IDs']=JSON.stringify(ids);
  }
 }
 if(b.kind==='Orders'&&b.data.Customer){
  const customer=await db().prepare("SELECT data FROM records WHERE kind = 'Customers' AND json_extract(data,'$.Name') = ?").bind(b.data.Customer).first<{data:string}>();
  if(customer&&customerCategory(JSON.parse(customer.data))==='Medical / Clinic'&&(!old||old.Customer!==b.data.Customer||old.Stockist!==b.data.Stockist)){
   const ids=stockistIDs(JSON.parse(customer.data));if(!ids.length)throw new HttpError(400,'Link at least one stockist to this medical / clinic before placing an order.');
   const stockists=await db().prepare("SELECT id,data FROM records WHERE kind = 'Stockists'").all<{id:string;data:string}>();const allowed=stockists.results.filter(r=>ids.includes(r.id)).map(r=>JSON.parse(r.data).Name as string);
   if(allowed.length===1&&!b.data.Stockist)b.data.Stockist=allowed[0];
   if(!allowed.includes(b.data.Stockist))throw new HttpError(400,'Choose one of this medical / clinic’s linked stockists.');
  }
 }
 const needed=masterKinds.includes(b.kind)?['Name']:b.kind==='Settings'?['Monthly target']:['Date'];
 if(['Orders','Secondary sales','Primary sales'].includes(b.kind))needed.push('Product','Stockist','Quantity');
 if(['Visits','Tour plan','Orders','Secondary sales'].includes(b.kind))needed.push('Customer');
 if(b.kind==='Expenses')needed.push('Amount','Category');
 if(b.kind==='Samples'){needed.push('Product','Quantity','Movement');if(b.data.Movement==='Given to customer')needed.push('Customer');}
 for(const k of needed)if(!b.data[k]?.trim())throw new HttpError(400,`${k} is required.`);
 if(masterKinds.includes(b.kind)){
  b.data.Name=b.data.Name.trim();
  const duplicate=await db().prepare("SELECT id FROM records WHERE kind = ? AND lower(trim(json_extract(data,'$.Name'))) = lower(?) AND id <> ?").bind(b.kind,b.data.Name,b.id||'').first();
  if(duplicate)throw new HttpError(409,'A record with this name already exists. Edit that record or use a distinct name.');
 }
 if(b.kind==='Routes'){if(!b.data.District||!await db().prepare("SELECT id FROM records WHERE kind='Districts' AND json_extract(data,'$.Name')=?").bind(b.data.District).first())throw new HttpError(400,'Every route must belong to a district.');}
 if(b.kind==='Gifts'){b.data['One per customer']=b.data['One per customer']||'Yes';if(!['Yes','No'].includes(b.data['One per customer']))throw new HttpError(400,'Choose Yes or No for the gift repeat rule.');if(Number(b.data['Unit cost'])<0||!Number.isFinite(Number(b.data['Unit cost'])))throw new HttpError(400,'Enter a valid gift cost.');}
 if(b.kind==='Products'){
  for(const i of [1,2,3])if(b.data[`Scheme ${i} enabled`]==='Yes'&&(!Number.isInteger(Number(b.data[`Scheme ${i} paid`]))||Number(b.data[`Scheme ${i} paid`])<1||!Number.isInteger(Number(b.data[`Scheme ${i} free`]))||Number(b.data[`Scheme ${i} free`])<1))throw new HttpError(400,`Scheme ${i} needs positive paid and free quantities.`);
  if(b.data['Retail offer enabled']==='Yes'&&!(Number(b.data['Retail offer rate'])>0))throw new HttpError(400,'Enter a positive retail offer rate.');
  if(b.data['Price mode']&&!['PTR','PTS','Offer rate','Special rate'].includes(b.data['Price mode']))throw new HttpError(400,'Choose PTR, PTS, offer rate or special rate.');
  if(b.data['Scheme enabled']==='Yes'&&(!Number.isInteger(Number(b.data['Scheme paid quantity']))||Number(b.data['Scheme paid quantity'])<1||!Number.isInteger(Number(b.data['Scheme free quantity']))||Number(b.data['Scheme free quantity'])<1))throw new HttpError(400,'An enabled scheme needs positive whole paid and free quantities.');
  if(['Offer rate','Special rate'].includes(b.data['Price mode'])&&!(Number(b.data[b.data['Price mode']])>0))throw new HttpError(400,'Enter a positive rate for the selected price mode.');
  if(Number(b.data['GST %']||0)>100)throw new HttpError(400,'GST must be between 0 and 100.');
 }
 if(m.role==='mr'){const invalid=validateMRFields(b.kind,b.data,old||undefined);if(invalid)throw new HttpError(403,invalid);}
 const assignedTo=m.role==='admin'?(b.assignedTo!==undefined?b.assignedTo:existing?.assigned_to||''):(existing?.assigned_to||m.email);
 let assignee:Member|null=null;
 if(assignedTo){
  assignee=await db().prepare('SELECT * FROM members WHERE email = ?').bind(assignedTo).first<Member>();
  if(!assignee||(assignee.status!=='active'&&existing?.assigned_to!==assignedTo&&!(b.kind==='Samples'&&b.data.Movement==='Returned')))throw new HttpError(400,'Select an active representative.');
  b.data.Representative=assignee.name;
  if(!masterKinds.includes(b.kind))for(const [field,key] of [['District','district'],['Headquarters','headquarters'],['Route','route']] as const)if(!b.data[field]&&assignee[key])b.data[field]=assignee[key];
 }else delete b.data.Representative;
 if(m.role==='mr'&&b.data.Customer){
  const customers=await db().prepare("SELECT * FROM records WHERE kind = 'Customers'").all<StoredRecord>();
  if(!customers.results.some(c=>canRead(m,c)&&JSON.parse(c.data).Name===b.data.Customer))throw new HttpError(403,'Select one of your assigned doctors or customers.');
 }
 if(['Orders','Secondary sales','Primary sales'].includes(b.kind)){
  if(!(Number(b.data.Quantity)>0)||!Number.isInteger(Number(b.data.Quantity)))throw new HttpError(400,'Quantity must be a positive whole number.');
  const changed=!old||old.Product!==b.data.Product||old.Quantity!==b.data.Quantity;
  if(changed){
   const product=await db().prepare("SELECT data FROM records WHERE kind = 'Products' AND json_extract(data,'$.Name') = ?").bind(b.data.Product).first<{data:string}>();
   if(!product)throw new HttpError(400,'Select a product from the catalogue.');
   const quote=quoteProduct(JSON.parse(product.data),Number(b.data.Quantity),b.kind);
   if(!(quote.rate>0))throw new HttpError(400,`Admin must set a positive ${quote.mode} for this product.`);
   Object.assign(b.data,{Rate:String(quote.rate),'Free quantity':String(quote.freeQuantity),'GST %':String(quote.gst),'Rate basis':quote.mode});
  }else if(old){for(const key of ['Rate','Free quantity','GST %','Rate basis'])if(old[key]!==undefined)b.data[key]=old[key];}
 }
 if(b.kind==='Visits'){const customer=await db().prepare("SELECT id FROM records WHERE kind='Customers' AND json_extract(data,'$.Name')=?").bind(b.data.Customer).first<{id:string}>();if(!customer)throw new HttpError(400,'Select a customer.');b.data['Customer ID']=customer.id;if(old?.Status==='Closed')throw new HttpError(403,'A closed visit cannot be edited.');b.data.Status='Open';}
 if(b.kind==='Attendance'&&m.role==='mr'&&b.data.Location&&!b.data['Location captured at'])b.data['Location captured at']=new Date().toISOString();
 const id=existing?.id||b.draftId||crypto.randomUUID(),now=new Date().toISOString();
 const notifications=[];
 if(m.role==='mr'&&['Orders','Expenses','Secondary sales'].includes(b.kind))notifications.push(notification(OWNER_EMAIL,`${b.kind==='Orders'?'Order':b.kind==='Expenses'?'Expense':'Secondary sale'} ${existing?'updated':'submitted'}`,`${m.name} · ${b.data.Customer||b.data.Category||b.data.Stockist||''}`,b.kind,id));
 if(m.role==='admin'&&assignedTo&&assignedTo!==m.email&&(!sharedKinds.includes(b.kind)||b.kind==='Routes'))notifications.push(notification(assignedTo,`${b.kind==='Samples'?'Samples':b.kind} ${existing?'updated':b.kind==='Samples'?'allotted':'assigned'}`,`${b.data.Name||b.data.Customer||b.data.Product||b.data.Category||b.kind}${b.data.Status?' · '+b.data.Status:''}`,b.kind,id));
 if(b.kind==='Samples'){
  if(!assignee||assignee.role!=='mr')throw new HttpError(400,'Choose an MR for this sample entry.');
  if(!['Issued to rep','Given to customer','Returned'].includes(b.data.Movement)||!Number.isInteger(Number(b.data.Quantity))||Number(b.data.Quantity)<=0)throw new HttpError(400,'Use a valid movement and a positive whole quantity.');
  if(old&&existing?.assigned_to&&(existing.assigned_to!==assignedTo||old.Product!==b.data.Product))throw new HttpError(400,'An existing sample entry must keep its MR and product. Correct the quantity or reverse the entry first.');
  const productExists=await db().prepare("SELECT id FROM records WHERE kind = 'Products' AND json_extract(data,'$.Name') = ?").bind(b.data.Product).first();if(!productExists)throw new HttpError(400,'Select a product from the catalogue.');
  const delta=sampleDelta(b.data);
  const sql=existing?`UPDATE records SET data = ?, assigned_to = ? WHERE id = ? AND ((${balanceSQL}) + ?) >= 0 RETURNING id`:`INSERT INTO records (id,owner,kind,data,created,assigned_to) SELECT ?,?,?,?,?,? WHERE ((${balanceSQL}) + ?) >= 0 RETURNING id`;
  const args=existing?[JSON.stringify(b.data),assignedTo,id,assignedTo,b.data.Product,id,delta]:[id,m.user_id,b.kind,JSON.stringify(b.data),now,assignedTo,assignedTo,b.data.Product,id,delta];
  const saved=await db().prepare(sql).bind(...args).first();
  if(!saved)throw new HttpError(409,'This would exceed the MR’s sample balance. Check their allotments and usage.');
  if(notifications.length){try{await db().batch(notifications)}catch(e){console.error('Sample saved; notification failed',e)}}
  return json({ok:true,id});
 }
 if(m.role==='mr'&&['Visits','Attendance'].includes(b.kind)){
  const required=b.kind==='Visits'||b.data.Action==='Check out';
  const once=b.kind==='Attendance'?` AND NOT EXISTS(SELECT 1 FROM records WHERE kind='Attendance' AND json_extract(data,'$.Date')=? AND (assigned_to=? OR (assigned_to='' AND owner=?)) AND json_extract(data,'$.Action')=?)`:'';
  const finish=b.kind==='Attendance'&&b.data.Action==='Check out'?` AND NOT EXISTS(SELECT 1 FROM records WHERE kind='Visits' AND json_extract(data,'$.Date')=? AND (assigned_to=? OR (assigned_to='' AND owner=?)) AND COALESCE(json_extract(data,'$.Status'),'Open')<>'Closed')`:'';
  const condition=`NOT EXISTS(SELECT 1 FROM period_locks WHERE closed=1 AND month>='${fieldDay.slice(0,7)}') AND COALESCE((${attendanceActionSQL}),'') ${required?'=':'<>'} 'Check in'${once}${finish}`;
  const query=existing?`UPDATE records SET data=?,assigned_to=? WHERE id=? AND ${condition} RETURNING id`:`INSERT INTO records (id,owner,kind,data,created,assigned_to) SELECT ?,?,?,?,?,? WHERE ${condition} RETURNING id`;
  const args=existing?[JSON.stringify(b.data),assignedTo,id,fieldDay,m.email,m.user_id]:[id,m.user_id,b.kind,JSON.stringify(b.data),now,assignedTo,fieldDay,m.email,m.user_id];
  if(b.kind==='Attendance')args.push(fieldDay,m.email,m.user_id,b.data.Action);if(b.kind==='Attendance'&&b.data.Action==='Check out')args.push(fieldDay,m.email,m.user_id);
  const saved=await db().prepare(query).bind(...args).first();
  if(!saved)throw new HttpError(409,b.kind==='Attendance'?'Only one check-in and one checkout are allowed per day. Close open visits before checkout.':'Start my day before recording a visit.');
  return json({ok:true,id});
 }
 const priceChanged=b.kind==='Products'&&old&&Object.keys({...old,...b.data}).some(k=>/PTS|PTR|MRP|rate|GST|Scheme|Price mode|Retail/i.test(k)&&old[k]!==b.data[k]);const auditReason=b.data['Change reason']?.trim()||'';if(priceChanged&&auditReason.length<3)throw new HttpError(400,'Enter a reason for changing product prices or schemes.');delete b.data['Change reason'];
 const statements=[...dates.map(periodGuard),...(m.role==='admin'&&b.kind==='Customers'?[audit(m,existing?'Customer details / assignment updated':'Customer created','Customers',id,existing?{data:old,assignedTo:existing.assigned_to}:null,{data:b.data,assignedTo},auditReason||'Admin customer directory update')]:[]),...(m.role==='admin'&&b.kind==='Products'?[audit(m,existing?'Product catalogue updated':'Product created','Products',id,old,b.data,auditReason||(existing?'Product details updated':'Initial product setup'))]:[]),existing?db().prepare('UPDATE records SET data = ?, assigned_to = ? WHERE id = ?').bind(JSON.stringify(b.data),assignedTo,id):db().prepare('INSERT INTO records (id,owner,kind,data,created,assigned_to) VALUES (?,?,?,?,?,?)').bind(id,m.user_id,b.kind,JSON.stringify(b.data),now,assignedTo)];
 const link=masterLinks[b.kind];
 if(link&&old&&old.Name!==b.data.Name){
  statements.push(db().prepare(`UPDATE records SET data = json_set(data,?,?) WHERE json_extract(data,?) = ? AND id <> ?`).bind(`$.${link}`,b.data.Name,`$.${link}`,old.Name,id));
  const memberColumn=memberLinks[b.kind];if(memberColumn)statements.push(db().prepare(`UPDATE members SET ${memberColumn} = ? WHERE ${memberColumn} = ?`).bind(b.data.Name,old.Name));
 }
 await db().batch([...statements,...notifications]);return json({ok:true,id});
}catch(e){return failure(e)}}

export async function DELETE(req:Request){try{
 sameOrigin(req);const m=await member();if(m.role!=='admin')throw new HttpError(403,'Only Admin can delete records.');
 const b=await req.json() as {id?:string};if(typeof b.id!=='string')throw new HttpError(400,'Choose a record.');
 const existing=await db().prepare('SELECT * FROM records WHERE id = ?').bind(b.id).first<StoredRecord>();if(!existing)throw new HttpError(404,'Record not found.');const data=JSON.parse(existing.data);if(data['Invoice ID']||data['Ledger ID'])throw new HttpError(403,'Posted ledger records cannot be deleted individually.');

 if(data.Date)await assertOpen(data.Date);if(data.Month&&existing.id.startsWith('monthly-target:'))await assertOpen(data.Month);
 if(existing.kind==='Stockists'){
  const customers=await db().prepare("SELECT data FROM records WHERE kind = 'Customers'").all<{data:string}>();
  if(customers.results.some(r=>stockistIDs(JSON.parse(r.data)).includes(b.id!)))throw new HttpError(409,'This stockist is linked to a medical / clinic. Remove that link before deleting it.');
 }
 if(['Products','Stockists','Gifts','Customers'].includes(existing.kind)){const linked=await db().prepare('SELECT id FROM stock_movements WHERE stockist_id=? OR product_id=? UNION SELECT id FROM benefit_movements WHERE item_id=? OR customer_id=? UNION SELECT id FROM invoices WHERE customer_id=? LIMIT 1').bind(b.id,b.id,b.id,b.id,b.id).first();if(linked)throw new HttpError(409,'This record has stock or visit history and cannot be deleted.');}
 const link=masterLinks[existing.kind];
 if(link){
  const linked=await db().prepare('SELECT id FROM records WHERE json_extract(data,?) = ? AND id <> ? LIMIT 1').bind(`$.${link}`,data.Name,b.id).first();
  const column=memberLinks[existing.kind];const memberLink=column?await db().prepare(`SELECT email FROM members WHERE ${column} = ? LIMIT 1`).bind(data.Name).first():null;
  if(linked||memberLink)throw new HttpError(409,'This master record is in use. Edit it, or reassign its linked records before deleting.');
 }
 if(existing.kind==='Samples'){
  const deleted=await db().prepare(`DELETE FROM records WHERE id = ? AND (${balanceSQL}) >= 0 AND NOT EXISTS(SELECT 1 FROM period_locks WHERE closed=1 AND month>=?) RETURNING id`).bind(b.id,existing.assigned_to,data.Product,b.id,String(data.Date||existing.created).slice(0,7)).first();
  if(!deleted)throw new HttpError(409,'This allotment has already been used. Removing it would make the MR’s sample balance negative.');
 }else await db().batch([...(data.Date?[periodGuard(data.Date)]:[]),...(data.Month?[periodGuard(data.Month)]:[]),db().prepare('DELETE FROM records WHERE id = ?').bind(b.id)]);
 return json({ok:true});
}catch(e){return failure(e)}}
