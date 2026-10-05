#!/usr/bin/env bash
# Install root-owned as /usr/local/sbin/vetmech-deploy. Do not run from a web endpoint.
set -Eeuo pipefail
umask 027
APP_ROOT=/opt/vetmech-field
RUN_USER=vetmech
SERVICE=vetmech-field
REPO="$APP_ROOT/repository"
SHARED_ENV="$APP_ROOT/shared/.env"
MODE="${1:-deploy}"
[[ "$EUID" == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
[[ "$MODE" == deploy || "$MODE" == --rollback ]] || { echo 'Usage: vetmech-deploy [--rollback]' >&2; exit 1; }
exec 9>/run/lock/vetmech-field-deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
[[ -f "$SHARED_ENV" ]] || { echo 'Missing shared/.env; follow INSTALL-GITHUB.md.' >&2; exit 1; }
# Parse dotenv with Node, never source it as shell code. Only a validated port is output.
PORT=$(runuser -u "$RUN_USER" -- node --env-file="$SHARED_ENV" -e 'const p=process.env.PORT||"3010";if(!/^\d+$/.test(p)||+p<1024||+p>65535)process.exit(1);process.stdout.write(p)')
OLD=$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)
if [[ ! -d "$OLD" ]]; then OLD=''; fi
if [[ "$MODE" == --rollback ]]; then
  RELEASE=$(readlink -f "$APP_ROOT/previous" 2>/dev/null || true)
  [[ "$RELEASE" == "$APP_ROOT/releases/"* && -f "$RELEASE/REVISION" ]] || { echo 'No previous release available.' >&2; exit 1; }
  echo 'Rolling back application code only. Database data is not restored.'
else
  [[ -d "$REPO/.git" ]] || { echo 'Clone the GitHub repository first.' >&2; exit 1; }
  [[ -z $(runuser -u "$RUN_USER" -- git -C "$REPO" status --porcelain) ]] || { echo 'Repository has local changes. Commit/reconcile them first; nothing was discarded.' >&2; exit 1; }
  [[ $(runuser -u "$RUN_USER" -- git -C "$REPO" branch --show-current) == main ]] || { echo 'Repository must be on main.' >&2; exit 1; }
  runuser -u "$RUN_USER" -- git -C "$REPO" pull --ff-only origin main
  SHA=$(runuser -u "$RUN_USER" -- git -C "$REPO" rev-parse HEAD)
  [[ "$SHA" == $(runuser -u "$RUN_USER" -- git -C "$REPO" rev-parse origin/main) ]] || { echo "Local main differs from GitHub main; reconcile it first." >&2; exit 1; }
  RELEASE="$APP_ROOT/releases/$(date -u +%Y%m%dT%H%M%SZ)-${SHA:0:12}"
  install -d -o "$RUN_USER" -g "$RUN_USER" -m 750 "$RELEASE"
  runuser -u "$RUN_USER" -- git -C "$REPO" archive HEAD | runuser -u "$RUN_USER" -- tar -x -C "$RELEASE"
  runuser -u "$RUN_USER" -- ln -s "$SHARED_ENV" "$RELEASE/.env"
  runuser -u "$RUN_USER" -- bash -c 'printf "%s\n" "$2" > "$1/REVISION"' _ "$RELEASE" "$SHA"
  # Install and build as the application user, while the old release still serves.
  runuser -u "$RUN_USER" -- bash -c 'set -e; cd "$1"; CI=true pnpm install --frozen-lockfile; pnpm db:check; pnpm build' _ "$RELEASE"
fi
SHA=$(cat "$RELEASE/REVISION")
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release revision.' >&2; exit 1; }
[[ -f "$RELEASE/.next/standalone/server.js" ]] || { echo 'Release build is missing.' >&2; exit 1; }
# All releases use the same environment/database. Check it before switching.
runuser -u "$RUN_USER" -- node --env-file="$SHARED_ENV" "$RELEASE/scripts/mongo-preflight.mjs"
switched=0
recover(){
  local rc=$?
  trap - ERR
  if [[ "$switched" == 1 ]]; then
    if [[ -n "$OLD" && "$OLD" == "$APP_ROOT/releases/"* ]]; then
      ln -sfn "$OLD" "$APP_ROOT/.current-restore"
      mv -Tf "$APP_ROOT/.current-restore" "$APP_ROOT/current"
      systemctl restart "$SERVICE" || true
      echo 'New release failed. Previous application release restored; check service logs and health.' >&2
    else
      systemctl stop "$SERVICE" || true
      rm -f "$APP_ROOT/current"
      echo 'First deployment failed and the service was stopped. Check service logs.' >&2
    fi
  fi
  exit "$rc"
}
trap recover ERR
ln -sfn "$RELEASE" "$APP_ROOT/.current-next"
mv -Tf "$APP_ROOT/.current-next" "$APP_ROOT/current"
switched=1
systemctl restart "$SERVICE"
runuser -u "$RUN_USER" -- node "$RELEASE/scripts/wait-healthy.mjs" "$PORT" "$SHA"
if [[ -n "$OLD" && "$OLD" != "$RELEASE" ]]; then
  ln -sfn "$OLD" "$APP_ROOT/.previous-next"
  mv -Tf "$APP_ROOT/.previous-next" "$APP_ROOT/previous"
fi
trap - ERR
printf 'Deployed %s on internal port %s.\n' "$SHA" "$PORT"
echo 'Keep previous releases until verified. No database data or environment file was deleted.'
