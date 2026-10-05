# VETMECH Field: GitHub → VPS installation and updates

This guide is for the **Node.js + local MongoDB package**, on an Ubuntu/Debian VPS
with systemd and Nginx. Your existing main application stays on **port 8001**.
Examples use **mr.vetmechpharma.in**; replace this with your chosen subdomain.

**Release status:** the application build and simulated workflow checks passed.
Actual MongoDB replica-set integration could not run in the preparation environment.
The included GitHub Actions check runs that real integration test. Require it to
pass, then test your own database connection, before accepting real MR activity.
This package has not been installed on your VPS or uploaded to your GitHub account.

## 1. Domain and ports: what changes?

| Address/service | Public port | Internal destination |
|---|---:|---|
| Existing primary domain | Existing configuration, normally HTTPS 443 | Existing app on **8001** |
| `https://mr.vetmechpharma.in` | HTTPS **443** | MR app on **127.0.0.1:3010** |
| Local MongoDB | No public port required | Existing local MongoDB, usually 27017 |

**Yes: use a different internal port for the second application.** No second
public HTTPS port is required. Nginx chooses the application using the domain name.
Users will not type `:3010`. Do not open port 3010 or MongoDB to the internet.
Do not replace the primary-domain Nginx file or change its upstream port 8001.
If 3010 is occupied, choose another unused port and change both `.env` and the
MR subdomain's Nginx `proxy_pass`.

## 2. Prepare these values

| Setting | Example |
|---|---|
| GitHub owner | `YOUR_GITHUB_USERNAME` or organization |
| Private repository | `vetmech-field` |
| Deployment branch | `main` |
| MR subdomain | `mr.vetmechpharma.in` |
| VPS address | Your actual server IPv4 address |
| MongoDB database | `vetmech_field` — dedicated to this app |
| MongoDB user | `vetmech_app` — dedicated to this database |
| Replica-set name | Existing name, or `rs0` when newly configured |
| App port | `3010` |

The examples below contain placeholders. Replace them before running commands.
Never send passwords, a GitHub token, a private SSH key or `.env` in chat/GitHub.

## 3. Put the package into your GitHub account — once

On your computer, extract the ZIP and open its `vetmech-field` folder. The correct
folder contains `package.json`, `INSTALL-GITHUB.md`, `.github` and `.env.example`.
The ZIP deliberately has no `.git` history, server credentials, database or build.

Create an **empty private GitHub repository** named `vetmech-field`. Do not add a
README, license or gitignore in the GitHub creation form, because these files are
already in the package. Sign in using GitHub Desktop, or Git's credential manager.
GitHub account passwords do not authenticate command-line HTTPS pushes.

In Git Bash / a terminal in the extracted project folder:

```bash
git init -b main
git add .
git status
git commit -m "Initial VETMECH Field Node and MongoDB application"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/vetmech-field.git
git push -u origin main
```

Before the first commit, `git status` should not list `.env`, database dumps,
`node_modules`, `.next`, passwords or private keys. `.env.example` is safe: it
contains placeholders. Include hidden `.github` and `.gitignore` files.

**GitHub Desktop alternative:** add/create a local repository in the extracted
folder, commit all source files, then Publish repository with **Keep this code
private** selected. Do not create an extra nested project folder.

Open the repository's **Actions** tab. The supplied “Build and MongoDB integration”
workflow runs on pushes to `main` and pull requests. It uses synthetic data and a
temporary replica set, not your server database. Resolve any failed check before
deploying. It tests/builds; it does **not** automatically log into your VPS.

## 4. Check the VPS without changing the existing app

SSH into the VPS with your normal administrator account:

```bash
node --version
npm --version
mongod --version
nginx -v
command -v node
sudo ss -ltnp
```

Use Node 24 LTS, or another compatible supported version meeting `>=22.13.0`.
Do not replace a working system-wide Node installation blindly if other apps use
it. The `vetmech` service account must be able to run Node and pnpm; an installation
inside your personal NVM home directory may not be accessible to systemd.

