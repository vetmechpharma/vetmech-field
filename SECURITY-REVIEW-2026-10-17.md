# VETMECH Field Force — code and security review

Review date: 17 October 2026 (India). Repository baseline: `89550196d4b164d722996e1adc0c7798a3d616a6`.

The web application has confirmed security and correctness fixes in this update. It is **not an assurance that every vulnerability is eliminated**. A newer framework security release, the separate Android client's dependency review, and live-server recovery checks remain open.

## Scope and limits

Reviewed the Next.js API authorization and request handling, account/session code, MongoDB transaction adapter, orders and stock, month locks, attendance/GPS, customer access, communications, deployment scripts, dependencies, and the separate `mobile/` client. Added regression cases and exercised the production HTTP server on loopback with synthetic configuration. No production database, customer account, external WhatsApp recipient, SMTP recipient, or VPS configuration was changed during the audit.

The Android sources and Android workflow were preserved. Their findings below are a separate release backlog. This was not a device-by-device visual review, a production penetration test, or a full Git history secret scan.

## Confirmed issues fixed

Severity is a review judgment about the application impact, not a formal CVSS score.

| Priority | Finding and effect | Change | Evidence / regression coverage |
| --- | --- | --- | --- |
| High | Outside-route customer approval could be bypassed using conflicting route ID and route name fields. | Customer creation now authorizes the canonical stored route. Explicit MR route IDs take precedence; legacy name matching applies only when there are no assigned IDs. | `app/api/records/route.ts`; a mismatched request creates an approval request instead of a customer. |
| High | JSON readers had no shared actual-byte limit; the login check trusted the declared length. Malformed/non-object payloads could become generic server errors. | Central streaming JSON reader enforces 4 KiB for login and 256 KiB elsewhere, checks content type and UTF-8, and returns specific 400/413/415 errors. | `lib/http-input.ts`, API routes, `tests/http-security.cjs`; covers absent/forged lengths, stream cancellation, malformed JSON, arrays and null. |
| Medium | Existing PBKDF2-HMAC-SHA512 hashes used 100,000 iterations. Login/password changes could race an administrator's credential update. | New hashes use 220,000 iterations. Valid legacy hashes upgrade on login. Transaction guards reject stale credential changes and inactive accounts. | `lib/passwords.ts`, auth routes, `scripts/create-admin.mjs`; old/new hashes, wrong passwords, bounded iteration formats and migration tested. |
| Medium | MR management could modify a non-owner Admin account if its email was submitted, and account changes lacked a dedicated audit entry. | The MR endpoint rejects all Admin targets and logs account/profile changes without passwords or password hashes. | `app/api/team/route.ts`; Admin target rejection and audit redaction tested. |
| Medium | Missing browser hardening and an unused image optimization endpoint increased exposure. | Added framing, MIME sniffing, referrer, permission and limited CSP protections; removed the framework response header; disabled image optimization. | `next.config.ts`; production root headers checked; `/_next/image` returns 404. CSP does not yet restrict scripts with nonces. |
| Medium | MR records could disappear because a global result limit was applied before MR visibility filtering. | Scope orders, edit history, benefit movements and message lists before their limits. | Commerce, benefits, communications and WhatsApp routes; regression with 1,001 newer records belonging to another MR. This fixes visibility, not complete historical pagination. |
| Medium | A customer created during the previous month could remain classified as new despite qualifying orders. | New-customer classification uses the current month and India date boundaries. | `lib/field-updates.ts`; previous-month top buyer and UTC/India month-boundary cases tested. |
| Dependency | The initial web production audit reported 14 advisories, including one critical and five high. | Updated eligible Next.js and transitive dependencies, including `sharp` 0.35.5, while preserving the release-age policy. | Locked Next.js / eslint-config-next 16.3.8; frozen install and production build passed. See the separate unresolved framework advisory below. |

Cross-site browser requests are now also rejected using Fetch Metadata. The existing Origin check remains. Native requests without browser Fetch Metadata continue to use the application's authenticated session and API permissions.

The requested simple MR password policy remains unchanged. Stronger storage does not make a short or reused password difficult to guess. Admin passwords retain their existing minimum of 12 characters.

## Open security and operational work

