# Daily and monthly tour approval

In **Tour plan → Tour programme**, choose either:

- **Full month:** complete all regular working dates in the planning period and submit the month, as before.
- **Single day:** choose a date and routes (or a leave reason), then **Submit day for approval**. Upcoming dates can remain unplanned.

Admin reviews each daily submission in **Approvals → Tour programme approvals**, using **Approve day** or **Reject day**. Approval permits visits only on that date's approved routes. Attendance, GPS and customer access checks still apply. The MR can withdraw a pending daily submission, edit it and resubmit.

Sundays and company holidays use **Request to work**. That separate approval covers the selected MR, date and routes; a complete monthly programme is no longer required for an explicitly approved holiday-work day. For example, 8 November 2026 is a Sunday.

Approved daily plans support the existing route-change, leave and date-swap requests. Swapping dates requires both dates to have an approved route plan. The current approval remains in effect while a change is pending.

If the MR later prepares the full month, approved daily dates are carried over unchanged. Pending daily submissions and schedule changes must first be reviewed or withdrawn. Monthly approval adopts the daily customer snapshots and change history, without adding duplicate customer/date visits. Later changes to adopted dates use the monthly programme.

Daily approvals and changes appear in monthly reports; pending daily approvals appear in the month-closing checklist. Past daily dates are read-only, and closed-month protections apply to both planning options.

## Deployment

Use the existing GitHub deployment procedure. No database migration or new environment variable is required. Existing monthly plans retain their behavior. New daily plans are stored as `Tour programme` records with `scope: "day"` and a separate deterministic ID per MR/date. Existing records without a scope remain monthly plans.

## Regression coverage

- `tests/daily-tour-integration.cjs` runs within `pnpm test:mongo`: independent approval, date/route permission checks, stale submissions, holiday/period guards, leave, date swaps, reports, monthly adoption and deduplication.
- `tests/daily-tour-ui.cjs` runs within `pnpm test:ui`: daily form, selected-date retention, daily revisions, withdrawal/rejection/approval, incomplete future dates, Sunday requests and monthly carry-over.
- Existing monthly tour and holiday tests continue to run.
