# Monthly tour programme

VETMECH Field Force MR App now requires an **Admin-approved monthly route programme before MR visits can be entered or closed**. This replaces the previous permission to record visits without a tour. Start Day and fresh GPS requirements still apply.

## Set up before the first field day

1. Admin opens **Tour plan → Monthly tour programme**, selects **Next month** (or any future month), and opens **Company holidays**. No MR selection is needed to publish shared holidays.
2. Add each applicable festival or company holiday by date, holiday name and note, then select **Publish holidays for all MRs**. Sundays are automatic holidays. Republic Day, Independence Day and Gandhi Jayanti remain in the shared calendar. Publish before the current month ends so MRs can prepare next month.
3. MR opens **Tour plan → Monthly tour programme**, chooses the month and assigns one or more accessible routes to each working date. The bulk-fill button repeats selected routes across working days; individual days can then be adjusted. Leave days require a reason.
4. MR selects **Submit month for approval**. Draft and pending programmes do not permit visits.
5. Admin opens **Approvals → Tour programme approvals**, reviews every date and approves or rejects with a reason. The MR receives an in-app notification.
6. After approval, the MR refreshes their workspace, starts the field day and records visits in that day's approved routes.

Future months can be prepared in advance. A first programme created partway through the current month starts from today; earlier attendance and visits remain unchanged. Approval never carries into the next month. Each new month needs its own approved programme.

## Shared monthly holiday calendar

Each month has its own company-wide holiday calendar, publication status and revision. Publishing December does not invalidate November’s pending tour approvals. MRs see the same holiday dates and notes; they cannot edit the shared calendar. They can save a tour draft beforehand, but submission requires Admin to publish that month’s holidays. Publication sends an in-app notification to active MRs.

A **2026 Central government reference** for Delhi/New Delhi offices can populate the selected month. It is optional and is not a complete Tamil Nadu or all-state calendar. Admin must review regional festivals and company holidays before publication. Dates are not automatically fetched or approved from external holiday lists.

Reference sources used for the 2026 Central preset:

