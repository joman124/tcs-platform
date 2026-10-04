import { describe, expect, it } from 'vitest';
import { validateLogPayload } from '../src/data/logValidation';

const known = { providers: new Set(['P001']), services: new Set(['S02']), payers: new Set(['Aetna']) };
const row = { estimateId: 'abc-123', date: '2026-10-03', serviceId: 'S02', providerId: 'P001', paymentType: 'insurance', payer: 'Aetna', perVisitCents: 10331, sessions: 12, totalCents: 123972, estimateFullPlanCents: 123972 };

describe('log payload validation', () => {
  it('accepts a clean row', () => {
    expect(validateLogPayload({ rows: [row] }, known).ok).toBe(true);
  });
  it('rejects an extra field such as a patient name', () => {
    expect(validateLogPayload({ rows: [{ ...row, patientName: 'Jane Doe' }] }, known).ok).toBe(false);
  });
  it('rejects free text smuggled into allowed fields', () => {
    expect(validateLogPayload({ rows: [{ ...row, payer: 'Jane Doe' }] }, known).ok).toBe(false);
    expect(validateLogPayload({ rows: [{ ...row, providerId: 'Jane-Doe' }] }, known).ok).toBe(false);
    expect(validateLogPayload({ rows: [{ ...row, serviceId: 'S99' }] }, known).ok).toBe(false);
    expect(validateLogPayload({ rows: [{ ...row, estimateId: 'Jane Doe' }] }, known).ok).toBe(false);
  });
  it('rejects bad shapes, dates, amounts and extra top-level fields', () => {
    expect(validateLogPayload({ rows: [{ ...row, date: '10/03/2026' }] }, known).ok).toBe(false);
    expect(validateLogPayload({ rows: [{ ...row, sessions: 1.5 }] }, known).ok).toBe(false);
    expect(validateLogPayload({ rows: [{ ...row, totalCents: -5 }] }, known).ok).toBe(false);
    expect(validateLogPayload({ rows: [], extra: 1 }, known).ok).toBe(false);
    expect(validateLogPayload({ rows: [row], patientName: 'x' }, known).ok).toBe(false);
    expect(validateLogPayload({ rows: [] }, known).ok).toBe(false);
    expect(validateLogPayload(null, known).ok).toBe(false);
  });
  it('cash rows carry no payer', () => {
    expect(validateLogPayload({ rows: [{ ...row, paymentType: 'cash', payer: '' }] }, known).ok).toBe(true);
    expect(validateLogPayload({ rows: [{ ...row, paymentType: 'cash', payer: 'Aetna' }] }, known).ok).toBe(false);
  });
});
