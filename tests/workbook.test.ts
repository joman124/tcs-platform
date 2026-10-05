import { describe, expect, it } from 'vitest';
import { parseWorkbook, type Sheets } from '../src/data/workbook';
import { priceLine } from '../src/engine';
import { sheets } from './workbookSheets';

describe('parseWorkbook', () => {
  const data = parseWorkbook(sheets, new Date('2026-10-03'));
  it('reads providers, ignoring formula-only rows and unknown credentials', () => {
    expect(data.providers.map((p) => p.id)).toEqual(['P1', 'P2', 'P3']);
    expect(data.providers[2]!.credential).toBeNull();
    expect(data.providers[1]).toMatchObject({ billsUnder: 'P1', excludedPayers: ['Medicare', 'UHC/Optum/UMR'] });
  });
  it('services: workbook cash override wins, tiers and flags parsed', () => {
    const [s1, s2, s3] = data.services;
    expect(s1).toMatchObject({ cashPrice: 250, cashStatus: 'ok', perSession: true, allowedTiers: ['T1'] });
    expect(s2).toMatchObject({ cashPrice: 225, cashStatus: 'ok' });
    expect(s3).toMatchObject({ cashPrice: 1800, perSession: false });
  });
  it('provider+service cash overrides', () => {
    expect(data.providerServices).toContainEqual({ providerId: 'P2', serviceId: 'S1', cashOverride: 195 });
    expect(data.providerServices).toHaveLength(3);
  });
  it('computes bundle rates from FeeRates and flags unusable cells', () => {
    const r = (s: string, payer: string, tier: 'T1' | 'T2') => data.rates.find((x) => x.serviceId === s && x.payer === payer && x.tier === tier)!;
    expect(r('S1', 'Aetna', 'T1')).toMatchObject({ total: 137.75, status: 'OK' });
    expect(r('S1', 'Aetna', 'T2')).toMatchObject({ total: 103.31, status: 'OK' });
    // S3: interview (148.90 + 111.40, optional 38.46 excluded) + 2 x follow-up (one cell quarantined) => blocked
    expect(r('S3', 'Aetna', 'T1').status).toBe('No contracted rate - offer cash');
    expect(r('S1', 'Medicare', 'T1').status).toBe('Payer quarantined');
  });
  it('credentialing keeps the best status per payer and skips unmapped payers', () => {
    expect(data.credentialing).toContainEqual({ providerId: 'P1', payer: 'Aetna', status: 'Credentialed' });
    expect(data.credentialing.filter((c) => c.payer === 'Aetna')).toHaveLength(1);
    expect(data.credentialing.some((c) => c.payer === '')).toBe(false);
  });
  it('payers: quarantine and staleness (Excel serial dates, blanks)', () => {
    const p = (n: string) => data.payers.find((x) => x.payer === n)!;
    expect(p('Aetna')).toMatchObject({ quarantined: false, stale: false });
    expect(p('Cigna').stale).toBe(true);
    expect(p('Medicare').quarantined).toBe(true);
    expect(p('Unknown').stale).toBe(true);
  });
  it('prices end to end from workbook rows', () => {
    const r = priceLine({ serviceId: 'S1', providerId: 'P1', payment: { type: 'insurance', subPlan: 'Aetna Commercial' }, frequency: { kind: 'weekly', perWeek: 1, weeks: 4 } }, data);
    expect(r.ok).toBe(true);
    expect(r.perVisitCents).toBe(13775);
    const resident = priceLine({ serviceId: 'S1', providerId: 'P2', payment: { type: 'cash' }, frequency: { kind: 'total', sessions: 1 } }, data);
    expect(resident.perVisitCents).toBe(19500);
  });
  it('throws a clear error when a tab is missing', () => {
    const { Providers: _drop, ...rest } = sheets;
    expect(() => parseWorkbook(rest as Sheets)).toThrow(/Providers/);
  });
});
