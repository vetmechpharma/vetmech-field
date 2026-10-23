# Reset Field Force application data

Open **Admin → Controls & settings → Management settings → Reset application data**.

1. Click **Review all data for reset**. The preview shows the entries to be removed.
2. Enter a reason and your current Admin password.
3. Type **DELETE ALL DATA** exactly and tick the acknowledgement.
4. Click **Permanently delete all application data**.
5. Sign in again using the same Admin username and password.

The review expires after ten minutes. If another user changes data after the preview, refresh the counts and review again. A message currently marked as sending must finish or have its delivery status resolved before resetting.

## What the reset does

| Deleted | Kept |
| --- | --- |
| MR accounts, login credentials and MR profile photos | Admin accounts, passwords and Admin profile photos |
| Customers, stockists, products, districts, headquarters and routes | WhatsApp/SMTP configuration, encrypted credentials and templates |
| Orders, primary invoices, approximate stock and order edit history | Backup configuration and monitoring |
| Sample/gift balances, allocations, issues and commitments | Login rate limits and database indexes |
| Visits, attendance, leave, tour programmes, holidays, targets and expenses | One new Admin activity receipt with the reason and deletion counts |
| Drafts, follow-ups, approvals, notifications, message queues and logs | Application code, environment configuration and encryption keys |
| Closed monthly reports, month locks and previous Admin activity history | Other applications, MongoDB databases and external backup files |

All sessions end, including the Admin's current session. Existing Admin territory assignments are cleared. New master data and MR accounts can then be created from the empty workspace.

This operation deliberately includes locked months. It is different from editing an individual order, which remains subject to month locks. There is no in-app undo. Recovery requires a previously completed external backup; reviewing or resetting does not create a backup. See [external recovery instructions](EXTERNAL-BACKUP-RECOVERY.md).

Counts describe stored entries, so a single order may contribute an invoice, stock movements, message logs and history entries. Already-sent WhatsApp messages and emails cannot be recalled, and resetting this application does not clear the external messaging gateway.

## Consistency and access controls

The server requires an active Admin session, same-origin request, current password, exact confirmation phrase, acknowledgement and a fresh server-issued review token. Incorrect passwords are rate-limited. The reset has no user-selectable database name and operates only on this application's defined collections.

Deletion runs in one MongoDB transaction using the existing shared ledger lock. Failure rolls back all changes. Repeated or concurrent requests cannot reuse a consumed preview. Business writes recheck their session when committing, preventing old requests from recreating records after the reset signs everyone out.

Deploying this feature does **not** reset any data. Only the explicit Admin confirmation performs deletion.
