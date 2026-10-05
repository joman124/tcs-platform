/**
 * Fee Schedule sync, engine part. Pure: takes the "Fee Schedule" sheet as the 2D array Graph's `usedRange` returns and
 * produces (a) FeeRates rows in exactly the shape `src/data/workbook.ts` reads, (b) cash prices from column H, and
 * (c) a review report. Nothing here reads or writes SharePoint. See docs/fee-schedule-sync.md.
 */

export type Cell = string | number | boolean | null | undefined;

const DOCTORAL_LABEL = 'PhD/PsyD/MD/DO';
const MASTERS_LABEL = 'LPC/LCSW/NP/PA';
export type TierLabel = typeof DOCTORAL_LABEL | typeof MASTERS_LABEL;

export interface PayerColumns {
  /** Payer name as the directory workbook (PayerKey, FeeRates) spells it. */
  payer: string;
  /** Column holding the payer's name in the header row, and the text it must match. */
  header: string;
  match: RegExp;
  doctoral: string;
  masters: string;
  /** Rates are always emitted as unusable ("ambiguous") until Billing confirms the block. */
  ambiguous?: boolean;
  /** The master's column has no tier label on the sheet. */
  mastersLabelOptional?: boolean;
  /** The header is misaligned with its data: find the payer by header text, then the tier columns by their labels. */
  locateByHeader?: boolean;
}

/**
 * The one place the sheet layout lives. Every column is checked against its header text at runtime, so a moved or
 * renamed column stops the sync instead of reading the wrong payer's rates.
 */
export const FEE_SCHEDULE_LAYOUT = {
  sheetName: 'Fee Schedule',
  /** Expected rows on the live sheet (confirmed 2026-10-05). The sync finds the header row by its text and reports any difference. */
  expectedHeaderRow: 1,
  expectedFirstDataRow: 4,
  labelColumn: 'A',
  cptColumn: 'B',
  cashColumn: 'H',
  headerChecks: { A: /appointment type/i, B: /^cpt$/i, H: /private pay/i } as Record<string, RegExp>,
  doctoralLabel: /ph\.?\s*d|psy\s*d/i,
  mastersLabel: /lpc|lcsw|np|pa\b/i,
  /** A cell more than this fraction from the median for its CPT (same payer and tier) is quarantined. */
  quarantineFraction: 0.25,
  payers: [
    { payer: 'Aetna', header: 'N', match: /^aetna\b/i, doctoral: 'N', masters: 'P' },
    { payer: 'UHC/Optum/UMR', header: 'S', match: /^uhc\s*\/\s*optum/i, doctoral: 'S', masters: 'U' },
    { payer: 'UHC Advantage', header: 'X', match: /^uhc\s+advantage/i, doctoral: 'X', masters: 'Z' },
    { payer: 'Cigna', header: 'AB', match: /^cigna\b/i, doctoral: 'AB', masters: 'AD' },
    { payer: 'BCBS', header: 'AG', match: /^bcbs\b/i, doctoral: 'AG', masters: 'AI' },
    { payer: 'Medicare', header: 'AM', match: /^medicare$/i, doctoral: 'AM', masters: 'AO', ambiguous: true },
    { payer: 'Medicare 2020', header: 'AP', match: /^medicare\s*2020/i, doctoral: 'AP', masters: 'AQ', ambiguous: true, mastersLabelOptional: true },
    { payer: 'ACN/EHN/Intel', header: 'AS', match: /^acn\b/i, doctoral: 'AS', masters: 'AT' },
    { payer: 'TriWest/Tricare', header: 'AV', match: /^triwest\b/i, doctoral: 'AV', masters: 'AX' },
    { payer: 'AHCCCS', header: 'AZ', match: /^ahcccs\b/i, doctoral: 'AZ', masters: 'BB' },
    { payer: 'AZCH', header: 'BD', match: /^azch\b/i, doctoral: 'BD', masters: 'BF' },
    { payer: 'Allwell/Ambetter', header: 'BI', match: /^allwell\b/i, doctoral: 'BI', masters: 'BK', locateByHeader: true },
  ] as PayerColumns[],
};
export type FeeScheduleLayout = typeof FEE_SCHEDULE_LAYOUT;

