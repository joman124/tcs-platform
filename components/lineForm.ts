import { displayName } from './format';
import { plansForProvider, providersForService, serviceNames } from '../src/engine/rules';
import type { EngineData, LineInput } from '../src/engine/types';

/** A line as the estimate holds it: the patient-facing service name plus the engine input. */
export interface NewLine {
  serviceName: string;
  input: LineInput;
}

export type PayType = 'cash' | 'insurance' | '';
export type FreqMode = 'week' | 'total';
export type FormField = 'service' | 'provider' | 'payment' | 'plan';

/** Everything the add/edit dialog holds while open. Frequency inputs stay as typed text. */
export interface LineFormState {
  serviceName: string;
  providerId: string;
  payType: PayType;
  subPlan: string;
  mode: FreqMode;
  a: string;
  b: string;
}

export const EMPTY_FORM: LineFormState = { serviceName: '', providerId: '', payType: '', subPlan: '', mode: 'week', a: '1', b: '12' };

export interface PrefilledForm {
  form: LineFormState;
  /** Fields left empty because the saved choice is no longer valid, with a note for the admin. */
  stale: Partial<Record<FormField, string>>;
}

/**
 * Dialog state for editing an existing line. Each saved choice is kept only if the dialog would still offer it
 * with the current directory data (a safeguard: "Refresh data" wipes the estimate, so lines normally stay valid).
 * The first invalid choice and everything that depends on it are left empty with a note: a value is never silently
 * substituted. Frequency is always kept.
 */
export function formFromLine(line: NewLine, data: EngineData): PrefilledForm {
  const f = line.input.frequency;
  const form: LineFormState =
    f.kind === 'weekly'
      ? { ...EMPTY_FORM, mode: 'week', a: String(f.perWeek), b: String(f.weeks) }
      : { ...EMPTY_FORM, mode: 'total', a: String(f.sessions), b: f.spanWeeks !== undefined ? String(f.spanWeeks) : '' };

  if (!serviceNames(data).includes(line.serviceName)) {
    return { form, stale: { service: `"${line.serviceName}" is no longer offered. Choose the service again.` } };
  }
  form.serviceName = line.serviceName;

  const provider = providersForService(line.serviceName, data).find((p) => p.id === line.input.providerId);
  if (!provider) {
    const known = data.providers.find((p) => p.id === line.input.providerId);
    const who = known ? displayName(known.name) : 'The saved provider';
    return { form, stale: { provider: `${who} is no longer available for ${line.serviceName}. Choose the provider again.` } };
  }
  form.providerId = provider.id;
  const who = displayName(provider.name);

  const pay = line.input.payment;
  if (pay.type === 'cash') {
    if (provider.accepts === 'Insurance') return { form, stale: { payment: `${who} no longer takes cash pay. Choose how this will be paid again.` } };
    form.payType = 'cash';
    return { form, stale: {} };
  }
  const plans = plansForProvider(provider, data);
  if (plans.length === 0) return { form, stale: { payment: `${who} no longer has insurance plans on file. Choose how this will be paid again.` } };
  form.payType = 'insurance';
  if (!plans.some((p) => p.subPlan === pay.subPlan)) {
    return { form, stale: { plan: `"${pay.subPlan}" is no longer listed for ${who}. Choose the plan again.` } };
  }
  form.subPlan = pay.subPlan;
  return { form, stale: {} };
}
