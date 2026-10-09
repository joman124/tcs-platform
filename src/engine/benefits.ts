import type { LineInput, LineResult } from './types';

/**
 * The patient's insurance benefits for the current year, as the admin entered them or as the benefits sheet holds them.
 * Amounts in cents, co-insurance as a percentage (20 = 20%). null = not known. Held in browser memory only; never logged.
 */
export interface Benefits {
  /** Per visit. */
  copayCents: number | null;
  deductibleCents: number | null;
  deductibleRemainingCents: number | null;
  /** 0 to 100. */
  coinsurancePct: number | null;
  outOfPocketCents: number | null;
  outOfPocketRemainingCents: number | null;
}

export const EMPTY_BENEFITS: Benefits = {
  copayCents: null,
  deductibleCents: null,
  deductibleRemainingCents: null,
  coinsurancePct: null,
  outOfPocketCents: null,
  outOfPocketRemainingCents: null,
};

export const hasBenefits = (b: Benefits): boolean => Object.values(b).some((v) => v !== null);

export interface Responsibility {
  /** Every priced line: insurance lines at the contracted rate, cash and custom lines at their price. */
  allowableCents: number;
  /** The insurance lines only. */
  insuranceAllowableCents: number;
  /** Cash and custom lines: the patient pays these in full. */
  selfPayCents: number;
  /** The patient's share of the insurance lines; null when there are insurance lines but no benefits entered. */
  insurancePatientCents: number | null;
  /** selfPayCents + insurancePatientCents; null when the insurance share is unknown. */
  patientCents: number | null;
  /** Parent payers of the priced insurance lines, in line order. */
  payers: string[];
}

/**
 * Estimated patient responsibility over the whole plan. Each insurance visit, in line order:
 * the remaining deductible is paid first, then the co-pay, then co-insurance on the rest
 * ((allowed - deductible - co-pay) x co-insurance %); the visit's total counts toward the out-of-pocket remaining,
 * and nothing more is owed once that reaches zero. Missing values: deductible remaining falls back to the deductible,
 * then $0; co-pay and co-insurance to $0 and 0%; no out-of-pocket figure means no cap. Blocked lines are left out.
 */
export function patientResponsibility(inputs: LineInput[], results: LineResult[], b: Benefits): Responsibility {
  let insuranceAllowableCents = 0;
  let selfPayCents = 0;
  let insurancePatientCents = 0;
  let insuranceVisits = 0;
  const payers: string[] = [];

  let deductibleLeft = Math.max(0, b.deductibleRemainingCents ?? b.deductibleCents ?? 0);
  let outOfPocketLeft = b.outOfPocketRemainingCents ?? b.outOfPocketCents ?? Number.POSITIVE_INFINITY;
  outOfPocketLeft = Math.max(0, outOfPocketLeft);
  const copay = Math.max(0, b.copayCents ?? 0);
  const pct = Math.min(100, Math.max(0, b.coinsurancePct ?? 0));

  inputs.forEach((input, i) => {
    const r = results[i];
    if (!r || !r.ok || r.perVisitCents === null || r.sessions === null || r.totalCents === null) return;
    if (input.payment.type !== 'insurance') {
      selfPayCents += r.totalCents;
      return;
    }
    insuranceAllowableCents += r.totalCents;
    if (r.payer && !payers.includes(r.payer)) payers.push(r.payer);
    for (let v = 0; v < r.sessions; v++) {
      insuranceVisits += 1;
      const allowed = r.perVisitCents;
      const deductible = Math.min(deductibleLeft, allowed);
      deductibleLeft -= deductible;
      const visitCopay = Math.min(copay, allowed - deductible);
      const coinsurance = Math.round(((allowed - deductible - visitCopay) * pct) / 100);
      const owed = Math.min(deductible + visitCopay + coinsurance, outOfPocketLeft);
      outOfPocketLeft -= owed;
      insurancePatientCents += owed;
    }
  });

  const known = insuranceVisits === 0 || hasBenefits(b);
  return {
    allowableCents: insuranceAllowableCents + selfPayCents,
    insuranceAllowableCents,
    selfPayCents,
    insurancePatientCents: known ? insurancePatientCents : null,
    patientCents: known ? selfPayCents + insurancePatientCents : null,
    payers,
  };
}
