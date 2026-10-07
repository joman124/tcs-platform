import { describe, expect, it } from 'vitest';
import { formFromLine, priceToCents, type NewLine } from '../components/lineForm';
import { CUSTOM_SERVICE_ID, type Frequency, type Payment } from '../src/engine';
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
    expect(r.form).toEqual({ kind: 'directory', serviceName: 'Individual Counseling', providerId: 'P3', payType: 'cash', subPlan: '', mode: 'week', a: '2', b: '6', description: '', price: '' });
    expect(r.stale).toEqual({});
  });

  it('fractional sessions per week survive as typed', () => {
    const r = formFromLine(line('Individual Counseling', 'P3', cash, { kind: 'weekly', perWeek: 0.5, weeks: 10 }, 'S1'), data);
    expect([r.form.a, r.form.b]).toEqual(['0.5', '10']);
  });

  it('total-sessions insurance line keeps the plan and the span', () => {
    const r = formFromLine(line('Individual Counseling', 'P1', ins('Aetna Commercial'), { kind: 'total', sessions: 10, spanWeeks: 8 }), data);
    expect(r.form).toEqual({ kind: 'directory', serviceName: 'Individual Counseling', providerId: 'P1', payType: 'insurance', subPlan: 'Aetna Commercial', mode: 'total', a: '10', b: '8', description: '', price: '' });
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
    const r = formFromLine(line('Retired Service', 'P1', cash, weekly, 'S404'), data);
    expect(r.form).toMatchObject({ serviceName: '', providerId: '', payType: '', subPlan: '', mode: 'week', a: '1', b: '12' });
    expect(r.stale.service).toContain('Retired Service');
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

describe('formFromLine: custom lines', () => {
  const custom = (cents: number): Payment => ({ type: 'custom', perVisitCents: cents });
  const once: Frequency = { kind: 'total', sessions: 1 };

  it('keeps the description, the price in dollars and no provider', () => {
    const r = formFromLine(line('Lab work (invented)', '', custom(4550), once, CUSTOM_SERVICE_ID), data);
    expect(r.form).toEqual({ kind: 'custom', serviceName: '', providerId: '', payType: '', subPlan: '', mode: 'total', a: '1', b: '', description: 'Lab work (invented)', price: '45.50' });
    expect(r.stale).toEqual({});
  });

  it('keeps an active provider, whatever services they offer', () => {
    const r = formFromLine(line('Home visit (invented)', 'P3', custom(12000), { kind: 'weekly', perWeek: 1, weeks: 4 }, CUSTOM_SERVICE_ID), data);
    expect(r.form).toMatchObject({ kind: 'custom', providerId: 'P3', price: '120.00', mode: 'week', a: '1', b: '4' });
    expect(r.stale).toEqual({});
  });

  it('a provider no longer active is not kept or replaced: the admin chooses again', () => {
    const r = formFromLine(line('Home visit (invented)', 'P6', custom(12000), once, CUSTOM_SERVICE_ID), data);
    expect(r.form).toMatchObject({ kind: 'custom', providerId: '', description: 'Home visit (invented)', price: '120.00' });
    expect(r.stale.provider).toContain('Gone Away');
  });
});

describe('priceToCents', () => {
  it('reads plain dollar amounts to whole cents', () => {
    expect(['45', '45.5', '45.50', '$1,200.00', ' 0.01 ', '0'].map(priceToCents)).toEqual([4500, 4550, 4550, 120000, 1, 0]);
    expect(priceToCents('19.99')).toBe(1999); // no floating-point drift
  });
  it('rejects anything else', () => {
    expect(['', 'abc', '45.555', '-5', '1e3', '45.', '.5', '12 34'].map(priceToCents)).toEqual(Array(8).fill(null));
  });
});
