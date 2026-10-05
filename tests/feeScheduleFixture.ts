import { colIndex, type Cell } from '../src/sync/feeSchedule';

/**
 * INVENTED Fee Schedule sheet with the real layout (header text, tier labels, column letters, the blank Medicare 2020
 * master's label and the Allwell header misalignment). Every label and amount is made up.
 */

export const PAYER_HEADERS: Record<string, string> = {
  N: 'Aetna',
  S: 'UHC / Optum/UMR',
  X: 'UHC Advantage',
  AB: 'Cigna',
  AG: 'BCBS',
  AL: 'Medicare',
  AM: 'MEDICARE',
  AP: 'Medicare 2020 ',
  AS: 'ACN (Managed by) Alignment, Employers Health Network (EHN) and Intel',
  AV: 'TriWest / Tricare',
  AZ: 'AHCCCS 100%',
  BD: 'AZCH ',
  BI: 'Allwell / Ambetter',
};
const DOC = 'PHD / PSYD  MD/DO';
export const TIER_LABELS: Record<string, string> = {
  N: DOC, P: 'LPC / LCSW NP/PA', S: DOC, U: 'LPC / LCSW NP/PA', X: DOC, Z: 'LPC / LCSW NP/PA', AB: DOC, AD: 'LPC / LCSW NP/PA',
  AG: DOC, AI: 'LPC / LCSW NP/PA', AM: DOC, AO: 'LCSW (No LPC) NP/PA', AP: DOC, AS: DOC, AT: 'LCSW (No LPC) NP/PA',
  AV: DOC, AX: 'LCSW (No LPC) NP/PA', AZ: DOC, BB: 'LCSW/LPC NP/PA', BD: DOC, BF: 'LCSW/LPC NP/PA  (Tele)', BI: DOC, BK: 'LCSW/LPC NP/PA  (Tele)',
};
/** Doctoral / master's rate columns, in payer order. */
export const RATE_COLUMNS = [['N', 'P'], ['S', 'U'], ['X', 'Z'], ['AB', 'AD'], ['AG', 'AI'], ['AM', 'AO'], ['AP', 'AQ'], ['AS', 'AT'], ['AV', 'AX'], ['AZ', 'BB'], ['BD', 'BF'], ['BI', 'BK']] as const;

export const WIDTH = colIndex('BU') + 1;

/** One sheet row from a letter -> value map. */
export function sheetRow(cells: Record<string, Cell>): Cell[] {
  const r: Cell[] = Array.from({ length: WIDTH }, () => '');
  for (const [k, v] of Object.entries(cells)) r[colIndex(k)] = v;
  return r;
}

/** Every rate column for a row: doctoral = base + 1 per payer, master's = 80% of that (all invented). */
export function rates(base: number): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  RATE_COLUMNS.forEach(([d, m], i) => {
    out[d] = base + i;
    out[m] = Math.round((base + i) * 80) / 100;
  });
  out.BH = base; // the unlabelled column left of Allwell: never read
  return out;
}

/** Sheet rows 1..N. Row numbers in comments are sheet rows. */
export function feeScheduleSheet(): Cell[][] {
  return [
    sheetRow({ A: 'Appointment Type ', B: 'CPT', D: 'Duration', F: 'Color', H: 'Private Pay Appt Price', J: 'Median Insurance', L: 'Non Contracted', ...PAYER_HEADERS }), // 1
    sheetRow({ A: 'updated: invented', N: '1.1.2026', BH: '100%', BI: '1.1.2026' }), // 2
    sheetRow(TIER_LABELS), // 3
    sheetRow({ A: 'Package Evaluation (invented)', B: 'PKGXX', H: 900, ...rates(500) }), // 4  non-CPT parent: no rates of its own
    sheetRow({ A: '  Interview', B: '90791', D: '1.5 hr', H: 300, ...rates(150) }), // 5
    sheetRow({ A: '   +', B: '96130', ...rates(110) }), // 6
    sheetRow({ A: '   + (optional)', B: '96136', ...rates(40) }), // 7
    sheetRow({ A: '   +Physical Intake (on hold)', B: '99203', ...rates(60) }), // 8
    sheetRow({}), // 9
    sheetRow({ A: 'Counseling (invented)', B: '90837', H: 200, ...rates(100), AD: 'DNB', U: '#DIV/0!', Z: '$81.60' }), // 10  number stored as text
    sheetRow({ A: 'Couples (invented)', B: '90847', H: '$200 *', ...rates(90) }), // 11
    sheetRow({ A: 'Second counseling row', B: '90837', H: 0, ...rates(100) }), // 12
    sheetRow({ A: 'Mislabeled row', B: '90837', H: 250, ...rates(100), N: 200 }), // 13  Aetna doctoral twice the median
    sheetRow({}), // 14
    sheetRow({ A: '   +', B: '96131', ...rates(80) }), // 15  orphan: no parent above
    sheetRow({ A: 'Consult (invented)', B: 'CONSULT', H: 100 }), // 16
    sheetRow({ A: '   +Counseling (60 min)', B: '90837', ...rates(100) }), // 17 add-on with a note, under a non-CPT parent
    sheetRow({ A: '   +', B: '' }), // 18 add-on with no CPT
    sheetRow({ A: 'FACILITY CONTRACTS' }), // 19 section row: no code and no "+" rows, so not a visit
    sheetRow({}), // 20
    sheetRow({ A: 'Neurofeedback (invented)', H: 180 }), // 21 parent with no code: its "+" rows carry the CPT
    sheetRow({ A: '+ Counseling (60 min)', B: '90837', ...rates(100) }), // 22
    sheetRow({ A: '+ Neurofeedback (30 min)' }), // 23 add-on with no CPT
    sheetRow({}), // 24
    sheetRow({ A: 'Ketamine visit (invented)', B: 'Inital', H: 500 }), // 25 non-CPT code
    sheetRow({ B: '90837', ...rates(100) }), // 26 unlabelled row with a CPT: part of the visit above
    sheetRow({ A: 'A note row (invented)' }), // 27
    sheetRow({ B: '90832', ...rates(70) }), // 28 unlabelled row after a note: no visit, skipped
  ];
}
