import { describe, expect, it } from 'vitest';
import { dateKey, describeSheet, lookUpBenefits, mapColumns, moneyCents, nameKey, percent } from '../src/data/benefitsSheet';
import { demoBenefitsSheet } from '../src/data/demo';

/** Invented patients only. */
const sheet: unknown[][] = [
  ['Benefits verified by front desk'],
  ['Patient Name', 'DOB', 'Insurance', 'Co-Pay', 'Deductible', 'Deductible Remaining', 'Co-Insurance', 'Out of Pocket', 'Out of Pocket Remaining', 'Notes'],
  ['Test, Jane', 29221, 'Aetna', 30, 1500, 400, 0.2, 5000, 3200, 'free text never returned'],
  ['Sample, Sam', '7/4/1975', 'Cigna', '$0.00', '$500.00', '$0.00', '10%', '$3,000.00', '$1,250.00', ''],
  ['Twin, Pat', '1990-05-05', 'BCBS', 25, 'N/A', '', '', '', '', ''],
  ['Twin, Pat', '1990-05-05', 'BCBS', 40, '', '', '', '', '', ''],
];

describe('benefits sheet: columns', () => {
  it('recognises common headings, "remaining" before the plain amount', () => {
    const m = mapColumns(sheet[1]!);
    expect(m).toMatchObject({ name: 0, dob: 1, insurance: 2, copay: 3, deductible: 4, deductibleRemaining: 5, coinsurance: 6, outOfPocket: 7, outOfPocketRemaining: 8 });
  });
  it('first and last name columns work too', () => {
    const s = [['Last Name', 'First Name', 'Date of Birth', 'Copay'], ['Test', 'Jane', '01/01/1980', 15]];
    expect(lookUpBenefits(s, 'Jane Test', '1980-01-01')).toMatchObject({ status: 'found', benefits: { copayCents: 1500 } });
  });
  it('a sheet without a name or date-of-birth column cannot be used', () => {
    expect(lookUpBenefits([['Copay', 'Deductible'], [10, 20]], 'Jane Test', '1980-01-01')).toEqual({ status: 'no-columns' });
  });
});

describe('benefits sheet: lookup', () => {
  it('finds the row by name (any order, any case) and date of birth, and returns only its benefit figures', () => {
    const r = lookUpBenefits(sheet, 'jane TEST', '1980-01-01');
    expect(r).toEqual({
      status: 'found',
      insurance: 'Aetna',
      benefits: { copayCents: 3000, deductibleCents: 150000, deductibleRemainingCents: 40000, coinsurancePct: 20, outOfPocketCents: 500000, outOfPocketRemainingCents: 320000 },
    });
    expect(JSON.stringify(r)).not.toMatch(/Jane|1980|free text/);
  });
  it('reads text amounts and US dates', () => {
    expect(lookUpBenefits(sheet, 'Sam Sample', '1975-07-04')).toMatchObject({ status: 'found', benefits: { copayCents: 0, deductibleRemainingCents: 0, coinsurancePct: 10, outOfPocketRemainingCents: 125000 } });
  });
  it('a wrong date of birth is not a match', () => {
    expect(lookUpBenefits(sheet, 'Jane Test', '1980-01-02')).toEqual({ status: 'not-found' });
  });
  it('two matching rows are reported, not guessed', () => {
    expect(lookUpBenefits(sheet, 'Pat Twin', '1990-05-05')).toEqual({ status: 'ambiguous', count: 2 });
  });
  it('rejects a malformed date of birth', () => {
    expect(lookUpBenefits(sheet, 'Jane Test', '01/01/1980')).toEqual({ status: 'not-found' });
  });
  it('the demo sheet works', () => {
    expect(lookUpBenefits(demoBenefitsSheet, 'Jane Test', '1980-01-01')).toMatchObject({ status: 'found', insurance: 'Aetna' });
  });
});

describe('benefits sheet: values', () => {
  it('money', () => {
    expect([1500, '1500', '$1,500.00', ' 0 ', '', 'N/A', -5].map(moneyCents)).toEqual([150000, 150000, 150000, 0, null, null, null]);
  });
  it('percent: "20%", 20 and Excel\'s 0.2 all mean 20%', () => {
    expect(['20%', 20, 0.2, '(0%)', 1, '150%', 'abc'].map(percent)).toEqual([20, 20, 20, 0, 100, null, null]);
  });
  it('dates', () => {
    expect([29221, '1/1/1980', '1980-01-01', '01/01/80', 'soon'].map(dateKey)).toEqual(['1980-01-01', '1980-01-01', '1980-01-01', '1980-01-01', null]);
  });
  it('names', () => {
    expect(nameKey('Test, Jane')).toBe(nameKey(' jane   test '));
  });
});

describe('benefits sheet: diagnostics', () => {
  it('lists recognised fields and the row count, nothing else', () => {
    const d = describeSheet(sheet);
    expect(d).toEqual({ headerRow: 2, matched: ['dob', 'name', 'insurance', 'deductibleRemaining', 'outOfPocketRemaining', 'copay', 'coinsurance', 'deductible', 'outOfPocket'], missing: [], rows: 4 });
  });
});
