export const TEMPLATE_VERSION=3;
const details='Order number: {{order_number}}\nDate: {{date}}\nCustomer: Dr. {{customer_name}}\nMR: {{mr_name}}\nSupply from: {{agency_name}}\n{{items}}\nRevision: {{revision}}';
const customerDetails='Order number: {{order_number}}\nDate: {{date}}\nMR: {{mr_name}}\n{{items}}';
const customerMessage=(event:string)=>'Dear Dr. {{customer_name}},\n'+event+'\n'+customerDetails+'\nThank you for your support.\nRegards\n*VETMECH PHARMA*';
export const messageTemplates={
 order_new:{label:'Order received · preview',body:customerMessage('Your order has been received.')},
 order_admin_review:{label:'Admin · new order for review',body:'Dear Dr. {{customer_name}},\nADMIN REVIEW REQUIRED — customer order\n'+details+'\nPlease review this order in VETMECH Field Force.'},
 order_approved:{label:'Customer · order received after approval',body:customerMessage('Your order has been received.')},
 stockist_forward:{label:'Stockist · approved order',body:'Dear Dr. {{customer_name}},\nAPPROVED CUSTOMER ORDER FOR {{agency_name}}\n'+details+'\nCustomer phone: {{customer_phone}}\nCustomer address: {{customer_address}}\nPlease arrange supply to the above customer.\nVETMECH PHARMACEUTICALS PRIVATE LIMITED'},
 company_completed:{label:'Customer · company order completed',body:customerMessage('Your order has been completed.')},
 order_update:{label:'Customer · order updated',body:customerMessage('Your order has been updated.')},
 order_cancelled:{label:'Customer · order cancelled',body:customerMessage('Your order has been cancelled.')},
 order_rejected:{label:'Customer · order rejected',body:customerMessage('Your order has been rejected.')},
 order_internal_status:{label:'Admin · order status / update',body:'Dear Dr. {{customer_name}},\n{{event}}\n'+details+'\nStatus: {{status}}\nVETMECH PHARMA'},
 stockist_update:{label:'Stockist · order update / cancellation',body:'Dear Dr. {{customer_name}},\n{{event}} — {{agency_name}}\n'+details+'\nCustomer phone: {{customer_phone}}\nCustomer address: {{customer_address}}\nStatus: {{status}}\n*VETMECH PHARMA*'},
 visit_thanks:{label:'Customer · visit thank-you',body:'Dear Dr. {{customer_name}},\nThank you for giving your time to {{mr_name}} from VETMECH PHARMACEUTICALS PRIVATE LIMITED.\nVisit date: {{date}}\n{{orders}}\nWe appreciate your support.\nThe Science of Animal Health'},
} as const;
export type TemplateKey=keyof typeof messageTemplates;
export const templateTokens=['order_number','date','mr_name','customer_name','customer_phone','customer_address','agency_name','items','revision','orders','status','event'];
export const defaultTemplates=()=>Object.fromEntries(Object.entries(messageTemplates).map(([k,v])=>[k,v.body])) as Record<TemplateKey,string>;
export function configuredTemplates(saved:any){
 const templates=defaultTemplates();
 if(saved.templateVersion===TEMPLATE_VERSION)return {...templates,...saved.templates};
 // Refresh only customer order wording. Preserve existing visit, Admin and agency customizations.
 if(saved.templateVersion===2)for(const key of ['order_admin_review','stockist_forward','visit_thanks'] as TemplateKey[])if(typeof saved.templates?.[key]==='string')templates[key]=saved.templates[key];
 return templates;
}
export function renderMessage(template:string,values:Record<string,string>){return template.replace(/{{\s*(\w+)\s*}}/g,(_,k)=>values[k]||'').trim();}
export function doctorName(name:string){return String(name||'Customer').trim().replace(/^(?:dear\s+)?dr(?:\.\s*|\s+)/i,'').trim()||'Customer';}
export function messageDate(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)?date.split('-').reverse().join('/'):date;}
// Financial fields and free-text pricing notes never enter generated message values.
export function quantityItems(items:any[]){return items.map(l=>`${l.name} · Packing: ${l.packing||'Not specified'} · Qty: ${l.qty}${l.free?` + Free qty: ${l.free}`:''}`).join('\n');}
export function splitMessage(text:string){
 if(text.length<=4096)return [text];
 const parts:string[]=[];let rest=text;
 while(rest.length){let end=Math.min(4000,rest.length);if(end<rest.length){const newline=rest.lastIndexOf('\n',end);if(newline>2000)end=newline+1;if(/[\uD800-\uDBFF]/.test(rest[end-1]))end--;}
  parts.push(rest.slice(0,end));rest=rest.slice(end);
 }
 return parts.map((p,i)=>`[Part ${i+1}/${parts.length}]\n${p}`);
}
export function stockistOrderPhone(data:Record<string,string>){return data['Order WhatsApp contact']==='Mobile 2'?data['Mobile 2']||'':data['Order WhatsApp contact']==='Mobile 1'?data.Phone||'':data['WhatsApp number']||data.Phone||'';}
