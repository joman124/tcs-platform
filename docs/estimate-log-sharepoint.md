# Estimate log on SharePoint (de-identified)

Decision: finalized estimates are logged to a **SharePoint list in the MHCA tenant**, de-identified only (Phase 0 + 2026-10-03). No patient name ever leaves the browser.

## What is stored

One list item per priced line. Blocked lines are not logged. Fields (see `src/engine/log.ts`, `docs/estimate-log-list.json`):

| Column | Notes |
|---|---|
| EstimateId | random per estimate; not derived from anything about the patient |
| EstimateDate | date only (no time) |
| ServiceId, ProviderId | workbook IDs |
| PaymentType, Payer | cash or insurance; parent payer only (not sub-plan, not member info) |
| PerVisit, Sessions, LineTotal, EstimateFullPlanTotal | dollars |

Not stored: patient name, free text, exact time, the admin's identity, plan sub-names, any CPT or credentialing detail.

## Setup (one-time, needs an MHCA admin)

1. Pick the site (suggest `MHCA-Billing Department`). Create the list from `docs/estimate-log-list.json`: `POST https://graph.microsoft.com/v1.0/sites/{site-id}/lists` with that body, or build the same columns by hand.
2. Restrict the list's permissions to billing/admin staff.
3. Register an Entra app and grant it **Sites.Selected** with write access to that single site only (least privilege), not tenant-wide Sites.ReadWrite.All. This is the same admin-consent step the Microsoft sign-in and Fee Schedule read need.
4. Put the tenant, site and list IDs in Vercel environment variables (never in the repo).

## Retention (12 months)

Decided 2026-10-03: rows are kept 12 months; view access is billing leadership only.

Automatic pruning is built but **off by default** (`src/data/retention.ts`, route `GET /api/log-retention`):

- Runs only when `LOG_RETENTION_ENABLED=1` and the log settings exist; never in demo mode. Otherwise the route answers 404.
- Needs `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically when the project has a `CRON_SECRET` variable). The route is outside the sign-in proxy (`proxy.ts`) because a cron call has no user session.
- Deletes list items whose `EstimateDate` is before the same date 12 months ago (filtered on the indexed column, then re-checked per row; a row without a valid date is never deleted). At most 2,000 per run; `?dryRun=1` only counts.
- Uses the app's existing **write** grant on the log site.

To turn it on (needs the user's approval): set `CRON_SECRET` (Sensitive, a random string) and `LOG_RETENTION_ENABLED=1` in Vercel Production, then add a cron entry to `vercel.json`, e.g. daily at 03:17 UTC:

```json
{ "crons": [{ "path": "/api/log-retention", "schedule": "17 3 * * *" }] }
```

The cron entry is deliberately not in `vercel.json` yet.
- The app writes to the list from the server; the browser never holds credentials.
