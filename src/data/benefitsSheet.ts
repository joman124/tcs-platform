import type { Benefits } from '../engine/benefits';

/**
 * The patients' benefits sheet (co-pay, deductible, co-insurance, out of pocket), one row per patient. Pure functions:
 * they run in the browser, which reads the sheet straight from SharePoint (components/benefitsBrowser.ts), so patient
 * data never reaches the estimator's server. A lookup returns only the matching row's benefit figures and insurance
 * name, never another row, a name or a date of birth. DECISIONS #35 and #38.
 */

export type BenefitsField =
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'dob'
  | 'insurance'
  | 'copay'
  | 'deductible'
  | 'deductibleRemaining'
  | 'coinsurance'
  | 'outOfPocket'
  | 'outOfPocketRemaining';

/**
 * How each column is recognised: the header, lower-cased with punctuation and spaces removed, must match one of these
 * patterns. Checked in this order, and a column is used by the first field that claims it, so "deductible remaining"
 * is claimed before "deductible".
 */
export const BENEFITS_COLUMNS: readonly (readonly [BenefitsField, RegExp])[] = [
  ['dob', /^(dob|dateofbirth|birthdate|birthday|patientdob)$/],
  ['firstName', /^(first|firstname|patientfirstname)$/],
  ['lastName', /^(last|lastname|patientlastname|surname)$/],
  ['name', /^(name|patient|patientname|fullname|client|clientname)$/],
  ['insurance', /^(insurance|insurancecompany|payer|payor|carrier|plan|primaryinsurance)$/],
  ['deductibleRemaining', /^(deductibleremaining|remainingdeductible|dedremaining|deductibleleft|deductiblebalance)$/],
  ['outOfPocketRemaining', /^(outofpocketremaining|oopremaining|remainingoutofpocket|remainingoop|outofpocketmaxremaining|oopmaxremaining)$/],
  ['copay', /^(copay|visitcopay|copayment|officecopay)$/],
  ['coinsurance', /^(coinsurance|coins|coinsurancepercent|coinsurancepct)$/],
  ['deductible', /^(deductible|annualdeductible|ded)$/],
  ['outOfPocket', /^(outofpocket|oop|outofpocketmax|oopmax|outofpocketmaximum|maxoutofpocket)$/],
];

const normHeader = (v: unknown): string => String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

export type ColumnMap = Partial<Record<BenefitsField, number>>;

/** The column index of each recognised field in a header row. */
export function mapColumns(header: unknown[]): ColumnMap {
  const map: ColumnMap = {};
  const taken = new Set<number>();
  for (const [field, pattern] of BENEFITS_COLUMNS) {
    const i = header.findIndex((h, j) => !taken.has(j) && pattern.test(normHeader(h)));
    if (i >= 0) {
      map[field] = i;
      taken.add(i);
    }
  }
  return map;
}

const canLookUp = (m: ColumnMap): boolean => m.dob !== undefined && (m.name !== undefined || (m.firstName !== undefined && m.lastName !== undefined));

/** The header row: the first of the top 10 rows with a date-of-birth and a name column. */
export function findHeader(values: unknown[][]): { row: number; columns: ColumnMap } | null {
  for (let row = 0; row < Math.min(10, values.length); row++) {
    const columns = mapColumns(values[row] ?? []);
    if (canLookUp(columns)) return { row, columns };
  }
  return null;
}

/** Names compare as their words in any order, case and punctuation ignored: "Test, Jane" matches "jane test". */
export const nameKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

/** A date cell (Excel serial number, ISO text or US month/day/year text) as YYYY-MM-DD, or null. */
export function dateKey(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = str(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3]!.length === 2 ? (Number(m[3]) > 30 ? `19${m[3]}` : `20${m[3]}`) : m[3]!;
    return `${year}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  }
  return null;
}

/** Money cell to cents: 1500, "1500", "$1,500.00". Blank or text such as "N/A" is unknown (null). */
export function moneyCents(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  const s = str(v).replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Co-insurance cell to a percentage: "20%" and 20 are 20; a fraction such as 0.2 (Excel's 20%) is 20 too. */
export function percent(v: unknown): number | null {
  const s = typeof v === 'number' ? String(v) : str(v).replace(/[\s()]/g, '');
  const m = /^(\d+(\.\d+)?)(%?)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const pct = m[3] === '%' || n > 1 ? n : n * 100;
  return pct >= 0 && pct <= 100 ? Math.round(pct * 100) / 100 : null;
}

export type BenefitsLookup =
  | { status: 'found'; benefits: Benefits; insurance: string }
  | { status: 'not-found' }
  | { status: 'ambiguous'; count: number }
  | { status: 'no-columns' };

/** Find one patient's row by name and date of birth (YYYY-MM-DD). Returns only that row's benefit figures. */
export function lookUpBenefits(values: unknown[][], name: string, dob: string): BenefitsLookup {
  const header = findHeader(values);
  if (!header) return { status: 'no-columns' };
  const c = header.columns;
  const want = nameKey(name);
  if (!want || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return { status: 'not-found' };
  const cell = (r: unknown[], f: BenefitsField) => (c[f] === undefined ? undefined : r[c[f]!]);
  const rowName = (r: unknown[]) => (c.name !== undefined ? str(cell(r, 'name')) : `${str(cell(r, 'firstName'))} ${str(cell(r, 'lastName'))}`);
  const matches = values.slice(header.row + 1).filter((r) => nameKey(rowName(r)) === want && dateKey(cell(r, 'dob')) === dob);
  if (matches.length === 0) return { status: 'not-found' };
  if (matches.length > 1) return { status: 'ambiguous', count: matches.length };
  const r = matches[0]!;
  return {
    status: 'found',
    insurance: str(cell(r, 'insurance')).slice(0, 60),
    benefits: {
      copayCents: moneyCents(cell(r, 'copay')),
      deductibleCents: moneyCents(cell(r, 'deductible')),
      deductibleRemainingCents: moneyCents(cell(r, 'deductibleRemaining')),
      coinsurancePct: percent(cell(r, 'coinsurance')),
      outOfPocketCents: moneyCents(cell(r, 'outOfPocket')),
      outOfPocketRemainingCents: moneyCents(cell(r, 'outOfPocketRemaining')),
    },
  };
}

/** For /diagnostics: which fields were recognised, and how many patient rows there are. No names or values. */
export function describeSheet(values: unknown[][]): { headerRow: number | null; matched: BenefitsField[]; missing: BenefitsField[]; rows: number } {
  const header = findHeader(values);
  const all = BENEFITS_COLUMNS.map(([f]) => f);
  if (!header) return { headerRow: null, matched: [], missing: all, rows: 0 };
  const byName = header.columns.name !== undefined;
  const optional = new Set<BenefitsField>(byName ? ['firstName', 'lastName'] : ['name']);
  const matched = all.filter((f) => header.columns[f] !== undefined);
  const nameCol = header.columns.name ?? header.columns.lastName!;
  const rows = values.slice(header.row + 1).filter((r) => str(r[nameCol]) !== '').length;
  return { headerRow: header.row + 1, matched, missing: all.filter((f) => !matched.includes(f) && !optional.has(f)), rows };
}
