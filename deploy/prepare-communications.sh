#!/usr/bin/env bash
# Keep administrative commands available when the caller supplies a Node-only PATH.
export PATH="${PATH:-/usr/local/bin:/usr/bin:/bin}:/usr/sbin:/sbin"
# One-time additive setup after pulling this update; prints no credentials.
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
APP_ROOT=/opt/vetmech-field
ENV_FILE="$APP_ROOT/shared/.env"
NODE=/opt/vetmech-node/bin/node
[[ -x "$NODE" && -f "$ENV_FILE" && -f "$APP_ROOT/repository/scripts/mongo-setup.mjs" ]] || { echo 'Expected VETMECH installation was not found.' >&2; exit 1; }
# Preserve the encryption key across all releases. Never rotate this casually.
"$NODE" --input-type=module - "$ENV_FILE" <<'NODE'
import fs from 'node:fs';
import crypto from 'node:crypto';
const path=process.argv[2],text=fs.readFileSync(path,'utf8');
const line=text.split(/\r?\n/).find(l=>/^COMMUNICATIONS_SECRET=/.test(l));
if(!line||!line.slice(line.indexOf('=')+1).trim()){
 const value='COMMUNICATIONS_SECRET='+crypto.randomBytes(32).toString('hex');
 fs.writeFileSync(path,line?text.replace(/^COMMUNICATIONS_SECRET=.*$/m,value):text+'\n'+value+'\n',{mode:0o600});
}
fs.chmodSync(path,0o600);
NODE
chown vetmech:vetmech "$ENV_FILE"
runuser -u vetmech -- "$NODE" --env-file="$ENV_FILE" "$APP_ROOT/repository/scripts/mongo-setup.mjs"
echo 'Communication tables, 30-day log expiry and persistent encryption key are ready. Deploy the new release next.'
