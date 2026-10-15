import { describe, expect, it, vi } from 'vitest';
import { runDiagnostics, settingsReport, tabCounts, type DiagnosticsDeps } from '../src/data/diagnostics';
import type { Sheets } from '../src/data/workbook';
import { feeRange, liveDirectory, unrenumberedDirectory } from './liveFixture';
import { sheets } from './workbookSheets';

const SECRETISH = 'value-that-must-never-appear-1234';
const fullEnv = {
  AZURE_TENANT_ID: SECRETISH,
  AZURE_CLIENT_ID: SECRETISH,
  AZURE_CLIENT_SECRET: SECRETISH,
  AUTH_SECRET: SECRETISH,
  DIRECTORY_DRIVE_ID: SECRETISH,
  DIRECTORY_ITEM_ID: SECRETISH,
  LOG_SITE_ID: SECRETISH,
  LOG_LIST_ID: SECRETISH,
};

const live = liveDirectory();

function deps(over: Partial<DiagnosticsDeps> = {}): DiagnosticsDeps {
  return {
    env: fullEnv,
    listWorksheets: vi.fn(async () => Object.keys(live)),
    readSheet: vi.fn(async (name: string) => live[name]!),
    readFeeSchedule: vi.fn(async () => feeRange()),
    readLogList: vi.fn(async () => 200),
    loadData: vi.fn(async () => ({ loadedAt: Date.UTC(2026, 9, 5, 7, 0), source: 'sharepoint' })),
    now: new Date('2026-10-05T08:00:00Z'),
    ...over,
  };
}

describe('settingsReport', () => {
  it('reports presence by name only', () => {
    const r = settingsReport({ AZURE_TENANT_ID: 'abc', AZURE_CLIENT_ID: '  ', LOG_SITE_ID: '' });
    expect(r.find((s) => s.name === 'AZURE_TENANT_ID')?.present).toBe(true);
    expect(r.find((s) => s.name === 'AZURE_CLIENT_ID')?.present).toBe(false);
    expect(r.find((s) => s.name === 'LOG_SITE_ID')).toMatchObject({ present: false, required: false });
    expect(JSON.stringify(r)).not.toContain('abc');
  });
});

describe('tabCounts', () => {
  it('counts rows with a first-column value and marks missing tabs', () => {
    const { CashPrices: _drop, ...rest } = sheets;
    const c = tabCounts(rest);
    expect(c.find((t) => t.tab === 'Providers')).toEqual({ tab: 'Providers', present: true, rows: 3 }); // the formula-only row is not counted
    expect(c.find((t) => t.tab === 'ProviderServices')?.rows).toBe(3);
    expect(c.find((t) => t.tab === 'CashPrices')).toEqual({ tab: 'CashPrices', present: false, rows: null });
  });
});