- [Income Tax Department directory, holiday list](https://www.incometaxindia.gov.in/documents/d/guest/departmental-directory2026-1)
- [DoPT: holiday on 14 April 2026](https://dopt.gov.in/sites/default/files/Declaration%20of%20Holiday%20on%2014.04.2026%20-%20Birthday%20of%20Dr.%20B.R.%20Ambedkar.pdf)
- [DoPT: Id-ul-Zuha date amendment](https://dopt.gov.in/sites/default/files/Change%20in%20the%20date%20of%20holiday%20of%20Id-ul-Zuha.PDF)

If this month’s holiday calendar changes while a programme or holiday work request is pending, Admin must reject that submission so the MR can review and resubmit. Adding a holiday removes ordinary route tasks for that date from active planned visits. Removing a holiday cancels individual holiday work permissions for that date; a date without an ordinary approved route needs a route-change request. A Sunday remains a holiday even if its festival label is removed. Past dates, closed periods and dates with open visits cannot be changed.

On upgrade, an already reviewed annual calendar remains usable for current or past months with an existing approved programme. A new month without an approved programme requires explicit monthly publication. Previous annual calendar records and archived monthly reports are retained.

## Request permission to work on a holiday

1. MR chooses the month and selects **Request to work** on a Sunday or another published holiday.
2. Select one or more accessible routes and provide a reason. This can be done before submitting the monthly programme.
3. Admin opens **Approvals → Tour programme approvals** and reviews the MR, date, holiday note, original plan and requested routes. Approve or reject; rejection requires a reason.
4. Approval applies only to that MR and date. The shared holiday remains unchanged for other MRs. The route’s eligible customers appear in planned visits once the monthly programme is also approved.
5. **Both approvals, Start Day and existing GPS/customer-access requirements apply to visits.** A holiday permission by itself does not unlock a missing, draft or pending monthly programme.

An MR can withdraw a pending request. After approval, **Change holiday work** lets the MR request different routes or cancellation. Existing permission stays active until Admin approves that change. Duplicate pending requests for the same MR/date are blocked. Regular date changes and holiday requests can be reviewed independently. Past-date approval, disabled accounts, inaccessible routes and locked periods are rejected. Requests whose dates passed must be rejected and submitted again with new dates.

Attendance shows unused holidays in **purple**, separately from personal leave and missing work records. On an approved holiday work date, a missed check-in/check-out is shown as incomplete or missing. Actual GPS check-in and checkout make the day green and calculate working duration; approval alone does not create attendance. A recorded check-in on a holiday without recorded permission remains visible to Admin with that distinction. Reports include holiday notes and individual holiday work decisions.

## Change, postpone or request leave

From an approved programme, select **Request change** on today or a future working date:

| Request | Result after Admin approval |
| --- | --- |
| Change routes / return to work | Replaces that date's route selection; approved leave on that date is removed without cancelling the rest of a leave range. |
| Postpone / swap two dates | Exchanges the route schedules of the original date and a later working date. Both dates must belong to approved programmes. This also works across two approved months. |
| Mark leave | Marks the selected working date or range as approved leave and updates attendance. Sundays and holidays are excluded. |

The MR must provide a reason. Admin sees the original and requested schedules before deciding. **The current approved schedule stays in force while the request is pending.** Only one change request per affected monthly programme can await review at a time. A pending request can be withdrawn by its MR.

The existing Attendance → Apply for leave button sends a tour change request when it overlaps an approved programme. Tour-linked leave is reviewed under Tour programme approvals. A working check-in still counts as a working day on approved leave, but recording visits requires an approved working-route change.

Open visits must be closed before a date change can be requested or approved. Past dates cannot be changed; stale requests must be rejected and requested again with future dates. Previous monthly programmes are view-only to MRs. Closed reporting periods also prevent programme changes.

## Pending visits, history and reports

- On approval, accessible and eligible customers in each route are captured as that date's planned visits. Duplicate route/date/customer tasks are suppressed.
- Customers can be visited only through today's approved routes. Customer access, availability status, Start Day, same-day closing and GPS checks still apply.
- Route/date changes preserve the original schedule, reason, reviewer and time. Approved leave or moved schedules remove the affected tasks from active pending visits while retaining history.
- One completed customer visit counts as monthly coverage. Cancelled or postponed tasks alone do not count as visits.
- Admin can review all monthly programmes, requests and history. MR reports and PDF exports include the daily programme, approved changes and holiday work decisions alongside customer coverage.
- Month-closing review includes unresolved monthly tour submissions and change requests.

## Update the existing VPS

Wait for the GitHub **Build and MongoDB integration** check to pass. Paste this complete block into the VPS terminal. The deployment pulls GitHub, builds a release, checks health and switches the running release. The full PATH includes `runuser`.

```bash
sudo bash <<'VETMECH_UPDATE'
set -Eeuo pipefail

sudo -u vetmech -H git -C /opt/vetmech-field/repository pull --ff-only origin main

sudo -u vetmech -H /opt/vetmech-node/bin/node \
  --env-file=/opt/vetmech-field/shared/.env \
  /opt/vetmech-field/repository/scripts/mongo-setup.mjs

systemd-run --scope --unit=vetmech-build \
  -p MemoryMax=1G \
  -p MemorySwapMax=512M \
  -p CPUQuota=50% \
  /usr/bin/env \
  PATH="/opt/vetmech-node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  NODE_OPTIONS=--max-old-space-size=768 \
  /usr/local/sbin/vetmech-deploy

systemctl is-active vetmech-field
curl -fsS https://mr.vetmechpharma.in/api/health
VETMECH_UPDATE
```

After deployment, refresh the application and complete the Admin holiday-calendar setup before MRs attempt visits. The health response's release value should match the deployed GitHub commit. No new port or Nginx change is required.

Monthly programmes use the existing MongoDB records and workflow-request collections. Database setup is additive and also includes earlier employee-photo setup if that release was not installed. Accounts, stock, visits and environment settings are retained. Existing full database backups include the new programmes and calendars.

## Verification

The automated suite covers authentication/ownership, complete working-day plans, monthly publication and revision isolation, shared holiday notes, individual holiday work approval/rejection/cancellation, approval before monthly submission, holiday attendance, calendar removal, approval permissions, duplicate tasks, visit/draft restrictions, route and date changes, leave attendance, month rollover, reporting-period locks, immutable schedule history and transactional conflict detection. UI tests exercise multi-route selection, holiday exclusions, draft/submit/withdraw actions, request previews, holiday work forms, next-month holiday publication and Admin approval controls. GitHub CI also runs these handlers against an isolated MongoDB replica set and builds the production app. Tests do not send live WhatsApp or email messages.
