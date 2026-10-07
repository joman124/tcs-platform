import { parseAddress, syncFeeSchedule, toCashPricesSheet, toFeeRatesSheet, type Cell, type SyncReport } from '../sync/feeSchedule';
import { diffFeeRates, readCurrentFeeRates } from '../sync/feeScheduleDiff';
import type { Sheets } from './workbook';

/**
 * Rates and cash prices come live from the Billing Fee Schedule (user decision 2026-10-06). The directory workbook keeps
 * providers, services, credentialing and the service-to-visit links; its FeeRates and CashPrices tabs are replaced with
 * a fresh sync of the Fee Schedule before parsing. Read-only: nothing is written anywhere.
 */

export interface FeeScheduleRange {
  address: string;
  values: unknown[][];
}

/** The two spreadsheets disagree in a way that would misprice estimates. Shown on the "not ready" page. */
export class LiveRatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveRatesError';
  }
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

function column(sheet: unknown[][] | undefined, startsWith: string): number {
  const header = (sheet?.[0] ?? []).map(str);
  return header.findIndex((h) => h.startsWith(startsWith));
}

/** The Phase 1 snapshot numbered every Fee Schedule row 3 higher than the sheet (docs/fee-schedule-sync.md). */
const PHASE1_OFFSET = -3;

/** A copy of `sheet` with `delta` added to every number in the column whose header starts with `header`. */
function shiftColumn(sheet: unknown[][], header: string, delta: number): unknown[][] {
  const i = column(sheet, header);
  if (i < 0) return sheet;
  return sheet.map((r, n) => (n === 0 ? r : r.map((v, j) => (j === i && str(v) !== '' && Number.isFinite(Number(v)) ? Number(v) + delta : v))));
}

/**
 * Directory sheets with FeeRates and CashPrices rebuilt from the live Fee Schedule. Every visit and cash-price lookup is
 * keyed by row, so the workbook's row numbers must line up with the sheet. A workbook still on the Phase 1 numbering
 * (exactly 3 high, detected from its own FeeRates tab) is corrected in memory (`rowShift: -3`; DECISIONS #34); any other
 * offset is refused (LiveRatesError). Nothing is written back to the workbook.
 */
export function withLiveFeeSchedule(sheets: Sheets, fee: FeeScheduleRange): { sheets: Sheets; report: SyncReport; rowShift: number } {
  const { startRow, startCol } = parseAddress(fee.address);
  const sync = syncFeeSchedule(fee.values as Cell[][], { startRow, startCol });

  // 1. Row numbering, checked against the workbook's own FeeRates snapshot.
  let rowShift = 0;
  if (sheets.FeeRates && sheets.FeeRates.length > 1) {
    const d = diffFeeRates(readCurrentFeeRates(sheets.FeeRates as Cell[][]), sync.feeRates);
    if (d.rowOffset === PHASE1_OFFSET) {
      rowShift = PHASE1_OFFSET;
      sheets = { ...sheets };
      if (sheets.ServiceComponents) sheets.ServiceComponents = shiftColumn(sheets.ServiceComponents, 'Visit row', rowShift);
      if (sheets.Services) sheets.Services = shiftColumn(sheets.Services, 'Cash price row', rowShift);
    } else if (d.rowOffset !== 0) {
      throw new LiveRatesError(
        `The directory workbook's Fee Schedule row numbers do not line up with the Fee Schedule (off by ${-d.rowOffset}; only the original 3-row difference is corrected automatically). Check the workbook's Visit row and Cash price row columns.`,
      );
    }
  }

  // 2. Every row the workbook points at must be a visit (parent row) on the sheet.
  const visitRows = new Set<number>([...sync.cashPrices.map((c) => c.row), ...sync.feeRates.map((r) => r.visitRow)]);
  const problems: string[] = [];
  const sc = sheets.ServiceComponents;
  const scId = column(sc, 'Service ID');
  const scRow = column(sc, 'Visit row');
  for (const r of (sc ?? []).slice(1)) {
    const id = str(r[scId]);
    const row = Number(r[scRow]);
    if (id && Number.isFinite(row) && row > 0 && !visitRows.has(row)) problems.push(`service ${id} uses visit row ${row}`);
  }
  const sv = sheets.Services;
  const svId = column(sv, 'Service ID');
  const svRow = column(sv, 'Cash price row');
  for (const r of (sv ?? []).slice(1)) {
    const id = str(r[svId]);
    const raw = str(r[svRow]);
    if (id && raw !== '' && !sync.cashPrices.some((c) => c.row === Number(raw))) problems.push(`service ${id} uses cash price row ${raw}`);
  }
  if (problems.length > 0) {
    throw new LiveRatesError(`The directory workbook points at Fee Schedule rows that are not visits on the sheet: ${problems.join('; ')}. Correct those rows in the workbook.`);
  }

  return { sheets: { ...sheets, FeeRates: toFeeRatesSheet(sync.feeRates) as unknown[][], CashPrices: toCashPricesSheet(sync.cashPrices) as unknown[][] }, report: sync.report, rowShift };
}

/** PayerKey payers that have no column on the Fee Schedule: their insurance lines would always be blocked. */
export function payersWithoutColumns(sheets: Sheets, report: SyncReport): string[] {
  const pk = sheets.PayerKey;
  const i = column(pk, 'Fee Schedule payer');
  const located = new Set(report.payers.map((p) => p.payer));
  return (pk ?? [])
    .slice(1)
    .map((r) => str(r[i]))
    .filter((p) => p !== '' && !located.has(p));
}
