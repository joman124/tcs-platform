import { describe, expect, it } from 'vitest';
import { bundleRate, type FeeRateCell } from '../src/engine';

const cell = (over: Partial<FeeRateCell>): FeeRateCell => ({
  visitRow: 10, cpt: '90791', isAddOn: false, optional: false, payer: 'Aetna', tier: 'T1', rate: 100, status: 'ok', ...over,
});

describe('bundleRate', () => {
  it('sums parent row plus add-on rows for a visit', () => {
    const cells = [cell({ rate: 148.9 }), cell({ cpt: '96130', isAddOn: true, rate: 111.4 }), cell({ cpt: '96131', isAddOn: true, rate: 78.88 })];
    const r = bundleRate([{ visitRow: 10, quantity: 1, includeOptional: false }], cells, 'Aetna', 'T1');
    expect(r.totalCents).toBe(14890 + 11140 + 7888);
    expect(r.status).toBe('OK');
  });
  it('sums multiple visits and honors quantity (interview + testing + follow-up)', () => {
    const cells = [
      cell({ visitRow: 1, rate: 100 }),
      cell({ visitRow: 2, rate: 50 }),
      cell({ visitRow: 3, rate: 25 }),
    ];
    const r = bundleRate(
      [{ visitRow: 1, quantity: 1, includeOptional: false }, { visitRow: 2, quantity: 2, includeOptional: false }, { visitRow: 3, quantity: 1, includeOptional: false }],
      cells, 'Aetna', 'T1',
    );
    expect(r.totalCents).toBe(10000 + 5000 * 2 + 2500);
  });
  it('excludes optional add-ons unless requested', () => {
    const cells = [cell({ rate: 100 }), cell({ cpt: '96136', isAddOn: true, optional: true, rate: 40 })];
    const comp = (includeOptional: boolean) => [{ visitRow: 10, quantity: 1, includeOptional }];
    expect(bundleRate(comp(false), cells, 'Aetna', 'T1').totalCents).toBe(10000);
    expect(bundleRate(comp(true), cells, 'Aetna', 'T1').totalCents).toBe(14000);
  });
  it('blocks the whole bundle when any component cell is unusable (DNB, quarantined, blank)', () => {
    const cells = [cell({ rate: 100 }), cell({ cpt: '96130', isAddOn: true, rate: null, status: 'text' })];
    const r = bundleRate([{ visitRow: 10, quantity: 1, includeOptional: false }], cells, 'Aetna', 'T1');
    expect(r.status).toBe('No contracted rate - offer cash');
    expect(r.unusable).toBe(1);
    const q = bundleRate([{ visitRow: 10, quantity: 1, includeOptional: false }], [cell({ status: 'quarantined' })], 'Aetna', 'T1');
    expect(q.status).toBe('No contracted rate - offer cash');
  });
  it('keeps tiers and payers separate (PsyD vs LPC differ)', () => {
    const cells = [cell({ tier: 'T1', rate: 137.75 }), cell({ tier: 'T2', rate: 103.31 }), cell({ payer: 'Cigna', tier: 'T1', rate: 1 })];
    const comp = [{ visitRow: 10, quantity: 1, includeOptional: false }];
    expect(bundleRate(comp, cells, 'Aetna', 'T1').totalCents).toBe(13775);
    expect(bundleRate(comp, cells, 'Aetna', 'T2').totalCents).toBe(10331);
  });
  it('marks a quarantined payer', () => {
    const r = bundleRate([{ visitRow: 10, quantity: 1, includeOptional: false }], [cell({})], 'Aetna', 'T1', true);
    expect(r.status).toBe('Payer quarantined');
  });
  it('reports Blank when nothing matches', () => {
    expect(bundleRate([{ visitRow: 99, quantity: 1, includeOptional: false }], [cell({})], 'Aetna', 'T1').status).toBe('Blank');
  });
});
