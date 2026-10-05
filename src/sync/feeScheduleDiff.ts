import { parseAddress, syncFeeSchedule, type Cell, type FeeRateRow, type SyncReport, type SyncResult } from './feeSchedule';

/** Compare the directory's current FeeRates tab with a fresh sync. Pure; prints nothing and writes nothing. */

export interface RateKeyed {
  visitRow: number;
  cpt: string;
  payer: string;
  tier: string;
  rate: number | null;
  status: string;
}

export interface RateChange {
  key: string;
  before: { rate: number | null; status: string };
  after: { rate: number | null; status: string };
}

export interface FeeRatesDiff {
  /** Constant added to the current tab's visit rows so they line up with the sheet (0 when they already match). */
  rowOffset: number;
  /** Whether rowOffset was detected (true) or given by the caller (false). */
  rowOffsetDetected: boolean;
  matched: number;
  unchanged: number;
  changed: RateChange[];
  added: string[];
  removed: string[];
  payersOnlyInCurrent: string[];
  payersOnlyInSync: string[];
}

const str = (v: Cell): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: Cell): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Read the FeeRates tab (header row first) by header text. Throws if a column the diff needs is missing. */
export function readCurrentFeeRates(sheet: Cell[][]): RateKeyed[] {
  const header = (sheet[0] ?? []).map(str);
  const idx = (h: string) => {
    const i = header.indexOf(h);
    if (i < 0) throw new Error(`The current FeeRates tab has no '${h}' column.`);
    return i;
  };
  const [vr, cpt, payer, tier, rate, status] = ['Visit row', 'Component CPT', 'Payer', 'Credential tier', 'Rate', 'Status'].map(idx) as [number, number, number, number, number, number];
  return sheet
    .slice(1)
    .filter((r) => str(r[0]) !== '')
    .map((r) => ({ visitRow: Number(r[vr]), cpt: str(r[cpt]), payer: str(r[payer]), tier: str(r[tier]), rate: num(r[rate]), status: str(r[status]) }));
}

/** Keys repeat when a CPT appears twice in one visit, so each occurrence gets its own number. */
function keyed(rows: RateKeyed[], offset: number): Map<string, RateKeyed> {
  const seen = new Map<string, number>();
  const out = new Map<string, RateKeyed>();
  for (const r of rows) {
    const base = `row ${r.visitRow + offset} ${r.cpt} ${r.payer} ${r.tier}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(n === 1 ? base : `${base} #${n}`, r);
  }
  return out;
}

const sameRate = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.round(a * 100) === Math.round(b * 100));
/** Statuses that mean "unusable" are compared as such: the sync's finer reasons (blank, text, error) are not a change by themselves. */
const usable = (s: string) => s.toLowerCase() === 'ok';

/**
 * Diff current FeeRates against a sync. If `rowOffset` is not given, the offset in -10..10 that lines up the most
 * rows is used (the Phase 1 snapshot numbered rows 3 higher than the sheet), and reported.
 */
export function diffFeeRates(current: RateKeyed[], next: FeeRateRow[], rowOffset?: number): FeeRatesDiff {
  const nextKeyed = keyed(next, 0);
  let offset = rowOffset ?? 0;
  if (rowOffset === undefined) {
    let best = -1;
    for (let k = -10; k <= 10; k++) {
      const cur = keyed(current, k);
      let hits = 0;
      for (const key of cur.keys()) if (nextKeyed.has(key)) hits += 1;
      if (hits > best || (hits === best && Math.abs(k) < Math.abs(offset))) {
        best = hits;
        offset = k;
      }
    }
  }
  const cur = keyed(current, offset);
  const d: FeeRatesDiff = { rowOffset: offset, rowOffsetDetected: rowOffset === undefined, matched: 0, unchanged: 0, changed: [], added: [], removed: [], payersOnlyInCurrent: [], payersOnlyInSync: [] };
  for (const [key, a] of cur) {
    const b = nextKeyed.get(key);
    if (!b) {
      d.removed.push(key);
      continue;
    }
    d.matched += 1;
    const statusChanged = usable(a.status) !== usable(b.status);
    const rateChanged = usable(a.status) && usable(b.status) && !sameRate(a.rate, b.rate);
    if (statusChanged || rateChanged) d.changed.push({ key, before: { rate: a.rate, status: a.status }, after: { rate: b.rate, status: b.status } });
    else d.unchanged += 1;
  }
  for (const key of nextKeyed.keys()) if (!cur.has(key)) d.added.push(key);
  const cp = new Set(current.map((r) => r.payer));
  const np = new Set(next.map((r) => r.payer));
  d.payersOnlyInCurrent = [...cp].filter((p) => !np.has(p)).sort();
  d.payersOnlyInSync = [...np].filter((p) => !cp.has(p)).sort();
  return d;
}

const money = (v: number | null) => (v === null ? 'none' : `$${v.toFixed(2)}`);

