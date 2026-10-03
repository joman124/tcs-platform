import { toCents } from './money';
import {
  NO_MEDICARE_CREDENTIALS,
  type Credential,
  type EngineData,
  type Frequency,
  type Issue,
  type LineInput,
  type LineResult,
  type PlanMapEntry,
  type Provider,
  type Service,
  type Tier,
} from './types';

const T1_CREDENTIALS: readonly Credential[] = ['PsyD', 'PhD', 'MD', 'DO', 'Postdoc'];

/** null when the provider's credential is not known yet. */
export const tierOf = (credential: Credential | null): Tier | null =>
  credential === null ? null : T1_CREDENTIALS.includes(credential) ? 'T1' : 'T2';

export const canBillMedicare = (credential: Credential | null): boolean =>
  credential !== null && !NO_MEDICARE_CREDENTIALS.includes(credential);

const blocked = (issues: Issue[], extra: Partial<LineResult> = {}): LineResult => ({
  ok: false,
  issues,
  perVisitCents: null,
  sessions: null,
  totalCents: null,
  spanWeeks: null,
  recurring: false,
  cashFallbackAvailable: false,
  ...extra,
});

const block = (code: string, message: string): Issue => ({ severity: 'block', code, message });
const warn = (code: string, message: string): Issue => ({ severity: 'warn', code, message });
const info = (code: string, message: string): Issue => ({ severity: 'info', code, message });

interface Sessions {
  sessions: number;
  spanWeeks: number | null;
  issues: Issue[];
}

export function resolveFrequency(freq: Frequency): Sessions | { error: Issue } {
  const issues: Issue[] = [];
  if (freq.kind === 'weekly') {
    if (!Number.isFinite(freq.perWeek) || freq.perWeek <= 0) return { error: block('bad-frequency', 'Sessions per week must be greater than zero.') };
    if (!Number.isInteger(freq.weeks) || freq.weeks < 1) return { error: block('bad-frequency', 'Weeks must be a whole number of at least 1.') };
    const raw = freq.perWeek * freq.weeks;
    const sessions = Math.round(raw);
    if (sessions < 1) return { error: block('bad-frequency', 'Frequency works out to less than one session.') };
    if (Math.abs(raw - sessions) > 1e-9) issues.push(warn('rounded-sessions', `${raw} sessions rounded to ${sessions}.`));
    return { sessions, spanWeeks: freq.weeks, issues };
  }
  if (!Number.isInteger(freq.sessions) || freq.sessions < 1) return { error: block('bad-frequency', 'Total sessions must be a whole number of at least 1.') };
  if (freq.spanWeeks !== undefined && (!Number.isFinite(freq.spanWeeks) || freq.spanWeeks < 1)) {
    return { error: block('bad-frequency', 'Span in weeks must be at least 1.') };
  }
  if (freq.spanWeeks === undefined && freq.sessions > 1) {
    issues.push(info('no-span', 'No time span given: this line is left out of the weekly and monthly views.'));
  }
  return { sessions: freq.sessions, spanWeeks: freq.spanWeeks ?? null, issues };
}

/** Services listed in the dropdown: one entry per active patient-facing name. */
export function serviceNames(data: EngineData): string[] {
  return [...new Set(data.services.filter((s) => s.active).map((s) => s.name))].sort();
}

/**
 * For a patient-facing service name and a provider, pick the Fee Schedule service that provider
 * delivers (e.g. Master's vs Doctoral counseling share one patient-facing name, split by tier).
 */
export function resolveService(name: string, provider: Provider, data: EngineData): Service | undefined {
  const tier = tierOf(provider.credential);
  return data.services.find(
    (s) =>
      s.active &&
      s.name === name &&
      (!s.allowedTiers || (tier !== null && s.allowedTiers.includes(tier))) &&
      data.providerServices.some((ps) => ps.providerId === provider.id && ps.serviceId === s.id),
  );
}

