import { describe, expect, it } from 'vitest';
import { CUSTOM_MAX_CENTS, CUSTOM_SERVICE_ID, canBillMedicare, plansForProvider, priceLine, providersForService, resolveService, serviceNames, tierOf, type LineInput } from '../src/engine';
import { data } from './fixtures';

const weekly = (perWeek: number, weeks: number) => ({ kind: 'weekly' as const, perWeek, weeks });
const line = (over: Partial<LineInput>): LineInput => ({
  serviceId: 'S2', providerId: 'P1', payment: { type: 'cash' }, frequency: weekly(1, 4), ...over,
});
const codes = (r: ReturnType<typeof priceLine>) => r.issues.map((i) => i.code);

describe('cash lines', () => {
  it('prices a cash-only provider at the Fee Schedule cash price', () => {
    const r = priceLine(line({ serviceId: 'S1', providerId: 'P3' }), data);
    expect(r.ok).toBe(true);
    expect(r.perVisitCents).toBe(19500);
    expect(r.totalCents).toBe(19500 * 4);
  });
  it('uses the provider cash override when set', () => {
    expect(priceLine(line({ providerId: 'P5' }), data).perVisitCents).toBe(30000);
  });
  it('does not apply a per-session cash override to an evaluation bundle', () => {
    const r = priceLine(line({ serviceId: 'S3', providerId: 'P5' }), data);
    expect(r.perVisitCents).toBe(180000);
  });
  it('blocks cash for an insurance-only provider', () => {
    const r = priceLine(line({ serviceId: 'S1', providerId: 'P4' }), data);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('cash-not-accepted');
  });
  it('blocks a $0 cash price instead of printing it', () => {
    const r = priceLine(line({ serviceId: 'S4' }), data);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('cash-unusable');
  });
  it('blocks inactive services and unavailable providers', () => {
    expect(codes(priceLine(line({ serviceId: 'S5' }), data))).toContain('service-inactive');
    expect(codes(priceLine(line({ providerId: 'P6' }), data))).toContain('provider-unavailable');
    expect(codes(priceLine(line({ providerId: 'NOPE' }), data))).toContain('unknown-provider');
  });
  it('blocks a service the provider does not offer', () => {
    expect(codes(priceLine(line({ serviceId: 'S3', providerId: 'P3' }), data))).toContain('not-offered');
  });
});

describe('insurance lines', () => {
  const ins = (subPlan: string): Partial<LineInput> => ({ payment: { type: 'insurance', subPlan } });
  it('prices an insurance-only provider at the contracted rate', () => {
    const r = priceLine(line({ ...ins('Aetna Commercial'), serviceId: 'S1', providerId: 'P4' }), data);
    expect(r.ok).toBe(true);
    expect(r.perVisitCents).toBe(10331);
    expect(r.payer).toBe('Aetna');
  });
  it('gives different rates for PsyD vs LPC, same service name and payer', () => {
    const psyd = priceLine(line({ ...ins('Aetna Commercial'), serviceId: 'S2', providerId: 'P1' }), data);
    const lpc = priceLine(line({ ...ins('Aetna Commercial'), serviceId: 'S1', providerId: 'P2' }), data);
    expect(psyd.perVisitCents).toBe(13775);
    expect(lpc.perVisitCents).toBe(10331);
  });
  it('blocks LPC + Medicare with no cash fallback', () => {
    const r = priceLine(line({ ...ins('Medicare Part B'), serviceId: 'S1', providerId: 'P2' }), data);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('lpc-medicare');
    expect(r.cashFallbackAvailable).toBe(false);
  });
  it('blocks a quarantined payer (Medicare) even for a PsyD, and offers cash', () => {
    const r = priceLine(line({ ...ins('Medicare Part B') }), data);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('payer-quarantined');
    expect(r.cashFallbackAvailable).toBe(true);
  });
  it('blocks out-of-network plans and offers the cash switch', () => {
    const r = priceLine(line({ ...ins('Aetna Focus HMO') }), data);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('out-of-network');
    expect(r.cashFallbackAvailable).toBe(true);
  });
  it('blocks plans with unconfirmed network or no Fee Schedule payer', () => {
    expect(codes(priceLine(line({ ...ins('Mystery Plan') }), data))).toContain('network-unconfirmed');
    expect(codes(priceLine(line({ ...ins('Solidarity') }), data))).toContain('no-fee-schedule-payer');
    expect(codes(priceLine(line({ ...ins('Nope') }), data))).toContain('unknown-plan');
  });
  it('blocks a provider who is not credentialed with the payer', () => {
    const r = priceLine(line({ ...ins('Aetna Commercial'), providerId: 'P5' }), data);
    expect(codes(r)).toContain('not-credentialed');
    expect(r.cashFallbackAvailable).toBe(true);
  });
  it('allows Pending credentialing with a warning', () => {
    const r = priceLine(line({ ...ins('Aetna Commercial'), providerId: 'P7' }), data);
    expect(r.ok).toBe(true);
    expect(codes(r)).toContain('credentialing-pending');
  });
  it('blocks when the rate row is DNB / blank / missing', () => {
    expect(codes(priceLine(line({ ...ins('Aetna Commercial'), serviceId: 'S3', providerId: 'P4' }), data))).toContain('rate-unusable');
    expect(codes(priceLine(line({ ...ins('Cigna Local') }), data))).toContain('rate-unusable');
    expect(codes(priceLine(line({ ...ins('Aetna Commercial'), serviceId: 'S6' }), data))).toContain('no-rate');
  });
  it('adds an admin-only stale-rate info for stale payers', () => {
    const d = { ...data, rates: [...data.rates.filter((r) => !(r.payer === 'Cigna')), { serviceId: 'S2', payer: 'Cigna', tier: 'T1' as const, total: 100, status: 'OK' as const }] };
    const r = priceLine(line({ ...ins('Cigna Local') }), d);
    expect(r.ok).toBe(true);
    expect(r.issues.find((i) => i.code === 'stale-rates')?.severity).toBe('info');
  });
  it('blocks insurance for a cash-only provider and offers cash', () => {
    const r = priceLine(line({ ...ins('Aetna Commercial'), serviceId: 'S1', providerId: 'P3' }), data);
    expect(codes(r)).toContain('insurance-not-accepted');
    expect(r.cashFallbackAvailable).toBe(true);
  });
});

