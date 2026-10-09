import { insuranceBillable, serviceNames } from '../engine/rules';
import { describeSheet, type BenefitsField } from './benefitsSheet';
import { payersWithoutColumns, withLiveFeeSchedule, type FeeScheduleRange } from './liveRates';
import { checkWorkbook, missingParts, parseWorkbook, SHEETS, type MissingPart, type Sheet, type SheetName } from './workbook';

/**
 * Readiness checks for the real-data verification (docs/phase5-checklist.md). Reports which settings exist (by name
 * only, never a value), whether the workbook, the Fee Schedule and the log list can be read, and when the data was loaded.
 * Read-only: nothing here writes to SharePoint.
 */

export interface SettingSpec {
  name: string;
  /** Required for the estimator to work; optional ones turn a feature on (the log). */
  required: boolean;
  purpose: string;
}

export const SETTINGS: readonly SettingSpec[] = [
  { name: 'AZURE_TENANT_ID', required: true, purpose: 'MHCA tenant (sign-in and Graph)' },
  { name: 'AZURE_CLIENT_ID', required: true, purpose: 'Entra app (sign-in and Graph)' },
  { name: 'AZURE_CLIENT_SECRET', required: true, purpose: 'Entra app secret' },
  { name: 'AUTH_SECRET', required: true, purpose: 'Session signing' },
  { name: 'DIRECTORY_DRIVE_ID', required: true, purpose: 'Directory workbook library' },
  { name: 'DIRECTORY_ITEM_ID', required: true, purpose: 'Directory workbook file' },
  { name: 'LOG_SITE_ID', required: false, purpose: 'Estimate log site (blank = logging off)' },
  { name: 'LOG_LIST_ID', required: false, purpose: 'Estimate log list (blank = logging off)' },
  { name: 'BENEFITS_ITEM_ID', required: false, purpose: 'Patient benefits sheet (blank = benefits typed by hand only)' },
];

export interface SettingStatus {
  name: string;
  required: boolean;
  purpose: string;
  present: boolean;
}

/** Presence only. The value is read to test for emptiness and never returned. */
export function settingsReport(env: Record<string, string | undefined>): SettingStatus[] {
  return SETTINGS.map((s) => ({ name: s.name, required: s.required, purpose: s.purpose, present: Boolean(env[s.name]?.trim()) }));
}

export interface TabCount {
  tab: SheetName;
  present: boolean;
  /** Rows below the header with a value in the first column (the rows the app reads). */
  rows: number | null;
}

/** Row count per required tab. A tab missing from `sheets` is reported as not present. */
export function tabCounts(sheets: Partial<Record<string, Sheet>>): TabCount[] {
  return SHEETS.map((tab) => {
    const sheet = sheets[tab];
    if (!sheet) return { tab, present: false, rows: null };
    const rows = sheet.slice(1).filter((r) => r[0] !== null && r[0] !== undefined && String(r[0]).trim() !== '').length;
    return { tab, present: true, rows };
  });
}

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export interface DiagnosticsReport {
  generatedAt: string;
  settings: SettingStatus[];
  missingRequired: string[];
  workbook: Check<{ tabs: TabCount[]; missing: MissingPart[]; parsed: Check<{ providers: number; services: number; offered: number; billable: number; plans: number }> }>;
  /** The live Fee Schedule: layout found, cell counts, and PayerKey payers with no column on the sheet. */
  feeSchedule: Check<{ headerRow: number; firstDataRow: number; visits: number; usable: number; quarantined: number; ambiguous: number; missingPayers: string[]; rowShift: number }>;
  log: Check<{ status: number }> | { ok: null; reason: string };
  /** The patient benefits sheet: recognised columns and row count only, never a name or value. */
  benefits: Check<{ headerRow: number | null; matched: BenefitsField[]; missing: BenefitsField[]; rows: number }> | { ok: null; reason: string };
  loaded: Check<{ loadedAt: string; source: string }>;
}

export interface DiagnosticsDeps {
  env: Record<string, string | undefined>;
  /** Tab names in the workbook. */
  listWorksheets: () => Promise<string[]>;
  readSheet: (name: string) => Promise<Sheet>;
  /** The Fee Schedule tab's used range (read-only). */
  readFeeSchedule: () => Promise<FeeScheduleRange>;
  /** HTTP status of a read-only GET on the log list. */
  readLogList: () => Promise<number>;
  /** The benefits sheet's used range (read-only); only called when BENEFITS_ITEM_ID is set. */
  readBenefitsSheet?: () => Promise<unknown[][]>;
  loadData: () => Promise<{ loadedAt: number; source: string }>;
  now?: Date;
}