Install only missing helper programs, and use the existing Nginx installation:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates nano openssh-client
sudo npm install --global pnpm@11.25.0
pnpm --version
```

If Nginx or Node is missing, have your server administrator install them first.
Do not run an unreviewed OS upgrade or change the current primary app's service.

## 5. Create an isolated app account and directories

These commands are for a **new installation** at `/opt/vetmech-field`. If that
folder/account already exists, inspect it first instead of overwriting it.

```bash
sudo useradd --system --user-group --create-home --home-dir /var/lib/vetmech --shell /bin/bash vetmech
sudo install -d -o root -g root -m 755 /opt/vetmech-field
sudo install -d -o vetmech -g vetmech -m 750 /opt/vetmech-field/releases
sudo install -d -o vetmech -g vetmech -m 700 /opt/vetmech-field/shared
sudo install -d -o vetmech -g vetmech -m 700 /var/lib/vetmech/.ssh
```

The primary app remains under its existing account/folder. Do not give `vetmech`
sudo access. Only your administrator runs the deployment command with sudo.

## 6. Give this server read-only access to the private repository

Generate a dedicated deploy key as the app account. For unattended pulls, press
Enter twice for an empty passphrase; the file stays protected on the server.
Do not overwrite an existing key with the same name.

```bash
sudo -u vetmech -H ssh-keygen -t ed25519 -C "vetmech-field-vps" -f /var/lib/vetmech/.ssh/id_ed25519
sudo cat /var/lib/vetmech/.ssh/id_ed25519.pub
```

Copy **only the `.pub` output**. In your GitHub repository, open **Settings → Deploy
keys → Add deploy key**. Name it `VETMECH VPS`, paste the public key and leave
**Allow write access unchecked**. Your computer can push; this server only pulls.

Test the connection:

```bash
sudo -u vetmech -H ssh -T git@github.com
```

On first connection, compare the displayed host fingerprint with GitHub's official
fingerprint page before accepting it. Successful authentication reports that GitHub
does not provide shell access; that message is expected (often exit status 1).

https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints

Clone into the dedicated directory:

```bash
sudo install -d -o vetmech -g vetmech -m 750 /opt/vetmech-field/repository
sudo -u vetmech -H git clone --branch main git@github.com:YOUR_GITHUB_USERNAME/vetmech-field.git /opt/vetmech-field/repository
```

## 7. Check MongoDB transactions and create the app database user

A locally installed MongoDB can be either standalone or a replica set. This app
requires replica-set transactions for stock reservations, gifts and period locks.
An authenticated `mongosh` session can inspect:

```javascript
db.hello().setName
```

If this shows your set name, retain it. If absent, ask the MongoDB administrator to
convert the existing standalone instance during a maintenance window. Back up all
its databases first. Preserve the existing dbPath and users, configure a replica-set
name and internal authentication (keyfile or X.509 when authorization is enabled),
restart MongoDB, and initialize the set **once** using an authorized admin account.
Do not disable authentication or rerun `rs.initiate()` on an existing replica set.
Existing applications may need their MongoDB URIs updated after the conversion.
A one-member replica set supports transactions but provides no failover redundancy.

Use the official version-specific conversion procedure rather than replacing your
whole MongoDB configuration:
https://www.mongodb.com/docs/v8.0/tutorial/convert-standalone-to-replica-set/

In an authenticated admin mongosh session, create a new dedicated database user
**if it does not already exist**:

```javascript
use vetmech_field
db.createUser({
  user: "vetmech_app",
  pwd: passwordPrompt(),
  roles: [{role: "readWrite", db: "vetmech_field"}]
})
```

Keep MongoDB bound to appropriate local/private interfaces. The app never needs
access to your shop's MongoDB collections. Do not reuse a database name used by
another application.

## 8. Store configuration outside GitHub

```bash
sudo -u vetmech cp /opt/vetmech-field/repository/.env.example /opt/vetmech-field/shared/.env
sudo chmod 600 /opt/vetmech-field/shared/.env
sudo -u vetmech nano /opt/vetmech-field/shared/.env
```

Set these values, with your real password, set name and domain:

```dotenv
MONGODB_URI=mongodb://vetmech_app:URL_ENCODED_PASSWORD@localhost:27017/vetmech_field?authSource=vetmech_field&replicaSet=rs0
MONGODB_DB=vetmech_field
APP_ORIGIN=https://mr.vetmechpharma.in
PORT=3010
NEXT_TELEMETRY_DISABLED=1
WHATSAPP_WEBHOOK_URL=
WHATSAPP_API_KEY=
WHATSAPP_SESSION=primary
```

Percent-encode special password characters in the URI. Set APP_ORIGIN to the exact
HTTPS address **without a trailing slash**. Leave WhatsApp values blank until your
gateway is configured. Existing WhatsApp services do not need to move ports.

Create an ignored symlink for one-time setup commands:

```bash
sudo -u vetmech ln -s /opt/vetmech-field/shared/.env /opt/vetmech-field/repository/.env
sudo -u vetmech -H bash
cd /opt/vetmech-field/repository
pnpm install --frozen-lockfile
pnpm db:setup
pnpm db:check
```

Expected: collections/indexes ready, then a transaction write/rollback succeeds.
If “replica set required”, fix MongoDB configuration first. Do not weaken the guard.
You are now in the `vetmech` shell; remain there for the next section.

## 9. Import existing data OR start empty

**Option A — keep your current app's data:** obtain a complete authorized D1 SQL
export or SQLite file from the existing app. This source ZIP is not a data backup.
Rehearse with a copy first. Pause writes on the original app during the final export
and switch, so no orders or attendance are lost between the two systems.

Place the export in a private location readable by `vetmech`, for example
`/opt/vetmech-field/shared/source-export.sql`, then:

```bash
node scripts/export-sqlite.mjs /opt/vetmech-field/shared/source-export.sql /opt/vetmech-field/shared/import.json
pnpm data:import /opt/vetmech-field/shared/import.json
```

The importer rejects a nonempty target database and verifies row/document counts.
Usernames, password hashes, customer IDs, stock history and archived reports are
preserved. Sessions are cleared; users must sign in again. Never commit the export
or generated JSON. Verify totals before removing private staging copies.

**Option B — genuinely new empty app:** instead of importing, run:

```bash
pnpm admin:create
```

Enter a new password of at least 12 characters. The initial username is `admin`;
the configured company-owner email is `vetmechpharma@gmail.com`. This command refuses
to overwrite an existing Admin. There is no default password. Create MRs from Team.

For either option, confirm the GitHub real MongoDB integration job is green.
A local real test is also available as `pnpm test:mongo`; without MONGO_TEST_URI it
starts a temporary replica set with synthetic data. Never grant the production app
user permission to create arbitrary test databases. See README for the isolated
MONGO_TEST_URI alternative.

Return to your administrator shell:

```bash
exit
```

## 10. Install the service and repeatable deployment command

```bash
sudo install -o root -g root -m 755 /opt/vetmech-field/repository/deploy/deploy-from-github.sh /usr/local/sbin/vetmech-deploy
sudo install -o root -g root -m 644 /opt/vetmech-field/repository/deploy/vetmech-field.service /etc/systemd/system/vetmech-field.service
command -v node
sudo nano /etc/systemd/system/vetmech-field.service
```

If Node is not `/usr/bin/node`, replace just that path in ExecStart with the
system-wide Node path. The app account must be able to execute it. The service
reads shared/.env and uses the `current` release link.

```bash
sudo systemctl daemon-reload
sudo systemctl enable vetmech-field
sudo vetmech-deploy
```

On first deployment this pulls `main`, creates a release, installs locked
dependencies, checks database transactions, builds, starts the service and checks
`/api/health`. It does not import data or reset passwords. Subsequent deployments
build while the previous release serves; there is a short restart interruption.
No schema/data migration is run automatically on updates.

Inspect the result:

```bash
sudo systemctl status vetmech-field --no-pager
curl -fsS http://127.0.0.1:3010/api/health
```

Expected JSON contains `"status":"ok"` and the deployed Git commit. This endpoint
exposes no credentials or customer data. It verifies database access and setup,
not every business workflow. Logs:

```bash
sudo journalctl -u vetmech-field -n 100 --no-pager
```

## 11. Set up the subdomain DNS

At your domain/DNS provider add:

| Type | Name | Value |
|---|---|---|
| A | `mr` | Your VPS public IPv4 address |

Keep the existing root (`@`) and `www` records unchanged. Only add an AAAA record
if this same VPS/Nginx is correctly configured for IPv6; an incorrect AAAA record
can break HTTPS validation. If using a DNS proxy, use DNS-only during initial
certificate setup, or follow your proxy provider's verified TLS procedure.

Wait for the subdomain to resolve to the correct server before requesting SSL.

## 12. Add a separate Nginx site and HTTPS

Use the current Nginx configuration directory on your server. On Ubuntu/Debian
with `sites-available` / `sites-enabled`:

```bash
sudo cp /opt/vetmech-field/repository/deploy/nginx-subdomain.conf.example /etc/nginx/sites-available/vetmech-field
sudo nano /etc/nginx/sites-available/vetmech-field
```

Change `server_name mr.example.com;` to `server_name mr.vetmechpharma.in;` (or your
chosen subdomain). Keep `proxy_pass http://127.0.0.1:3010;`, unless you selected a
different port. There must be only one server block for this hostname.

