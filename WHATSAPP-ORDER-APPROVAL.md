# WhatsApp order approval update

VETMECH Field Force MR App · 18 October 2026

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
| New stockist order | New order awaiting approval | None | Pending Admin approval |
| New company order at approved pricing | New order awaiting approval | None | Pending Admin approval |
| Company pricing departure | Proposal awaiting approval | None | Pending pricing proposal |
| Admin approves stockist order | Approval notification | Customer name, phone, address and complete product list | Forwarded to stockist after gateway acceptance of every message part |
| Admin approves company order | Approval notification | None | Approved — awaiting company completion |
| Admin completes company order | Completion notification | None | Completed |
| Approved order amendment | Revised order details | Revised details for stockist orders | Updated revision and forwarding status |
| Cancellation / rejection | Cancellation message | Cancellation only if the stockist order had already been approved | Cancelled |
| MR closes a visit | Customer thank-you with linked orders, including pending direct-pricing proposals | None | Visit closed |

Admin can approve new orders in **Approvals** or **Orders**. Direct-pricing proposals appear in both areas; approving the proposal also approves the company order, so a second approval is unnecessary. Approval rechecks stock and current MR/customer access. Historical delivered stockist orders remain intact and appear as **Previously supplied**.

Only Admin can complete an approved company order. The server rejects stockist completion and MR approval/completion, even if called outside the web interface. MRs can edit an unapproved order within its open month. Edits after approval require Admin review; original product rates remain unless Admin explicitly approves repricing. Month locks still block order creation, editing, cancellation, approval and company completion.

## Stock and reports

Placing an order reserves units. Custom company-pricing proposals reserve units only when approved. Approval and forwarding do not deduct physical stock. **Forwarded stockist orders remain reserved** because forwarding does not confirm supply; there is no new stockist Completed action.

Company completion deducts company stock only. Cancellation releases reserved stock. Existing historical delivered stockist movements are preserved. Delivered-sales achievement continues to count completed company supply and historical delivered stockist sales. Forwarded stockist orders are shown separately in the monthly report and do not silently inflate delivered targets.

Month closing requires resolution of unapproved orders and incomplete company orders. Approved stockist orders can remain as reservations; reconciliation still checks those units. Communication failures remain visible in delivery logs and order forwarding status. A later gateway receipt can update communication status without changing a locked month's sales, stock or approved report snapshot.

## Editable templates

Admin → WhatsApp & email → Message templates contains eight templates:

1. Customer order awaiting approval.
2. Admin order review.
3. Order approved.
4. Approved order forwarded to stockist.
5. Company order completed.
6. Revised order.
7. Cancelled / rejected order.
8. Visit thank-you.

All begin with `Dear Dr. {{customer_name}}` and include the relevant date. Order product lines contain product name, packing, paid quantity and free quantity. Rates, totals, invoice values and free-text order notes are not inserted into WhatsApp or corresponding email messages. Existing `Dr.` prefixes are normalized so greetings do not repeat the title.

Required placeholders are validated when saving. Order templates require customer name, date, order number and items. Visit templates require customer name, MR name, date and linked orders. The stockist-forward template also requires customer phone and address. A rendered message longer than 4,096 characters is split into numbered parts, each with a stable idempotency key.

Previous template versions reset to these quantity-only defaults, retaining gateway and SMTP credentials. Unsent messages created before this update are superseded on retry, preventing old prices or unapproved stockist forwarding from being sent. Historical communication logs are retained for their existing 30-day period.

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