| Priority | Status and evidence | Required action |
| --- | --- | --- |
| High — framework update | Next.js's 14 October advisory recommends **16.4.1**, including upstream fixes that are not reflected in the current zero-result production audit. The repository's seven-day release-age gate rejected that release during this review. | Upgrade Next.js and eslint-config-next together, refresh the lockfile, and rerun security, integration, UI and build checks when the release is eligible. The published Next.js timestamp makes it eligible after **21 October, 23:13:55 IST**; 22 October is a practical target. Recheck all resolved dependencies against the policy. |
| Framework mitigation limits | `sharp` is now 0.35.5 and image optimization is disabled. Source search found no `use cache`, Cache Components, Server Actions or `next/image` usage. This reduces the observed exposure but does not replace the recommended framework upgrade. | Keep this item open. Do not describe `pnpm audit --prod` returning zero as proof that the framework is fully patched. |
| High — Android dependency backlog | An isolated lockfile-only resolution of `mobile/package.json` reported **35 affected dependency entries: 23 high, 12 moderate**. This includes transitive/meta-vulnerability entries, not 35 independent exploitable APK vulnerabilities. There is no committed native dependency lockfile. | Choose an Expo-supported dependency set, commit its lockfile, use reproducible CI installation, and build/test on Android. Do not use a forced major-version audit fix without compatibility testing. |
| Medium — build dependency | Full web audit still reports `braces` 3.0.3 through `eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch`. The registry lists no patched release for GHSA-vfj7-8cjw-p6xm. | Track the upstream fix; keep untrusted glob patterns out of tooling. This is a development dependency finding and has not been suppressed. |
| Medium — account protection | Admin MFA is absent. The intentionally permissive MR password policy remains a guessing risk despite rate limiting. | Add optional Admin MFA and a controlled password-reset/recovery process. Any stricter MR policy needs a product decision. |
| Medium — scale | Several reports and stock calculations load large record sets and process them in memory. Stock loading has repeated reservation lookups. Transactions update a shared `_control` ledger document, serializing writes. | Measure realistic data volume on the small shared VPS; add pagination, targeted MongoDB queries/indexes and aggregate stock reads. Avoid a broad database adapter rewrite without transaction regression tests. |
| Medium — configured outbound services | WhatsApp/SMTP settings are Admin-only, encrypted, and use HTTPS/TLS, but allowed destination hosts are not restricted to a deployment-specific allowlist. | Consider an explicit gateway/SMTP allowlist and network egress restrictions for the actual deployment. Preserve intentionally self-hosted services. This is not an anonymous endpoint finding. |
| Live environment — unverified | Current firewall rules, MongoDB authorization, shared-server isolation, backup credentials, off-server restore success, TLS renewal and deployed revision cannot be established from source alone. | Perform the read-only checks and isolated recovery drill below. Do not restart or reconfigure shared MongoDB merely to perform this review. |

Android audit examples include `image-size`, `node-forge`, `postcss`, `sprintf-js`, `uuid`, and the same `braces` issue. Some paths belong to build/development tooling. Reachability in a signed APK needs separate assessment.

## Functional gaps and code improvements

| Area | Observed gap | Next change |
| --- | --- | --- |
| Daily travel and maps | `distanceKm` calculates straight-line endpoint distance. It is not road distance or a continuous daily travel track. | Store and display the day's ordered GPS capture points; distinguish straight-line estimates from any directions-service road distance. Do not advertise endpoint distance as actual kilometres travelled. |
| GPS confidence | Coordinates, timestamp and non-negative accuracy are checked, but there is no maximum accuracy threshold. Client GPS can be spoofed; an address lookup is an approximate locality. | Show accuracy and source, flag poor fixes, and define an Admin exception/review policy. Do not label client GPS as independent proof of attendance. |
| Stockist territory | Multiple district IDs are supported. Headquarters and route fields are still single values. | Add multiple headquarters/route IDs, migrate existing values, and validate hierarchy and MR allocation consistently. |
| Historical lists | Fixed list limits remain (for example, 1,000 invoices). | Add date filters and pagination rather than silently implying the visible list is complete history. |
| Native dashboard | `mobile/App.tsx` uses the legacy `member.target` field for the monthly target. | Load the authoritative monthly target/report data and achievement figures. |
| Native order entry | The Android form submits one product and offers only scheme 1/2/3 or none. It lacks the full web direct-company pricing and approval flow. | Match web multi-product, dynamic schemes and direct-supply approval behavior. |
| Native ambiguous retries | Save functions create new operation IDs on each call; there is no persistent operation record or explicit fetch timeout. | Retain the same idempotency key and payload until the server outcome is resolved. A retry after a lost response must not create another order or issue stock twice. |
| Native workflow coverage | Leave, tour planning, complete order-edit approvals, expiry views and print/PDF workflows do not have full web parity. Visit close sends empty readable-location fields. | Complete and test these modules before describing the Android client as feature-complete. Test cookie persistence and GPS permissions on real devices. |
| Maintainability | Several important API/components are densely compressed; validation and legacy master-field definitions are spread across modules. | Gradually separate request schemas, business services and presentation code. Keep stock, period-lock and permission tests as gates for each small refactor. |

## Validation performed

