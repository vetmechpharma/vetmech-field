# VETMECH Field Force — encrypted external backup and recovery

This backs up this complete application's recoverable source, database and configuration, not the entire VPS or your other applications. Photos are disabled; if other uploaded files exist, set uploadsPath to their folder under /opt/vetmech-field/shared/. Backups include secrets and personal data and must remain encrypted. The encryption password must also be stored separately off the VPS (password manager / offline recovery copy). Losing it means losing recovery access.

## External destination required
Choose an SFTP server on another machine or an S3-compatible bucket in a separate account. Use a dedicated repository, restricted credentials and off-server retention/version protection. Do not use the same VPS, its mounted local disk, or localhost. GitHub source alone is not a database or configuration backup.

Install restic and MongoDB Database Tools from their official supported packages. Configure SSH host verification and an unattended restricted backup key for SFTP, or the provider's access keys for S3. Never disable host verification. Validate your destination belongs to you before activating.

As root create /etc/vetmech-backup.env (mode 600), for example:

    RESTIC_REPOSITORY=sftp:backupuser@YOUR_EXTERNAL_SERVER:/backups/vetmech-field
    RESTIC_PASSWORD_FILE=/etc/vetmech-backup.password

For S3 use restic's documented s3 endpoint and AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY. Save the encryption password in /etc/vetmech-backup.password (mode 600). Keep a separate offline copy. Do not put these files in GitHub.

Create /etc/vetmech-backup.json (root-owned mode 600):

    {"exclusiveAppWriter": true}

Set this true only after confirming all writers to vetmech_field belong to vetmech-field.service. Stop any separate import jobs or workers during backup. Other databases continue operating. The script stops ONLY vetmech-field briefly during its database dump, then restarts it before upload. It does not stop MongoDB or other sites. The nightly timer uses India time. A database with independent writers requires an alternative coordinated backup procedure.

Initialise the external repository once using restic init with these environment variables loaded securely. Test `restic snapshots` as root with the same environment. Do not reinitialise or delete an existing repository.

Install the runner and its dependency in a separate ROOT-OWNED directory. Never run a root backup timer from a directory writable by the web app:

    sudo install -d -m 700 /usr/local/lib/vetmech-backup
    sudo install -m 600 scripts/external-backup.mjs /usr/local/lib/vetmech-backup/external-backup.mjs
    sudo /opt/vetmech-node/bin/npm install --prefix /usr/local/lib/vetmech-backup --ignore-scripts mongodb@7.6.0
    sudo chown -R root:root /usr/local/lib/vetmech-backup
    sudo chmod -R go-rwx /usr/local/lib/vetmech-backup

After future reviewed backup-script updates, replace this root-owned copy explicitly. Copy deploy/vetmech-backup.service and .timer to /etc/systemd/system/, then:

    sudo systemctl daemon-reload
    sudo systemctl start vetmech-backup.service
    sudo systemctl status vetmech-backup.service --no-pager

Check Admin → Settings → External backup & recovery for the snapshot ID and success time. Only after a successful manual run:

    sudo systemctl enable --now vetmech-backup.timer

No automatic snapshot deletion is enabled. Set remote retention with your storage administrator after a successful restore drill (suggested starting policy: daily 30, weekly 12, monthly 12). Failed uploads keep root-only staging files for diagnosis; successful uploads remove staging. Check disk space after failures. Service logs suppress tool stderr to prevent credential leakage. Monitoring flags no success within 36 hours; use an independent external uptime/backup monitor as well, since a failed VPS cannot display its own alert. The dashboard's restore drill field remains unverified until independently tested; repository metadata checks are not a restored database test.

## Restore without overwriting the live site
Use a separate recovery server, or an isolated directory and NEW database on your existing server. Use your external repository credentials and password. Inspect `restic snapshots --tag vetmech-field`; choose the exact snapshot ID. Run:

    restic restore SNAPSHOT_ID --target /srv/vetmech-recovery --verify

The stage folder is restored under /srv/vetmech-recovery/var/lib/vetmech-backup/stage. Protect this directory mode 700; it contains the app's .env secrets. Run scripts/verify-restored-backup.mjs with that directory as its single argument using Node. This validates required-file hashes. Do not serve this directory through Nginx.

Read manifest.json for the deployed release. Extract source.tar into a NEW empty source directory. Install the recorded Node/pnpm versions (package.json), then pnpm install --frozen-lockfile. Do not source application.env as shell commands.

On a separate Mongo replica-set recovery instance, or with a database-scoped recovery user, restore to a NEW empty database named vetmech_field_restore_test:

    mongorestore --config=/root/recovery-mongo.yml --archive=/srv/vetmech-recovery/var/lib/vetmech-backup/stage/database.archive.gz --gzip --nsFrom='vetmech_field.*' --nsTo='vetmech_field_restore_test.*'

/root/recovery-mongo.yml contains the recovery instance URI and is mode 600. Confirm that the target database is empty before import; never use --drop on the production database. Users/roles are not included in this database-scoped dump: create a new restricted recovery app user separately. Preserve COMMUNICATIONS_SECRET from application.env to decrypt saved gateway/SMTP settings.

Copy application.env into the isolated checkout .env; change MONGODB_URI/MONGODB_DB to the test database and APP_ORIGIN/PORT to the recovery host. Disable outbound WhatsApp/SMTP in the isolated database before starting or exercising workflows; do not send old pending messages. Run pnpm db:setup, pnpm db:check, pnpm build and verify health, Admin login, MR records, sample balances, batch availability, month locks and a report against the saved production figures. Restore uploads to the isolated path if included. Record date, snapshot and verification results in your operations log.

Only after successful isolated testing, plan production cutover: stop the Field Force service, retain the current DB/config for rollback, point the service to the verified restored release and database, recreate reviewed service/Nginx settings for the new host and issue a fresh Let's Encrypt certificate. Source includes all deployment templates and lockfiles; dependencies are reinstalled. TLS private keys and the system Node binaries are intentionally not copied. Configure DNS if the server changed. Verify HTTPS and application health before enabling the backup timer and outbound messaging. Never restore the shared Mongo data directory over other applications' databases.

Official references:
- https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html
- https://restic.readthedocs.io/en/stable/050_restore.html
- https://www.mongodb.com/docs/database-tools/mongodump/
- https://www.mongodb.com/docs/database-tools/mongorestore/
