import { describe, expect, it } from 'vitest';
import { benefitsToForm, EMPTY_BENEFITS_FORM, parseBenefits, percentInput } from '../components/benefitsForm';

describe('benefit fields', () => {
  it('blank fields are unknown, typed amounts are cents', () => {
    const { benefits, errors } = parseBenefits({ ...EMPTY_BENEFITS_FORM, copay: '30', deductibleRemaining: '$1,200.50', coinsurance: '20%' });
    expect(errors).toEqual({});
    expect(benefits).toEqual({ copayCents: 3000, deductibleCents: null, deductibleRemainingCents: 120050, coinsurancePct: 20, outOfPocketCents: null, outOfPocketRemainingCents: null });
  });
  it('anything that is not an amount is an error on that field', () => {
    const { errors } = parseBenefits({ ...EMPTY_BENEFITS_FORM, copay: 'thirty', coinsurance: '120' });
    expect(Object.keys(errors).sort()).toEqual(['coinsurance', 'copay']);
  });
  it('percent input', () => {
    expect(['20', '20%', '12.5', '0', '100', '101', '-5', 'x'].map(percentInput)).toEqual([20, 20, 12.5, 0, 100, null, null, null]);
  });
  it('round-trips the lookup figures', () => {
    const b = { copayCents: 3000, deductibleCents: 150000, deductibleRemainingCents: null, coinsurancePct: 20, outOfPocketCents: 0, outOfPocketRemainingCents: 320000 };
    expect(parseBenefits(benefitsToForm(b)).benefits).toEqual(b);
  });
});
