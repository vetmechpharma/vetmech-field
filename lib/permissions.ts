import {customerVisible,idList} from './field-rules';
export const TEST_MR_EMAIL = 'test-mr@vetmech.invalid';
export const OWNER_EMAIL = 'vetmechpharma@gmail.com';
export type Role = 'admin' | 'mr';
export type Member = {route_ids?:string;district_ids?:string;stockist_ids?:string;test_mode?:boolean;username?:string;email:string;user_id:string|null;name:string;role:Role;status:string;territory:string;target:number;mr_type:string;district:string;headquarters:string;route:string;phone:string;employee_code:string};
export type StoredRecord = {id:string;owner:string;kind:string;data:string;created:string;assigned_to:string};
export const kinds=['Customers','Stockists','Products','Visits','Tour plan','Orders','Secondary sales','Primary sales','Samples','Expenses','Attendance','Settings','Districts','Headquarters','Routes','MR types','Gifts'];
export const masterKinds=['Customers','Stockists','Products','Districts','Headquarters','Routes','MR types','Gifts'];
export const sharedKinds=['Products','Stockists','Districts','Headquarters','Routes','MR types','Gifts'];
export const adminKinds=['Products','Stockists','Primary sales','Settings','Districts','Headquarters','Routes','MR types','Gifts'];
export function canRead(user:Member,r:StoredRecord){
 if(user.role==='admin')return true;
 if(r.kind==='Customers')return customerVisible(user,r);
 if(r.kind==='Stockists')return idList(user.stockist_ids).includes(r.id);
 if(r.kind==='Routes')return idList(user.route_ids).includes(r.id)||JSON.parse(r.data).Name===user.route;
 if(r.kind==='Districts')return idList(user.district_ids).includes(r.id)||JSON.parse(r.data).Name===user.district;
 return sharedKinds.includes(r.kind)||(!adminKinds.includes(r.kind)&&(r.assigned_to?r.assigned_to===user.email:r.owner===user.user_id));
}
export function canWrite(user:Member,r:StoredRecord){return user.role==='admin'||(r.kind!=='Customers'&&!adminKinds.includes(r.kind)&&(r.assigned_to?r.assigned_to===user.email:r.owner===user.user_id));}
export function validateMRFields(kind:string,data:Record<string,string>,existing?:Record<string,string>){
  if(kind==='Expenses'&&data.Status!=='Submitted')return 'Only Admin can approve expenses.';
  if(kind==='Expenses'&&existing&&existing.Status!=='Submitted')return 'Approved or rejected expenses can only be changed by Admin.';
  if(kind==='Orders'&&!['Requested','Sent to stockist','Cancelled'].includes(data.Status))return 'Only Admin can confirm supply or close an order.';
  if(kind==='Orders'&&existing&&['Partially supplied','Supplied','Closed'].includes(existing.Status))return 'This order can only be changed by Admin.';
  if(kind==='Samples'&&existing&&existing.Movement!=='Given to customer')return 'Only Admin can change sample allotments or returns.';
  if(kind==='Samples'&&data.Movement!=='Given to customer')return 'Only Admin can issue or receive sample stock.';
  return null;
}