describe('provider+service cash overrides (roster pricing)', () => {
  it('licensed doctor $250 vs postdoc $195 for the same patient-facing service', () => {
    expect(priceLine(line({ providerId: 'P1' }), data).perVisitCents).toBe(25000);
    expect(priceLine(line({ providerId: 'P8' }), data).perVisitCents).toBe(19500);
  });
  it('master-level and trainee providers resolve to the right Fee Schedule service', () => {
    expect(resolveService('Individual Counseling', data.providers.find((p) => p.id === 'P8')!, data)?.id).toBe('S2');
    expect(priceLine(line({ serviceId: 'S1', providerId: 'P2', payment: { type: 'cash' } }), data).perVisitCents).toBe(19500);
  });
  it('a $95-per-session provider is priced at $95 only on the service with the override', () => {
    expect(priceLine(line({ serviceId: 'S1', providerId: 'P9' }), data).perVisitCents).toBe(9500);
    expect(priceLine(line({ serviceId: 'S7', providerId: 'P9' }), data).perVisitCents).toBe(22500); // couples at the standard price
  });
  it('a provider+service override wins over the provider-wide override, even on an evaluation bundle', () => {
    const d = {
      ...data,
      providers: data.providers.map((p) => (p.id === 'P5' ? { ...p, cashOverride: 300 } : p)),
      providerServices: [...data.providerServices.filter((x) => !(x.providerId === 'P5' && x.serviceId === 'S3')), { providerId: 'P5', serviceId: 'S3', cashOverride: 1500 }],
    };
    expect(priceLine(line({ serviceId: 'S3', providerId: 'P5' }), d).perVisitCents).toBe(150000);
    expect(priceLine(line({ serviceId: 'S2', providerId: 'P5' }), d).perVisitCents).toBe(30000);
  });
  it('rejects a $0 override', () => {
    const d = { ...data, providerServices: data.providerServices.map((x) => (x.providerId === 'P8' && x.serviceId === 'S2' ? { ...x, cashOverride: 0 } : x)) };
    expect(codes(priceLine(line({ providerId: 'P8' }), d))).toContain('cash-unusable');
  });
});

