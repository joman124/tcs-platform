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

## Open

- Retention (how long to keep rows) is not decided.
- Who may view the list is not decided (suggest billing leadership).
- The app writes to the list from the server; the browser never holds credentials.