// ---------- cell and column helpers

export const colIndex = (letters: string): number => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export function colLetter(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Top-left of a Graph range address such as `'Fee Schedule'!A1:BU160`. */
export function parseAddress(address: string): { startRow: number; startCol: number } {
  const m = /!?\$?([A-Z]+)\$?(\d+)(?::|$)/i.exec(address.split('!').pop() ?? '');
  if (!m) throw new Error(`Unrecognised range address "${address}".`);
  return { startRow: Number(m[2]), startCol: colIndex(m[1]!) };
}

const text = (v: Cell): string => (v === null || v === undefined ? '' : String(v).trim());
const CPT = /^(\d{4}[0-9A-Z]|[A-Z]\d{4})$/;
const MONEY_TEXT = /^\$?\s*\d{1,3}(,?\d{3})*(\.\d+)?$/;

export type CellStatus = 'ok' | 'blank' | 'zero' | 'text' | 'error' | 'quarantined' | 'ambiguous';
const USABLE = (s: CellStatus) => s === 'ok';

export interface SyncOptions {
  /** Row number of `values[0]` and column index of `values[r][0]` (from the usedRange address). Default A1. */
  startRow?: number;
  startCol?: number;
  /** Numbers stored as text ("$165.45" in a text cell). Default 'unusable': text cells never become rates. */
  numericText?: 'usable' | 'unusable';
}

function readNumber(v: Cell, numericText: 'usable' | 'unusable'): { value: number | null; status: CellStatus; numericText: boolean } {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { value: null, status: 'error', numericText: false };
    return { value: v, status: v > 0 ? 'ok' : 'zero', numericText: false };
  }
  const s = text(v);
  if (s === '') return { value: null, status: 'blank', numericText: false };
  if (s.startsWith('#')) return { value: null, status: 'error', numericText: false };
  if (MONEY_TEXT.test(s)) {
    if (numericText === 'unusable') return { value: null, status: 'text', numericText: true };
    const n = Number(s.replace(/[$,\s]/g, ''));
    return { value: n, status: n > 0 ? 'ok' : 'zero', numericText: true };
  }
  return { value: null, status: 'text', numericText: false };
}

// ---------- output shapes

/** One FeeRates row. `toFeeRatesSheet` turns these into the tab `parseWorkbook` reads. */
export interface FeeRateRow {
  visitRow: number;
  visitLabel: string;
  cpt: string;
  isAddOn: boolean;
  optional: boolean;
  payer: string;
  tier: TierLabel;
  rate: number | null;
  status: CellStatus;
  raw: string;
  source: string;
}

export interface CashPriceRow {
  row: number;
  label: string;
  raw: string;
  price: number | null;
  status: 'ok' | 'zero' | 'blank' | 'text' | 'error';
}

export const FEE_RATES_HEADER = ['Visit row', 'Visit label', 'Component CPT', 'Is add-on', 'Optional add-on', 'Payer', 'Credential tier', 'Rate', 'Status', 'Raw cell text', 'Source cell'] as const;
export const CASH_PRICES_HEADER = ['Fee Schedule row', 'Appointment type', 'Raw cash text (col H)', 'Cash price', 'Status'] as const;

const yn = (b: boolean) => (b ? 'Y' : 'N');
export const toFeeRatesSheet = (rows: FeeRateRow[]): Cell[][] => [
  [...FEE_RATES_HEADER],
  ...rows.map((r) => [r.visitRow, r.visitLabel, r.cpt, yn(r.isAddOn), yn(r.optional), r.payer, r.tier, r.rate, r.status, r.raw, r.source]),
];
export const toCashPricesSheet = (rows: CashPriceRow[]): Cell[][] => [[...CASH_PRICES_HEADER], ...rows.map((r) => [r.row, r.label, r.raw, r.price, r.status])];

