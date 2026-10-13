# VETMECH MR — Native Android client (development)

Separate React Native / Expo Android app for the live VETMECH Field server at https://mr.vetmechpharma.in. The existing Next.js/MongoDB backend and portal are not altered by this folder.

## Existing server APIs (verified against the source)
- `POST /api/auth/login` → HttpOnly __Host-vetmech-session cookie; MR role required.
- `GET /api/session` and `POST /api/auth/logout`.
- `GET/POST /api/records` (attendance, visits, expenses, customers; invoice writes deliberately blocked).
- `GET/POST/PATCH /api/commerce` (invoices, stock, secondary sales, order edits).
- `GET /api/attendance?month=YYYY-MM`, `POST /api/visits/close`.
- `GET/POST /api/followups`, `GET /api/monthly-report`, `GET/PATCH /api/notifications`.

## Build
1. Node 20 and Android SDK (or the GitHub Actions workflow).
2. `cd mobile && npm install`
3. `npx expo prebuild --platform android`
4. `cd android && ./gradlew assembleDebug`
5. Install `android/app/build/outputs/apk/debug/app-debug.apk` on a test device.

This is an actual React Native app, not a WebView. The backend alone controls authorization, price calculation, stock, GPS validation, and month locks. No database connection strings, credentials, or session secrets are shipped in the APK.

## Validation / release gates
- TEST with an MR test account in a non-production database first.
- Confirm native Android cookie persistence through login + /api/session on a real phone.
- Check GPS permission, 3-minute fresh GPS limit, and visit close before checkout.
- Confirm the deployed server matches the repository and its data/API schemas.
- Confirm stockist-linked clinic orders, pricing, stock and idempotent retries.
- Inspect GitHub Actions Android build; no production APK/release claimed yet.
- Complete remaining advanced modules (route planning, samples/gift allotment workflows, order-edit approval UX, print/PDF and offline sync) before claiming full feature parity.