```bash
sudo ln -s /etc/nginx/sites-available/vetmech-field /etc/nginx/sites-enabled/vetmech-field
sudo nginx -t
sudo systemctl reload nginx
```

Run the reload only if `nginx -t` succeeds. Do not delete the primary-domain file
or change its port 8001. Ensure inbound 80/443 are allowed by your existing server
and provider firewalls. Do not reset your firewall or enable a new default policy
that might lock out SSH.

If Certbot already manages this server, reuse it. If absent, install it according
to the official Nginx/Linux instructions: https://certbot.eff.org/instructions
For a server already using snap, the common installation is:

```bash
sudo snap install --classic certbot
```

Do not install a second conflicting Certbot method. Then request a certificate
for **only** the MR subdomain using the nginx plugin:

```bash
sudo certbot --nginx -d mr.vetmechpharma.in --redirect
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

If your system-wide `certbot` command is not on PATH after snap installation, use
`sudo /snap/bin/certbot ...` for those Certbot commands.

Now open **https://mr.vetmechpharma.in**. Use HTTPS for login and GPS; plain HTTP is
only for initial certificate provisioning and redirects.

## 13. Verify before allowing real MR activity

- Confirm the primary domain still loads from its existing app on 8001.
- Log in as Admin and a test MR; check MR route/customer visibility.
- Check in/out on a mobile phone with location enabled; try duplicate attendance.
- Create primary stock, place an order, check reserved versus physical stock,
  deliver/cancel it and verify agency balances.
- Run the real concurrency test: competing reservations must not oversell.
- Check samples, gifts, approval requests, monthly totals and printed reports.
- MR edits/cancellations must be blocked outside the original order month.
- Admin-locked months must block changes even through direct API requests.
- Compare imported stock and sales totals with the original app.
- Configure WhatsApp only when ready to test actual notifications to selected
  recipients; blank gateway settings leave messages queued.

The original demo and this VPS are separate databases. Do not keep both accepting
real entries after the final data cutover.

## 14. Every future update: push, then deploy

**On your computer/development checkout:** apply the next code changes without
reinitializing Git or replacing `.git` or `.env`. If receiving another source ZIP,
merge its changed source files into this repository and review deletions as well.

```bash
git pull --ff-only origin main
git status
git add .
git commit -m "Describe this update"
git push origin main
```

Wait for the GitHub Actions checks to pass. Review any release notes requiring a
database migration or new environment variable. Make a current database backup.

**On the VPS**, run just:

```bash
sudo vetmech-deploy
```

The command internally runs `git pull --ff-only origin main`, refuses local changes
or unpublished local commits, builds a new release, switches the `current` symlink,
restarts only `vetmech-field`, and checks the exact deployed revision and database.
It does not modify the 8001 app or overwrite shared/.env. Failed builds leave the
old app serving. If startup/health fails after switching, the command attempts to
restore the previous app release and reports the failure.

Pulling code alone is not sufficient: React/Next changes require a new build and
service restart. Do not edit files inside a deployed release or run `git reset
--hard` to hide a conflict. Resolve local changes explicitly.

If an update changes the deployment script or systemd unit itself, review those
changes, reinstall the root-owned files using section 10, and run daemon-reload.
They are deliberately not replaced silently by a normal application update.

## 15. Rollback and backups

To return to the previous successfully retained application release:

```bash
sudo vetmech-deploy --rollback
```

This changes **code only**; it does not rewind sales, stock, customer records or
MongoDB schema. Roll back only when the prior code supports the current database.
After a schema-changing update, use that update's specific recovery procedure.
The script reports failure if no previous release exists. Review service logs after
any failed deployment. Retained releases use disk space; remove old releases only
after checking that neither `current` nor `previous` points to them.

Use your existing MongoDB backup system if available, with daily off-server copies
and a tested restore. Do not upload backups to the source repository.

For a small dedicated app database, an administrator can take a consistent
maintenance backup by stopping **only the MR app** and preventing other writers to
this app database during the dump. Use MongoDB Database Tools and a root-only YAML
file `/etc/vetmech-mongodump.yml` containing an authorized backup URI:

```yaml
uri: "mongodb://BACKUP_USER:ENCODED_PASSWORD@localhost:27017/vetmech_field?authSource=vetmech_field&replicaSet=rs0"
```

Give the file mode 600 and use a database user authorized to read this database.
Then run these in an administrator shell; always restart the service afterward,
including if the dump fails:

```bash
sudo install -d -m 700 /var/backups/vetmech-field
VM_BACKUP_FILE="/var/backups/vetmech-field/backup-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
sudo systemctl stop vetmech-field
sudo mongodump --config=/etc/vetmech-mongodump.yml --db=vetmech_field --archive="$VM_BACKUP_FILE" --gzip
VM_DUMP_STATUS=$?
sudo systemctl start vetmech-field
printf 'Backup exit status: %s (0 means success)\n' "$VM_DUMP_STATUS"
```

The example uses a timestamped filename; do not overwrite your last good backup. Check the dump command's exit status and test restoration into a
**different isolated database** before trusting the backup. The root-only URI file
avoids putting the password directly in the command-line process list. For a
no-downtime snapshot of a busy replica set, use an administrator-designed consistent
backup/oplog procedure; a live multi-collection dump alone may be inconsistent.

## 16. Troubleshooting

| Symptom | Check / action |
|---|---|
| GitHub Permission denied (publickey) | Deploy key belongs to this exact repository; clone/pull runs as `vetmech`; verify SSH file permissions. |
| Git pull refuses local changes | Inspect `git status`; reconcile/commit deliberately. Do not discard changes blindly. |
| Replica set required | Check `db.hello().setName`, URI replicaSet and actual MongoDB configuration. |
| MongoDB authentication failed | Database user, encoded password and authSource must match. |
| Node/pnpm not found in service | Use a system-wide executable accessible to `vetmech`; check ExecStart and PATH. |
| Address already in use | Check `sudo ss -ltnp`; choose a free port and change .env + Nginx together. |
| Nginx 502 | Check MR service logs, port and `curl http://127.0.0.1:3010/api/health`. |
| Login “request not allowed” | APP_ORIGIN must exactly match the HTTPS domain; preserve Nginx Host forwarding. |
| GPS unavailable | Use HTTPS, allow browser/OS location access, and test on a phone outdoors. |
| New code not visible | Confirm deploy succeeded, compare health release SHA and refresh browser. |
| Month/order read-only | Check order month and Admin lock; MR cannot edit historical months even if reopened. |
| Primary domain stops working | Restore its original Nginx configuration; only MR's separate server block should change. |
| Certificate failure | Verify DNS A/AAAA, 80/443 reachability, server_name and existing Certbot setup. |