export interface QuarantinedCell {
  source: string;
  visitRow: number;
  visitLabel: string;
  cpt: string;
  payer: string;
  tier: TierLabel;
  rate: number;
  median: number;
}

export interface LocatedPayer {
  payer: string;
  doctoral: string;
  masters: string;
  ambiguous: boolean;
}

export interface SyncReport {
  headerRow: number;
  firstDataRow: number;
  payers: LocatedPayer[];
  /** Layout differences that did not stop the sync (e.g. the header row moved, Allwell found in other columns). */
  warnings: string[];
  visits: number;
  cells: number;
  usable: number;
  unusable: Record<'blank' | 'zero' | 'text' | 'error', number>;
  quarantined: QuarantinedCell[];
  ambiguous: number;
  /** Cells holding a number stored as text, with what was done with them. */
  numericText: { source: string; treatedAs: 'usable' | 'unusable' }[];
  /** "(optional)" add-on rows: emitted with Optional add-on = Y, so bundles leave them out unless a service asks for them. */
  optionalAddOns: { row: number; cpt: string; visitRow: number }[];
  /** Add-on rows whose label carries a note (e.g. "(on hold)"): included as normal add-ons; check them. */
  addOnNotes: { row: number; label: string; cpt: string; visitRow: number }[];
  /**
   * Parent rows whose code is blank or not a CPT (package, summary or heading rows such as Neurofeedback): no rate of
   * their own; their "+" rows form the visit. A row with no code counts as a parent only when "+" rows follow it.
   */
  nonCptParents: { row: number; label: string; code: string; addOns: number }[];
  /** Rows with a CPT but no label, directly under a visit (e.g. under KAP): included in that visit as add-ons. */
  unlabelledComponents: { row: number; cpt: string; visitRow: number }[];
  /** "+" rows with no parent visit above them: skipped. */
  orphanAddOns: { row: number; label: string; cpt: string }[];
  /** "+" rows with no CPT: skipped. */
  addOnsWithoutCpt: { row: number; label: string }[];
}

export interface SyncResult {
  feeRates: FeeRateRow[];
  cashPrices: CashPriceRow[];
  report: SyncReport;
}

/** The sheet does not have the layout the config expects. Nothing was synced. */
export class FeeScheduleLayoutError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`The Fee Schedule layout has changed, so nothing was synced: ${problems.join('; ')}.`);
    this.name = 'FeeScheduleLayoutError';
    this.problems = problems;
  }
}

// ---------- the sync

