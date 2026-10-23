# WhatsApp order approval update

VETMECH Field Force MR App · 23 October 2026

## Configure the new gateway

In Admin → WhatsApp & email → WhatsApp API:

- Gateway URL: `https://msg.vetmechpharma.in/api/v1/messages/send`
- API key: a dedicated backend integration key from the gateway's API Keys page.
- Scopes: `send` and `read`, with permission for the connected WhatsApp session.
- Connected session ID: copy the exact existing session ID from the gateway.
- Admin WhatsApp number: international digits, for example `919876543210`.
- Enable automatic delivery and save.

Enter the API key only in the Admin settings. It is encrypted using the existing server `COMMUNICATIONS_SECRET`; it is never returned to the browser. Preserve that secret during upgrades and recovery. No key or session is included in this release.

Use **Send test to saved Admin contact** when ready. This button sends a real message to the saved Admin number. All automated development tests use synthetic network responses and send no external messages. Existing ANIMitra settings continue working until Admin changes the gateway.

## Order workflow

| Event | Customer / Admin messages | Stockist message | MR order status |
| --- | --- | --- | --- |
| New stockist order | Admin review notification only | None | Pending Admin approval |
| New company order at approved pricing | Admin review notification only | None | Pending Admin approval |
| Company pricing departure | Admin proposal review only | None | Pending pricing proposal |
| Admin approves stockist order | Customer: order received; Admin: approved | Customer name, phone, address and complete product list | Forwarded to stockist after gateway acceptance of every message part |
| Admin approves company order | Customer: order received; Admin: approved | None | Approved — awaiting company completion |
| Admin completes company order | Completion notification | None | Completed |
| Approved order amendment | Revised order details | Revised details for stockist orders | Updated revision and forwarding status |
| Cancellation / rejection | Separate cancelled / rejected message | Cancellation only if the stockist order had already been approved | Cancelled |
| MR closes a visit | Customer thank-you with linked orders, including pending direct-pricing proposals | None | Visit closed |

Admin can approve new orders in **Approvals** or **Orders**. Direct-pricing proposals appear in both areas; approving the proposal also approves the company order, so a second approval is unnecessary. Approval rechecks current MR/customer access. Orders use product quantities. Stock availability, batch and expiry never block order approval or company completion. Custom schemes still require scheme approval followed by separate order approval. Historical delivered stockist orders remain intact and appear as **Previously supplied**.

Only Admin can complete an approved company order. The server rejects stockist completion and MR approval/completion, even if called outside the web interface. MRs can edit an unapproved order within its open month. Edits after approval require Admin review; original product rates remain unless Admin explicitly approves repricing. Month locks still block order creation, editing, cancellation, approval and company completion.

## Stock and reports

Unapproved stockist orders record pending demand without deducting stock. Admin approval deducts paid plus free units from the approximate stockist balance. Approval is allowed even when the balance becomes negative. Forwarding confirms gateway acceptance, not customer delivery; there is no stockist completion action. Edits adjust only the quantity difference, and cancellation/deletion restores any posted deduction. Primary invoice edits and deletion also adjust this approximate balance.

Direct company orders do not reserve, deduct or require company stock. Admin can complete an approved company order without a company receipt, batch or expiry. Order entry and the stock statement show product quantities; historical batch metadata is retained internally.

**Approved orders in both channels count toward the responsible MR's secondary sales and monthly target, excluding GST, using the original order date.** Company completion never counts twice. Pending, rejected and cancelled orders do not count. Approved quantity/rate edits update achievement and pending target. Reports separate direct company and stockist sales.

An atomic, one-time inventory migration runs on the first application database request after deployment. It deducts previously approved stockist orders that were only reserved, restores legacy company deductions, and avoids double deduction of historical stockist supplies. A failed migration rolls back completely and retries on a later request. It does not rewrite orders or approved monthly report snapshots. Open reports use the new approved-order basis; closed reports retain their saved figures. Do not run an older release with the previous stock rules alongside this release.

Month closing requires resolution of unapproved orders, incomplete company orders and pending changes. Negative approximate balances alone do not block closing; the stock movement ledger and pending-demand reservations must still reconcile. A later gateway receipt can update communication status without changing a locked month's sales, stock or approved report snapshot.

## Edit and delete controls

Admin can edit or delete orders while the month is open. An MR can edit/delete their unapproved order in its current open month; approved or completed orders require an Admin change request. A month lock blocks both roles. Deletion cancels and hides the active order while preserving its history, rather than erasing audit evidence. Use **Show cancelled / deleted** to include those records.