/** Plain-text report for the CLI. */
export function formatDiffReport(report: SyncReport, diff: FeeRatesDiff, limit = 50): string {
  const L: string[] = [];
  const list = <T,>(title: string, items: T[], f: (x: T) => string) => {
    L.push(`${title}: ${items.length}`);
    for (const x of items.slice(0, limit)) L.push(`  ${f(x)}`);
    if (items.length > limit) L.push(`  … ${items.length - limit} more (use --json for all)`);
  };
  L.push('Fee Schedule sync: dry run. Nothing was written.', '');
  L.push(`Header row ${report.headerRow}; data from row ${report.firstDataRow}.`);
  L.push(`Payer columns: ${report.payers.map((p) => `${p.payer} ${p.doctoral}/${p.masters}${p.ambiguous ? ' (ambiguous, blocked)' : ''}`).join(', ')}`);
  for (const w of report.warnings) L.push(`WARNING: ${w}`);
  L.push('', `Visits ${report.visits}; rate cells ${report.cells}: usable ${report.usable}, blank ${report.unusable.blank}, zero ${report.unusable.zero}, text ${report.unusable.text}, error ${report.unusable.error}, quarantined ${report.quarantined.length}, ambiguous ${report.ambiguous}.`);
  list('Quarantined (more than 25% from the median for the CPT, same payer and tier)', report.quarantined, (q) => `${q.source} row ${q.visitRow} ${q.visitLabel} ${q.cpt} ${q.payer} ${q.tier}: ${money(q.rate)} vs median ${money(q.median)}`);
  list('Numbers stored as text', report.numericText, (n) => `${n.source} (${n.treatedAs})`);
  list('Optional add-ons (left out of bundles unless a service asks for them)', report.optionalAddOns, (o) => `row ${o.row} ${o.cpt} under row ${o.visitRow}`);
  list('Add-on rows with a note (included; check them)', report.addOnNotes, (o) => `row ${o.row} "${o.label}" ${o.cpt} under row ${o.visitRow}`);
  list('Parent rows with a non-CPT code (no rate of their own)', report.nonCptParents, (o) => `row ${o.row} "${o.label}" code "${o.code}", ${o.addOns} add-on rows`);
  list('Unlabelled rows with a CPT, included in the visit above', report.unlabelledComponents, (o) => `row ${o.row} ${o.cpt} under row ${o.visitRow}`);
  list('Add-on rows with no parent (skipped)', report.orphanAddOns, (o) => `row ${o.row} "${o.label}" ${o.cpt}`);
  list('Add-on rows with no CPT (skipped)', report.addOnsWithoutCpt, (o) => `row ${o.row} "${o.label}"`);
  L.push('', 'Compared with the current FeeRates tab:');
  if (diff.rowOffset !== 0) {
    L.push(
      `WARNING: the current FeeRates visit rows line up with the sheet only when shifted by ${diff.rowOffset > 0 ? '+' : ''}${diff.rowOffset}${diff.rowOffsetDetected ? ' (detected)' : ' (given)'}. ` +
        'ServiceComponents, Services "Cash price row" and CashPrices use the same numbering: renumber them together before writing synced rows.',
    );
  }
  L.push(`Matched ${diff.matched}, unchanged ${diff.unchanged}, changed ${diff.changed.length}, only in the sync ${diff.added.length}, only in the current tab ${diff.removed.length}.`);
  list('Changed', diff.changed, (c) => `${c.key}: ${money(c.before.rate)} ${c.before.status} -> ${money(c.after.rate)} ${c.after.status}`);
  list('Only in the sync', diff.added, (k) => k);
  list('Only in the current tab', diff.removed, (k) => k);
  if (diff.payersOnlyInCurrent.length) L.push(`Payers only in the current tab: ${diff.payersOnlyInCurrent.join(', ')}`);
  if (diff.payersOnlyInSync.length) L.push(`Payers only in the sync: ${diff.payersOnlyInSync.join(', ')}`);
  return L.join('\n');
}


export interface DiffRun {
  sync: SyncResult;
  diff: FeeRatesDiff;
  text: string;
}

/**
 * The whole dry run, with the reads injected: read the Fee Schedule sheet and the directory's FeeRates tab, sync, diff.
 * There is deliberately no write step anywhere in this module.
 */
export async function runFeeScheduleDiff(
  read: { feeSchedule: () => Promise<{ address: string; values: unknown[][] }>; currentFeeRates: () => Promise<unknown[][]> },
  opts: { rowOffset?: number; numericText?: 'usable' | 'unusable'; limit?: number } = {},
): Promise<DiffRun> {
  const sheet = await read.feeSchedule();
  const { startRow, startCol } = parseAddress(sheet.address);
  const sync = syncFeeSchedule(sheet.values as Cell[][], { startRow, startCol, ...(opts.numericText ? { numericText: opts.numericText } : {}) });
  const diff = diffFeeRates(readCurrentFeeRates((await read.currentFeeRates()) as Cell[][]), sync.feeRates, opts.rowOffset);
  return { sync, diff, text: formatDiffReport(sync.report, diff, opts.limit) };
}