export function syncFeeSchedule(values: Cell[][], opts: SyncOptions = {}, layout: FeeScheduleLayout = FEE_SCHEDULE_LAYOUT): SyncResult {
  const startRow = opts.startRow ?? 1;
  const startCol = opts.startCol ?? 0;
  const numericTextMode = opts.numericText ?? 'unusable';
  const lastRow = startRow + values.length - 1;
  const at = (row: number, col: string): Cell => values[row - startRow]?.[colIndex(col) - startCol];
  const problems: string[] = [];
  const warnings: string[] = [];

  // Header row: found by its text, so a title line inserted above it does not break the sync.
  let headerRow = -1;
  for (let r = startRow; r <= Math.min(lastRow, startRow + 15) && headerRow < 0; r++) {
    if (layout.headerChecks.A!.test(text(at(r, 'A'))) && layout.headerChecks.B!.test(text(at(r, 'B')))) headerRow = r;
  }
  if (headerRow < 0) throw new FeeScheduleLayoutError([`no header row with "Appointment Type" in column A and "CPT" in column B`]);
  for (const [col, re] of Object.entries(layout.headerChecks)) {
    if (!re.test(text(at(headerRow, col)))) problems.push(`column ${col} of the header row should match ${re} but reads "${text(at(headerRow, col))}"`);
  }
  // Tier-label row: the first row below the header whose Aetna doctoral cell carries a doctoral label.
  const first = layout.payers[0]!;
  let tierRow = -1;
  for (let r = headerRow + 1; r <= Math.min(lastRow, headerRow + 4) && tierRow < 0; r++) if (layout.doctoralLabel.test(text(at(r, first.doctoral)))) tierRow = r;
  if (tierRow < 0) throw new FeeScheduleLayoutError([`no tier-label row (PhD/PsyD) under the header in column ${first.doctoral}`, ...problems]);
  const firstDataRow = tierRow + 1;
  if (headerRow !== layout.expectedHeaderRow) warnings.push(`Header row is ${headerRow}, expected ${layout.expectedHeaderRow}.`);
  if (firstDataRow !== layout.expectedFirstDataRow) warnings.push(`Data starts at row ${firstDataRow}, expected ${layout.expectedFirstDataRow}. Visit rows are numbered from the sheet as it is now.`);

  // Payer columns: checked against the header and tier-label text.
  const located: (LocatedPayer & { spec: PayerColumns })[] = [];
  const lastCol = startCol + Math.max(0, ...values.map((r) => r.length)) - 1;
  for (const p of layout.payers) {
    let { header, doctoral, masters } = p;
    if (p.locateByHeader) {
      let found = -1;
      for (let c = startCol; c <= lastCol && found < 0; c++) if (p.match.test(text(at(headerRow, colLetter(c))))) found = c;
      if (found < 0) {
        problems.push(`no "${p.payer}" header found in the header row`);
        continue;
      }
      header = colLetter(found);
      let d = -1;
      for (let c = found; c <= found + 3 && d < 0; c++) if (layout.doctoralLabel.test(text(at(tierRow, colLetter(c))))) d = c;
      let m = -1;
      for (let c = d + 1; d >= 0 && c <= d + 3 && m < 0; c++) if (layout.mastersLabel.test(text(at(tierRow, colLetter(c))))) m = c;
      if (d < 0 || m < 0) {
        problems.push(`"${p.payer}" header found in column ${header} but its PhD/PsyD and LPC/LCSW columns were not found next to it`);
        continue;
      }
      doctoral = colLetter(d);
      masters = colLetter(m);
      if (doctoral !== p.doctoral || masters !== p.masters) warnings.push(`${p.payer} found in columns ${doctoral}/${masters}, expected ${p.doctoral}/${p.masters}.`);
    } else {
      const h = text(at(headerRow, header));
      if (!p.match.test(h)) {
        problems.push(`column ${header} should be the ${p.payer} header but reads "${h}"`);
        continue;
      }
      const dl = text(at(tierRow, doctoral));
      const ml = text(at(tierRow, masters));
      if (!layout.doctoralLabel.test(dl)) problems.push(`${p.payer} doctoral column ${doctoral} should be labelled PhD/PsyD but reads "${dl}"`);
      if (!(layout.mastersLabel.test(ml) || (p.mastersLabelOptional && ml === ''))) problems.push(`${p.payer} master's column ${masters} should be labelled LPC/LCSW but reads "${ml}"`);
    }
    located.push({ payer: p.payer, doctoral, masters, ambiguous: Boolean(p.ambiguous), spec: p });
  }
  if (problems.length > 0) throw new FeeScheduleLayoutError(problems);

  // Visits: a parent row (label not starting with "+", a code in column B) plus the "+" rows under it.
  const report: SyncReport = {
    headerRow,
    firstDataRow,
    payers: located.map(({ spec: _s, ...l }) => l),
    warnings,
    visits: 0,
    cells: 0,
    usable: 0,
    unusable: { blank: 0, zero: 0, text: 0, error: 0 },
    quarantined: [],
    ambiguous: 0,
    numericText: [],
    optionalAddOns: [],
    addOnNotes: [],
    nonCptParents: [],
    unlabelledComponents: [],
    orphanAddOns: [],
    addOnsWithoutCpt: [],
  };
  const feeRates: FeeRateRow[] = [];
  const cashPrices: CashPriceRow[] = [];
  let visit: { row: number; label: string; nonCpt?: SyncReport['nonCptParents'][number] } | null = null;

  const emit = (row: number, cpt: string, isAddOn: boolean, optional: boolean) => {
    for (const p of located) {
      for (const [col, tier] of [[p.doctoral, DOCTORAL_LABEL], [p.masters, MASTERS_LABEL]] as const) {
        const v = at(row, col);
        const n = readNumber(v, numericTextMode);
        const source = `${col}${row}`;
        if (n.numericText) report.numericText.push({ source, treatedAs: numericTextMode });
        feeRates.push({ visitRow: visit!.row, visitLabel: visit!.label, cpt, isAddOn, optional, payer: p.payer, tier, rate: n.value, status: p.ambiguous ? 'ambiguous' : n.status, raw: text(v), source });
      }
    }
  };

  for (let row = firstDataRow; row <= lastRow; row++) {
    const label = text(at(row, layout.labelColumn));
    const code = text(at(row, layout.cptColumn));
    if (label.startsWith('+')) {
      if (!code) {
        report.addOnsWithoutCpt.push({ row, label });
        continue;
      }
      if (!visit) {
        report.orphanAddOns.push({ row, label, cpt: code });
        continue;
      }
      const optional = /\(optional\)/i.test(label);
      const note = label.slice(1).replace(/\(optional\)/gi, '').trim();
      if (optional) report.optionalAddOns.push({ row, cpt: code, visitRow: visit.row });
      if (note) report.addOnNotes.push({ row, label, cpt: code, visitRow: visit.row });
      if (visit.nonCpt) visit.nonCpt.addOns += 1;
      emit(row, code, true, optional);
      continue;
    }
    if (!label && code) {
      // An unlabelled row with a code continues the visit above it (Phase 1 read it the same way).
      if (!visit || !CPT.test(code)) {
        report.orphanAddOns.push({ row, label, cpt: code });
        continue;
      }
      report.unlabelledComponents.push({ row, cpt: code, visitRow: visit.row });
      if (visit.nonCpt) visit.nonCpt.addOns += 1;
      emit(row, code, true, false);
      continue;
    }
    // A labelled row with no code is a parent only if "+" rows follow (e.g. Neurofeedback); otherwise it is a heading or note.
    const nextLabel = text(at(row + 1, layout.labelColumn));
    if (!label || (!code && !nextLabel.startsWith('+'))) {
      visit = null; // a blank, section or note row ends the visit
      continue;
    }
    const cash = readNumber(at(row, layout.cashColumn), numericTextMode);
    cashPrices.push({ row, label, raw: text(at(row, layout.cashColumn)), price: cash.value, status: cash.status as CashPriceRow['status'] });
    report.visits += 1;
    if (!CPT.test(code)) {
      const entry = { row, label, code, addOns: 0 };
      report.nonCptParents.push(entry);
      visit = { row, label, nonCpt: entry };
      continue;
    }
    visit = { row, label };
    emit(row, code, false, false);
  }

  // Quarantine: compare each usable cell with the median of the same CPT, payer and tier across the sheet.
  const groups = new Map<string, FeeRateRow[]>();
  for (const r of feeRates) {
    if (!USABLE(r.status) || r.rate === null) continue;
    const k = `${r.cpt}|${r.payer}|${r.tier}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const cells of groups.values()) {
    const sorted = cells.map((c) => c.rate!).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    for (const c of cells) {
      if (Math.abs(c.rate! - median) > layout.quarantineFraction * median) {
        c.status = 'quarantined';
        report.quarantined.push({ source: c.source, visitRow: c.visitRow, visitLabel: c.visitLabel, cpt: c.cpt, payer: c.payer, tier: c.tier, rate: c.rate!, median: Math.round(median * 100) / 100 });
      }
    }
  }

  for (const r of feeRates) {
    report.cells += 1;
    if (r.status === 'ok') report.usable += 1;
    else if (r.status === 'ambiguous') report.ambiguous += 1;
    else if (r.status !== 'quarantined') report.unusable[r.status] += 1;
  }
  return { feeRates, cashPrices, report };
}