## 17. Directory layout and responsibility

| Path | Purpose |
|---|---|
| `/opt/vetmech-field/repository` | GitHub checkout, branch main; not the running build |
| `/opt/vetmech-field/releases/<time>-<sha>` | Separately built application releases |
| `/opt/vetmech-field/current` | Symlink to the running release |
| `/opt/vetmech-field/previous` | Retained code rollback target |
| `/opt/vetmech-field/shared/.env` | Persistent secrets/settings outside Git |
| `/usr/local/sbin/vetmech-deploy` | Root-owned update/rollback command |
| `/etc/systemd/system/vetmech-field.service` | MR service definition |
| `/etc/nginx/sites-available/vetmech-field` | MR subdomain only |

GitHub stores source/history. MongoDB stores business data. The shared environment
file stores connection settings. They are separate and must be backed up accordingly.

## Official references

- GitHub import: https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github
- Deploy keys: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys
- Nginx host routing: https://nginx.org/en/docs/http/request_processing.html
- Nginx reverse proxy: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- HTTPS: https://certbot.eff.org/instructions
- MongoDB backup tools: https://www.mongodb.com/docs/database-tools/mongodump/

- GitHub Node workflow action: https://github.com/actions/setup-node
- GitHub checkout action: https://github.com/actions/checkout
