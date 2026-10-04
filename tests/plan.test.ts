import { describe, expect, it } from 'vitest';
import { lineView, planView, priceLine, summarize, type LineInput } from '../src/engine';
import { data } from './fixtures';

const cash = (providerId: string, serviceId: string, frequency: LineInput['frequency']): LineInput =>
  ({ serviceId, providerId, payment: { type: 'cash' }, frequency });

describe('plan summary and cost views', () => {
  // Weekly counseling $300 x 1/wk x 12 wks; ADHD eval once $1,800; counseling $195 x 8 sessions over 4 weeks (2/wk)
  const lines = [
    priceLine(cash('P5', 'S2', { kind: 'weekly', perWeek: 1, weeks: 12 }), data), // 300 * 12 = 3600
    priceLine(cash('P5', 'S3', { kind: 'total', sessions: 1 }), data), // 1800
    priceLine(cash('P3', 'S1', { kind: 'total', sessions: 8, spanWeeks: 4 }), data), // 195 * 8 = 1560, $390/wk
  ];
  const s = summarize(lines);

  it('full treatment plan cost = sum of every priced line', () => {
    expect(s.fullPlanCents).toBe(360000 + 180000 + 156000);
    expect(s.oneTimeCents).toBe(180000);
    expect(s.recurringCents).toBe(360000 + 156000);
  });
  it('weekly cost = recurring lines divided by their own spans', () => {
    expect(s.weeklyCents).toBe(30000 + 39000);
  });
  it('monthly cost = weekly x 52 / 12', () => {
    expect(s.monthlyCents).toBe(Math.round((69000 * 52) / 12));
  });
  it('plan length is the longest span', () => {
    expect(s.planWeeks).toBe(12);
  });
  it('exposes the three views with labels', () => {
    expect(planView(s, 'plan').cents).toBe(s.fullPlanCents);
    expect(planView(s, 'weekly')).toMatchObject({ cents: 69000, label: 'Per week', note: 'One-time services are not included.' });
    expect(planView(s, 'monthly').label).toBe('Per month');
  });
  it('per-line views: single sessions have no weekly or monthly figure', () => {
    expect(lineView(lines[0]!, 'weekly')).toBe(30000);
    expect(lineView(lines[0]!, 'monthly')).toBe(130000);
    expect(lineView(lines[0]!, 'plan')).toBe(360000);
    expect(lineView(lines[1]!, 'weekly')).toBeNull();
    expect(lineView(lines[1]!, 'plan')).toBe(180000);
  });
  it('can print only when there is at least one line and none are blocked', () => {
    expect(s.canPrint).toBe(true);
    expect(summarize([]).canPrint).toBe(false);
    const withBlocked = summarize([...lines, priceLine(cash('P5', 'S4', { kind: 'total', sessions: 1 }), data)]);
    expect(withBlocked.canPrint).toBe(false);
    expect(withBlocked.blockedCount).toBe(1);
    expect(withBlocked.fullPlanCents).toBe(s.fullPlanCents); // blocked lines are excluded from totals
  });
  it('recurring lines without a span are excluded from weekly/monthly and flagged', () => {
    const noSpan = priceLine(cash('P5', 'S2', { kind: 'total', sessions: 6 }), data);
    const sum = summarize([noSpan]);
    expect(sum.fullPlanCents).toBe(180000);
    expect(sum.weeklyCents).toBe(0);
    expect(sum.recurringWithoutSpan).toBe(1);
    expect(planView(sum, 'weekly').note).toContain('no time span');
  });
  it('counts warnings (e.g. pending credentialing)', () => {
    const pending = priceLine({ serviceId: 'S2', providerId: 'P7', payment: { type: 'insurance', subPlan: 'Aetna Commercial' }, frequency: { kind: 'weekly', perWeek: 1, weeks: 4 } }, data);
    expect(summarize([pending]).warnCount).toBe(1);
  });
});
