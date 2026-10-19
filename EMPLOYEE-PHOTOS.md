# Employee profile photos

Admin → MR management → Add representative or Manage representative → Add photo / Change photo → Save representative.

- Preview the photo before saving. Cancel discards the change; Undo photo change restores the current photo in the form.
- Remove photo returns the employee to their initials after saving.
- JPG, PNG and WebP files up to 10 MB can be selected. The browser crops a square preview and compresses it before upload. The server validates and re-encodes it as a 256 × 256 WebP, stripping metadata.
- Photos appear on MR cards, the Admin MR profile and the employee's workspace avatar. Refresh an already-open MR workspace after an Admin update.
- Only Admin can change photos. Admin can view employee photos; each MR can view their own. The image endpoint requires a current login.
- MongoDB stores only one current image per employee, under 96 KB before base64 encoding. Replacing/removing it discards the previous image from the live collection. Existing backup snapshots retain their original contents.
- Full database backups include the `employee_photos` collection. Nothing is stored in a temporary deployment folder; uploads survive code releases.

## VPS update

Run the following in the VPS terminal as root. The setup is additive: it creates the photo collection/index and does not clear accounts or existing data. It uses the same `vetmech_field` database.

```bash
sudo -u vetmech -H git -C /opt/vetmech-field/repository pull --ff-only origin main

sudo -u vetmech -H /opt/vetmech-node/bin/node \
  --env-file=/opt/vetmech-field/shared/.env \
  /opt/vetmech-field/repository/scripts/mongo-setup.mjs

sudo systemd-run --scope --unit=vetmech-build \
  -p MemoryMax=1G \
  -p MemorySwapMax=512M \
  -p CPUQuota=50% \
  /usr/bin/env \
  PATH="/opt/vetmech-node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  NODE_OPTIONS=--max-old-space-size=768 \
  /usr/local/sbin/vetmech-deploy

curl -fsS https://mr.vetmechpharma.in/api/health
```

The health response should show the commit deployed from GitHub. Refresh the app, then open MR management to add the first photo. No Nginx or WhatsApp configuration change is required.
