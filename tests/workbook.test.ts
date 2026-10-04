import { describe, expect, it } from 'vitest';
import { parseWorkbook, type Sheets } from '../src/data/workbook';
import { priceLine } from '../src/engine';

/** Synthetic workbook shaped like the real directory tabs. */
const sheets: Sheets = {
  Providers: [
    ['Provider ID', 'Name', 'Credential', 'Credential tier', 'NPI', 'Status', 'Accepts', 'Cash rate override ($, blank = Fee Schedule price)', 'Monthly patient minimum (KPI)', 'Can bill Medicare directly', 'Notes', 'Bills under (Provider ID)', 'Excluded payers (comma-separated Fee Schedule payers)'],
    ['P1', 'Doc, Dana', 'PsyD', '=formula', '', 'Active', 'Both', null, null, '', '', null, null],
    ['P2', 'Resident, Dr.', 'Postdoc', '', '', 'Active', 'Both', null, null, '', '', 'P1', 'Medicare, UHC/Optum/UMR'],
    ['P3', 'New, Nat', null, '', '', 'Active', 'Cash', null, null, '', '', null, null],
    [null, null, null, '=IF(...)', null, null, null, null, null, null, null, null, null],
  ],
  Services: [
    ['Service ID', 'Fee Schedule name', 'Patient-facing name', 'Component CPTs', 'Duration', 'Active in estimator (Y/N)', 'Cash price row (Fee Schedule)', 'Cash price (from Fee Schedule)', 'Cash price status', 'Display mode', 'Notes', 'Per-session service (provider cash override applies) Y/N', 'Cash price override (this workbook only; Fee Schedule is read-only)', 'Allowed tiers (T1 = x; blank = any)'],
    ['S1', 'Ind', 'Individual Counseling', '90837', '1 hr', 'Y', 10, '=f', '=f', 'One line', '', 'Y', null, 'T1'],
    ['S2', 'Couples', 'Couples Counseling', '90847', '1 hr', 'Y', 11, '=f', '=f', 'One line', '', 'Y', 225, null],
    ['S3', 'Eval', 'ADHD Evaluation', '90791', '', 'Y', 12, '=f', '=f', 'One line', '', 'N', null, null],
  ],
  ServiceComponents: [
    ['Service ID', 'Visit row (Fee Schedule parent row)', 'Quantity', 'Include optional add-ons (Y/N)', 'Visit label', 'Component CPTs'],
    ['S1', 20, 1, 'N', 'Ind', ''],
    ['S3', 30, 1, 'N', 'Interview', ''],
    ['S3', 31, 2, 'N', 'Follow up', ''],
  ],
  ProviderServices: [
    ['Provider ID', 'Service ID', 'Provider name (auto)', 'Service (auto)', 'Cash price override ($; blank = service cash price)'],
    ['P1', 'S1', '=f', '=f', null],
    ['P2', 'S1', '=f', '=f', 195],
    ['P1', 'S3', '=f', '=f', null],
    [null, null, '=f', '=f', null],
  ],
  Credentialing: [
    ['Provider ID', 'Provider (auto)', 'Payer (dashboard column)', 'Status (normalized)', 'Effective date', 'Raw text', 'Fee Schedule payer'],
    ['P1', '=f', 'Aetna', 'Pending', null, 'Submitted', 'Aetna'],
    ['P1', '=f', 'Aetna (other)', 'Credentialed', null, 'In network', 'Aetna'],
    ['P1', '=f', 'Cigna', 'Needs review', null, 'x', 'Cigna'],
    ['P1', '=f', 'Lucit', 'Credentialed', null, 'x', ''],
  ],
  PayerMap: [
    ['Sub-plan', 'Parent payer (Fee Schedule)', 'Network', 'Notes'],
    ['Aetna Commercial', 'Aetna', 'In', ''],
    ['Medicare Part B', 'Medicare', 'In', ''],
  ],
  PayerKey: [
    ['Fee Schedule payer', 'Rate header date', 'Stale (>12 months)', 'Quarantined', 'Quarantine reason'],
    ['Aetna', '2026-06-02', '=f', 'N', ''],
    ['Cigna', '2025-01-01', '=f', 'N', ''],
    ['Medicare', 46000, '=f', 'Y', 'hold'],
    ['Unknown', null, '=f', 'N', ''],
  ],
  FeeRates: [
    ['Visit row', 'Visit label', 'Component CPT', 'Is add-on', 'Optional add-on', 'Payer', 'Credential tier', 'Rate', 'Status', 'Raw cell text', 'Source cell'],
    [20, 'Ind', '90837', 'N', 'N', 'Aetna', 'PhD/PsyD/MD/DO', 137.75, 'ok', '$137.75', 'N25'],
    [20, 'Ind', '90837', 'N', 'N', 'Aetna', 'LPC/LCSW/NP/PA', 103.31, 'ok', '$103.31', 'P25'],
    [30, 'Interview', '90791', 'N', 'N', 'Aetna', 'PhD/PsyD/MD/DO', 148.9, 'ok', '', ''],
    [30, 'Interview', '96130', 'Y', 'N', 'Aetna', 'PhD/PsyD/MD/DO', 111.4, 'ok', '', ''],
    [30, 'Interview', '96136', 'Y', 'Y', 'Aetna', 'PhD/PsyD/MD/DO', 38.46, 'ok', '', ''],
    [31, 'Follow up', '90832', 'N', 'N', 'Aetna', 'PhD/PsyD/MD/DO', 70.47, 'ok', '', ''],
    [31, 'Follow up', '96130', 'Y', 'N', 'Aetna', 'PhD/PsyD/MD/DO', null, 'quarantined', '', ''],
    [20, 'Ind', '90837', 'N', 'N', 'Medicare', 'PhD/PsyD/MD/DO', 140, 'ok', '', ''],
  ],
  CashPrices: [
    ['Fee Schedule row', 'Appointment type', 'Raw cash text (col H)', 'Cash price', 'Status'],
    [10, 'Ind', '$250', 250, 'ok'],
    [11, 'Couples', '$195', 195, 'ok'],
    [12, 'Eval', '$1,800', 1800, 'ok'],
  ],
};

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
