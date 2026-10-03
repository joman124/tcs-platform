import { describe, expect, it } from 'vitest';
import { buildLogRows, priceLine, summarize, type LineInput } from '../src/engine';
import { data } from './fixtures';

describe('de-identified log rows', () => {
  const inputs: LineInput[] = [
    { serviceId: 'S2', providerId: 'P1', payment: { type: 'insurance', subPlan: 'Aetna Commercial' }, frequency: { kind: 'weekly', perWeek: 1, weeks: 4 } },
    { serviceId: 'S4', providerId: 'P1', payment: { type: 'cash' }, frequency: { kind: 'total', sessions: 1 } }, // blocked ($0)
    { serviceId: 'S3', providerId: 'P5', payment: { type: 'cash' }, frequency: { kind: 'total', sessions: 1 } },
  ];
  const results = inputs.map((i) => priceLine(i, data));
  const summary = summarize(results);
  const rows = buildLogRows('est-123', '2026-10-03', inputs, results, summary);

  it('logs priced lines only', () => {
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.serviceId)).toEqual(['S2', 'S3']);
  });
  it('records payer for insurance and blank for cash', () => {
    expect(rows[0]).toMatchObject({ paymentType: 'insurance', payer: 'Aetna', perVisitCents: 13775, sessions: 4, totalCents: 55100 });
    expect(rows[1]).toMatchObject({ paymentType: 'cash', payer: '' });
  });
  it('contains no patient identifiers: only the whitelisted fields', () => {
    const allowed = ['estimateId', 'date', 'serviceId', 'providerId', 'paymentType', 'payer', 'perVisitCents', 'sessions', 'totalCents', 'estimateFullPlanCents'];
    for (const r of rows) expect(Object.keys(r).sort()).toEqual([...allowed].sort());
    expect(JSON.stringify(rows)).not.toMatch(/Sample Patient|name/i);
    expect(rows[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