describe('billing under a supervisor (postdocs)', () => {
  const aetna = (over: Partial<LineInput> = {}) => line({ providerId: 'P8', payment: { type: 'insurance', subPlan: 'Aetna Commercial' }, ...over });
  it('uses the supervisor credentialing and tier rates', () => {
    const r = priceLine(aetna(), data);
    expect(r.ok).toBe(true);
    expect(r.perVisitCents).toBe(13775); // supervisor (PsyD, T1) Aetna rate
  });
  it('keeps cash at the postdoc override while insurance follows the supervisor', () => {
    expect(priceLine(line({ providerId: 'P8' }), data).perVisitCents).toBe(19500);
  });
  it('blocks payers the postdoc cannot see, even if the supervisor can', () => {
    const r = priceLine(aetna({ payment: { type: 'insurance', subPlan: 'Cigna Local' } }), data);
    expect(codes(r)).toContain('payer-excluded');
    expect(r.cashFallbackAvailable).toBe(true);
    expect(codes(priceLine(aetna({ payment: { type: 'insurance', subPlan: 'Medicare Part B' } }), data))).toContain('payer-excluded');
  });
  it('blocks when the supervisor is inactive or missing', () => {
    const inactive = { ...data, providers: data.providers.map((p) => (p.id === 'P1' ? { ...p, status: 'Inactive' as const } : p)) };
    expect(codes(priceLine(aetna(), inactive))).toContain('supervisor-unavailable');
    const missing = { ...data, providers: data.providers.map((p) => (p.id === 'P8' ? { ...p, billsUnder: 'GONE' } : p)) };
    expect(codes(priceLine(aetna(), missing))).toContain('supervisor-unavailable');
  });
  it('blocks when the supervisor is not credentialed with the payer', () => {
    const d = { ...data, credentialing: data.credentialing.filter((c) => !(c.providerId === 'P1' && c.payer === 'Aetna')) };
    expect(codes(priceLine(aetna(), d))).toContain('not-credentialed');
  });
  it('the plan picker follows the supervisor minus excluded payers', () => {
    const plans = plansForProvider(data.providers.find((p) => p.id === 'P8')!, data).map((p) => p.subPlan).sort();
    expect(plans).toEqual(['Aetna Commercial', 'Aetna Focus HMO']);
  });
});

describe('credential edge cases', () => {
  it('BA and MA providers are cash only', () => {
    expect(codes(priceLine(line({ serviceId: 'S1', providerId: 'P9', payment: { type: 'insurance', subPlan: 'Aetna Commercial' } }), data))).toContain('insurance-not-accepted');
  });
  it('blank credential: cash works on tier-free services, insurance and tiered services are blocked', () => {
    expect(priceLine(line({ serviceId: 'S6', providerId: 'P10' }), data).perVisitCents).toBe(9500);
    expect(codes(priceLine(line({ serviceId: 'S6', providerId: 'P10', payment: { type: 'insurance', subPlan: 'Aetna Commercial' } }), data))).toContain('unknown-credential');
    expect(codes(priceLine(line({ serviceId: 'S2', providerId: 'P10' }), data))).toContain('wrong-tier');
  });
  it('tierOf and canBillMedicare', () => {
    expect(tierOf('Postdoc')).toBe('T1');
    expect(tierOf('MA')).toBe('T2');
    expect(tierOf(null)).toBeNull();
    expect(canBillMedicare('PsyD')).toBe(true);
    expect(canBillMedicare('Postdoc')).toBe(false);
    expect(canBillMedicare(null)).toBe(false);
  });
});

describe('frequency', () => {
  it('per week x weeks', () => {
    const r = priceLine(line({ providerId: 'P5', frequency: weekly(2, 6) }), data);
    expect(r.sessions).toBe(12);
    expect(r.spanWeeks).toBe(6);
    expect(r.totalCents).toBe(30000 * 12);
  });
  it('total sessions, with and without a span', () => {
    const a = priceLine(line({ providerId: 'P5', frequency: { kind: 'total', sessions: 10, spanWeeks: 5 } }), data);
    expect(a.sessions).toBe(10);
    expect(a.spanWeeks).toBe(5);
    const b = priceLine(line({ providerId: 'P5', frequency: { kind: 'total', sessions: 10 } }), data);
    expect(b.spanWeeks).toBeNull();
    expect(codes(b)).toContain('no-span');
  });
  it('a single session is not recurring and needs no span', () => {
    const r = priceLine(line({ providerId: 'P5', frequency: { kind: 'total', sessions: 1 } }), data);
    expect(r.recurring).toBe(false);
    expect(codes(r)).not.toContain('no-span');
  });
  it('rounds fractional weekly products with a warning (biweekly x 5 weeks)', () => {
    const r = priceLine(line({ providerId: 'P5', frequency: weekly(0.5, 5) }), data);
    expect(r.sessions).toBe(3);
    expect(codes(r)).toContain('rounded-sessions');
  });
  it('rejects zero, negative and non-integer inputs', () => {
    for (const f of [weekly(0, 4), weekly(1, 0), weekly(-1, 4), weekly(1, 2.5), { kind: 'total' as const, sessions: 0 }, { kind: 'total' as const, sessions: 2.5 }, { kind: 'total' as const, sessions: 2, spanWeeks: 0 }]) {
      const r = priceLine(line({ providerId: 'P5', frequency: f }), data);
      expect(r.ok).toBe(false);
      expect(codes(r)).toContain('bad-frequency');
    }
  });
});

