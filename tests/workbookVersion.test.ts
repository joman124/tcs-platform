import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWorkbook, missingParts, parseWorkbook, WorkbookVersionError, type Sheets } from '../src/data/workbook';
import { sheets } from './workbookSheets';

/** Copy of the synthetic workbook with one column removed from a tab (header and every row). */
function dropColumn(tab: string, startsWith: string): Sheets {
  const sheet = sheets[tab]!;
  const i = sheet[0]!.findIndex((h) => String(h).startsWith(startsWith));
  if (i < 0) throw new Error(`fixture has no ${startsWith} column in ${tab}`);
  return { ...sheets, [tab]: sheet.map((r) => r.filter((_, j) => j !== i)) };
}

describe('workbook version check', () => {
  it('a current workbook passes', () => {
    expect(missingParts(sheets)).toEqual([]);
    expect(() => checkWorkbook(sheets)).not.toThrow();
  });

  it('an older build without Services "Allowed tiers" fails with an admin-friendly message instead of mispricing', () => {
    const old = dropColumn('Services', 'Allowed tiers');
    expect(missingParts(old)).toEqual([{ tab: 'Services', column: 'Allowed tiers' }]);
    expect(() => parseWorkbook(old)).toThrow(WorkbookVersionError);
    expect(() => parseWorkbook(old)).toThrow(/^This directory workbook is an older build: the Services tab has no 'Allowed tiers' column\./);
  });

  it('names a missing tab', () => {
    const { PayerKey: _drop, ...rest } = sheets;
    expect(missingParts(rest)).toEqual([{ tab: 'PayerKey' }]);
    expect(() => checkWorkbook(rest)).toThrow(/it has no 'PayerKey' tab/);
  });

  it('treats a tab with no header row as missing', () => {
    expect(missingParts({ ...sheets, FeeRates: [] })).toEqual([{ tab: 'FeeRates' }]);
    expect(missingParts({ ...sheets, FeeRates: [[null, '', '  ']] })).toEqual([{ tab: 'FeeRates' }]);
  });

  it('lists every missing part in one message', () => {
    const old = { ...dropColumn('Providers', 'Bills under'), ProviderServices: dropColumn('ProviderServices', 'Cash price override').ProviderServices! };
    const err = (() => {
      try {
        checkWorkbook(old);
      } catch (e) {
        return e as WorkbookVersionError;
      }
      throw new Error('expected a throw');
    })();
    expect(err.missing).toEqual([
      { tab: 'Providers', column: 'Bills under' },
      { tab: 'ProviderServices', column: 'Cash price override' },
    ]);
    expect(err.message).toContain("the Providers tab has no 'Bills under' column; the ProviderServices tab has no 'Cash price override' column");
  });

  it('accepts long headers for prefix columns but needs exact text for the others', () => {
    // "Allowed tiers (T1 = x; blank = any)" in the fixture satisfies the "Allowed tiers" prefix.
    expect(missingParts(sheets).some((m) => m.column === 'Allowed tiers')).toBe(false);
    // "Credential tier" must not stand in for the "Credential" column.
    expect(missingParts(dropColumn('Providers', 'Credential'))).toEqual([{ tab: 'Providers', column: 'Credential' }]);
  });

  it('ignores extra columns and tabs', () => {
    const extra: Sheets = { ...sheets, Notes: [['Anything']], CashPrices: sheets.CashPrices!.map((r, i) => [...r, i === 0 ? 'New column' : 1]) };
    expect(missingParts(extra)).toEqual([]);
  });
});

describe('reading the workbook through Graph (mocked)', () => {
  const env = { AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's', DIRECTORY_DRIVE_ID: 'drive', DIRECTORY_ITEM_ID: 'item' };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** Fake Graph that serves the synthetic workbook, minus any tabs listed in `without`. */
  function fakeGraph(without: string[] = [], listStatus = 200) {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/oauth2/')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      if (url.endsWith('/worksheets?$select=name')) {
        if (listStatus !== 200) return new Response('{}', { status: listStatus });
        return new Response(JSON.stringify({ value: Object.keys(sheets).filter((n) => !without.includes(n)).map((name) => ({ name })) }));
      }
      const m = /worksheets\('([^']+)'\)/.exec(url);
      const name = m ? decodeURIComponent(m[1]!) : '';
      if (!sheets[name] || without.includes(name)) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ values: sheets[name] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    return calls;
  }

  it('reads only tabs that exist, so a missing tab is named by the version check', async () => {
    const calls = fakeGraph(['CashPrices']);
    const { readDirectoryWorkbook } = await import('../src/data/graph');
    const read = await readDirectoryWorkbook();
    expect(Object.keys(read)).not.toContain('CashPrices');
    expect(calls.some((u) => u.includes("worksheets('CashPrices')"))).toBe(false);
    expect(() => parseWorkbook(read)).toThrow(/it has no 'CashPrices' tab/);
  });

  it('a current workbook read through Graph parses', async () => {
    fakeGraph();
    const { readDirectoryWorkbook } = await import('../src/data/graph');
    expect(parseWorkbook(await readDirectoryWorkbook(), new Date('2026-10-03')).providers).toHaveLength(3);
  });

  it('a workbook that is not found or not shared gets its own message', async () => {
    fakeGraph([], 404);
    const { readDirectoryWorkbook } = await import('../src/data/graph');
    await expect(readDirectoryWorkbook()).rejects.toThrow(/directory workbook was not found/);
  });
});
