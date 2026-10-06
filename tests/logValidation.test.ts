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
  describe('custom lines', () => {
    const custom = { ...row, serviceId: 'CUSTOM', providerId: '', paymentType: 'custom', payer: '' };
    it('accepts service CUSTOM with no provider or with a known one, and no payer', () => {
      expect(validateLogPayload({ rows: [custom] }, known).ok).toBe(true);
      expect(validateLogPayload({ rows: [{ ...custom, providerId: 'P001' }] }, known).ok).toBe(true);
    });
    it('rejects an unknown provider, a payer, or any other service id on a custom row', () => {
      expect(validateLogPayload({ rows: [{ ...custom, providerId: 'P999' }] }, known).ok).toBe(false);
      expect(validateLogPayload({ rows: [{ ...custom, payer: 'Aetna' }] }, known).ok).toBe(false);
      expect(validateLogPayload({ rows: [{ ...custom, serviceId: 'S02' }] }, known).ok).toBe(false);
    });
    it('rejects the description smuggled in as the service id', () => {
      expect(validateLogPayload({ rows: [{ ...custom, serviceId: 'Lab work' }] }, known).ok).toBe(false);
      expect(validateLogPayload({ rows: [{ ...custom, serviceId: 'Lab-work' }] }, known).ok).toBe(false);
    });
    it('cash and insurance rows cannot use service CUSTOM or leave the provider empty', () => {
      expect(validateLogPayload({ rows: [{ ...row, serviceId: 'CUSTOM' }] }, known).ok).toBe(false);
      expect(validateLogPayload({ rows: [{ ...row, paymentType: 'cash', payer: '', serviceId: 'CUSTOM' }] }, known).ok).toBe(false);
      expect(validateLogPayload({ rows: [{ ...row, providerId: '' }] }, known).ok).toBe(false);
    });
  });
});
