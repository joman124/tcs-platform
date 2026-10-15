You are working overnight, unattended, on the MHCA Treatment Plan Estimator in `joman124/tcs-platform`. Nobody will answer questions until morning. Work through the queue below in order, verify each task, commit and push it, and keep going until every task is done or blocked. Do not end your turn while an unblocked task remains.

## 0. Before you start

1. Read `docs/HANDOFF.md`, `DECISIONS.md`, `README.md` and `docs/engine.md`. They are the source of truth on decisions, privacy rules and past mistakes.
2. Branch: use the branch this session assigns you. If none is assigned, create `claude/overnight-2026-10-05` from the latest `main`. Never push to `main`, and never reuse a merged branch.
3. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build && npm run e2e` once to confirm a green baseline (79 unit tests, 44 browser checks). Chromium for e2e is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (or set `CHROME_PATH`). If the baseline is red, fixing it becomes task 1.
4. Create `docs/OVERNIGHT-LOG.md` with sections: **Done** (task, commit, how it was verified), **In progress**, **Blocked / skipped** (and why), **Questions for the morning**, **Needs the user**. Update and commit it after every task. If your context is compacted or the session restarts, re-read this file first and continue from it.

## Hard rules (apply all night)

- **No outward actions.** Do not merge any PR. Do not deploy or promote to production. Do not create, change or read the values of Vercel environment variables. Do not write to SharePoint or OneDrive, send email or Teams messages, or change access grants. Do not use Figma (the monthly quota is used up).
- **Privacy.** No patient data, NPIs, Medicare IDs, secrets, the workbook (`MHCA-Provider-Directory.xlsx`) or real Fee Schedule rates in the repo. Test fixtures must be invented. Do not run broad Microsoft 365 searches (earlier searches surfaced files with patient names). If you read anything from Microsoft 365, read only the Billing Fee Schedule by its exact IDs (drive `b!5tnb6bLSWU2cr0Fyqdme8sr-r_CXXlJCv_nIcpkR8cYC3SF8On0DTaP4Asyu0SBf`, item `016S6WHA37ZNV3LWBGB5CZUHTAZIVPIYLB`), read-only, and only to confirm its column layout.
- **The estimate stays in browser memory.** Never add localStorage, sessionStorage, cookies, IndexedDB or server storage for estimate content or the patient name.
- **Don't ask, record.** When a choice needs the user, make the safest reversible choice, note it under "Questions for the morning", and continue. Add any new assumption to `DECISIONS.md`.
- **Process hygiene.** Do not use `pkill -f next-server`; it once killed the agent's own shell. Stop servers by PID or process group. Check nothing is left listening on the e2e port before each e2e run.
- **Time-box.** If a task is stuck after about 90 minutes or is blocked on something only a person can give, write down exactly where it stopped and move on.

## Definition of done for each task

1. `npm test`, `npm run typecheck` and `npm run build && npm run e2e` all pass. New behavior has new unit tests and/or browser checks. Never skip, weaken or delete a test to get green.
2. Re-read your diff as a skeptical reviewer would. Match the existing code style and comment density.
3. Make one focused commit per task with a clear message, then push with `git push -u origin <branch>` (retry network failures with 2s, 4s, 8s, 16s backoff).
4. After the first task is pushed, open **one** PR against `main`, ready for review (not draft), titled "Overnight: line editing, release safety, Fee Schedule sync and setup docs". Keep its description as a live checklist of the tasks below, updated after each push. Subscribe to its activity if that tool is available. After each push, use the Vercel connector, read-only, to check that the branch's **preview** deployment for project `mhca-estimator` (`prj_KSedFjI4PAgnMJ6r568WZV7TJGff`) reaches READY. If it fails, read the build logs and fix it.
5. Update `docs/OVERNIGHT-LOG.md`.

## Task queue (in priority order)

### 1. Edit a line item after it has been added (user request, top priority)

Today a line can only be removed (`components/Estimator.tsx`) and added (`components/AddLineDialog.tsx`). Add editing:

- Each row in the estimate table gets an **Edit** button next to Remove, with `aria-label="Edit <service name>"`.
- Edit opens the same dialog in edit mode, rather than a new component. Add an optional `initial?: NewLine` prop (or similar). In edit mode the title is "Edit service", the dialog's `aria-label` is "Edit service", and the confirm button reads "Save changes".
- Prefill everything from the line: service, provider, payment type, sub-plan, and frequency (weekly: `perWeek`/`weeks`; total: `sessions` and `spanWeeks` if set). Set the initial state directly. Do **not** go through `pickService`/`pickProvider`, because those clear the fields that depend on them. Changing the service or provider during an edit should still clear dependent fields, as when adding.
- Save replaces the line **in place**: same id, same position in the table. Cancel or Escape leaves the line exactly as it was.
- If the saved choice is no longer valid (for example, the provider was removed or the plan dropped after "Refresh data"), open with the invalid field empty and a short note saying it needs choosing again. Never silently substitute a value.
- Blocked lines must be editable. Editing is a way to fix them, so change the message "Fix or remove blocked lines first" (and the related alert text) to mention editing.
- Totals, the scheduling plan in the footer, the preview and the print copy all reflect the edit straight away. Any edit means the estimate counts as not logged (check that the existing `useEffect` on `lines` covers this).
- Tests: put the line-to-form-state mapping in a small pure helper with unit tests (both frequency kinds, cash and insurance, missing provider or plan). Add e2e checks for: edit a provider and frequency so the totals change; Cancel changes nothing; the edited line keeps its position among three lines; a blocked insurance line is fixed by editing it to cash; the edited values appear in the print sheet; Remove still works.
- Update `docs/design/estimator-design.html` so the design source shows the Edit action next to Remove. Do not republish the artifact. Add a short entry to `DECISIONS.md`.

### 2. Release safety

- Stop automatic production deploys from `main` until the user approves a release. Add a `vercel.json` with `"git": { "deploymentEnabled": { "main": false } }` (check the current Vercel docs for the exact key first) and explain in the PR that it takes effect only once merged. Do not change Vercel project settings through the connector.
- Pin `next-auth` to an exact version (currently `5.0.0-beta.32`). Regenerate the lockfile with npm, never by hand. Run the full test suite.
- Fix the stale `package.json` description ("UI not yet built").

### 3. Workbook version check

The handoff says older workbook copies lack `Services` column N, "Allowed tiers", and then price counseling wrongly. Make `src/data/workbook.ts` check that every required tab and column header is present when it loads. If one is missing, fail with a clear, admin-friendly error naming the tab and column (for example: "This directory workbook is an older build: the Services tab has no 'Allowed tiers' column."), and show it in the app instead of wrong prices. Unit-test it with invented fixtures. The app must still never depend on Excel recalculation.

### 4. Readiness / diagnostics for the real-data check

Add a signed-in-only diagnostics view or route (it must not exist or work in demo mode for anonymous users) that reports:
- which required settings are **present**, by name only, never their values;
- whether the workbook can be read through Graph, plus the row count per tab;
- whether the log list is reachable (a read only, never a write);
- the loaded data's timestamp.

Unit-test the parts that don't need network access. Then write `docs/phase5-checklist.md`: the step-by-step real-data verification with expected values (Aetna PsyD individual $137.75; Aetna LPC individual $103.31; ADHD Evaluation on Aetna at PsyD tier $875.03; Dr. Lee cash $195; couples cash $225; Medicare blocked; one log row per printed line and no name in any log row; editing a line before printing logs only the final values).

### 5. Fee Schedule sync (engine part only, no writes)

Build `src/sync/feeSchedule.ts`: a pure function that takes the Fee Schedule sheet as a 2D array of cell values (the shape Graph's `usedRange` returns) and produces (a) `FeeRates` rows in exactly the shape `src/data/workbook.ts` reads, and (b) a review report. Use the layout in `docs/HANDOFF.md` §3 "Next engineering" item 2:
- data rows start at sheet row 7;
- rate columns (doctoral / master's): Aetna N/P, UHC/Optum/UMR S/U, UHC Advantage X/Z, Cigna AB/AD, BCBS AG/AI, Medicare AM/AO and AP/AQ (always marked ambiguous and blocked), ACN/EHN/Intel AS/AT, TriWest AV/AX, AHCCCS AZ/BB, AZCH BD/BF, Allwell/Ambetter BI/BK (header misaligned, so detect it by header text, not position alone);
- cash price is column H;
- a visit is a parent row plus following rows starting with `+`; "(optional)" add-ons are excluded by default;
- text or error cells are unusable;
- a cell more than 25% from the median for its CPT is quarantined.

Keep the column map in one config object and check the header text at runtime, so a moved column fails loudly instead of mispricing. Add a CLI script (`scripts/fee-schedule-diff.mjs` or a TS equivalent) that, given Graph credentials in the environment (not available tonight), reads the sheet and prints a diff against the current `FeeRates` tab without writing anything. Test thoroughly with invented fixtures, including quarantine, `+` rows, optional add-ons, text cells, the misaligned header and a moved column. If you can read the real Fee Schedule read-only under the hard rules, use it only to confirm the layout assumptions, and record any mismatch in the log. Commit no real values. Document it in `docs/fee-schedule-sync.md`.

### 6. Setup guide for the user (fixes handoff issue 9: placeholder-driven instructions)

Write `docs/SETUP-CHECKLIST.md`: a numbered, copy-paste-ready guide for the "Needs the user" list in `docs/HANDOFF.md` §3. It should:
- recommend the small dedicated SharePoint site and explain why;
- give exact Graph Explorer requests with every known ID already filled in, and say which value to copy from each response (site ID, drive ID, item ID, list ID);
- cover the log list creation, the Entra app and `Sites.Selected` grants (what to ask the MHCA admin for, word for word);
- give the Vercel variables to set, with a reminder that secrets are never pasted into chat;
- end with "send these back" (names only).

Link it from `README.md` and `docs/HANDOFF.md`.

### 7. Stretch (only after 1–6)

- **Log retention:** code for pruning log rows older than 12 months (a route meant for a Vercel cron). It is **off by default** behind an env flag, does nothing in demo mode, and is unit-tested with a mocked Graph client. Do not add the cron schedule to `vercel.json`; describe it in the PR instead.
- **Accessibility pass** on the dialogs: focus moves into the dialog on open and back to the triggering button on close, Escape closes, and focus is trapped while open. Add e2e checks.
- Any small, clearly correct fix you found along the way. Log it, but do not widen scope into redesigns.

## Before you finish

1. Update `docs/HANDOFF.md`: what changed tonight, the new state of each "Next engineering" item, and the refreshed "Needs the user" list.
2. Make the final PR description a short summary of what is done, how each part was verified (test counts before and after), what is blocked and why, and the morning questions.
3. Make sure `docs/OVERNIGHT-LOG.md` is complete, everything is committed and pushed, the preview is READY, and the working tree is clean.
