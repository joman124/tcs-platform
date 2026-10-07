import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveRatesError, payersWithoutColumns, withLiveFeeSchedule } from '../src/data/liveRates';
import { parseWorkbook } from '../src/data/workbook';
import { insuranceBillable, priceLine, providersForService, serviceNames } from '../src/engine';
import { feeRange, liveDirectory, unrenumberedDirectory } from './liveFixture';

const NOW = new Date('2026-10-06');
const load = (sheets = liveDirectory(), fee = feeRange()) => parseWorkbook(withLiveFeeSchedule(sheets, fee).sheets, NOW);
const rate = (d: ReturnType<typeof load>, s: string, payer: string, tier: 'T1' | 'T2') => d.rates.find((r) => r.serviceId === s && r.payer === payer && r.tier === tier)!;
const weekly4 = { kind: 'weekly' as const, perWeek: 1, weeks: 4 };

describe('rates come live from the Fee Schedule', () => {
  it('insurance rates are the sheet values, not the stale FeeRates snapshot', () => {
    const d = load();
    expect(rate(d, 'S1', 'Aetna', 'T1')).toMatchObject({ total: 100, status: 'OK' }); // snapshot says $1
    expect(rate(d, 'S3', 'Aetna', 'T1')).toMatchObject({ total: 320, status: 'OK' }); // 150 + 110 + 60; optional 40 left out
    expect(rate(d, 'S1', 'Cigna', 'T2').status).toBe('No contracted rate - offer cash'); // DNB on the sheet
  });

  it('a change on the sheet changes the price', () => {
    const fee = feeRange();
    fee.values[9]![13] = 111; // N10: Aetna doctoral, Individual Counseling
    expect(rate(load(liveDirectory(), fee), 'S1', 'Aetna', 'T1').total).toBe(111);
  });

  it('cash prices come from column H of the sheet; a workbook override still wins', () => {
    const d = load();
    const cash = (id: string) => d.services.find((s) => s.id === id)!;
    expect(cash('S1')).toMatchObject({ cashPrice: 200, cashStatus: 'ok' }); // snapshot CashPrices says $1
    expect(cash('S3')).toMatchObject({ cashPrice: 300, cashStatus: 'ok' });
    expect(cash('S2')).toMatchObject({ cashPrice: 225, cashStatus: 'ok' }); // sheet has text; override applies
  });

  it('Medicare stays blocked: its cells are ambiguous and the payer is quarantined', () => {
    expect(rate(load(), 'S1', 'Medicare', 'T1').status).toBe('Payer quarantined');
  });

  it('prices a real line end to end', () => {
    const r = priceLine({ serviceId: 'S1', providerId: 'P1', payment: { type: 'insurance', subPlan: 'Aetna Commercial' }, frequency: weekly4 }, load());
    expect([r.ok, r.perVisitCents, r.totalCents]).toEqual([true, 10000, 40000]);
  });
});

describe('every service on the Services tab is offered (DECISIONS #32)', () => {
  it('a service switched off in the workbook but billable to insurance is listed and can be priced', () => {
    const d = load();
    const s4 = d.services.find((s) => s.id === 'S4')!;
    expect(s4.active).toBe(false);
    expect(insuranceBillable(s4, d)).toBe(true);
    expect(serviceNames(d)).toContain('Mislabeled Visit Service');
    expect(providersForService('Mislabeled Visit Service', d).map((p) => p.id)).toEqual(['P1']);
    // Aetna's doctoral cell on that row is quarantined, so Aetna is blocked; the service is still offered for other payers.
    const r = priceLine({ serviceId: 'S4', providerId: 'P1', payment: { type: 'insurance', subPlan: 'Aetna Commercial' }, frequency: weekly4 }, d);
    expect(r.issues.map((i) => i.code)).toContain('rate-unusable');
  });

  it('a service switched off with no insurance rate is listed too: cash prices from the sheet, insurance says why not', () => {
    const d = load();
    const s5 = d.services.find((s) => s.id === 'S5')!;
    expect([s5.active, insuranceBillable(s5, d)]).toEqual([false, false]);
    expect(serviceNames(d)).toContain('Package Service');
    const cash = priceLine({ serviceId: 'S5', providerId: 'P1', payment: { type: 'cash' }, frequency: weekly4 }, d);
    expect([cash.ok, cash.perVisitCents]).toEqual([true, 90000]); // column H of the package row
    const ins = priceLine({ serviceId: 'S5', providerId: 'P1', payment: { type: 'insurance', subPlan: 'Aetna Commercial' }, frequency: weekly4 }, d);
    expect([ins.ok, ins.cashFallbackAvailable]).toEqual([false, true]);
  });

  it('every row on the tab is listed, whatever its "Active in estimator" flag or rates', () => {
    expect(serviceNames(load())).toEqual(['ADHD Evaluation', 'Couples Counseling', 'Individual Counseling', 'Mislabeled Visit Service', 'Package Service']);
  });
});