| Check | Result and limit |
| --- | --- |
| Frozen dependency installation | Passed with the updated lockfile and existing supply-chain policy. |
| TypeScript and production build | Passed; standalone production server generated. |
| HTTP/password regression tests | Passed: malformed payloads, actual byte limits, content type/UTF-8, legacy/current password hashes. |
| Product import/export and batch/closing tests | Passed: CSV escaping/validation, expiry boundaries, FEFO allocation, reservations, edits, cancellation and closing blockers. |
| UI interaction tests | Passed: repeated navigation and two-product primary/secondary submission. These are DOM tests, not all-device visual certification. |
| Database business tests in model mode | Passed: authentication, role isolation, stock rollback, saved prices, month locks, attendance, gifts/samples privacy, tour coverage, leave, direct supply, geography, targets and the new regressions. |
| Real MongoDB locally | Blocked by the execution environment: the temporary MongoDB process reported `open: Operation not permitted`. Model results are not a substitute for replica-set concurrency validation. GitHub's real MongoDB integration job remains the release gate. |
| Production HTTP smoke | Passed on loopback: root/security headers, disabled optimizer, anonymous denial, cross-site/Origin rejection, malformed/oversized login handling. Used an unreachable synthetic database. |
| Deployment control-flow test | Passed: initial deploy/update, failed-build isolation, failed-health rollback, manual rollback and dirty-checkout refusal. Commands were simulated; no VPS service was changed. |
| Web production dependency audit | Zero registry advisories at review time; the separately published framework update remains outstanding. |
| Full web dependency audit | One high development dependency advisory remains (`braces`). |
| Current tracked-source secret pattern scan | No matches for the checked private-key, GitHub-token and AWS-access-key patterns. This was a narrow current-tree scan, not a complete credential or history audit. |
| Live sends and external restoration | Not performed. Existing communication tests use doubles and synthetic data. |

Reproducible local/CI commands:

```bash
pnpm install --frozen-lockfile
pnpm test:security
pnpm test:domain
pnpm test:ui
MONGO_TEST_MODE=model pnpm test:mongo
pnpm test:mongo
pnpm audit --prod --audit-level=high
pnpm audit
pnpm build
```

`pnpm test:mongo` without model mode uses an isolated temporary replica set by default. Do not point `MONGO_TEST_URI` at a production/shared database. A nonzero result from full `pnpm audit` is expected until the remaining build dependency advisory is fixed.

GitHub CI now runs the security tests, domain tests and production audit alongside its existing real MongoDB, UI and build checks. Check the **Build and MongoDB integration** workflow for the update commit before deploying.

## Deployment and recovery notes

No new database schema migration or destructive data operation is required by these fixes. Existing accounts retain their passwords. A successful login upgrades an old password hash; newly set passwords use the new format immediately.

**Rollback compatibility:** a pre-audit release only understands 100,000-iteration hashes. After accounts acquire the new hashes, rolling back to that old code can prevent those accounts from logging in. Use a forward fix or a rollback release that retains support for both formats. Do not restore an old production database simply to reverse the password format and discard newer business activity.

On the VPS, after the GitHub checks pass, use the existing deployment wrapper:

```bash
sudo systemd-run --scope --unit=vetmech-build \
  -p MemoryMax=1G \
  -p MemorySwapMax=512M \
  -p CPUQuota=50% \
  /usr/bin/env NODE_OPTIONS=--max-old-space-size=768 \
  /usr/local/sbin/vetmech-deploy

sudo systemctl is-active vetmech-field
curl -fsS https://mr.vetmechpharma.in/api/health
```

Verify the health response names the intended new commit. Test one Admin login, one MR login, customer visibility and a controlled test order after deployment. The current source review does not mean the VPS is already updated.

Live-server checks still needed:

1. Confirm HTTPS, certificate renewal, and that ports 3010/27017 are reachable only as intended; verify Nginx overwrites trusted client-IP headers.
2. Verify MongoDB authentication and database-specific privileges, without interrupting the other applications sharing that instance.
3. Verify restricted application/environment-file permissions and the encryption key used for communication secrets.
4. Verify a recent encrypted backup exists outside the VPS, that the recovery key is stored separately, and that monitoring notices backup failures.
5. Restore into a separate environment and verify representative stock totals, month locks, orders and account access. Keep external messaging disabled during the drill.
6. Measure memory, disk, response times and login latency under realistic use. Confirm old releases and communication logs are retained/cleaned according to policy.

## Primary references

- [Next.js security update, 14 October 2026](https://nextjs.org/blog/nextjs-security-update-october-14-2026): upgrade recommendation and affected feature conditions.
- [Next.js image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): upstream `sharp` mitigation.
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): PBKDF2-HMAC-SHA512 work factor and gradual hash upgrades.
- [Remaining braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): build dependency denial-of-service issue.

Dependency counts and release eligibility are snapshots from this review. Recheck them when deploying or preparing the next update.