/** Providers who offer a service (by patient-facing name) and are Active. */
export function providersForService(name: string, data: EngineData): Provider[] {
  return data.providers.filter((p) => p.status === 'Active' && resolveService(name, p, data) !== undefined);
}

export interface PlanOption {
  subPlan: string;
  payer: string;
  network: PlanMapEntry['network'];
  credentialing: 'Credentialed' | 'Pending';
}

/** The provider whose credentialing and tier apply to insurance: the supervisor if set, else the provider. */
export function billingProvider(provider: Provider, data: EngineData): Provider | undefined {
  return provider.billsUnder ? data.providers.find((p) => p.id === provider.billsUnder) : provider;
}

/** Plans the picker may show for a provider: parent payer credentialed (or pending) with the provider. */
export function plansForProvider(provider: Provider, data: EngineData): PlanOption[] {
  if (provider.accepts === 'Cash') return [];
  const biller = billingProvider(provider, data);
  if (!biller) return [];
  const out: PlanOption[] = [];
  for (const plan of data.planMap) {
    if (!plan.parentPayer || plan.network === 'Needs review') continue;
    if (provider.excludedPayers?.includes(plan.parentPayer)) continue;
    const cred = data.credentialing.find((c) => c.providerId === biller.id && c.payer === plan.parentPayer);
    if (cred && (cred.status === 'Credentialed' || cred.status === 'Pending')) {
      out.push({ subPlan: plan.subPlan, payer: plan.parentPayer, network: plan.network, credentialing: cred.status });
    }
  }
  return out;
}