describe('the two spreadsheets must line up', () => {
  it('refuses a workbook that has not been renumbered, instead of pricing from the wrong rows', () => {
    expect(() => load(unrenumberedDirectory())).toThrow(LiveRatesError);
    expect(() => load(unrenumberedDirectory())).toThrow(/3 higher than the Fee Schedule.*step 3\.2/);
  });

  it('refuses any other row offset', () => {
    const d = liveDirectory();
    d.FeeRates = d.FeeRates!.map((r, i) => (i === 0 ? r : [Number(r[0]) - 2, ...r.slice(1)]));
    expect(() => load(d)).toThrow(/off by -2/);
  });

  it('refuses a service that points at a row that is not a visit, naming the service', () => {
    const d = liveDirectory();
    d.ServiceComponents = [...d.ServiceComponents!, ['S3', 9, 1, 'N', 'blank row', '']];
    expect(() => load(d)).toThrow(/service S3 uses visit row 9/);
  });

  it('refuses a cash price row that is not a visit', () => {
    const d = liveDirectory();
    d.Services = d.Services!.map((r, i) => (i === 1 ? r.map((v, j) => (j === 6 ? 19 : v)) : r));
    expect(() => load(d)).toThrow(/service S1 uses cash price row 19/);
  });

  it('lists PayerKey payers that have no column on the Fee Schedule', () => {
    const sheets = liveDirectory();
    const { report } = withLiveFeeSchedule(sheets, feeRange());
    expect(payersWithoutColumns(sheets, report)).toEqual(['Unknown']);
  });
});

describe('the loader reads both spreadsheets through Graph (mocked)', () => {
  const env = { AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's', AUTH_SECRET: 'a', DIRECTORY_DRIVE_ID: 'dir-drive', DIRECTORY_ITEM_ID: 'dir-item' };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function fakeGraph(feeStatus = 200, directory = liveDirectory()) {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('/oauth2/')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      if (url.includes('/drives/dir-drive/') && url.endsWith('/worksheets?$select=name')) return new Response(JSON.stringify({ value: Object.keys(directory).map((name) => ({ name })) }));
      const tab = decodeURIComponent(/worksheets\('([^']+)'\)/.exec(url)?.[1] ?? '');
      if (url.includes('/drives/dir-drive/')) return new Response(JSON.stringify({ address: `'${tab}'!A1:Z99`, values: directory[tab] }));
      if (tab === 'Fee Schedule') return feeStatus === 200 ? new Response(JSON.stringify(feeRange())) : new Response('{}', { status: feeStatus });
      return new Response('{}', { status: 404 });
    }));
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.stubEnv('DEMO_MODE', '');
    return calls;
  }

  it('prices from the live Fee Schedule (Billing copy by default) and offers every billable service', async () => {
    const calls = fakeGraph();
    const { loadData } = await import('../src/data/load');
    const { data, source } = await loadData(true);
    expect(source).toBe('sharepoint');
    expect(rate(data as ReturnType<typeof load>, 'S1', 'Aetna', 'T1').total).toBe(100);
    expect(serviceNames(data)).toContain('Mislabeled Visit Service');
    expect(calls.some((c) => c.url.includes('/drives/b!5tnb6bLSWU2cr0Fyqdme8sr-r_CXXlJCv_nIcpkR8cYC3SF8On0DTaP4Asyu0SBf/items/016S6WHA37ZNV3LWBGB5CZUHTAZIVPIYLB/'))).toBe(true);
    // Read-only: every Graph call is a GET (only the token request is a POST).
    expect(calls.filter((c) => !c.url.includes('/oauth2/')).every((c) => c.method === 'GET')).toBe(true);
  });

  it('a missing Billing site grant gives a clear message', async () => {
    fakeGraph(403);
    const { loadData } = await import('../src/data/load');
    await expect(loadData(true)).rejects.toThrow(/needs read access to the Billing Department site/);
  });

  it('an unrenumbered workbook stops the load', async () => {
    fakeGraph(200, unrenumberedDirectory());
    const { loadData } = await import('../src/data/load');
    await expect(loadData(true)).rejects.toThrow(/3 higher than the Fee Schedule/);
  });
});
