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

## Phase 2 build notes (2026-10-03)

- Workbook `MHCA-Provider-Directory.xlsx` built locally (14 tabs). **Not committed** (`*.xlsx` gitignored): Credentialing raw text contains NPIs, Medicare IDs/PTANs. Intended home is the MHCA SharePoint site; upload pending the user's choice of folder.
- `FeeRates` is a values snapshot of the Fee Schedule (Excel cannot live-link to another SharePoint workbook in the browser); `ContractedRates` is formula-driven from it. Refresh = app/Graph sync. Deviation from "(b) live-linked" in Phase 0 to be confirmed.
- ContractedRates is keyed Service × Payer × Tier (not per provider); a provider's tier comes from `Providers`. Per-provider expansion left to the app.
- Providers seeded from the Credentialing Dashboard: 18 current/onboarding, 9 previous or unclear. `Needs review`: Garay (no credentialing), Hoepfner (listed under Previous Staff but named in-network on Network tabs).
- Credentialing statuses normalized by rule: Credentialed 154, Pending 58 (includes "Submitted"/"In process"), Not eligible 16 (includes "Denied"), Do not submit 11, Needs review 5. Oscar column treated as Credentialed (plan-coverage note kept verbatim).
- Services proposed from the Fee Schedule (30). TMS, Treatment Consult ($0 cash), Testing Consultation, and IOP are marked inactive. Optional add-ons excluded by default.
- Availability, ProviderServices, KPI, monthly minimums, and cash overrides left blank (no data invented).
- Verification: LibreOffice is unavailable in this environment, so the full workbook was not recalculated. SUMIFS/COUNTIFS logic was checked with a Python formula engine (32/32 matches vs an independent calculation); the SUMPRODUCT array form used in ContractedRates is standard Excel but unverified until opened in Excel.

## Phase 3 progress (2026-10-03)

- Brand tokens read from `mhca_guidelines 2021.pdf` (CorporateDrive). Figma file: https://www.figma.com/design/nj9pwmiG0l4ME6UTU9l5n8 (team "John Mansoor's team", Starter plan, seat View).
- Figma has no Gill Sans; **Cabin** (Gill Sans-inspired Google font) is the design stand-in. App font stack: Gill Sans, Gill Sans MT, Cabin, Calibri, sans-serif (assumption).
- Built so far: variable collection "MHCA Brand" (8 brand colors + white, spacing, radius, font family) and frame **A. Admin Builder** (sample data, fictional patient). A cleanup fix (clear stray white fills, shorten Medicare chip) was applied but NOT visually re-checked.
- Blocked: Figma MCP tool-call limit reached on the Starter plan. Not yet built: frame **B. Patient Copy** (US Letter) and the add-line modal (Cash/Insurance + plan picker).
- Logo asset not located; the frames use a text wordmark placeholder.

## Engine build (2026-10-03)

- User asked to build the app engine while Figma is blocked, and to add weekly, monthly and full-plan cost views. Built `src/engine` (TypeScript, vitest, 47 tests, synthetic data only). No UI, no deployment, no Graph access yet; the "design approved before Phase 4" gate still applies to UI/print/deploy.
- Cost view definitions: see `docs/engine.md` (weekly = recurring lines / their spans; monthly = weekly x 52/12; full plan = all lines; single-session lines are one-time).
- **Cash override rule (assumption):** a provider's cash override applies only to services flagged per-session (counseling, couples, group, med management, etc.), never to evaluation bundles. Workbook `Services` gained column L "Per-session service" (seeded: single-visit services = Y).
- LPC/LAC/LMFT + Medicare is blocked with no cash fallback offered (Medicare private-contract rules). Out-of-network, uncredentialed, quarantined and unusable-rate cases block the insurance line and offer a cash switch.
- Open: does the patient copy print the selected view or all three views?