export function priceLine(input: LineInput, data: EngineData): LineResult {
  const provider = data.providers.find((p) => p.id === input.providerId);
  if (!provider) return blocked([block('unknown-provider', 'Provider not found.')]);
  if (provider.status !== 'Active') {
    return blocked([block('provider-unavailable', `Provider status is "${provider.status}".`)]);
  }
  const service = data.services.find((s) => s.id === input.serviceId);
  if (!service) return blocked([block('unknown-service', 'Service not found.')]);
  if (!service.active) return blocked([block('service-inactive', 'Service is not active in the estimator.')]);
  if (!data.providerServices.some((ps) => ps.providerId === provider.id && ps.serviceId === service.id)) {
    return blocked([block('not-offered', 'This provider does not offer this service.')]);
  }
  const tier = tierOf(provider.credential);
  if (service.allowedTiers && (tier === null || !service.allowedTiers.includes(tier))) {
    return blocked([block('wrong-tier', 'This Fee Schedule service is not delivered by this credential.')]);
  }

  const freq = resolveFrequency(input.frequency);
  if ('error' in freq) return blocked([freq.error]);
  const issues: Issue[] = [...freq.issues];

  const finish = (perVisitCents: number, extra: Partial<LineResult> = {}): LineResult => ({
    ok: true,
    issues,
    perVisitCents,
    sessions: freq.sessions,
    totalCents: perVisitCents * freq.sessions,
    spanWeeks: freq.spanWeeks,
    recurring: freq.sessions > 1,
    cashFallbackAvailable: false,
    ...extra,
  });

  // ---- Cash
  const payment = input.payment;
  if (payment.type === 'cash') {
    if (provider.accepts === 'Insurance') return blocked([...issues, block('cash-not-accepted', 'This provider does not accept cash pay.')]);
    const link = data.providerServices.find((ps) => ps.providerId === provider.id && ps.serviceId === service.id);
    // A provider+service override is deliberate and wins; the provider-wide override only reprices per-session services.
    const override = link?.cashOverride ?? (service.perSession ? provider.cashOverride : undefined);
    if (override !== undefined) {
      if (!(override > 0)) return blocked([...issues, block('cash-unusable', 'Cash override must be greater than $0.')]);
      return finish(toCents(override));
    }
    if (service.cashStatus !== 'ok' || service.cashPrice === null || !(service.cashPrice > 0)) {
      return blocked([...issues, block('cash-unusable', 'Cash price is $0, blank, or unparsed in the Fee Schedule.')]);
    }
    return finish(toCents(service.cashPrice));
  }

  // ---- Insurance
  if (provider.accepts === 'Cash') return blocked([...issues, block('insurance-not-accepted', 'This provider does not accept insurance.')], { cashFallbackAvailable: true });
  const biller = billingProvider(provider, data);
  if (!biller || biller.status !== 'Active') {
    return blocked([...issues, block('supervisor-unavailable', 'The supervising provider this provider bills under is not available.')], { cashFallbackAvailable: true });
  }
  const billTier = tierOf(biller.credential);
  if (billTier === null) {
    return blocked([...issues, block('unknown-credential', 'Provider credential is not on file yet, so insurance cannot be priced.')], { cashFallbackAvailable: true });
  }
  const plan = data.planMap.find((p) => p.subPlan === payment.subPlan);
  if (!plan) return blocked([...issues, block('unknown-plan', 'Plan not found in the plan list.')], { cashFallbackAvailable: true });
  if (plan.network === 'Out') {
    return blocked([...issues, block('out-of-network', 'This plan is out of network. Switch the line to cash pay.')], { cashFallbackAvailable: true });
  }
  if (plan.network === 'Needs review') {
    return blocked([...issues, block('network-unconfirmed', 'Network status for this plan is unconfirmed.')], { cashFallbackAvailable: true });
  }
  if (!plan.parentPayer) {
    return blocked([...issues, block('no-fee-schedule-payer', 'No Fee Schedule rates exist for this plan.')], { cashFallbackAvailable: true });
  }
  const payer = plan.parentPayer;

  if (provider.excludedPayers?.includes(payer)) {
    return blocked([...issues, block('payer-excluded', `${provider.name} does not see ${payer} patients.`)], { payer, cashFallbackAvailable: true });
  }
  if (payer === 'Medicare' && !canBillMedicare(provider.credential)) {
    return blocked([...issues, block('lpc-medicare', `${provider.credential} providers cannot bill Medicare directly.`)], { payer });
  }
  const payerInfo = data.payers.find((p) => p.payer === payer);
  if (payerInfo?.quarantined) {
    return blocked([...issues, block('payer-quarantined', `${payer} rates are on hold until the Fee Schedule is confirmed.`)], { payer, cashFallbackAvailable: true });
  }
  const cred = data.credentialing.find((c) => c.providerId === biller.id && c.payer === payer);
  if (!cred || (cred.status !== 'Credentialed' && cred.status !== 'Pending')) {
    return blocked(
      [...issues, block('not-credentialed', `${biller.id === provider.id ? 'Provider' : 'Supervising provider'} is not credentialed with ${payer} (${cred?.status ?? 'no record'}).`)],
      { payer, cashFallbackAvailable: true },
    );
  }
  if (cred.status === 'Pending') issues.push(warn('credentialing-pending', `Credentialing with ${payer} is still pending.`));

  const rate = data.rates.find((r) => r.serviceId === service.id && r.payer === payer && r.tier === billTier);
  if (!rate) return blocked([...issues, block('no-rate', `No contracted rate exists for this service with ${payer}.`)], { payer, cashFallbackAvailable: true });
  if (rate.status !== 'OK') {
    return blocked([...issues, block('rate-unusable', `Contracted rate unusable: ${rate.status}.`)], { payer, cashFallbackAvailable: true });
  }
  const cents = toCents(rate.total);
  if (!(cents > 0)) return blocked([...issues, block('rate-zero', 'Contracted rate is $0.')], { payer, cashFallbackAvailable: true });
  if (payerInfo?.stale) issues.push(info('stale-rates', `${payer} rate header is over 12 months old.`));
  return finish(cents, { payer });
}

