# DECISIONS.md — MHCA Provider Directory + Treatment Plan Estimator

## Phase 0 answers (2026-10-03)

| # | Topic | Decision |
|---|---|---|
| 1 | Architecture | (b) Directory is a new Excel workbook in the same SharePoint site, live-linked to the Fee Schedule |
| 2 | Source of truth | Billing Department site copy of `MHCA Fee Schedule.xlsx` |
| 3 | Brand guidelines | In SharePoint (location still to be found/confirmed) |
| 4 | Ownership | User's personal accounts for now (spreadsheet + Vercel); transfer to MHCA later |
| 5 | Estimator services | All appointment types (patient-facing names to be written) |
| 6 | TMS | Skipped for now |
| 7 | Non-covered fee | Never shown on an estimate |
| 8 | Testing bundles | Per-service setting (one line vs itemized), stored in `Services` tab |
| 9 | Insurance line display | Contracted rate shown as estimated cost |
| 10 | Plan picker | Sub-plan list (In Network Plans tab) mapped to parent payer |
| 11 | Out-of-network | Warn, and allow switching the line to cash |
| 12 | "Can bill" statuses | In Network / Effective; Pending also allowed with a warning |
| 13 | Provider roster | Import Credentialing Dashboard as starting list (review/prune with user) |
| 14 | Frequency entry | Both: total sessions, or sessions/week × weeks |
| 15 | Login | Microsoft sign-in restricted to the MHCA tenant |
| 16 | Logging | Initially "full estimate"; **revised after privacy check to de-identified only** (no patient name) |
| 17 | KPI visibility | Spreadsheet only; never in the app |
| 18 | Disclaimer | None on the patient copy |

## Assumptions / open items

- Excel-in-SharePoint choice means no Google Sheets API; directory is edited via Graph/Excel.
- Personal-account ownership (Vercel and Microsoft/Google) must be revisited before real use: the app will read MHCA tenant data (Fee Schedule), so the Entra app registration needs MHCA admin consent.
- De-identified logging needs a store; no storage chosen. To decide before Phase 4 (options: SharePoint list in MHCA tenant vs. Vercel-hosted DB).
- Brand guidelines location in SharePoint not yet identified; fallback is navy/teal/gold + Calibri with assumptions listed.
- The Fee Schedule is never written to. No real patient data in fixtures, logs, or commits.

## Phase 1 answers (2026-10-03)

| # | Topic | Decision |
|---|---|---|
| 19 | Text in rate cells (DNB / N/A / OON / INN) | Treated as no contracted rate; estimator offers to fall back to cash price |
| 20 | Suspicious cells (~25) | Quarantined: treated as unparsed/blocked until the source is corrected. List in `docs/phase1-fee-schedule-review.md` |
| 21 | Medicare rate columns | User unsure. **Assumption:** Medicare is quarantined until Billing confirms which block is the contracted rate. LPC + Medicare stays blocked regardless |
| 22 | Stale rate dates | Admin-only warning when a payer's rate header is over 12 months old |

Findings: Billing copy is 160×73 with 12 tabs (not ~111×51); "Non-covered" column renamed "Non Contracted (Specialty Services)"; TMS now present in rows 56–62 but TMS was excluded in Round 2 (decision 6). The `$3.73` typo and 2034 date from the brief were not found in this copy.
