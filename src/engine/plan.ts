import { divideCents, formatUSD, weeklyToMonthlyCents } from './money';
import type { LineResult } from './types';

export interface PlanSummary {
  lineCount: number;
  blockedCount: number;
  warnCount: number;
  /** Every line priced and at least one line: printing allowed. */
  canPrint: boolean;
  /** Full treatment plan cost: all priced lines. */
  fullPlanCents: number;
  /** Portion of the full plan from single-session lines. */
  oneTimeCents: number;
  /** Portion of the full plan from repeating lines. */
  recurringCents: number;
  /** Weekly cost while the recurring services run: sum of each line's total / its span in weeks. */
  weeklyCents: number;
  /** Weekly cost x 52 / 12. */
  monthlyCents: number;
  /** Longest span among priced lines that have one. */
  planWeeks: number | null;
  /** Recurring lines with no time span (left out of weekly and monthly). */
  recurringWithoutSpan: number;
}

export function summarize(lines: LineResult[]): PlanSummary {
  let fullPlanCents = 0;
  let oneTimeCents = 0;
  let recurringCents = 0;
  let weeklyCents = 0;
  let planWeeks: number | null = null;
  let recurringWithoutSpan = 0;
  let blockedCount = 0;
  let warnCount = 0;

  for (const l of lines) {
    if (l.issues.some((i) => i.severity === 'warn')) warnCount += 1;
    if (!l.ok || l.totalCents === null) {
      blockedCount += 1;
      continue;
    }
    fullPlanCents += l.totalCents;
    if (l.spanWeeks !== null) planWeeks = Math.max(planWeeks ?? 0, l.spanWeeks);
    if (!l.recurring) {
      oneTimeCents += l.totalCents;
      continue;
    }
    recurringCents += l.totalCents;
    if (l.spanWeeks === null) recurringWithoutSpan += 1;
    else weeklyCents += divideCents(l.totalCents, l.spanWeeks);
  }
  return {
    lineCount: lines.length,
    blockedCount,
    warnCount,
    canPrint: lines.length > 0 && blockedCount === 0,
    fullPlanCents,
    oneTimeCents,
    recurringCents,
    weeklyCents,
    monthlyCents: weeklyToMonthlyCents(weeklyCents),
    planWeeks,
    recurringWithoutSpan,
  };
}

export type CostView = 'weekly' | 'monthly' | 'plan';

export interface ViewValue {
  cents: number;
  label: string;
  /** Admin-facing caveat, if any. */
  note?: string;
}

/** The three plan-level views the admin can switch between. */
export function planView(summary: PlanSummary, view: CostView): ViewValue {
  if (view === 'plan') return { cents: summary.fullPlanCents, label: 'Full treatment plan', ...(summary.oneTimeCents > 0 ? { note: `Includes ${formatUSD(summary.oneTimeCents)} of one-time services.` } : {}) };
  const note =
    summary.recurringWithoutSpan > 0
      ? `${summary.recurringWithoutSpan} repeating line(s) have no time span and are not included.`
      : summary.oneTimeCents > 0
        ? 'One-time services are not included.'
        : undefined;
  return view === 'weekly'
    ? { cents: summary.weeklyCents, label: 'Per week', ...(note ? { note } : {}) }
    : { cents: summary.monthlyCents, label: 'Per month', ...(note ? { note } : {}) };
}

/** Same three views for a single line. Single-session lines have no weekly/monthly figure. */
export function lineView(line: LineResult, view: CostView): number | null {
  if (!line.ok || line.totalCents === null) return null;
  if (view === 'plan') return line.totalCents;
  if (!line.recurring || line.spanWeeks === null) return null;
  const weekly = divideCents(line.totalCents, line.spanWeeks);
  return view === 'weekly' ? weekly : weeklyToMonthlyCents(weekly);
}