/** Error text without anything that could be a setting value (only our own Graph messages carry text). */
const errorText = (e: unknown): string => (e instanceof Error ? e.message : 'Unknown error');

export async function runDiagnostics(deps: DiagnosticsDeps): Promise<DiagnosticsReport> {
  const settings = settingsReport(deps.env);
  const missingRequired = settings.filter((s) => s.required && !s.present).map((s) => s.name);
  const has = (n: string) => settings.find((s) => s.name === n)?.present ?? false;
  const graphReady = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'].every(has);

  let fee: FeeScheduleRange | null = null;
  let feeSchedule: DiagnosticsReport['feeSchedule'];
  if (!graphReady) feeSchedule = { ok: false, error: 'Not checked: the Entra settings are missing.' };
  else {
    try {
      fee = await deps.readFeeSchedule();
      feeSchedule = { ok: true, value: { headerRow: 0, firstDataRow: 0, visits: 0, usable: 0, quarantined: 0, ambiguous: 0, missingPayers: [], rowShift: 0 } };
    } catch (e) {
      feeSchedule = { ok: false, error: errorText(e) };
    }
  }

  let workbook: DiagnosticsReport['workbook'];
  if (!graphReady || !has('DIRECTORY_DRIVE_ID') || !has('DIRECTORY_ITEM_ID')) {
    workbook = { ok: false, error: 'Not checked: the Entra or directory settings are missing.' };
  } else {
    try {
      const present = new Set(await deps.listWorksheets());
      const sheets: Record<string, Sheet> = {};
      for (const tab of SHEETS) if (present.has(tab)) sheets[tab] = await deps.readSheet(tab);
      let parsed: Check<{ providers: number; services: number; offered: number; billable: number; plans: number }>;
      try {
        // Same steps as the app's loader: the workbook's own tabs first, then live Fee Schedule rates.
        checkWorkbook(sheets);
        if (!fee) throw new Error(feeSchedule.ok ? 'The Fee Schedule was not read.' : feeSchedule.error);
        const live = withLiveFeeSchedule(sheets, fee);
        const r = live.report;
        feeSchedule = { ok: true, value: { headerRow: r.headerRow, firstDataRow: r.firstDataRow, visits: r.visits, usable: r.usable, quarantined: r.quarantined.length, ambiguous: r.ambiguous, missingPayers: payersWithoutColumns(sheets, r), rowShift: live.rowShift } };
        const d = parseWorkbook(live.sheets, deps.now);
        parsed = { ok: true, value: { providers: d.providers.length, services: d.services.length, offered: serviceNames(d).length, billable: d.services.filter((s) => insuranceBillable(s, d)).length, plans: d.planMap.length } };
      } catch (e) {
        parsed = { ok: false, error: errorText(e) };
      }
      workbook = { ok: true, value: { tabs: tabCounts(sheets), missing: missingParts(sheets), parsed } };
    } catch (e) {
      workbook = { ok: false, error: errorText(e) };
    }
  }

  let log: DiagnosticsReport['log'];
  if (!has('LOG_SITE_ID') || !has('LOG_LIST_ID')) log = { ok: null, reason: 'Logging is off (LOG_SITE_ID and LOG_LIST_ID are not both set).' };
  else if (!graphReady) log = { ok: false, error: 'Not checked: the Entra settings are missing.' };
  else {
    try {
      const status = await deps.readLogList();
      log = status >= 200 && status < 300 ? { ok: true, value: { status } } : { ok: false, error: `The log list could not be read (HTTP ${status}).` };
    } catch (e) {
      log = { ok: false, error: errorText(e) };
    }
  }

  let benefits: DiagnosticsReport['benefits'];
  if (!has('BENEFITS_ITEM_ID') || !deps.readBenefitsSheet) benefits = { ok: null, reason: 'No benefits sheet (BENEFITS_ITEM_ID is not set): benefits are typed in by hand.' };
  else if (!graphReady) benefits = { ok: false, error: 'Not checked: the Entra settings are missing.' };
  else {
    try {
      const d = describeSheet(await deps.readBenefitsSheet());
      benefits = d.headerRow === null ? { ok: false, error: 'No header row with a patient name and a date of birth column was found in the first 10 rows.' } : { ok: true, value: d };
    } catch (e) {
      benefits = { ok: false, error: errorText(e) };
    }
  }

  let loaded: DiagnosticsReport['loaded'];
  try {
    const l = await deps.loadData();
    loaded = { ok: true, value: { loadedAt: new Date(l.loadedAt).toISOString(), source: l.source } };
  } catch (e) {
    loaded = { ok: false, error: errorText(e) };
  }

  return { generatedAt: (deps.now ?? new Date()).toISOString(), settings, missingRequired, workbook, feeSchedule, log, benefits, loaded };
}
