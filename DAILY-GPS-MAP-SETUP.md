# Daily GPS map setup

The **Field work → Daily GPS map** screen shows one MR and one date (Indian Standard Time). Admin can select any MR, including inactive accounts for historical review. MRs can see only themselves.

- Green: attendance check-in. Blue: visit GPS. Purple: visit-closing GPS. Red: checkout.
- Pins and the location list are numbered in capture-time order. Click a pin or list entry to select it.
- Saved locality/address, capture time, accuracy and coordinates are shown. Older entries without an address remain usable.
- Straight-line kilometres add the gaps between captures. **Calculate road estimate** requests a Google driving route through those same captures in the same order. Neither measure proves actual travel or mileage reimbursement.
- Export GPS CSV contains recorded information only. Print uses the readable location list; interactive maps and temporary Google results are screen-only.
- Historical visits whose original GPS was never saved cannot have that point reconstructed. Original visit address fields are now preserved when a visit closes.

## Google Cloud configuration

1. Create/select your Google Cloud project, enable billing, and enable **Maps JavaScript API**, **Routes API** and **Geocoding API**.
2. Create a **browser API key**. Restrict it to Maps JavaScript API and your website referrers, including `https://mr.vetmechpharma.in/*`. Add a demo origin only if you use one.
3. In Map management, create a **JavaScript map ID**. Copy the map ID, not a style ID.
4. Create a separate **server API key** restricted to Routes API and Geocoding API and your VPS public outbound IP address.
5. Open **Admin → Controls & settings → Management settings → Daily GPS map**. Enter the browser key, map ID and server key. Enable Google Maps and save.
6. Refresh any map screen that was already open. Select a date with at least two GPS captures. Confirm the pins, then request a road estimate and an address lookup.

The server key is encrypted using the existing `COMMUNICATIONS_SECRET` environment setting. It is never returned to the browser. If your communication secret is not configured, use the existing `deploy/prepare-communications.sh` procedure and redeploy first. Preserve that secret in your external backups; replacing it prevents existing encrypted credentials from being read. A blank server-key field preserves the saved key; the separate remove option clears it.

## Usage and failure handling

Google billing must be active even when usage falls within a free allowance. Configure daily API quotas and billing alerts in Google Cloud; an alert alone is not a spending cap. Current pricing and eligibility: https://developers.google.com/maps/billing-and-pricing/pricing-india

The map loads when opened. Road estimates and Google address lookups occur only on explicit request. Requests are limited to 12 per minute per signed-in user; a route request can involve multiple Google calls. No Google key is included in audit history.

Routes contain at most 25 intermediate stops per request. Longer days are split with an overlapping boundary stop so no leg is lost. Requests with more than 10 intermediate stops may use a higher pricing tier. The road estimate supports at most 200 captures; larger days still show their saved pins. A missing route segment produces an error instead of a misleading partial total.

Google addresses and routes are displayed temporarily and are not written into customer records or exported. Saved coordinates and existing locality names remain available if Google fails or is disabled. The publicly accessible `/maps-information` page explains map data use and links Google's terms and privacy policy.

This feature does not enable continuous background GPS, upload photos, change attendance or overwrite a customer's postal address.
