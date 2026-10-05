import {db,HttpError} from './server';
import type {Member} from './permissions';
export const unfinishedDraftSQL="status='Active' AND NOT EXISTS(SELECT 1 FROM invoices i WHERE mr_drafts.kind='order' AND i.id=mr_drafts.id) AND NOT EXISTS(SELECT 1 FROM records r WHERE mr_drafts.kind='visit' AND r.id=mr_drafts.id) AND NOT EXISTS(SELECT 1 FROM records r WHERE mr_drafts.kind='visit_close' AND r.id=json_extract(mr_drafts.payload,'$.visitId') AND json_extract(r.data,'$.Status')='Closed')";
export async function visitDraft(m:Member,id:string){const d=await db().prepare("SELECT * FROM mr_drafts WHERE id=? AND mr_email=? AND kind='visit' AND status='Active'").bind(id,m.email).first<any>();if(!d)throw new HttpError(409,'Visit draft unavailable. Reopen your saved draft.');return d;}
