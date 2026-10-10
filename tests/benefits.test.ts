import { describe, expect, it } from 'vitest';
import { EMPTY_BENEFITS, patientResponsibility, type Benefits, type LineInput, type LineResult } from '../src/engine';

const ok = (perVisitCents: number, sessions: number, payer?: string): LineResult => ({
  ok: true, issues: [], perVisitCents, sessions, totalCents: perVisitCents * sessions, spanWeeks: null, recurring: sessions > 1, cashFallbackAvailable: false, ...(payer ? { payer } : {}),
});
const ins: LineInput = { serviceId: 'S1', providerId: 'P1', payment: { type: 'insurance', subPlan: 'Plan' }, frequency: { kind: 'total', sessions: 1 } };
const cash: LineInput = { ...ins, payment: { type: 'cash' } };
const custom: LineInput = { ...ins, serviceId: 'CUSTOM', payment: { type: 'custom', perVisitCents: 4500 } };
const b = (over: Partial<Benefits>): Benefits => ({ ...EMPTY_BENEFITS, ...over });

describe('patient responsibility', () => {
  it('a single visit inside the deductible: the patient pays the allowed amount (the sample estimate)', () => {
    const r = patientResponsibility([ins], [ok(5342, 1, 'BCBS')], b({ deductibleCents: 150000, deductibleRemainingCents: 150000, outOfPocketCents: 550000, outOfPocketRemainingCents: 514565, copayCents: 0, coinsurancePct: 0 }));
    expect([r.allowableCents, r.patientCents, r.payers]).toEqual([5342, 5342, ['BCBS']]);
  });

  it('deductible first, then co-pay, then co-insurance on the rest, visit by visit', () => {
    // 3 visits x $100, $150 deductible left, $20 co-pay, 20%: $100 + ($50 + $20 + $6) + ($20 + $16) = $212
    const r = patientResponsibility([ins], [ok(10000, 3)], b({ deductibleRemainingCents: 15000, copayCents: 2000, coinsurancePct: 20 }));
    expect([r.insuranceAllowableCents, r.insurancePatientCents]).toEqual([30000, 21200]);
  });

  it('stops at the out-of-pocket remaining', () => {
    const r = patientResponsibility([ins], [ok(10000, 3)], b({ deductibleRemainingCents: 15000, copayCents: 2000, coinsurancePct: 20, outOfPocketRemainingCents: 15000 }));
    expect(r.insurancePatientCents).toBe(15000);
  });

  it('falls back: deductible remaining to the deductible; a co-pay never exceeds the visit', () => {
    expect(patientResponsibility([ins], [ok(10000, 1)], b({ deductibleCents: 4000 })).insurancePatientCents).toBe(4000);
    expect(patientResponsibility([ins], [ok(1500, 2)], b({ copayCents: 3000 })).insurancePatientCents).toBe(3000);
  });

  it('the deductible and out-of-pocket carry across lines in order', () => {
    const r = patientResponsibility([ins, ins], [ok(10000, 1), ok(10000, 1)], b({ deductibleRemainingCents: 12000 }));
    expect(r.insurancePatientCents).toBe(12000);
  });

  it('cash and custom lines are paid in full and do not use the deductible', () => {
    const r = patientResponsibility([cash, custom, ins], [ok(19500, 2), ok(4500, 1), ok(10000, 1)], b({ deductibleRemainingCents: 5000 }));
    expect([r.selfPayCents, r.insurancePatientCents, r.patientCents, r.allowableCents]).toEqual([43500, 5000, 48500, 53500]);
  });

  it('no benefits entered: the insurance share is unknown, not $0', () => {
    const r = patientResponsibility([cash, ins], [ok(19500, 1), ok(10000, 1)], EMPTY_BENEFITS);
    expect([r.insurancePatientCents, r.patientCents, r.allowableCents]).toEqual([null, null, 29500]);
  });

  it('no insurance lines: the patient pays everything, benefits or not', () => {
    expect(patientResponsibility([cash], [ok(19500, 1)], EMPTY_BENEFITS).patientCents).toBe(19500);
  });

  it('blocked lines are left out', () => {
    const blocked: LineResult = { ...ok(0, 1), ok: false, perVisitCents: null, totalCents: null };
    expect(patientResponsibility([ins, cash], [blocked, ok(100, 1)], EMPTY_BENEFITS)).toMatchObject({ allowableCents: 100, patientCents: 100 });
  });
});
