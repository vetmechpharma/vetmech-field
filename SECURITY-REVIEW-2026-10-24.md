# Target saving and security review — 24 October 2026

Baseline: GitHub `c52cf04a192958944cc2a445560073376ea555d7`. Review covers the current web repository and a separate assessment of the development Android client. No live database, customer message, server configuration or paid API was changed.

## Target findings and fixes

- **Stale Admin figures:** saving a target refreshed workspace records, but Admin overview/comparison/profile kept their previously fetched targets. A successful target save now triggers those consumers and monthly performance cards to refetch. Regression tests render the actual editor and comparison together.
- **Unclear save result:** the API returned only `ok`; the editor retained the typed amount without displaying the persisted value. It now returns the committed MR/month/amount, shows a saved amount and confirmation, preserves other MRs' unsaved inputs, and separates a failed save from a successful save followed by failed refresh. Reload saved targets is available explicitly. Failed saves clear old success messages and keep the entry.
- **Concurrent edits:** the editor submits the saved target it started from. A changed target produces 409 instead of overwriting another screen's change. Database guards also protect the read/write race. Changes and their original/new amounts are written to Admin activity history atomically.
- **Fractional rupees:** Admin overview had rounded all amounts to whole rupees. It now displays two decimal places, consistent with the persisted target and reports.
- **Android Home:** it still read the retired `member.target` field. It now fetches its MR's selected-current-month summary and displays target, achieved, percentage and pending; missing targets show Not set. Tested using mocked React Native components, not a physical device.
- Targets remain independent by MR/month. No shared total or distribution rule is reintroduced. Closed periods remain protected; next months do not inherit targets.

The database save path passed synthetic API tests before this change too. The observed defects above explain stale displays; this review does not prove which error occurred on the user's deployed VPS. Confirm the deployed release via `/api/health` after updating. If an HTTP save error remains, its response and server log are needed; do not reset business data.

## Security and operational fixes

| Finding | Resolution |
|---|---|
| Nodemailer 10.0.13: three moderate recipient-parser advisories | Pin patched 10.1.4. |
| fast-uri 3.1.8: three moderate and two low normalization/host/scheme advisories | Override to patched 3.1.9. |
| Development follow-redirects 1.16.0: two high credential-header advisories | Override to patched 1.16.1. |
| Development undici 8.11.2: one high and two moderate advisories | Override 8.x to patched 8.12.2. |
| CI audited only production dependencies at high severity | CI now audits all web dependencies, including development, at low severity. |
| Custom deployment PATH omitted `/usr/sbin`, causing `runuser: command not found` | Deployment and communication preparation scripts append administrative command directories without replacing the selected Node path. |

The seven-day dependency age policy remains enabled. Only the four explicitly pinned security-patch versions have age exceptions. After updating, the full **web** dependency audit reported **0 known registry advisories**, from 12 initially (3 high, 7 moderate, 2 low). This is a dated registry result, not proof that code has no vulnerabilities.

## Review coverage and evidence

Repository-wide route/dependency inventory and targeted review of authentication/session cookies, Admin/MR authorization, customer access, JSON limits, bound database expressions, transaction/session guards, month locks, pricing/orders/stock, attendance/tour permissions, photo validation, encrypted communications/Google credentials, backup scripts and deployment. Current tracked-source scan found no matches for the tested private-key, GitHub-token or AWS-access-key patterns; Git history and live secrets were not scanned.

Validation:

- TypeScript and production build.
- HTTP security tests: streamed byte limits, malformed/non-object JSON, content types, hashing compatibility.
- Domain tests: pricing/schemes, CSV injection handling, inventory/month closing, messages and GPS chronology.
- UI tests: target reload/confirmation, independent MR edits, error retention, immediate comparison refresh, monthly locks, plus existing app workflows.
- API integration: target readback, decimals, audit before/after, stale expected value rejection, role restrictions, month isolation and locks, alongside existing account/session/stock/approval/reset/access tests. Local model run passed; GitHub runs the real temporary MongoDB replica-set suite.
- Deployment orchestration: initial/update deployment, dirty-checkout refusal, failed build isolation, health-check rollback and manual rollback using command doubles.
- Native target display: source executed with mocked React Native components. No APK installation or phone test.

## Remaining gaps and release boundaries

1. **Development Android dependencies:** isolated lockfile-only resolution reported 7 vulnerable/meta-vulnerable entries (6 high, 1 moderate) involving Expo toolchain, node-forge, image-size and postcss. This is not seven proven exploitable APK vulnerabilities. The folder has no committed dependency lockfile; Expo-compatible remediation, reproducible native CI and phone validation remain required before native production release. No forced major Expo upgrade was performed.
2. **Android feature parity:** the separate client lacks the web app's full monthly tour planning/approval and multi-product workflow interfaces. Web workflows are the supported, comprehensively tested path in this update.
3. **Admin MFA** is absent. MR weak-password acceptance remains the user's explicit requirement; rate limiting and hashing do not remove that risk.
4. **Large datasets:** several reports intentionally load complete business history. Pagination/aggregation and load testing against production-sized data remain needed. This review used synthetic test data, not production load.
5. **External services:** Admin configures WhatsApp/SMTP destinations. TLS and role checks exist, but destination egress restrictions/DNS-rebinding defenses are not comprehensive. Host firewall/egress and trusted Admin access remain important; no live service probing occurred.
6. **VPS/recovery:** actual Mongo authentication/bind/firewall, Nginx, OS updates, Node runtime security, encrypted off-server backups and restore drills were not verified remotely. Code checks cannot confirm their operational state.
7. Browser CSP restricts framing/objects/base URI but is not a nonce-based restrictive script policy. No production penetration test or device-by-device visual assessment was performed.

## Deployment

Update the repository and the root-owned deployment helper before deploying; otherwise `/usr/local/sbin/vetmech-deploy` can still contain the old PATH behavior. Keep the full Node + administration PATH in the command. Existing `.env`, communication secret and business database must be preserved. No data reset or database restore is part of this update. Verify the successful GitHub workflow for the new commit, then confirm `/api/health` reports that release and save/reopen one MR target in an open month.

## Advisory references

- https://github.com/advisories/GHSA-8c8m-p3m8-cjg8
- https://github.com/advisories/GHSA-m943-m63m-w62w
- https://github.com/advisories/GHSA-85x2-q946-cp5h
- https://github.com/advisories/GHSA-q3jh-wrc6-jgq8
- https://github.com/advisories/GHSA-8r9p-f939-6h3c
- https://github.com/advisories/GHSA-xjj6-f33q-929c
- https://github.com/advisories/GHSA-w74x-v6f9-j3xg
