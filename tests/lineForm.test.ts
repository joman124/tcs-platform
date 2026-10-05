import { describe, expect, it } from 'vitest';
import { formFromLine, type NewLine } from '../components/lineForm';
import { demoData, demoScenario } from '../src/data/demo';
import type { Frequency, Payment } from '../src/engine';
import { data } from './fixtures';

const line = (serviceName: string, providerId: string, payment: Payment, frequency: Frequency, serviceId = 'S2'): NewLine => ({
  serviceName,
  input: { serviceId, providerId, payment, frequency },
});
const cash: Payment = { type: 'cash' };
const ins = (subPlan: string): Payment => ({ type: 'insurance', subPlan });

describe('formFromLine: prefill', () => {
  it('weekly cash line keeps every choice and the per-week inputs', () => {
    const r = formFromLine(line('Individual Counseling', 'P3', cash, { kind: 'weekly', perWeek: 2, weeks: 6 }, 'S1'), data);
    expect(r.form).toEqual({ serviceName: 'Individual Counseling', providerId: 'P3', payType: 'cash', subPlan: '', mode: 'week', a: '2', b: '6' });
    expect(r.stale).toEqual({});
  });

  it('fractional sessions per week survive as typed', () => {
    const r = formFromLine(line('Individual Counseling', 'P3', cash, { kind: 'weekly', perWeek: 0.5, weeks: 10 }, 'S1'), data);
    expect([r.form.a, r.form.b]).toEqual(['0.5', '10']);
  });

  it('total-sessions insurance line keeps the plan and the span', () => {
    const r = formFromLine(line('Individual Counseling', 'P1', ins('Aetna Commercial'), { kind: 'total', sessions: 10, spanWeeks: 8 }), data);
    expect(r.form).toEqual({ serviceName: 'Individual Counseling', providerId: 'P1', payType: 'insurance', subPlan: 'Aetna Commercial', mode: 'total', a: '10', b: '8' });
    expect(r.stale).toEqual({});
  });

  it('total sessions with no span leaves the span input empty', () => {
    const r = formFromLine(line('ADHD Evaluation', 'P1', cash, { kind: 'total', sessions: 1 }, 'S3'), data);
    expect(r.form.mode).toBe('total');
    expect([r.form.a, r.form.b]).toEqual(['1', '']);
  });

  it('a blocked but still offered choice (out-of-network plan) is kept so the admin can fix it in the dialog', () => {
    const r = formFromLine(line('Individual Counseling', 'P1', ins('Aetna Focus HMO'), { kind: 'weekly', perWeek: 1, weeks: 4 }), data);
    expect(r.form.subPlan).toBe('Aetna Focus HMO');
    expect(r.stale).toEqual({});
  });
});

describe('formFromLine: choices that are no longer valid', () => {
  const weekly: Frequency = { kind: 'weekly', perWeek: 1, weeks: 12 };

  it('a service no longer offered leaves everything empty except frequency', () => {
    const r = formFromLine(line('TMS Session', 'P1', cash, weekly, 'S5'), data);
    expect(r.form).toMatchObject({ serviceName: '', providerId: '', payType: '', subPlan: '', mode: 'week', a: '1', b: '12' });
    expect(r.stale.service).toContain('TMS Session');
    expect(Object.keys(r.stale)).toEqual(['service']);
  });

  it('a provider who is no longer available is not substituted, and payment and plan wait for a new provider', () => {
    const r = formFromLine(line('Individual Counseling', 'P6', ins('Aetna Commercial'), weekly), data);
    expect(r.form).toMatchObject({ serviceName: 'Individual Counseling', providerId: '', payType: '', subPlan: '' });
    expect(r.stale.provider).toContain('Gone Away');
    expect(Object.keys(r.stale)).toEqual(['provider']);
  });

  it('a provider missing from the data entirely gets a generic note', () => {
    const r = formFromLine(line('Individual Counseling', 'P404', cash, weekly), data);
    expect(r.form.providerId).toBe('');
    expect(r.stale.provider).toMatch(/^The saved provider/);
  });

  it('a plan the provider no longer has keeps insurance chosen but empties the plan', () => {
    const r = formFromLine(line('Individual Counseling', 'P2', ins('Cigna Local'), weekly, 'S1'), data);
    expect(r.form).toMatchObject({ providerId: 'P2', payType: 'insurance', subPlan: '' });
    expect(r.stale.plan).toContain('Cigna Local');
  });

  it('cash on a provider who no longer takes cash empties the payment type', () => {
    const r = formFromLine(line('Individual Counseling', 'P4', cash, weekly, 'S1'), data);
    expect(r.form).toMatchObject({ providerId: 'P4', payType: '', subPlan: '' });
    expect(r.stale.payment).toContain('cash');
  });

  it('insurance on a provider with no plans empties the payment type', () => {
    const r = formFromLine(line('Individual Counseling', 'P3', ins('Aetna Commercial'), weekly, 'S1'), data);
    expect(r.form).toMatchObject({ providerId: 'P3', payType: '', subPlan: '' });
    expect(r.stale.payment).toContain('insurance');
  });
});

describe('demo "after refresh" scenario', () => {
  it('is only used when asked for', () => {
    expect(demoScenario(undefined)).toBe(demoData);
    expect(demoScenario('anything-else')).toBe(demoData);
  });

  it('makes a provider inactive and drops a credentialing row, leaving the base demo data untouched', () => {
    const after = demoScenario('after-refresh');
    expect(after.providers.find((p) => p.id === 'D06')?.status).toBe('Inactive');
    expect(after.credentialing.some((c) => c.providerId === 'D02' && c.payer === 'Aetna')).toBe(false);
    expect(demoData.providers.find((p) => p.id === 'D06')?.status).toBe('Active');
    expect(demoData.credentialing.some((c) => c.providerId === 'D02' && c.payer === 'Aetna')).toBe(true);
  });

  it('turns saved lines stale in the edit form', () => {
    const after = demoScenario('after-refresh');
    const casey = formFromLine(line('Individual Counseling', 'D02', ins('Aetna Commercial Plans'), { kind: 'weekly', perWeek: 1, weeks: 4 }, 'S-IND-M'), after);
    expect(casey.form).toMatchObject({ payType: 'insurance', subPlan: '' });
    expect(casey.stale.plan).toBeDefined();
    const sam = formFromLine(line('Couples Counseling', 'D06', cash, { kind: 'weekly', perWeek: 1, weeks: 8 }, 'S-CPL'), after);
    expect(sam.form.providerId).toBe('');
    expect(sam.stale.provider).toContain('Sam Second');
  });
});