describe('runDiagnostics', () => {
  it('all settings present: workbook parsed, log readable, load time shown, and no value appears anywhere', async () => {
    const d = deps();
    const r = await runDiagnostics(d);
    expect(r.missingRequired).toEqual([]);
    expect(r.workbook.ok && r.workbook.value.missing).toEqual([]);
    expect(r.workbook.ok && r.workbook.value.parsed).toEqual({ ok: true, value: { providers: 3, services: 5, offered: 5, billable: 4, plans: 2 } });
    expect(r.feeSchedule).toMatchObject({ ok: true, value: { headerRow: 1, firstDataRow: 4, missingPayers: ['Unknown'] } });
    expect(r.feeSchedule.ok && r.feeSchedule.value.visits).toBeGreaterThan(0);
    expect(r.log).toEqual({ ok: true, value: { status: 200 } });
    expect(r.loaded).toEqual({ ok: true, value: { loadedAt: '2026-10-05T07:00:00.000Z', source: 'sharepoint' } });
    expect(JSON.stringify(r)).not.toContain(SECRETISH);
  });

  it('the log check is a read: only readLogList is called, never a write', async () => {
    const d = deps();
    await runDiagnostics(d);
    expect(d.readLogList).toHaveBeenCalledTimes(1);
  });

  it('missing settings skip the network checks and are listed by name', async () => {
    const d = deps({ env: { AUTH_SECRET: 'x' } });
    const r = await runDiagnostics(d);
    expect(r.missingRequired).toEqual(['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'DIRECTORY_DRIVE_ID', 'DIRECTORY_ITEM_ID']);
    expect(r.workbook.ok).toBe(false);
    expect(r.log).toMatchObject({ ok: null });
    expect(d.listWorksheets).not.toHaveBeenCalled();
    expect(d.readLogList).not.toHaveBeenCalled();
  });

  it('an older workbook is reported with its missing columns and parse error', async () => {
    const old: Sheets = { ...live, Services: live.Services!.map((r) => r.slice(0, 13)) }; // drops "Allowed tiers"
    const r = await runDiagnostics(deps({ readSheet: async (n) => old[n]! }));
    expect(r.workbook.ok && r.workbook.value.missing).toEqual([{ tab: 'Services', column: 'Allowed tiers' }]);
    expect(r.workbook.ok && r.workbook.value.parsed.ok).toBe(false);
  });

  it('a missing tab is not read and shows as missing', async () => {
    const d = deps({ listWorksheets: async () => Object.keys(live).filter((n) => n !== 'FeeRates') });
    const r = await runDiagnostics(d);
    expect(d.readSheet).not.toHaveBeenCalledWith('FeeRates');
    expect(r.workbook.ok && r.workbook.value.tabs.find((t) => t.tab === 'FeeRates')?.present).toBe(false);
  });

  it('Graph failures and an unreadable log list are reported, not thrown', async () => {
    const r = await runDiagnostics(deps({ listWorksheets: async () => { throw new Error('The directory workbook was not found.'); }, readLogList: async () => 403, loadData: async () => { throw new Error('load failed'); } }));
    expect(r.workbook).toEqual({ ok: false, error: 'The directory workbook was not found.' });
    expect(r.log).toEqual({ ok: false, error: 'The log list could not be read (HTTP 403).' });
    expect(r.loaded).toEqual({ ok: false, error: 'load failed' });
  });

  it('logging off is reported as off, not as a failure', async () => {
    const { LOG_SITE_ID: _a, LOG_LIST_ID: _b, ...env } = fullEnv;
    const r = await runDiagnostics(deps({ env }));
    expect(r.log.ok).toBeNull();
  });

  it('a Fee Schedule the app cannot read is reported, and the workbook is not priced without it', async () => {
    const r = await runDiagnostics(deps({ readFeeSchedule: async () => { throw new Error('The app cannot read the Fee Schedule: it needs read access to the Billing Department site.'); } }));
    expect(r.feeSchedule).toEqual({ ok: false, error: 'The app cannot read the Fee Schedule: it needs read access to the Billing Department site.' });
    expect(r.workbook.ok && r.workbook.value.parsed).toMatchObject({ ok: false, error: expect.stringContaining('Billing Department') });
  });

  it('a workbook on the old numbering parses, and the automatic correction is reported', async () => {
    const old = unrenumberedDirectory();
    const r = await runDiagnostics(deps({ readSheet: async (n) => old[n]! }));
    expect(r.workbook.ok && r.workbook.value.parsed.ok).toBe(true);
    expect(r.feeSchedule).toMatchObject({ ok: true, value: { rowShift: -3 } });
  });

  it('the benefits sheet is only reported as set up or not: the server never reads it (no BAA with the host)', async () => {
    expect((await runDiagnostics(deps())).benefits).toEqual({ configured: false });
    const r = await runDiagnostics(deps({ env: { ...fullEnv, BENEFITS_ITEM_ID: SECRETISH } }));
    expect(r.benefits).toEqual({ configured: true });
    expect(JSON.stringify(r)).not.toContain(SECRETISH);
  });
});
