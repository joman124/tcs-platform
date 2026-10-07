import type { LineInput, LineResult } from './types';
import type { PlanSummary } from './plan';

/**
 * De-identified estimate log. One row per priced line.
 * Deliberately has NO patient name, no free text, no timestamp finer than the day, and no admin identity.
 * Blocked lines are not logged. A custom line is logged as service id CUSTOM with its amounts; its description is never logged.
 */
export interface EstimateLogRow {
  estimateId: string; // random per estimate, not derivable from patient data
  date: string; // YYYY-MM-DD
  serviceId: string;
  providerId: string;
  paymentType: 'cash' | 'insurance' | 'custom';
  payer: string; // parent payer for insurance lines, '' for cash and custom
  perVisitCents: number;
  sessions: number;
  totalCents: number;
  estimateFullPlanCents: number;
}

export function buildLogRows(
  estimateId: string,
  date: string,
  inputs: LineInput[],
  results: LineResult[],
  summary: PlanSummary,
): EstimateLogRow[] {
  const rows: EstimateLogRow[] = [];
  inputs.forEach((input, i) => {
    const r = results[i];
    if (!r || !r.ok || r.perVisitCents === null || r.sessions === null || r.totalCents === null) return;
    rows.push({
      estimateId,
      date,
      serviceId: input.serviceId,
      providerId: input.providerId,
      paymentType: input.payment.type,
      payer: input.payment.type === 'insurance' ? (r.payer ?? '') : '',
      perVisitCents: r.perVisitCents,
      sessions: r.sessions,
      totalCents: r.totalCents,
      estimateFullPlanCents: summary.fullPlanCents,
    });
  });
  return rows;
}
