# MHCA Treatment Plan Estimator: Session Handoff

Written 2026-10-05 at the end of the first build session. Read this, then `DECISIONS.md` (every decision and assumption, in order), then `README.md` (setup and commands).

Repo: `joman124/tcs-platform`. `main` contains everything through PR #2 (merge commit `8b8c54c`).

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

### Needs other people
- **Billing:** which Medicare columns are the contracted rate; correct the 25 quarantined cells (`docs/phase1-fee-schedule-review.md`); update couples cash price to $225 in the Fee Schedule.
- **MHCA admin:** the Sites.Selected grants and any site creation.

### Next engineering
1. Once data is connected: **point a preview at real data and run the Phase 5 checks** (the real Graph read, Entra sign-in, and SharePoint log write have never been exercised). Verification checklist is in the previous chat reply (Aetna PsyD individual $137.75; Dr. Lee cash $195; couples cash $225; Medicare blocked; one log row per printed line with no name).
2. **Build the Fee Schedule sync.** `FeeRates` is still a manual snapshot. Layout facts needed: data rows start at sheet row 7; rate columns (doctoral / master's): Aetna N/P, UHC/Optum/UMR S/U, UHC Advantage X/Z, Cigna AB/AD, BCBS AG/AI, Medicare AM/AO (**ambiguous**) and AP/AQ (Medicare 2020), ACN/EHN/Intel AS/AT, TriWest AV/AX, AHCCCS AZ/BB, AZCH BD/BF, Allwell/Ambetter BI/BK (header misaligned); cash price column H; a visit is a parent row plus rows starting with `+`; add-on rows labelled "(optional)" are excluded by default; cells with text or errors are unusable; a cell more than 25% from the median for its CPT is quarantined.
3. **Figma:** build frame B (patient copy), the add-line modal, and visually re-check frame A. The Figma MCP is limited to 20 calls per month on the Starter plan and the limit was used up in October 2026. It resets monthly, or upgrade to a Full or Dev seat.
4. **Production release** needs the user's explicit approval. Consider preventing automatic production deploys on `main` until then.
5. Optional: automate pruning of log rows older than 12 months; `next-auth` is a beta (5.0.0-beta.32), worth pinning and re-checking before release.

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

- **Code:** `src/engine` (rules), `src/data` (workbook loader, Graph, log), `app` and `components` (UI), `tests` (79 unit tests), `e2e/run.mjs` (44 browser checks), `docs/` (engine, log spec, design source, review list, sample PDF), `.env.example`.
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
