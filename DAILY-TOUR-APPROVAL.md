# Daily and monthly tour approval

In **Tour plan → Tour programme**, choose either:

- **Full month:** choose routes beside any date and click **Submit this day** to send only that date. Other dates may stay blank, and unfinished route choices remain on screen. To send the whole programme, complete all working dates and use **Submit month for approval**.
- **Single day:** choose a date and routes (or a leave reason), then **Submit day for approval**. Upcoming dates can remain unplanned.

A submitted date shows **Daily approval pending** with **Review day**. If a pending monthly submission already covers the chosen date, **Single day → Withdraw month to plan this day** returns the month to Draft before a separate submission. Approved dates use **Request change**.

Admin reviews each daily submission in **Approvals → Tour programme approvals**, using **Approve day** or **Reject day**. Approval permits visits only on that date's approved routes. Attendance, GPS and customer access checks still apply. The MR can withdraw a pending daily submission, edit it and resubmit.

Sundays and company holidays use **Request to work**. That separate approval covers the selected MR, date and routes; a complete monthly programme is no longer required for an explicitly approved holiday-work day. For example, 8 November 2026 is a Sunday.

Approved daily plans support the existing route-change, leave and date-swap requests. Swapping dates requires both dates to have an approved route plan. The current approval remains in effect while a change is pending.

If the MR later prepares the full month, approved daily dates are carried over unchanged. Pending daily submissions and schedule changes must first be reviewed or withdrawn. Monthly approval adopts the daily customer snapshots and change history, without adding duplicate customer/date visits. Later changes to adopted dates use the monthly programme.

Daily approvals and changes appear in monthly reports; pending daily approvals appear in the month-closing checklist. Past daily dates are read-only, and closed-month protections apply to both planning options.

Admin can use **Mark holiday** beside any date or **Assign holiday** above the calendar, including after a programme is submitted or approved. This changes the shared calendar for all MRs. Closed periods remain protected, and completed work is preserved. See [Shared monthly holidays](MONTHLY-TOUR-PROGRAMME.md#shared-monthly-holiday-calendar) for the effect on pending approvals.

## Deployment

Use the existing GitHub deployment procedure. No database migration or new environment variable is required. Existing approved monthly plans and actual attendance/visits are retained. New daily plans are stored as `Tour programme` records with `scope: "day"` and a separate deterministic ID per MR/date. Existing records without a scope remain monthly plans.

## Regression coverage

- `tests/daily-tour-integration.cjs` runs within `pnpm test:mongo`: independent approval, date/route permission checks, stale submissions, holiday/period guards, leave, date swaps, reports, monthly adoption and deduplication.
- `tests/daily-tour-ui.cjs` runs within `pnpm test:ui`: daily form, selected-date retention, daily revisions, withdrawal/rejection/approval, incomplete future dates, Sunday requests and monthly carry-over.
- `tests/tour-holiday-changes-integration.cjs` runs within `pnpm test:mongo`: late shared holidays, pending plan reconciliation, preserved actual work, holiday permission, stale reviews and closed-month protection.
- Existing monthly tour and holiday tests continue to run.
