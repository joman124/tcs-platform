# MHCA Treatment Plan Estimator: Session Handoff

Written 2026-10-05 at the end of the first build session. Read this, then `DECISIONS.md` (every decision and assumption, in order), then `README.md` (setup and commands).

Repo: `joman124/tcs-platform`. `main` contains everything through PR #2 (merge commit `8b8c54c`).

## 0. Overnight session, 2026-10-05 (read first)

Unattended work on branch `claude/kind-euler-50msb6`, PR https://github.com/joman124/tcs-platform/pull/5 (not merged). Full log: `docs/OVERNIGHT-LOG.md`. Tests went from 79 unit / 44 browser to **165 unit / 78 browser**.

- **Edit a line** (user request): Edit next to Remove reopens the same dialog prefilled; saves in place; stale choices open empty with a note. ("Refresh data" briefly kept the estimate overnight; **the user reverted that on 2026-10-05: refresh wipes the estimate.**)
- **Release safety:** `vercel.json` stops automatic production deploys from `main` (**only once PR #5 is merged**). `next-auth` pinned to `5.0.0-beta.32`.
- **Workbook version check:** an older workbook (e.g. no `Services` "Allowed tiers") is refused with a message naming the missing tab/column, instead of mispricing.
- **`/diagnostics`** (signed-in only, absent in demo mode): settings by name, workbook row counts, log-list reachability (read only), load time. Real-data checklist: `docs/phase5-checklist.md`.
- **Fee Schedule sync engine + dry-run diff** (`npm run fee-schedule-diff`, writes nothing): `docs/fee-schedule-sync.md`. **Finding:** the live sheet's data starts at **row 4**, not row 7; Phase 1 row numbers (and the workbook's visit and cash-price row keys) are 3 higher. **Decided (#34): the app corrects the −3 in memory; the workbook is uploaded unchanged.** Confirmed by reading the Billing Fee Schedule once, read-only: all 25 Phase 1 quarantines reproduce exactly.
- **Setup guide:** `docs/SETUP-CHECKLIST.md` (fixes issue 9).
- **Stretch:** 12-month log retention (built, **off**, no cron scheduled); dialog focus management; the e2e run no longer rewrites the sample PDF.

## 1. Where things stand

The estimator is **built and tested on demo data, but not yet connected to real MHCA data**, and nothing has been intentionally released to production.

- A Next.js app (Microsoft sign-in, Graph reads of a provider-directory workbook, estimate held in browser memory only, US Letter print copy with weekly / monthly / full-plan figures, de-identified SharePoint log) is on `main`.
- 79 unit tests and 44 browser checks pass locally against invented data.
- Vercel project `mhca-estimator` exists. Previews serve **demo data** (`DEMO_MODE=1`, Preview environment only). The production alias currently shows a configuration error and serves no data, because production has no Entra or directory settings yet.
- The user is partway through connecting real data: they have the workbook saved on SharePoint but have not yet returned the IDs, created the log list, or set the Vercel variables.
- Medicare rates are deliberately blocked until Billing confirms which Fee Schedule columns are the contracted rate (answer expected about 48 hours after 2026-10-03).

## 2. What we did

### Decisions (full list in `DECISIONS.md`)
- Directory is an **Excel workbook in SharePoint** (not Google Sheets). Fee Schedule source of truth: the **Billing Department** copy. Brand: MHCA guidelines PDF (navy, forest, wine, gold, sky, mint, rose, stone; Gill Sans, Cabin as the web stand-in).
- Estimates: all appointment types; TMS excluded; non-covered fee never shown; insurance lines show the contracted rate; sub-plan picker mapped to a parent payer; out-of-network warns and offers cash; **Pending credentialing allowed with a warning**; frequency as sessions-per-week x weeks or total sessions; Microsoft sign-in for the MHCA tenant only.
- **Privacy:** nothing stored in the browser or on a server; log is **de-identified only** (no patient name, no free text), in a **SharePoint list**, 12-month retention, billing leadership only. KPI data stays in the spreadsheet.
- Patient copy shows **all three views** (weekly, monthly, full plan), no disclaimer line, no logo yet (text wordmark placeholder).
- Pricing from the user: individual therapy $195 master's-level, **$250 licensed doctoral**, **$195 postdocs**, **$95 for Autumn Prak (BA) and Gentry Tays (MA)** (cash only, individual only); **couples $225** (Fee Schedule still says $195). 60 minutes is always assumed.
- Postdocs (Lee, Nine, Arbuckle-Washington) **bill under Dr. Mansoor**, except Medicare and UHC.
- Monthly = weekly x 52 / 12. One-time services (a single session) count only in the full plan.

### Work completed
1. **Phase 0:** interview, answers logged.
2. **Phase 1:** read the Billing Fee Schedule (read-only), normalized it, produced a review list (`docs/phase1-fee-schedule-review.md`): 25 suspect cells quarantined, text cells (DNB etc.) treated as no rate, Medicare quarantined.
3. **Phase 2:** built `MHCA-Provider-Directory.xlsx` (14 tabs, 35 providers, 30 services plus a functional-psych placeholder, 126 provider-service links, credentialing normalized, cash overrides, supervisor billing). **Not in git** (contains NPIs and Medicare IDs).
4. **Phase 3:** Figma file with brand variables and frame A (Admin Builder). Interim design published as a Claude artifact (v2, patient copy shows all three views). Source: `docs/design/estimator-design.html`. The user approved the design (the artifact).
5. **Engine** (`src/engine`): rates by payer x tier, Medicare/LPC block, credentialing and network rules, cash overrides (per provider and service), supervisor billing, three cost views, de-identified log rows. Details in `docs/engine.md`.
6. **App** (`app`, `components`, `src/data`): see section 1. Contracted rates are computed by the app from the workbook's `FeeRates` and `ServiceComponents` tabs, so it does not depend on Excel recalculation. Tested against the real workbook locally (ADHD Evaluation on Aetna at PsyD tier = $875.03; Aetna individual counseling $137.75 PsyD vs $103.31 LPC).
7. **Deploy:** Vercel project linked to the GitHub repo; preview verified serving the demo app. Sample patient copy PDF: `docs/samples/sample-patient-copy.pdf`.

## 3. What still needs doing

### Needs the user (in this order)

Step-by-step guide with every known ID filled in: **[`docs/SETUP-CHECKLIST.md`](SETUP-CHECKLIST.md)** (fixes issue 9 below: no placeholder-only instructions).

1. **Decide where the workbook and log list live.** Recommended: a **small dedicated SharePoint site** holding only the workbook and the log list. The CorporateDrive site contains files with patient names (caseload and candidate lists), and the app's site-level access grant would cover all of it. The user has saved copies at:
   - `CorporateDrive / Shared Documents / Admin / Claude / TCS-creator` (not yet found by search, may need time to index);
   - an earlier copy in their personal OneDrive (test only). Its IDs, found by search: drive `b!nlQsWChhb0u7Okr2aJHS7dpHN_y5RrBEqk_XYLQLvh32pBsOT1piS7JST3Bi-s2-`, item `01QUYAHRNQ2ZGYGXMELRBYJ5M45GSKWVBU`.
2. **Confirm the uploaded workbook is the latest build.** It must have `Services` column N ("Allowed tiers"); older copies make counseling price wrongly. If unsure, re-send the file from the repo working copy (it is gitignored; regenerate by asking, see Issues).
3. **Return the IDs:** `DIRECTORY_DRIVE_ID`, `DIRECTORY_ITEM_ID`, the site ID. For CorporateDrive the library drive ID is `b!XkYzqW_YEkW5_2R3Md-UIzQYp9g0Zg1Ipi2h88AzMTDQZnSHUZG-QK0zkkpP20pA`; the item ID comes from `GET /drives/{drive-id}/root:/Admin/Claude/TCS-creator/MHCA-Provider-Directory.xlsx`.
4. **Create the log list** from `docs/estimate-log-list.json` (steps in `docs/estimate-log-sharepoint.md`) and return `LOG_SITE_ID` and `LOG_LIST_ID`.
5. **Entra app:** single tenant; redirect URI `https://mhca-estimator.vercel.app/api/auth/callback/microsoft-entra-id`; client secret; application permission `Sites.Selected` granted per site (read on the workbook site, write on the log site). The user said an MHCA admin already gave consent; confirm the exact permissions.
6. **Vercel variables** (Production and Preview, secrets as Sensitive): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AUTH_SECRET`, `DIRECTORY_DRIVE_ID`, `DIRECTORY_ITEM_ID`, `LOG_SITE_ID`, `LOG_LIST_ID`. The user sets the secrets; they must never be pasted into chat. Redeploy afterward. Demo mode turns itself off once real settings exist.
7. **Open Excel once** and confirm the workbook shows no errors (formulas were never recalculated here).
8. Small answers: spelling of **Denish** Gusich (earlier "Denise"); postdoc first names; logo file (deferred).
9. **Done (2026-10-05):** PR #5 merged; morning questions answered (`DECISIONS.md` #23–28). The −3 renumbering is no longer a manual step: the app corrects it when it loads (`DECISIONS.md` #34). Still open: confirm the sync's handling of Neurofeedback, the unlabelled KAP row, "(on hold)" and "(optional)" rows.
10. **Required (2026-10-06):** ask the MHCA admin for a **read** grant on the Billing site as well; the app now reads its rates there live (in the admin message in `docs/SETUP-CHECKLIST.md` §5).

### Needs other people
- **Billing:** which Medicare columns are the contracted rate; correct the 25 quarantined cells (`docs/phase1-fee-schedule-review.md`); update couples cash price to $225 in the Fee Schedule.
- **MHCA admin:** the Sites.Selected grants and any site creation.

### Next engineering (state after 2026-10-05)
1. **Still open; tooling ready.** `/diagnostics` and `docs/phase5-checklist.md` exist. Once data is connected: **point a preview at real data and run the Phase 5 checks** (the real Graph read, Entra sign-in, and SharePoint log write have never been exercised). Verification checklist is in the previous chat reply (Aetna PsyD individual $137.75; Dr. Lee cash $195; couples cash $225; Medicare blocked; one log row per printed line with no name).
2. **Done: the app reads rates live from the Fee Schedule** (2026-10-06; `src/data/liveRates.ts`, `docs/fee-schedule-sync.md`), with checks that correct the old −3 numbering automatically and refuse any other mismatch. Every service on the Services tab is offered (DECISIONS #32); custom line items are available (#31). Needs the Billing-site read grant.
2a. **Done (2026-10-09): patient benefits and the new "Patient Estimate" copy** (DECISIONS #35–37). Benefits are typed in or looked up by name + date of birth from the benefits sheet (`BENEFITS_ITEM_ID`, setup step 3d). The lookup runs in the browser, never on the server (#38: Vercel has no BAA). **Waiting on the user:** the benefits sheet's tab name and column headings, so `BENEFITS_COLUMNS` in `src/data/benefitsSheet.ts` can be checked against them (common spellings are already recognised; `/diagnostics` lists any that are not).
3. **Figma:** build frame B (patient copy), the add-line modal, and visually re-check frame A. The Figma MCP is limited to 20 calls per month on the Starter plan and the limit was used up in October 2026. It resets monthly, or upgrade to a Full or Dev seat.
4. **Production release** needs the user's explicit approval. Automatic production deploys from `main` are turned off by `vercel.json` once PR #5 merges.
5. Log pruning: **built, and stays off** (user decision 2026-10-05; `docs/estimate-log-sharepoint.md` says how to turn it on). `next-auth`: **pinned** to 5.0.0-beta.32; re-check before release. New: `npm audit` flags PostCSS inside Next (fix is Next 16, a major upgrade): **planned separately**, `docs/next16-upgrade-plan.md`. The user approves PRs and releases.

## 4. Issues and mistakes from this session

1. **Workbook delivery.** The workbook was sent several times through the file tool; the user said they never received it. It was re-sent and the user was told delivery is unconfirmed. Multiple versions went out (the `Services` column changes), so which copy the user uploaded is unknown.
2. **PR #1 merged early.** It merged before the Phase 1 commit landed, so I had to rebase and open PR #2. Later, PR #2's merge into `main` automatically created a production deployment.
3. **Unintended Vercel production deployment.** Creating the project and pushing a feature branch produced a deployment that Vercel promoted to the production alias because none existed. It has no settings, shows a configuration error, serves no data, and is behind Vercel Authentication. No production release was intended.
4. **Wrong claim about Figma.** I first said Figma could not create frames (from its listed tools). After the user connected it, it could. Then the Starter-plan limit of 20 calls stopped the work mid-design: frame A was not visually re-checked after a fix, frame B and the modal were never built. An interim artifact replaced them.
5. **Cash override design flaw.** A single provider-wide override would have repriced an $1,800 evaluation to $300. Caught in tests; replaced with a per provider-and-service override.
6. **Test harness bug.** My e2e runner started the server through `npx`, so stopping it left stale `next-server` processes, which made some runs hit an old build and report misleading results. Fixed (direct start, process group, port-in-use guard). Also, one `pkill -f next-server` killed my own shell.
7. **UI bug found by the browser tests:** a tall sticky footer covered the "Add service" button with many lines. Fixed.
8. **LibreOffice unusable here,** so the workbook was never recalculated. The `ContractedRates` array formulas are unverified in Excel. The app does not depend on them.
9. **Unclear instructions to the user.** The setup steps used a `{site-id}` placeholder; the user ran Graph Explorer's default `/me` query instead and pasted that. I did not ask early where the workbook would live (personal OneDrive, then CorporateDrive).
10. **Privacy exposure surfaced late.** Broad SharePoint searches returned snippets of files with patient names (caseload and candidate lists). Nothing was read in full, saved, or committed, but the CorporateDrive site is a poor home for an app with site-wide access. Flagged to the user only at the end.
11. **Assumptions not yet confirmed** (all listed in `DECISIONS.md`): service mappings for the roster ("ADHD assessment", "ALL assessment", "neuro", "TMS pints", "iop intake", "med mgmt"); functional psych priced like Psychiatric Intake as a placeholder; postdocs cash and supervisor billing details; Autumn/Gentry group at $80.
12. **Not done:** the CorporateDrive copy of the Fee Schedule was never diffed against the Billing copy; the `$3.73` typo and 2034 date from the brief were not found in the Billing copy.
13. **The workbook builder script is not in the repo.** It lived only in the session's scratch folder, so the next session cannot regenerate the workbook from it. The `.xlsx` itself is now the source of truth (edit it directly), and the Fee Schedule sync (above) should replace the one-off generation.

## 5. Where everything lives

- **Code:** `src/engine` (rules), `src/data` (workbook loader and version check, Graph, log, diagnostics, retention), `src/sync` (Fee Schedule sync and diff), `scripts/fee-schedule-diff.ts`, `app` and `components` (UI), `tests` (165 unit tests), `e2e/run.mjs` (78 browser checks), `docs/` (engine, log spec, design source, review list, sample PDF), `.env.example`.
- **Not in git:** `MHCA-Provider-Directory.xlsx` (gitignored); `tests/real.local.test.ts` (local only, needs a dump of the real workbook).
- **Commands:** `npm test`, `npm run typecheck`, `npm run build && npm run e2e`, `DEMO_MODE=1 AUTH_SECRET=x npm run dev`. Chromium for e2e: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **Vercel:** team "joman124's projects" (`team_FtOIUGtMDIHuEEU6FhWqbzOB`), project `mhca-estimator` (`prj_KSedFjI4PAgnMJ6r568WZV7TJGff`), production alias `mhca-estimator.vercel.app`. Previews sit behind Vercel login.
- **Figma:** file `nj9pwmiG0l4ME6UTU9l5n8` (plan `team::1687718605796589947`, Starter, View seat).
- **Design artifact:** https://claude.ai/artifact/MKgXSFPpzZ6CqhkhqzkqEi
- **Fee Schedule (Billing, source of truth):** drive `b!5tnb6bLSWU2cr0Fyqdme8sr-r_CXXlJCv_nIcpkR8cYC3SF8On0DTaP4Asyu0SBf`, item `016S6WHA37ZNV3LWBGB5CZUHTAZIVPIYLB` (modified 2026-10-01).
- **Brand guidelines:** CorporateDrive, `Admin/Marketing & BD/Assets - Marketing Resources/mhca_guidelines 2021.pdf`.
- **Tools used:** Microsoft 365 connector (search and read work; uploading the workbook is impractical because it needs the whole file inline), GitHub connector (no `gh` CLI), Vercel connector, Figma connector.

## 6. How to resume

1. Read `DECISIONS.md` and this file. Ask the user for the status of section 3 "Needs the user".
2. Start new work on a **new branch from `main`**; do not reuse merged branches.
3. If the IDs and variables are in: run a preview against real data, then the Phase 5 checks, then report. Production only with explicit approval.
4. Do not put patient data, NPIs, secrets, or the workbook in the repo. Ask before any outward action (uploads, deployments to production, access grants).
