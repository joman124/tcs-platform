'use client';

import { useMemo, useState } from 'react';
import { fmt } from './format';
import { displayName } from './format';
import { CUSTOM_DESCRIPTION_MAX, EMPTY_FORM, formFromLine, priceToCents, type FormField, type LineKind, type NewLine, type PayType } from './lineForm';
import { Modal } from './Modal';
import {
  CUSTOM_SERVICE_ID,
  plansForProvider,
  priceLine,
  providersForService,
  resolveService,
  serviceNames,
  type EngineData,
  type Frequency,
  type LineInput,
  type Payment,
} from '@/src/engine';

export type { NewLine };

/**
 * Add a line, or edit one when `initial` is given. Edit mode starts from the line's saved choices (set directly,
 * not through pickService/pickProvider, which would clear the fields that depend on them). A saved choice the
 * current data no longer offers starts empty with a note until it is chosen again.
 *
 * "Custom service" lets the admin type any description and price per visit, with an optional provider. The description
 * prints on the patient copy; the log gets only service id CUSTOM and the amounts.
 */
export function AddLineDialog({ data, initial, onSave, onClose }: { data: EngineData; initial?: NewLine; onSave: (l: NewLine) => void; onClose: () => void }) {
  const editing = initial !== undefined;
  const names = useMemo(() => serviceNames(data), [data]);
  const [start] = useState(() => (initial ? formFromLine(initial, data) : { form: EMPTY_FORM, stale: {} as Partial<Record<FormField, string>> }));
  const [kind, setKind] = useState<LineKind>(start.form.kind);
  const [serviceName, setServiceName] = useState(start.form.serviceName);
  const [providerId, setProviderId] = useState(start.form.providerId);
  const [payType, setPayType] = useState<PayType>(start.form.payType);
  const [subPlan, setSubPlan] = useState(start.form.subPlan);
  const [mode, setMode] = useState(start.form.mode);
  const [a, setA] = useState(start.form.a);
  const [b, setB] = useState(start.form.b);
  const [description, setDescription] = useState(start.form.description);
  const [price, setPrice] = useState(start.form.price);
  const [customProvChosen, setCustomProvChosen] = useState(false);
  const isCustom = kind === 'custom';
  // A note shows only while its field is still empty and the choices it depends on are unchanged.
  const sameUpstream: Record<FormField, boolean> = {
    service: true,
    provider: serviceName === start.form.serviceName,
    payment: serviceName === start.form.serviceName && providerId === start.form.providerId,
    plan: serviceName === start.form.serviceName && providerId === start.form.providerId,
  };
  const staleNote = (field: FormField, empty: boolean) =>
    empty && kind === start.form.kind && sameUpstream[field] && start.stale[field] ? (
      <p className="attn" data-testid={`stale-${field}`}>
        {start.stale[field]}
      </p>
    ) : null;

  const providers = useMemo(() => (serviceName ? providersForService(serviceName, data) : []), [serviceName, data]);
  const provider = providers.find((p) => p.id === providerId);
  const service = provider ? resolveService(serviceName, provider, data) : undefined;
  const plans = useMemo(() => (provider ? plansForProvider(provider, data) : []), [provider, data]);
  const cashOk = provider ? provider.accepts !== 'Insurance' : false;
  const insOk = provider ? provider.accepts !== 'Cash' && plans.length > 0 : false;

  const frequency: Frequency =
    mode === 'week'
      ? { kind: 'weekly', perWeek: Number(a), weeks: Number(b) }
      : { kind: 'total', sessions: Number(a), ...(Number(b) >= 1 ? { spanWeeks: Number(b) } : {}) };
  const payment: Payment | null = payType === 'cash' ? { type: 'cash' } : payType === 'insurance' && subPlan ? { type: 'insurance', subPlan } : null;

  // Custom line: a saved provider that is no longer available must be chosen again (or "No specific provider") before saving.
  const activeProviders = useMemo(() => data.providers.filter((p) => p.status === 'Active').sort((x, y) => displayName(x.name).localeCompare(displayName(y.name))), [data]);
  const customProvStale = isCustom && start.form.kind === 'custom' && Boolean(start.stale.provider) && !customProvChosen;
  const desc = description.trim();
  const cents = priceToCents(price);
  const priceBad = price.trim() !== '' && cents === null;

  const base: Omit<LineInput, 'frequency'> | null = isCustom
    ? desc && cents !== null && !customProvStale
      ? { serviceId: CUSTOM_SERVICE_ID, providerId, payment: { type: 'custom', perVisitCents: cents } }
      : null
    : service && provider && payment
      ? { serviceId: service.id, providerId: provider.id, payment }
      : null;
  const lineName = isCustom ? desc : serviceName;
  const probe = base ? priceLine({ ...base, frequency: { kind: 'total', sessions: 1 } }, data) : null;
  const draft: LineInput | null = base ? { ...base, frequency } : null;
  const result = draft ? priceLine(draft, data) : null;
  const perVisit = probe?.perVisitCents ?? null;
  const blockers = (probe && !probe.ok ? probe.issues : result && !result.ok ? result.issues : []).filter((i) => i.severity === 'block');
  const notes = (result?.issues ?? probe?.issues ?? []).filter((i) => i.severity !== 'block');
  const canSwitchCash = !isCustom && probe && !probe.ok && probe.cashFallbackAvailable && cashOk && payType === 'insurance';

  function pickService(v: string) {
    setServiceName(v);
    setProviderId('');
    setPayType('');
    setSubPlan('');
  }
  function pickKind(k: LineKind) {
    setKind(k);
    setProviderId('');
    setPayType('');
    setSubPlan('');
  }
  function pickProvider(v: string) {
    setProviderId(v);
    setPayType('');
    setSubPlan('');
  }

  return (
    <Modal label={editing ? 'Edit service' : 'Add service'} onClose={onClose}>
      <div className="modal">
        <h2>{editing ? 'Edit service' : 'Add a service'}</h2>
        <div className="seg light" role="group" aria-label="Kind of service">
          <button type="button" id="kind-directory" aria-pressed={!isCustom} onClick={() => { if (isCustom) pickKind('directory'); }}>
            From the directory
          </button>
          <button type="button" id="kind-custom" aria-pressed={isCustom} onClick={() => { if (!isCustom) pickKind('custom'); }}>
            Custom service
          </button>
        </div>

        {isCustom && (
          <div className="steps">
            <div className="wide">
              <label htmlFor="custom-desc">Service description</label>
              <input id="custom-desc" data-autofocus className="field" value={description} maxLength={CUSTOM_DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} autoComplete="off" spellCheck={false} />
              <span className="hint">Printed on the patient copy. Never sent to the log.</span>
            </div>
            <div>
              <label htmlFor="custom-prov">Provider (optional)</label>
              <select id="custom-prov" value={providerId} onChange={(e) => { setProviderId(e.target.value); setCustomProvChosen(true); }}>
                <option value="">No specific provider</option>
                {activeProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p.name)}
                    {p.credential ? `, ${p.credential}` : ''}
                  </option>
                ))}
              </select>
              {customProvStale && (
                <p className="attn" data-testid="stale-provider">
                  {start.stale.provider}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="custom-price">Price per visit ($)</label>
              <input id="custom-price" className="field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} autoComplete="off" />
              {priceBad && (
                <p className="attn" role="alert">
                  Enter an amount such as 45 or 45.50.
                </p>
              )}
            </div>
          </div>
        )}

        {!isCustom && (
          <div className="steps">
            <div>
              <label htmlFor="svc">Service</label>
              <select id="svc" data-autofocus value={serviceName} onChange={(e) => pickService(e.target.value)}>
                <option value="">Choose a service</option>
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {staleNote('service', !serviceName)}
            </div>
            <div>
              <label htmlFor="prov">Provider</label>
              <select id="prov" value={providerId} onChange={(e) => pickProvider(e.target.value)} disabled={!serviceName}>
                <option value="">{serviceName ? 'Choose a provider' : 'Choose a service first'}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p.name)}
                    {p.credential ? `, ${p.credential}` : ''}
                  </option>
                ))}
              </select>
              {staleNote('provider', !providerId)}
              {serviceName && providers.length === 0 && (
                <p className="note" data-testid="no-providers">
                  No active provider offers this service in the directory. Link one on the workbook&apos;s ProviderServices tab, or use Custom service.
                </p>
              )}
            </div>
          </div>
        )}

        {!isCustom && provider && (
          <div>
            <span className="lbl2">How will this be paid?</span>
            <div className="pay">
              <button type="button" className="opt" id="pay-cash" aria-pressed={payType === 'cash'} disabled={!cashOk} onClick={() => { setPayType('cash'); setSubPlan(''); }}>
                <b>Cash pay</b>
                {cashOk ? 'Private-pay price' : 'This provider does not take cash pay'}
              </button>
              <button type="button" className="opt" id="pay-ins" aria-pressed={payType === 'insurance'} disabled={!insOk} onClick={() => setPayType('insurance')}>
                <b>Insurance</b>
                {insOk ? 'Plans this provider is credentialed for' : provider.accepts === 'Cash' ? 'This provider is cash only' : 'No plans on file for this provider'}
              </button>
            </div>
            {staleNote('payment', !payType)}
          </div>
        )}

        {!isCustom && payType === 'insurance' && (
          <div>
            <span className="lbl2">Patient&apos;s plan</span>
            {staleNote('plan', !subPlan)}
            <div className="plans" role="radiogroup" aria-label="Plan">
              {plans.map((p) => (
                <button key={p.subPlan} type="button" role="radio" aria-checked={subPlan === p.subPlan} className={`plan-row${subPlan === p.subPlan ? ' sel' : ''}`} onClick={() => setSubPlan(p.subPlan)}>
                  <span>{p.subPlan}</span>
                  <span className={`chip ${p.network === 'Out' ? 'warn' : p.credentialing === 'Pending' ? 'warn' : 'ok'}`}>
                    {p.network === 'Out' ? 'Out of network' : p.credentialing === 'Pending' ? 'Credentialing pending' : 'In network'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {base && (
          <>
            <div className="rate">
              <span>Rate per visit</span>
              <b id="rate-value">{perVisit === null ? '—' : fmt(perVisit)}</b>
            </div>
            {blockers.map((i) => (
              <p key={i.code} className="attn" role="alert">
                {i.message}
              </p>
            ))}
            {notes.map((i) => (
              <p key={i.code} className="note">
                {i.message}
              </p>
            ))}
            {canSwitchCash && (
              <div>
                <button type="button" className="btn sky" onClick={() => { setPayType('cash'); setSubPlan(''); }}>
                  Switch to cash pay
                </button>
              </div>
            )}
          </>
        )}

        {base && probe?.ok && (
          <div>
            <span className="lbl2">How often?</span>
            <div className="seg light" role="group" aria-label="Frequency mode">
              <button type="button" aria-pressed={mode === 'week'} onClick={() => { setMode('week'); setA('1'); setB('12'); }}>
                Per week × weeks
              </button>
              <button type="button" aria-pressed={mode === 'total'} onClick={() => { setMode('total'); setA('12'); setB('12'); }}>
                Total sessions
              </button>
            </div>
            <div className="freq">
              <div>
                <label htmlFor="f1">{mode === 'week' ? 'Sessions per week' : 'Total sessions'}</label>
                <input id="f1" type="number" min={mode === 'week' ? 0.25 : 1} step={mode === 'week' ? 0.25 : 1} value={a} onChange={(e) => setA(e.target.value)} />
              </div>
              <div>
                <label htmlFor="f2">{mode === 'week' ? 'Number of weeks' : 'Spread over (weeks, optional)'}</label>
                <input id="f2" type="number" min={1} step={1} value={b} onChange={(e) => setB(e.target.value)} />
              </div>
            </div>
            {result && (
              <div className="lineout">
                {result.ok ? (
                  <>
                    <div>
                      <small>Sessions</small>
                      <b>{result.sessions}</b>
                    </div>
                    <div>
                      <small>Line total</small>
                      <b id="line-total">{fmt(result.totalCents ?? 0)}</b>
                    </div>
                  </>
                ) : (
                  <p className="attn" role="alert">
                    {result.issues.find((i) => i.severity === 'block')?.message}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="dlg-actions">
          <button type="button" className="btn sky" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" id={editing ? 'save-confirm' : 'add-confirm'} disabled={!result?.ok || !draft} onClick={() => draft && onSave({ serviceName: lineName, input: draft })}>
            {editing ? 'Save changes' : 'Add to estimate'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
