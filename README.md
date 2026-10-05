# VETMECH Field — GitHub and VPS package

Start with **[INSTALL-GITHUB.md](INSTALL-GITHUB.md)** for the complete setup.

- Existing primary app: keep port **8001**.
- MR app: **127.0.0.1:3010**, reached through its HTTPS subdomain via Nginx.
- Source: your private GitHub repository, branch `main`.
- Database: your local MongoDB, in a dedicated database with replica-set transactions.
- Updates: push to GitHub, wait for checks, then run `sudo vetmech-deploy` on the VPS.
- Code rollback: `sudo vetmech-deploy --rollback`.

## Verification status

The Node.js production build and the workflow regression tests against a MongoDB
query model passed. Actual MongoDB could not start in the preparation environment
(`open: Operation not permitted`), so **real replica-set integration remains a
release gate**. The supplied GitHub Actions workflow runs that integration test,
including simultaneous stock reservations, before building the app. Do not deploy
real business data while that check is failing.

Deployment-script staging/rollback tests use simulated service/dependency commands.
They verify orchestration logic, not your VPS, DNS, certificate or MongoDB settings.
No GitHub repository, server service or live data has been changed by making this
package. The existing Sites demo and this server installation use separate databases.

## Included

- React interface, Next.js production Node server and native MongoDB storage.
- Admin/MR independent authentication; no ChatGPT login or Cloudflare runtime required.
- GPS attendance, orders/stock, samples/gifts, reports and approval workflows.
- MR order changes restricted to the original calendar month (India time).
- Admin locks block order changes until explicitly reopened; MRs still cannot edit
  a historical month's order after reopening.
- Data export/import, new-admin setup and database transaction preflight scripts.
- Separate release builds, shared private environment file, health check, systemd
  service, Nginx subdomain template and GitHub checks.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm db:setup
pnpm db:check
pnpm test:mongo
pnpm build
```

These commands need the environment/data setup described in INSTALL-GITHUB.md.
`pnpm test:mongo` starts an isolated temporary replica set unless MONGO_TEST_URI is
supplied. A supplied test URI must use credentials able to create/drop temporary
`vetmech_test_<random>` databases; do not give the production application user those
extra privileges. No production database is used by the test runner.

Optional query-model regression: `MONGO_TEST_MODE=model pnpm test:mongo`.
It is not a substitute for the real integration test. Deployment-script check:
`python3 tests/deployment-orchestration.py` in an isolated root-owned test container.

## Database implementation

MongoDB is authoritative. `lib/mongo` preserves existing application-owned query
templates through a restricted compatibility layer that executes native MongoDB
finds, aggregations and document writes. It is not a public SQL endpoint and has
no SQLite dependency at runtime. Unsupported syntax fails closed.

JSON/text fields remain compatible with the UI and archived reports. Parsed `_json`
mirrors support Mongo filters; all application writes refresh them. Every business
write/batch uses a session transaction and shared revision document to prevent
write-skew between guards and updates. This serializes writes and requires load
testing for large deployments; no concurrency capacity has been benchmarked.

Use application services for writes. Manual MongoDB edits bypassing transaction
checks and JSON mirrors can break consistency. The importer refuses a nonempty
target, preserves IDs/password hashes and clears login sessions. No default password
or automatic production data seed is provided.

Secrets stay in shared/.env, business data stays in MongoDB, and source history
stays in GitHub. Maintain backups of each as described in the installation guide.
