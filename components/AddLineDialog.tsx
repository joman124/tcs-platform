'use client';

import { useMemo, useState } from 'react';
import { fmt } from './format';
import { displayName } from './format';
import {
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

export interface NewLine {
  serviceName: string;
  input: LineInput;
}

export function AddLineDialog({ data, onAdd, onClose }: { data: EngineData; onAdd: (l: NewLine) => void; onClose: () => void }) {
  const names = useMemo(() => serviceNames(data), [data]);
  const [serviceName, setServiceName] = useState('');
  const [providerId, setProviderId] = useState('');
  const [payType, setPayType] = useState<'cash' | 'insurance' | ''>('');
  const [subPlan, setSubPlan] = useState('');
  const [mode, setMode] = useState<'week' | 'total'>('week');
  const [a, setA] = useState('1');
  const [b, setB] = useState('12');

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

  const probe = service && provider && payment ? priceLine({ serviceId: service.id, providerId: provider.id, payment, frequency: { kind: 'total', sessions: 1 } }, data) : null;
  const draft: LineInput | null = service && provider && payment ? { serviceId: service.id, providerId: provider.id, payment, frequency } : null;
  const result = draft ? priceLine(draft, data) : null;
  const perVisit = probe?.perVisitCents ?? null;
  const blockers = (probe && !probe.ok ? probe.issues : result && !result.ok ? result.issues : []).filter((i) => i.severity === 'block');
  const notes = (result?.issues ?? probe?.issues ?? []).filter((i) => i.severity !== 'block');
  const canSwitchCash = probe && !probe.ok && probe.cashFallbackAvailable && cashOk && payType === 'insurance';

  function pickService(v: string) {
    setServiceName(v);
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
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Add service">
      <div className="modal">
        <h2>Add a service</h2>
        <div className="steps">
          <div>
            <label htmlFor="svc">Service</label>
            <select id="svc" value={serviceName} onChange={(e) => pickService(e.target.value)}>
              <option value="">Choose a service</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
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
          </div>
        </div>

        {provider && (
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
          </div>
        )}

        {payType === 'insurance' && (
          <div>
            <span className="lbl2">Patient&apos;s plan</span>
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

        {provider && payment && (
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

        {provider && payment && probe?.ok && (
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
          <button type="button" className="btn" id="add-confirm" disabled={!result?.ok || !draft} onClick={() => draft && onAdd({ serviceName, input: draft })}>
            Add to estimate
          </button>
        </div>
      </div>
    </div>
  );
}
