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

## Roster and pricing update (2026-10-03)

User supplied the active roster, services per provider, and cash prices.

- **Cash prices:** individual counseling $195 master's-level (matches Fee Schedule); **licensed doctoral $250**; **postdoctoral residents (Dr. Lee, Dr. Nine, Dr. Arbuckle-Washington) $195**; **Autumn Prak (BA) and Gentry Tays (MA): cash only, $95 per 60-min individual session**. 60 minutes is always the assumption. **Couples $225** (Fee Schedule still says $195; workbook `Services!M` overrides, Billing should update the source).
- **Mechanism:** new `ProviderServices` column E "Cash price override" (per provider + service), so $95 applies to Autumn/Gentry individual counseling only (group stays at the standard $80; confirm). Engine: provider+service override wins, then provider-wide override (per-session services only).
- **New credentials:** Postdoc (tier T1, no Medicare, cash only assumed), BA and MA (tier T2, cash only). Engine allows a null credential (cash on tier-free services only).
- **Roster applied:** 35 providers; 117 provider-service links. Active per the user's list: Dr. John (Mansoor), Dr. Shasteen, Dr. Lee, Dr. Nine, Dr. Arbuckle-Washington, John-Eli Garay, Tara (Iacono), Stephanie, Julianne (Haddad), Kimberley (Dixon), Gentry, Autumn, Gregg (Bagdade), Mike (Hanafin), Glenn (Goodrich, leaving soon), Mirna (Pacheco), Emily (Lyon), Alyssa (Bruns), Devon (Hoepfner), Nestazia (Khamis), Raul (Rivera), Denise, Amber. Resolves earlier open items: Garay and Hoepfner are Active. Not on the list, now **Inactive** (confirm): Palsdottir, Northup, Cabanillas, Maupin. Previous staff kept.
- **Assumptions to confirm:** "ADHD assessment" = ADHD Evaluation + ADHD Abbreviated; Shasteen's "ALL assessment" = all testing services (not Mental Health Assessment); "neuro" = Neurofeedback intake + 80-min + 30-min; "TMS pints" = TMS initial only, other TMS providers get all three TMS services (TMS is inactive in the estimator); "iop intake" linked to the IOP service (inactive); "med mgmt" = all three med-management services (not Psychiatric Intake); postdocs cash only.
- **Not linked (need answers):** "functional psych appts" (Tara, Amber) has no Fee Schedule service; Gentry/Autumn "ADHD testing with a supervisor" (price unknown); Mental Health Assessment has no provider.
- **Placeholders:** Stephanie, Denise and Amber need last names and credentials (cash only until then); postdocs need first names.

## Roster follow-up answers (2026-10-03)

- **Functional psych appts** (Tara, Amber): new placeholder service S31 "Functional Psychiatry Appointment", priced exactly like Psychiatric Intake (Fee Schedule row 41) until it has its own price.
- **ADHD testing with a supervisor** (Gentry, Autumn): standard ADHD Evaluation, $1,800 cash.
- **Mental Health Assessment** ($689): offered by the licensed doctors (Dr. John, Dr. Shasteen) and the three postdocs.
- **Postdocs and insurance:** they bill under **Dr. John Mansoor** (his credentialing and PsyD-tier rates), **except Medicare and UHC** (UHC/Optum/UMR and UHC Advantage). Cash stays at $195. Workbook `Providers` columns L (bills under) and M (excluded payers); engine fields `billsUnder` and `excludedPayers`.
- **Autumn and Gentry group therapy:** standard $80 (no override).
- **Palsdottir, Northup, Cabanillas, Maupin:** confirmed inactive.
- Still open: last names/credentials for Stephanie, Denise, Amber; first names for the three postdocs; Medicare rate columns; logo; log storage; Entra admin consent; design path (Figma limit).
- Engine now 61 tests; workbook has 126 provider-service links.

## Names and log storage (2026-10-03)

- New providers: **Stephanie Tavener, PA**; **Denish Gusich, PMHNP** (spelled "Denish" by the user; earlier "Denise", confirm); **Amber Tessette, PMHNP**. No credentialing on file, so cash only until recorded. Postdoc first names still needed.
- **Log storage: SharePoint list in the MHCA tenant, de-identified only.** Spec in `docs/estimate-log-sharepoint.md`, column definitions in `docs/estimate-log-list.json`, row builder in `src/engine/log.ts` (64 tests total). Retention and viewers undecided. Needs an Entra app with Sites.Selected on one site (admin consent).
- **Design path:** start with a Claude artifact; the user wants Figma eventually (Figma MCP limit resets monthly; frame A and variables already exist in the Figma file).
