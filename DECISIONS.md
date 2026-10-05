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

## Design artifact (2026-10-03)

- Interim design published as a private Claude artifact: https://claude.ai/artifact/MKgXSFPpzZ6CqhkhqzkqEi (source: `docs/design/estimator-design.html`). Three screens: admin builder, add-a-line, patient copy (US Letter). Includes the weekly / monthly / full-plan toggle. Figma remains the eventual design home (file nj9pwmiG0l4ME6UTU9l5n8, frame A built; frame B and the modal wait for the monthly limit to reset or a plan upgrade).
- The artifact previews an open question: patient copy shows only the selected cost view, or all three. Awaiting the user's choice. Still no approval of the design (Phase 3 gate).

## Decisions (2026-10-03, later)

- **Patient copy shows all three views** (weekly, monthly, full plan) plus per-line totals. No "selected view only" option. Artifact v2 reflects this.
- **Logo:** deferred; text wordmark stays until supplied.
- **Entra:** MHCA admin has granted consent. App credentials still need to be put in Vercel env vars (not in the repo).
- **Medicare rate columns:** answer expected within ~48 hours. Medicare stays quarantined until then.

## Phase 4/5 build (2026-10-03)

- Design approved by the user (artifact v2). Vercel: the user's connected account; Entra secrets set by the user directly in Vercel; log retention 12 months, view access billing leadership only.
- **App** built: Next.js 15, Microsoft Entra sign-in (single-tenant issuer plus `tid` check, 8-hour sessions), server-side Graph reads of the directory workbook (read-only, 5-minute cache, "Refresh data" button), estimate in browser memory only (no storage), print stylesheet for US Letter, afterprint "clear for next patient" prompt, New estimate confirm, 15-minute idle clear, de-identified log endpoint with strict server-side validation (known provider/service/payer IDs only).
- **Contracted rates are computed by the app** from the workbook's `FeeRates` and `ServiceComponents` tabs (not read from the formula-driven `ContractedRates` tab), so the app does not depend on Excel recalculating. The real workbook was parsed locally and matched independent figures (ADHD Evaluation Aetna PsyD $875.03; Aetna individual PsyD $137.75 vs LPC $103.31). That test is local-only and never committed.
- Workbook `Services` gained column N "Allowed tiers" (S04 = T2 master's-level counseling, S05 = T1 doctoral counseling). The updated workbook must be re-uploaded.
- `FeeRates` is still a snapshot of the Fee Schedule; the automatic sync from the Fee Schedule is NOT built (refresh = regenerate the snapshot). Open.
- Patient copy: weekly and monthly figures show a small "repeating visits" label only when a one-time service is on the estimate.
- Demo mode (`DEMO_MODE=1`) uses invented data with a SAMPLE DATA watermark and turns itself off when real directory/Entra settings exist.
- **Tests:** 79 unit tests plus 44 browser checks (cash-only, insurance-only, LPC + Medicare block, PsyD vs LPC rates, testing bundle, split service, three cost views, patient-copy contents, 30-line page break and Letter size, clear after print, reload/idle clear, two admins in separate browsers, no patient name in any request, server rejects name-bearing log rows, sign-in required outside demo mode). One bug found and fixed by the browser tests: a tall sticky footer covered the Add button with many lines.
- Sample output: `docs/samples/sample-patient-copy.pdf` (demo data, watermarked).

## Vercel (2026-10-03)

- Project `mhca-estimator` (team joman124's projects, id prj_KSedFjI4PAgnMJ6r568WZV7TJGff) linked to GitHub `joman124/tcs-platform`, production branch `main` (which does not contain the app yet). Vercel Authentication protects deployments (`all_except_custom_domains`).
- `DEMO_MODE=1` is set for the **Preview** environment only (invented data, no sign-in, SAMPLE DATA watermark). Production has no env vars yet: it needs the Entra and directory settings from `.env.example`, set by the user in Vercel.
- The first deployment was created from the feature branch but Vercel promoted it to the project's production alias (`mhca-estimator.vercel.app`) because the project had no production deployment. With no Entra settings it shows a configuration error and serves no data. **Nothing has been intentionally released to production; production release still needs the user's approval.**
- Redirect URI to register in Entra for the stable domain: `https://mhca-estimator.vercel.app/api/auth/callback/microsoft-entra-id` (preview URLs change per deployment, so sign-in for real data should run on a stable domain).

## Overnight session (2026-10-05)

### Editing a line (user request)
- Each estimate row has **Edit** next to Remove. Edit reuses the add-a-line dialog in edit mode ("Edit service", "Save changes"), prefilled from the line; Save replaces the line in place (same position), Cancel or Escape leaves it untouched. Changing the service or provider while editing still clears the fields that depend on them.
- A saved choice the current data no longer offers (service inactive, provider gone or no longer offering the service, payment type no longer accepted, plan no longer listed) opens **empty with a note** to choose it again. Nothing is silently substituted. A choice that is still offered but blocked (e.g. an out-of-network plan) stays selected so the admin sees the reason and can switch.
- Blocked lines are editable; the admin messages now say "edit or remove".
- **"Refresh data" now keeps the estimate** (`router.refresh()` instead of a full page reload) and re-prices every line against the new data, so lines that became invalid show as blocked and can be fixed by editing. Before, refresh reloaded the page, which silently discarded the estimate. The estimate is still memory-only. Re-pricing after a refresh also counts as "not yet logged". (Assumption, reversible; listed in the morning questions.) **Reverted 2026-10-05 by the user: see below.**
- Demo mode has an invented "after refresh" scenario (a provider made inactive, a credentialing row dropped) that the browser tests select with a `demo-scenario` cookie. The app never sets that cookie, and it is ignored outside demo mode. **Removed 2026-10-05** along with the kept-estimate refresh.

### Release safety
- `vercel.json` sets `git.deploymentEnabled.main = false`, so a merge or push to `main` no longer creates an automatic production deployment. It takes effect only once this file is on `main`. Feature-branch previews are unaffected. A release then needs a deliberate deployment (Vercel dashboard "Redeploy"/"Promote", or `vercel --prod`) after the user approves it. Vercel project settings were not changed.
- `next-auth` is pinned to exactly `5.0.0-beta.32` (it is a beta; upgrade deliberately and re-test sign-in).
- `npm audit --omit=dev` reports PostCSS inside `next` (build-time CSS processing of our own stylesheet, not exposed to user input). The fix is a major upgrade to Next 16; not done overnight, listed in the morning questions.

### Workbook version check
- When the directory workbook loads, every tab and column header the app reads must be present (`REQUIRED_COLUMNS` in `src/data/workbook.ts`). If any is missing, nothing is priced: the app shows "This directory workbook is an older build: the Services tab has no 'Allowed tiers' column. ..." naming each missing tab and column. Some columns are matched by prefix because the real headers carry hints such as "(Y/N)". Extra tabs and columns are ignored. The formula-driven `ContractedRates` tab is still not read, so nothing depends on Excel recalculation.
- The Graph read lists the workbook's tabs first, reads only those that exist, and reports a missing workbook (wrong IDs or not shared) separately from a missing tab.

### Readiness page
- `/diagnostics` (signed-in MHCA accounts only; returns 404 in demo mode, where there is no sign-in) shows which settings are present **by name only**, whether the workbook can be read through Graph with a row count per tab and the version check, whether the log list can be read (a GET of the list; it never writes), and when the directory data in use was loaded. It is not linked from the estimator; the Phase 5 checklist (`docs/phase5-checklist.md`) points to it.

### Fee Schedule sync (engine and dry run only)
- `src/sync/feeSchedule.ts` turns the "Fee Schedule" tab into `FeeRates` and `CashPrices` rows plus a review report; `scripts/fee-schedule-diff.ts` prints a dry-run diff against the current `FeeRates` tab. Nothing writes. Details: `docs/fee-schedule-sync.md`.
- **Row numbering (finding):** the live sheet's data starts at row 4, not row 7. Phase 1's row numbers (and so the current workbook's visit and cash-price rows) are 3 higher than the sheet. The sync numbers rows from the sheet; the diff detects the offset and warns. **Decided 2026-10-05: renumber the workbook by −3** (see below).
- Assumptions: parents with no code or a non-CPT code have no rate of their own and anchor their `+` rows (a code-less row only when `+` rows follow); an unlabelled CPT row under a visit belongs to it; "(optional)" add-ons are kept in `FeeRates` with the optional flag (the engine already leaves them out by default) rather than dropped; add-on rows with notes such as "(on hold)" are included and listed; numbers stored as text are unusable by default; `$0` is unusable; the quarantine median is per CPT, payer and tier (this reproduces all 25 Phase 1 quarantines exactly).

### Log retention (built, off)
- Pruning of log rows older than 12 months exists (`src/data/retention.ts`, `GET /api/log-retention`) but is off unless `LOG_RETENTION_ENABLED=1`, does nothing in demo mode, and requires Vercel Cron's `CRON_SECRET` bearer token. No cron schedule is configured; turning it on is the user's call (`docs/estimate-log-sharepoint.md`).

### Dialog accessibility
- The add/edit dialog and the patient-copy preview share a `Modal` shell (`components/Modal.tsx`): focus moves to the first control on open, Tab and Shift+Tab stay inside, Escape closes, and focus returns to the button that opened it.

## User answers (2026-10-05)

| # | Topic | Decision |
|---|---|---|
| 23 | "Refresh data" | **Wipes the estimate** (full page reload with fresh directory data), as it originally did. The overnight change that kept and re-priced the estimate is reverted, and the demo "after refresh" scenario is removed. The edit dialog still opens a no-longer-valid choice empty with a note, as a safeguard. |
| 24 | Fee Schedule row numbering | **Renumber the workbook by −3** (`FeeRates` Visit row, `ServiceComponents` Visit row, `Services` Cash price row, `CashPrices` Fee Schedule row) so they match the sheet. Done by hand in Excel before upload (`docs/SETUP-CHECKLIST.md` §3 step 2). The sync expects no offset; the diff warns otherwise. |
| 25 | Log deletion (12-month retention) | **Stays off.** The code exists; no `LOG_RETENTION_ENABLED`, `CRON_SECRET` or cron entry. |
| 26 | Real contracted amounts in demo data | **Left as they are** ($137.75, $103.31, $875.03 in `src/data/demo.ts`). |
| 27 | PR and release approval | **The user approves PRs and production releases.** |
| 28 | Next.js 16 upgrade (PostCSS advisory) | **Planned as a separate piece of work:** `docs/next16-upgrade-plan.md`. |

Still open from the overnight questions: how the sync treats code-less Neurofeedback parents, the unlabelled KAP 90837 row, "(on hold)" add-ons and "(optional)" rows (`docs/fee-schedule-sync.md`).

### Production server error (2026-10-05)
- Production (`mhca-estimator.vercel.app`) runs a build of `main` at `9a91af3` with **no environment variables**, so Auth.js threw `MissingSecret` (HTTP 500) on every request. Not related to the Next.js version.
- Code change: when any sign-in setting (`AUTH_SECRET`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`) is missing outside demo mode, every page and API route answers 503 with a plain "Estimator is not set up yet" message (no setting names, no data). With the settings present, sign-in works exactly as before.
- The real fix is the user's: set the Production variables (`docs/SETUP-CHECKLIST.md` §6) and redeploy production deliberately (`main` no longer deploys automatically).

### Next.js 16 (2026-10-05)
- Upgraded to `next` 16.3.8 to clear the PostCSS advisory (`npm audit --omit=dev` now clean). `middleware.ts` is now `proxy.ts`. Details and remaining steps: `docs/next16-upgrade-plan.md`. Release still needs the user's approval and one real sign-in check.

### Test tooling (2026-10-05)
- `vitest` 2 → 5.0.3 (with `vite` 8.3.2) to clear the dev-only vite/esbuild advisories; `vite-node` replaced by `tsx` as the runner for `npm run fee-schedule-diff`. `npm audit` is clean for all dependencies. Local test runs need Node 22.12+; the app's own requirement stays `>=20.9`.
