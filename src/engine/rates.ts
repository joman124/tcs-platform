import { toCents } from './money';
import type { RateStatus, Tier } from './types';

/**
 * One rate cell from the normalized Fee Schedule (mirrors the workbook's FeeRates tab).
 * `visitRow` is the Fee Schedule parent row of the visit; a visit = parent CPT + its "+" add-on rows.
 */
export interface FeeRateCell {
  visitRow: number;
  cpt: string;
  isAddOn: boolean;
  optional: boolean;
  payer: string;
  tier: Tier;
  rate: number | null;
  /** 'ok' means a usable number. Everything else (blank, text, error, quarantined) is unusable. */
  status: string;
}

export interface ServiceComponent {
  visitRow: number;
  quantity: number;
  includeOptional: boolean;
}

export interface BundleRate {
  totalCents: number;
  /** Number of component cells without a usable rate. */
  unusable: number;
  status: RateStatus;
}

/**
 * Contracted total for a service: sum over its visits of (parent + add-ons) x quantity,
 * for one payer and tier. Same semantics as the workbook's ContractedRates formulas:
 * optional add-ons count only when `includeOptional` is set, and any unusable cell blocks the bundle.
 */
export function bundleRate(
  components: ServiceComponent[],
  cells: FeeRateCell[],
  payer: string,
  tier: Tier,
  payerQuarantined = false,
): BundleRate {
  let totalCents = 0;
  let unusable = 0;
  for (const c of components) {
    for (const cell of cells) {
      if (cell.visitRow !== c.visitRow || cell.payer !== payer || cell.tier !== tier) continue;
      if (cell.optional && !c.includeOptional) continue;
      if (cell.status === 'ok' && cell.rate !== null) totalCents += toCents(cell.rate) * c.quantity;
      else unusable += 1;
    }
  }
  let status: RateStatus = 'OK';
  if (payerQuarantined) status = 'Payer quarantined';
  else if (unusable > 0) status = 'No contracted rate - offer cash';
  else if (totalCents === 0) status = 'Blank';
  return { totalCents, unusable, status };
}