Approvals show original versus requested paid/free quantities, rates, schemes, values, notes and stock effects. Original values are rose, updated values green; pending requests are amber and approved edit requests teal. Approved history uses captured snapshots even after catalogue prices or the order change again. Repricing at current catalogue prices remains an explicit approval option.

## MR order entry

Select the customer, supply source, product, quantity and an optional approved scheme. Packing, PTS and PTR are displayed for reference; they cannot be edited by the MR. Only direct company orders show an optional **Special proposed rate** for bulk orders. Admin must approve price departures. Internal sample/gift costs remain hidden. Existing orders and month locks are retained.

## Editable templates

Admin → WhatsApp & email → Message templates contains separate customer, Admin, stockist and visit templates. Customer order received/updated/rejected/cancelled/completed messages use one greeting and this layout:

```text
Dear Dr. LOKESH T,
Your order has been received.
Order number: ORD-20261018-1E81068F
Date: 18/10/2026
MR: MATHEESH KUMAR
ZEBUCAL LIQ · Packing: 1 LTR · Qty: 30 + Free qty: 8
Thank you for your support.
Regards
*VETMECH PHARMA*
```

The received message is sent after Admin approval. Accepted edits send “Your order has been updated” with updated quantities. Rejected and cancelled orders use their respective wording. A custom-scheme amendment sends its update after the subsequent order approval. No duplicate greeting, supply source, revision, status block, customer line, price or value is inserted into customer order messages. WhatsApp displays the company name in bold. Internal Admin/stockist templates retain routing and customer contact details.

All templates include `Dear Dr. {{customer_name}}` and a date. Existing `Dr.` prefixes are normalized. Required placeholders are validated when saving. Order templates require customer name, date, order number and items. Visit templates require customer name, MR name, date and linked orders. A message longer than 4,096 characters splits into numbered parts with stable idempotency keys.

Template version 3 refreshes legacy customer order wording. Version 2 visit, Admin review and stockist-forward customizations are retained, along with gateway/SMTP settings. Subsequent version 3 customizations are preserved. Existing delivered messages are not resent. Detailed communication logs retain their existing 30-day expiry.

## Delivery logs and retries

The request uses Bearer authentication, `sessionId`, `phone`, `text`, and a stable `Idempotency-Key` for each order revision, recipient and message part.

- **accepted**: queued or being sent by the gateway.
- **submitted**: submitted through the WhatsApp connection.
- **delivered / read**: shown only if the gateway actually reports that state.
- **uncertain / not sent / demo only**: submission is not confirmed.

HTTP 202 is not proof of delivery or reading. **Check gateway status** queries the stored message ID; it does not send again. It requires the matching gateway/session and a key with read permission. Once a gateway ID exists, the application does not resend that message automatically. A timeout without an ID requires checking the gateway directly before any further send. Clear request failures without an ID can be retried after correction, retaining the same idempotency key.

The MR sees **Approved — forwarding pending** or **Approved — forwarding needs attention** until all parts are accepted. Minimal forwarding receipts stay on the order after detailed communication logs expire at 30 days.

## Update the existing VPS

Run these in the VPS terminal, not Windows Git Bash. Use the existing MongoDB database, replica set, HTTPS domain and internal port 3010.

First pull the reviewed update and run the additive communication setup. This keeps the existing encryption key and does not add demo accounts or replace application data:

```bash
sudo -u vetmech -H git -C /opt/vetmech-field/repository pull --ff-only origin main
sudo env PATH="/opt/vetmech-node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash /opt/vetmech-field/repository/deploy/prepare-communications.sh
```

If either command fails, resolve its reported error before deploying. Then run the existing release deployer:

```bash
sudo systemd-run --scope --unit=vetmech-build \
  -p MemoryMax=1G \
  -p MemorySwapMax=512M \
  -p CPUQuota=50% \
  /usr/bin/env \
  PATH="/opt/vetmech-node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  NODE_OPTIONS=--max-old-space-size=768 \
  /usr/local/sbin/vetmech-deploy
```

The complete PATH includes `/usr/sbin`, fixing the earlier `runuser: command not found` failure. The deployer keeps the previous release serving during the build and checks health before confirming success.

Verify the service and release:

```bash
sudo systemctl is-active vetmech-field
curl -fsS https://mr.vetmechpharma.in/api/health
sudo -u vetmech -H git -C /opt/vetmech-field/repository rev-parse HEAD
```

The health response's release must match the Git commit. Refresh the browser, configure the gateway in Admin, and review the templates. No Nginx, certificate, public-port or shared MongoDB-instance change is required for this update.
