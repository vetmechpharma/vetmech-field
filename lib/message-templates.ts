export const messageTemplates={
 order_new:{label:'New order',body:'VETMECH — New MR order\nOrder number: {{order_number}}\nDate: {{date}}\nMR: {{mr_name}}\nCustomer: {{customer_name}}\nAgency: {{agency_name}}\n{{items}}\nNet: {{net_value}}\nTotal incl. GST: {{total_value}}\nRequests: {{notes}}\nRevision: {{revision}}'},
 order_update:{label:'Order update / delivery / cancellation',body:'VETMECH — UPDATED MR order (replaces earlier details)\nOrder number: {{order_number}}\nMR: {{mr_name}}\nCustomer: {{customer_name}}\nAgency: {{agency_name}}\n{{items}}\nNet: {{net_value}}\nTotal incl. GST: {{total_value}}\n{{notes}}\nRevision: {{revision}}'},
 visit_thanks:{label:'Visit thank-you',body:'Thank you {{customer_name}} for giving your time to {{mr_name}} from VETMECH Pharmaceuticals.\n{{orders}}\nWe appreciate your support.'}
} as const;
export type TemplateKey=keyof typeof messageTemplates;
export const templateTokens=['order_number','date','mr_name','customer_name','agency_name','items','net_value','total_value','notes','revision','orders'];
export function renderMessage(template:string,values:Record<string,string>){return template.replace(/{{\s*(\w+)\s*}}/g,(_,k)=>values[k]||'').trim();}
export function stockistOrderPhone(data:Record<string,string>){return data['Order WhatsApp contact']==='Mobile 2'?data['Mobile 2']||'':data['Order WhatsApp contact']==='Mobile 1'?data.Phone||'':data['WhatsApp number']||data.Phone||'';}
