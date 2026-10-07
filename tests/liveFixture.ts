import { syncFeeSchedule, toFeeRatesSheet } from '../src/sync/feeSchedule';
import type { Sheets } from '../src/data/workbook';
import { feeScheduleSheet } from './feeScheduleFixture';
import { sheets as base } from './workbookSheets';

/**
 * INVENTED directory workbook whose row numbers line up with the invented Fee Schedule sheet (as the real workbook will
 * after the -3 renumbering): Services and ServiceComponents point at visit rows of `feeScheduleSheet()`, and the FeeRates
 * snapshot was taken from that sheet. Rates and cash prices in the snapshot are deliberately stale, so tests can tell
 * live values from snapshot values.
 */
export const feeRange = () => ({ address: "'Fee Schedule'!A1:BU28", values: feeScheduleSheet() as unknown[][] });

const staleSnapshot = (): unknown[][] =>
  toFeeRatesSheet(syncFeeSchedule(feeScheduleSheet()).feeRates).map((r, i) => (i === 0 ? r : [...r.slice(0, 7), 1, 'ok', ...r.slice(9)]));

export const liveDirectory = (): Sheets => ({
  ...base,
  Services: [
    base.Services![0]!,
    // Individual Counseling, doctoral: visit row 10 (cash $200 on the sheet)
    ['S1', 'Ind', 'Individual Counseling', '90837', '1 hr', 'Y', 10, '', '', 'One line', '', 'Y', null, 'T1'],
    // Couples: visit row 11 (cash is text on the sheet), workbook override $225
    ['S2', 'Couples', 'Couples Counseling', '90847', '1 hr', 'Y', 11, '', '', 'One line', '', 'Y', 225, null],
    // ADHD Evaluation: visit row 5 (cash $300 on the sheet)
    ['S3', 'Eval', 'ADHD Evaluation', '90791', '', 'Y', 5, '', '', 'One line', '', 'N', null, null],
    // Switched off in the workbook but billable to insurance (visit row 13)
    ['S4', 'Other', 'Mislabeled Visit Service', '90837', '', 'N', 13, '', '', 'One line', '', 'Y', null, null],
    // Switched off with no insurance rate (visit row 4 is a package row with no rate cells)
    ['S5', 'Package', 'Package Service', 'PKGXX', '', 'N', 4, '', '', 'One line', '', 'N', null, null],
  ],
  ServiceComponents: [
    base.ServiceComponents![0]!,
    ['S1', 10, 1, 'N', 'Counseling', ''],
    ['S2', 11, 1, 'N', 'Couples', ''],
    ['S3', 5, 1, 'N', 'Interview', ''],
    ['S4', 13, 1, 'N', 'Mislabeled', ''],
    ['S5', 4, 1, 'N', 'Package', ''],
  ],
  ProviderServices: [
    base.ProviderServices![0]!,
    ['P1', 'S1', '=f', '=f', null],
    ['P1', 'S3', '=f', '=f', null],
    ['P1', 'S4', '=f', '=f', null],
    ['P1', 'S5', '=f', '=f', null],
    ['P2', 'S1', '=f', '=f', 195],
  ],
  FeeRates: staleSnapshot(),
  CashPrices: [base.CashPrices![0]!, [10, 'stale', '$1', 1, 'ok'], [11, 'stale', '$1', 1, 'ok'], [5, 'stale', '$1', 1, 'ok']],
});

/** The same workbook before the renumbering: every row 3 higher than the sheet. */
export const unrenumberedDirectory = (): Sheets => {
  const d = liveDirectory();
  const shift = (sheet: unknown[][], col: number) => sheet.map((r, i) => (i === 0 ? r : r.map((v, j) => (j === col ? Number(v) + 3 : v))));
  return { ...d, FeeRates: shift(d.FeeRates!, 0), ServiceComponents: shift(d.ServiceComponents!, 1), Services: shift(d.Services!, 6) };
};
