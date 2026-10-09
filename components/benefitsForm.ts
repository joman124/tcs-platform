import { priceToCents } from './lineForm';
import { EMPTY_BENEFITS, type Benefits } from '@/src/engine';

export type BenefitsKey = 'copay' | 'deductible' | 'deductibleRemaining' | 'coinsurance' | 'outOfPocket' | 'outOfPocketRemaining';

/** The benefit fields as typed (or as filled in by the lookup). Held in browser memory only. */
export type BenefitsForm = Record<BenefitsKey, string>;

export const EMPTY_BENEFITS_FORM: BenefitsForm = { copay: '', deductible: '', deductibleRemaining: '', coinsurance: '', outOfPocket: '', outOfPocketRemaining: '' };

export const BENEFIT_FIELDS: readonly { key: BenefitsKey; id: string; label: string; percent?: true }[] = [
  { key: 'copay', id: 'b-copay', label: 'Co-pay per visit ($)' },
  { key: 'coinsurance', id: 'b-coinsurance', label: 'Co-insurance (%)', percent: true },
  { key: 'deductible', id: 'b-deductible', label: 'Deductible ($)' },
  { key: 'deductibleRemaining', id: 'b-deductible-remaining', label: 'Deductible remaining ($)' },
  { key: 'outOfPocket', id: 'b-oop', label: 'Out of pocket max ($)' },
  { key: 'outOfPocketRemaining', id: 'b-oop-remaining', label: 'Out of pocket remaining ($)' },
];

const CENTS_FIELD: Record<Exclude<BenefitsKey, 'coinsurance'>, keyof Benefits> = {
  copay: 'copayCents',
  deductible: 'deductibleCents',
  deductibleRemaining: 'deductibleRemainingCents',
  outOfPocket: 'outOfPocketCents',
  outOfPocketRemaining: 'outOfPocketRemainingCents',
};

/** Percent as typed: "20", "20%", "12.5". null unless 0 to 100. */
export function percentInput(text: string): number | null {
  const m = /^(\d{1,3}(\.\d{1,2})?)\s*%?$/.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n <= 100 ? n : null;
}

/** Blank fields are unknown (null); anything that is not an amount is an error, shown next to the field. */
export function parseBenefits(f: BenefitsForm): { benefits: Benefits; errors: Partial<Record<BenefitsKey, string>> } {
  const benefits: Benefits = { ...EMPTY_BENEFITS };
  const errors: Partial<Record<BenefitsKey, string>> = {};
  for (const { key, percent } of BENEFIT_FIELDS) {
    const raw = f[key].trim();
    if (raw === '') continue;
    if (percent) {
      const p = percentInput(raw);
      if (p === null) errors[key] = 'Enter a percentage from 0 to 100.';
      else benefits.coinsurancePct = p;
    } else {
      const cents = priceToCents(raw);
      if (cents === null) errors[key] = 'Enter an amount such as 30 or 1,500.00.';
      else (benefits[CENTS_FIELD[key as Exclude<BenefitsKey, 'coinsurance'>]] as number | null) = cents;
    }
  }
  return { benefits, errors };
}

/** The lookup's figures, as the fields show them. */
export function benefitsToForm(b: Benefits): BenefitsForm {
  const d = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));
  return {
    copay: d(b.copayCents),
    deductible: d(b.deductibleCents),
    deductibleRemaining: d(b.deductibleRemainingCents),
    coinsurance: b.coinsurancePct === null ? '' : String(b.coinsurancePct),
    outOfPocket: d(b.outOfPocketCents),
    outOfPocketRemaining: d(b.outOfPocketRemainingCents),
  };
}
