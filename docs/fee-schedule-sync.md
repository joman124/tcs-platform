# Fee Schedule sync

The directory workbook's `FeeRates` and `CashPrices` tabs are a snapshot of the Billing Department's `MHCA Fee Schedule.xlsx`. This sync rebuilds them from the live sheet. **Only the engine and a dry-run diff exist.** Nothing writes to the directory workbook or the Fee Schedule yet; writing synced rows is a later, separately approved step.

| Piece | What it does |
|---|---|
| `src/sync/feeSchedule.ts` | `syncFeeSchedule(values, opts)`: pure. Takes the "Fee Schedule" tab as Graph's `usedRange` returns it and produces `FeeRates` rows (exactly the columns `src/data/workbook.ts` reads; `toFeeRatesSheet` adds the header), cash prices from column H (`toCashPricesSheet`), and a review report. |
| `src/sync/feeScheduleDiff.ts` | `diffFeeRates` compares a sync with the current `FeeRates` tab; `formatDiffReport` prints it; `runFeeScheduleDiff` runs the whole dry run with the reads injected. |
| `scripts/fee-schedule-diff.ts` | CLI: reads both through Graph, prints the report. Writes nothing. |
| `tests/feeSchedule.test.ts` | Invented sheet with the real layout (`tests/feeScheduleFixture.ts`). |

## Layout rules

All column positions live in one config object, `FEE_SCHEDULE_LAYOUT`.

- **Header row**: found by its text ("Appointment Type" in A, "CPT" in B, "Private Pay" in H). The tier-label row (PhD/PsyD) follows it, and data starts on the next row. On the live sheet (checked 2026-10-05) that is header row 1, tier labels row 3, **data from row 4**. If a title line is inserted, the sync still works and reports the move.
- **Rate columns** (doctoral / master's): Aetna N/P, UHC/Optum/UMR S/U, UHC Advantage X/Z, Cigna AB/AD, BCBS AG/AI, Medicare AM/AO, Medicare 2020 AP/AQ, ACN/EHN/Intel AS/AT, TriWest/Tricare AV/AX, AHCCCS AZ/BB, AZCH BD/BF, Allwell/Ambetter BI/BK. Each payer's header text and both tier labels are checked at runtime. A moved or renamed column stops the sync with a `FeeScheduleLayoutError` that lists every problem. Nothing is half-synced.
- **Allwell/Ambetter** is found by its header text, and its tier columns by their labels next to it, because the block is misaligned (an unlabelled column BH sits left of it, with "100%" in the date row). BH is never read. If Allwell is found somewhere other than BI/BK, the report warns.
- **Medicare** (AM/AO) and **Medicare 2020** (AP/AQ) cells are always emitted as `ambiguous` (unusable) until Billing confirms the contracted columns. Medicare 2020's master's column has no tier label on the sheet; that is allowed. `Medicare 2020` is not a PayerKey payer, so the app ignores it.
- **Cash price**: column H of each parent row.
- **Visits**: a parent row plus the rows starting with `+` under it. A blank row, a heading or a note ends the visit. Two shapes on the live sheet needed extra rules:
  - A parent with **no code** in column B (Neurofeedback) or a **non-CPT code** (`MHARC` package row, KAP `Inital`, `CONSULT`, `N/A`) has no rate of its own. Its `+` rows form the visit. A row with no code counts as a parent only if `+` rows follow it.
  - An **unlabelled row with a CPT** directly under a visit (the 90837 row under KAP) is part of that visit. Phase 1 read it the same way.
- **"(optional)" add-ons** are emitted with `Optional add-on = Y`, so bundles leave them out unless a service's `ServiceComponents` row asks for them. They are not dropped from `FeeRates`, because dropping them would silently under-price any service that includes them.
- **Add-on rows with a note** (e.g. `+Physical Intake (on hold)`) are included as normal add-ons and listed for review.
- **Unusable cells**: blank, `$0`, text (`DNB`, `N/A`, `OON`), and errors (`#DIV/0!`). Numbers stored as text are unusable by default (`numericText: 'unusable'`); the report lists them, and `--numeric-text usable` reads them as numbers.
- **Quarantine**: a usable cell more than 25% from the median of the same CPT, payer and tier across the sheet is marked `quarantined`. Exactly 25% is kept.

## Check against the live sheet (2026-10-05, read-only)

The Billing copy was read once by its exact IDs to confirm the layout. No values were saved or committed. The sync ran over it in a scratch folder:

- Every header and tier-label check passed. Allwell was located at BI/BK. No warnings.
- **All 25 cells quarantined in Phase 1 are quarantined again, and no others.** Rows are numbered 3 lower (see below).
- 42 visits, 2,376 rate cells, 396 ambiguous (Medicare), 2 add-on rows without a CPT (Neurofeedback 30-minute rows), no orphan add-ons.

### Row numbering differs from the Phase 1 snapshot

Phase 1 and the handoff said data starts at **row 7**. The live sheet's own formulas (`N4: =SUM(N5:N12)` on the Mental Health Assessment row) show it starts at **row 4**. Every Phase 1 cell reference is exactly 3 rows lower on the sheet (AD51 is AD48, AT145 is AT142, and so on). The likely cause: Phase 1 counted lines of a text export that has 3 preamble lines. The sync numbers rows from the sheet as it is.

The current `FeeRates`, `ServiceComponents` ("Visit row"), `Services` ("Cash price row") and `CashPrices` ("Fee Schedule row") tabs were built with the Phase 1 numbering. **They work together today because they share it**, but synced rows would not line up with them. The diff detects a constant offset and warns (`shifted by -3 (detected)`). Before any synced rows are written, either renumber those columns in the workbook by −3, or write synced rows with `+3`. This is a decision for the user, listed in the morning questions.

## Running the dry run

```
AZURE_TENANT_ID=… AZURE_CLIENT_ID=… AZURE_CLIENT_SECRET=… DIRECTORY_DRIVE_ID=… DIRECTORY_ITEM_ID=… \
  npm run fee-schedule-diff -- [--json] [--row-offset N] [--numeric-text usable] [--limit N]
```

- Set the variables in your shell from a secure source; never paste secrets into chat or commit them.
- The Entra app needs read access to the **Billing** site as well (with `Sites.Selected`, a read grant on that site), or the Fee Schedule read returns 403. `FEE_SCHEDULE_DRIVE_ID` and `FEE_SCHEDULE_ITEM_ID` override the Billing copy's IDs.
- Exit codes: 0 report printed, 2 the layout changed (nothing compared), 1 any other error (e.g. missing variable, Graph refused).

The report lists: header and data rows, payer columns, warnings, cell counts by status, quarantined cells with their medians, numbers stored as text, optional add-ons, add-ons with notes, non-CPT parents, unlabelled rows, skipped rows, and against the current tab: row offset, changed rates or usability, rows only in the sync, rows only in the current tab, and payers on one side only.

## Not built yet

- Writing synced `FeeRates`/`CashPrices` to the directory workbook (needs a write grant on the directory site and the renumbering decision above).
- Running it on a schedule.