describe('pickers', () => {
  it('lists one entry per active patient-facing name', () => {
    expect(serviceNames(data)).toEqual(['ADHD Evaluation', 'Cash Only Service', 'Couples Counseling', 'Individual Counseling', 'Treatment Consult']);
  });
  it('resolves the Fee Schedule service by provider tier', () => {
    const psyd = data.providers.find((p) => p.id === 'P1')!;
    const lpc = data.providers.find((p) => p.id === 'P2')!;
    expect(resolveService('Individual Counseling', psyd, data)?.id).toBe('S2');
    expect(resolveService('Individual Counseling', lpc, data)?.id).toBe('S1');
  });
  it('lists only active providers who offer the service', () => {
    const ids = providersForService('Individual Counseling', data).map((p) => p.id).sort();
    expect(ids).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P7', 'P8', 'P9']); // P6 inactive; P10 has no credential so cannot be offered tiered services
  });
  it('shows only plans the provider is credentialed (or pending) for, with network flags', () => {
    const plans = plansForProvider(data.providers.find((p) => p.id === 'P1')!, data).map((p) => p.subPlan).sort();
    expect(plans).toEqual(['Aetna Commercial', 'Aetna Focus HMO', 'Cigna Local', 'Medicare Part B']);
    expect(plansForProvider(data.providers.find((p) => p.id === 'P3')!, data)).toEqual([]); // cash only
    expect(plansForProvider(data.providers.find((p) => p.id === 'P5')!, data)).toEqual([]); // Do not submit
  });
});

describe('a service split across two providers', () => {
  it('prices each line independently', () => {
    const a = priceLine(line({ providerId: 'P1', payment: { type: 'insurance', subPlan: 'Aetna Commercial' }, frequency: weekly(1, 4) }), data);
    const b = priceLine(line({ providerId: 'P5', frequency: weekly(1, 4) }), data);
    expect(a.perVisitCents).toBe(13775);
    expect(b.perVisitCents).toBe(30000);
  });
});

describe('custom lines (admin description and price)', () => {
  const custom = (perVisitCents: number, over: Partial<LineInput> = {}): LineInput =>
    line({ serviceId: CUSTOM_SERVICE_ID, providerId: '', payment: { type: 'custom', perVisitCents }, ...over });

  it('prices at the typed price, with no provider, rate or credentialing', () => {
    const r = priceLine(custom(4550), data);
    expect([r.ok, r.perVisitCents, r.sessions, r.totalCents, r.spanWeeks, r.recurring, r.payer]).toEqual([true, 4550, 4, 18200, 4, true, undefined]);
    expect(r.issues).toEqual([]);
  });

  it('one time: total sessions 1 is not recurring', () => {
    const r = priceLine(custom(4500, { frequency: { kind: 'total', sessions: 1 } }), data);
    expect([r.ok, r.totalCents, r.recurring]).toEqual([true, 4500, false]);
  });

  it('any active provider may be named, whatever services or payment types they take', () => {
    expect(priceLine(custom(12000, { providerId: 'P4' }), data).ok).toBe(true); // insurance-only provider
    expect(priceLine(custom(12000, { providerId: 'P3' }), data).ok).toBe(true); // does not offer S2
  });

  it('a named provider must exist and be active', () => {
    expect(codes(priceLine(custom(12000, { providerId: 'P6' }), data))).toEqual(['provider-unavailable']);
    expect(codes(priceLine(custom(12000, { providerId: 'P404' }), data))).toEqual(['unknown-provider']);
  });

  it('the price must be whole cents from $0.01 to $100,000', () => {
    for (const bad of [0, -100, 12.5, Number.NaN, CUSTOM_MAX_CENTS + 1]) expect(codes(priceLine(custom(bad), data))).toEqual(['custom-price']);
    expect(priceLine(custom(CUSTOM_MAX_CENTS), data).ok).toBe(true);
  });

  it('frequency rules still apply', () => {
    expect(codes(priceLine(custom(4500, { frequency: weekly(0, 4) }), data))).toEqual(['bad-frequency']);
  });

  it('only service CUSTOM takes a custom price, and CUSTOM takes no other payment', () => {
    expect(codes(priceLine(custom(4500, { serviceId: 'S2', providerId: 'P1' }), data))).toEqual(['unknown-service']);
    expect(codes(priceLine(line({ serviceId: CUSTOM_SERVICE_ID }), data))).toEqual(['unknown-service']);
  });
});
