'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddLineDialog, type NewLine } from './AddLineDialog';
import { BenefitsPanel } from './BenefitsPanel';
import { EMPTY_BENEFITS_FORM, parseBenefits } from './benefitsForm';
import { Modal } from './Modal';
import { PrintSheet, type PrintLine } from './PrintSheet';
import { displayName, fmt, freqText, todayISO } from './format';
import {
  buildLogRows,
  lineView,
  patientResponsibility,
  planView,
  priceLine,
  summarize,
  type CostView,
  type EngineData,
  type LineInput,
  type Payment,
} from '@/src/engine';

interface Line {
  id: string;
  serviceName: string;
  input: LineInput;
}

const IDLE_MS = 15 * 60 * 1000;
const VIEW_LABEL: Record<CostView, string> = { weekly: 'Weekly', monthly: 'Monthly', plan: 'Full plan' };
/** Short random estimate ID: printed on the patient copy and used for the log rows, so the two can be matched. */
const newEstimateId = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
const paymentText = (p: Payment): string => (p.type === 'cash' ? 'Cash' : p.type === 'custom' ? 'Custom price' : `Insurance · ${p.subPlan}`);

/**
 * The whole estimate lives in this component's React state. Nothing is written to localStorage, cookies,
 * IndexedDB or the server: a reload, a new tab, or 15 idle minutes all start blank.
 * Only de-identified line figures (never the patient name) are sent for the log, after printing.
 */
export function Estimator({
  data,
  source,
  loadedAt,
  userName,
  logEnabled,
  benefitsLookup,
  signOutAction,
}: {
  data: EngineData;
  source: 'demo' | 'sharepoint';
  loadedAt: number;
  userName: string | null;
  logEnabled: boolean;
  benefitsLookup: boolean;
  signOutAction: (() => Promise<void>) | null;
}) {
  const demo = source === 'demo';
  const [patientName, setPatientName] = useState('');
  const [dob, setDob] = useState('');
  const [benefitsForm, setBenefitsForm] = useState(EMPTY_BENEFITS_FORM);
  const [insurance, setInsurance] = useState('');
  const [estimateId, setEstimateId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [view, setView] = useState<CostView>('plan');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Line | null>(null);
  const [preview, setPreview] = useState(false);
  const [bar, setBar] = useState<null | 'printed' | 'new' | 'idle'>(null);
  const [logMsg, setLogMsg] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(loadedAt);
  const logged = useRef(false);
  const idRef = useRef(0);

  const results = useMemo(() => lines.map((l) => priceLine(l.input, data)), [lines, data]);
  const summary = useMemo(() => summarize(results), [results]);
  const providerById = useMemo(() => new Map(data.providers.map((p) => [p.id, p])), [data]);
  const total = planView(summary, view);
  const { benefits, errors: benefitErrors } = useMemo(() => parseBenefits(benefitsForm), [benefitsForm]);
  const responsibility = useMemo(() => patientResponsibility(lines.map((l) => l.input), results, benefits), [lines, results, benefits]);
  const insuranceText = insurance.trim() || responsibility.payers.join(', ');
  const serviceById = useMemo(() => new Map(data.services.map((s) => [s.id, s])), [data]);

  // A custom line may have no provider ('' = no specific provider); every other line needs one.
  const printLines: PrintLine[] = lines.flatMap((l, i) => {
    const provider = providerById.get(l.input.providerId);
    const result = results[i];
    const custom = l.input.payment.type === 'custom';
    const code = serviceById.get(l.input.serviceId)?.codes;
    return (provider || (custom && l.input.providerId === '')) && result?.ok ? [{ serviceName: l.serviceName, ...(code ? { code } : {}), provider, input: l.input, result }] : [];
  });

  const clearAll = useCallback(() => {
    setPatientName('');
    setDob('');
    setBenefitsForm(EMPTY_BENEFITS_FORM);
    setInsurance('');
    setLines([]);
    setView('plan');
    setAdding(false);
    setEditing(null);
    setPreview(false);
    setLogMsg(null);
    logged.current = false;
  }, []);

  // Any change to the estimate (adding, editing or removing a line) means it has not been logged yet, and is a new estimate.
  useEffect(() => {
    logged.current = false;
    setEstimateId(newEstimateId());
  }, [lines]);

  // Auto-clear after 15 idle minutes.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        clearAll();
        setBar('idle');
      }, IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'pointermove', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [clearAll]);

  // After printing: log de-identified figures once, then offer to clear for the next patient.
  const lastLines = useRef({ lines, results, summary, estimateId });
  lastLines.current = { lines, results, summary, estimateId };
  useEffect(() => {
    const onAfterPrint = () => {
      const cur = lastLines.current;
      if (cur.lines.length === 0) return;
      setBar('printed');
      if (logEnabled && !logged.current) {
        logged.current = true;
        const rows = buildLogRows(cur.estimateId || newEstimateId(), todayISO(), cur.lines.map((l) => l.input), cur.results, cur.summary);
        if (rows.length > 0) {
          fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) })
            .then((r) => r.json())
            .then((j: { logged?: boolean }) => setLogMsg(j.logged ? null : 'This estimate was not added to the log.'))
            .catch(() => setLogMsg('This estimate was not added to the log.'));
        }
      }
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, [logEnabled]);

  const addLine = (n: NewLine) => {
    idRef.current += 1;
    setLines((ls) => [...ls, { id: `l${idRef.current}`, ...n }]);
    setAdding(false);
  };

  // Replaces the line in place: same id, same position.
  const saveEdit = (id: string, n: NewLine) => {
    setLines((ls) => ls.map((l) => (l.id === id ? { id, ...n } : l)));
    setEditing(null);
  };

  const printReason =
    lines.length === 0
      ? 'Add at least one service.'
      : summary.blockedCount > 0
        ? 'Edit or remove blocked lines first.'
        : !patientName.trim()
          ? 'Enter the patient name.'
          : Object.keys(benefitErrors).length > 0
            ? 'Fix the benefit amounts.'
            : null;
  const canPrint = printReason === null;
  const doPrint = () => {
    if (!canPrint) return;
    setPreview(false);
    window.print();
  };

  async function refresh() {
    setRefreshMsg('Refreshing…');
    try {
      const r = await fetch('/api/refresh', { method: 'POST' });
      const j = (await r.json()) as { loadedAt?: number; error?: string };
      if (!r.ok) throw new Error(j.error ?? 'Refresh failed');
      setLoaded(j.loadedAt ?? Date.now());
      // A full reload: the estimate is wiped (user decision 2026-10-05) and the page starts blank with the new data.
      setRefreshMsg('Refreshed. Reloading…');
      window.location.reload();
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : 'Refresh failed');
    }
  }

  const sheet = (
    <PrintSheet
      patientName={patientName}
      dateText={new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      insurance={insuranceText}
      lines={printLines}
      responsibility={responsibility}
      benefits={benefits}
      estimateId={estimateId}
      demo={demo}
    />
  );

  const switchToCash = (id: string) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, input: { ...l.input, payment: { type: 'cash' } } } : l)));

  return (
    <>
      <div className="app">
        {demo && <div className="demo">DEMO DATA. Invented providers and prices for testing. Do not give any output to a patient.</div>}
        <header className="hdr">
          <small>Mental Health Center of America</small>
          <h1>Treatment Plan Estimate</h1>
          <div className="hdr-right">
            {userName && <span className="who">{userName}</span>}
            <button type="button" className="link" onClick={refresh} title={`Directory data loaded ${new Date(loaded).toLocaleTimeString()}`}>
              Refresh data
            </button>
            {signOutAction && (
              <form action={signOutAction}>
                <button type="submit" className="link">
                  Sign out
                </button>
              </form>
            )}
          </div>
        </header>
        {refreshMsg && <div className="bar info-bar">{refreshMsg}</div>}

        {bar === 'printed' && (
          <div className="bar" role="status">
            <span>Printed. Clear for the next patient?</span>
            <button type="button" className="btn" onClick={() => { clearAll(); setBar(null); }}>Clear</button>
            <button type="button" className="btn sky" onClick={() => setBar(null)}>Keep</button>
            {logMsg && <span className="note">{logMsg}</span>}
          </div>
        )}
        {bar === 'new' && (
          <div className="bar" role="status">
            <span>Clear this estimate?</span>
            <button type="button" className="btn" onClick={() => { clearAll(); setBar(null); }}>Yes, clear</button>
            <button type="button" className="btn sky" onClick={() => setBar(null)}>Cancel</button>
          </div>
        )}
        {bar === 'idle' && (
          <div className="bar" role="status">
            <span>The estimate was cleared after 15 minutes without activity.</span>
            <button type="button" className="btn sky" onClick={() => setBar(null)}>OK</button>
          </div>
        )}

        <main className="body">
          <div className="pname">
            <label htmlFor="patient">Patient name</label>
            <input id="patient" className="field" value={patientName} onChange={(e) => setPatientName(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck={false} />
            <span className="hint">Held in this browser only. Never saved{benefitsLookup ? '; sent only to look up benefits' : ' or sent'}.</span>
          </div>

          <BenefitsPanel
            patientName={patientName}
            dob={dob}
            setDob={setDob}
            form={benefitsForm}
            setForm={setBenefitsForm}
            insurance={insurance}
            setInsurance={setInsurance}
            errors={benefitErrors}
            lookupEnabled={benefitsLookup}
          />

          <div className="card">
            <table aria-label="Estimate lines">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Provider</th>
                  <th>Payment</th>
                  <th>How often</th>
                  <th className="num">Per visit</th>
                  <th className="num">{view === 'plan' ? 'Line total' : view === 'weekly' ? 'Per week' : 'Per month'}</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty">
                      No services yet. Choose “Add service” to start the estimate.
                    </td>
                  </tr>
                )}
                {lines.map((l, i) => {
                  const r = results[i]!;
                  const provider = providerById.get(l.input.providerId);
                  const block = r.issues.find((x) => x.severity === 'block');
                  const warn = r.issues.find((x) => x.severity === 'warn');
                  const stale = r.issues.find((x) => x.code === 'stale-rates');
                  const v = lineView(r, view);
                  return (
                    <tr key={l.id} className={r.ok ? '' : 'blocked'} data-testid="line">
                      <td>{l.serviceName}</td>
                      <td>
                        {provider ? displayName(provider.name) : l.input.providerId === '' ? '—' : '?'}
                        {provider?.credential ? `, ${provider.credential}` : ''}
                      </td>
                      <td>{paymentText(l.input.payment)}</td>
                      <td>{r.ok ? freqText(l.input.frequency, r.sessions ?? 1) : '—'}</td>
                      <td className="num">{r.perVisitCents === null ? '—' : fmt(r.perVisitCents)}</td>
                      <td className="num">{v === null ? (r.ok ? 'one time' : '—') : fmt(v)}</td>
                      <td>
                        {block ? (
                          <>
                            <span className="chip bad">{block.message}</span>
                            {r.cashFallbackAvailable && provider && provider.accepts !== 'Insurance' && (
                              <button type="button" className="link dark" onClick={() => switchToCash(l.id)}>
                                Switch to cash
                              </button>
                            )}
                          </>
                        ) : warn ? (
                          <span className="chip warn">{warn.message}</span>
                        ) : (
                          <span className="chip ok">Ready</span>
                        )}
                        {stale && <div className="note">{stale.message}</div>}
                      </td>
                      <td className="row-actions">
                        <button type="button" className="link dark" aria-label={`Edit ${l.serviceName}`} onClick={() => setEditing(l)}>
                          Edit
                        </button>
                        <button type="button" className="link dark" aria-label={`Remove ${l.serviceName}`} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <button type="button" className="btn" id="add-service" onClick={() => setAdding(true)}>
              + Add service
            </button>
          </div>
          {summary.blockedCount > 0 && (
            <p className="attn" role="alert">
              {summary.blockedCount} {summary.blockedCount === 1 ? 'line is' : 'lines are'} blocked. Blocked lines are left out of the totals, and printing stays off until they are edited or removed.
            </p>
          )}
        </main>

        <footer className="foot">
          <div className="plan">
            <div className="lbl">Scheduling plan</div>
            {printLines.length === 0 ? <div className="row dim">Nothing scheduled yet.</div> : null}
            {printLines.map((l, i) => (
              <div className="row" key={i}>
                {l.provider ? `${displayName(l.provider.name)} · ` : ''}
                {l.serviceName} · {freqText(l.input.frequency, l.result.sessions ?? 1)}
              </div>
            ))}
          </div>
          <div className="total">
            <div className="lbl" id="view-label">{total.label}</div>
            <div className="big" id="view-total">{fmt(total.cents)}</div>
            <div className="seg" role="group" aria-label="Cost view">
              {(['weekly', 'monthly', 'plan'] as CostView[]).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} data-view={v}>
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </div>
            {total.note && <div className="small">{total.note}</div>}
            <div className="resp-line">
              Patient responsibility:{' '}
              <b id="patient-responsibility">{responsibility.patientCents === null ? 'enter or look up benefits' : fmt(responsibility.patientCents)}</b>
            </div>
          </div>
          <div className="actions">
            <button type="button" className="btn light" onClick={() => setPreview(true)} disabled={printLines.length === 0}>
              Preview patient copy
            </button>
            <button type="button" className="btn light" id="print" onClick={doPrint} disabled={!canPrint} title={printReason ?? undefined}>
              Print patient copy
            </button>
            <button type="button" className="btn sky" onClick={() => setBar('new')} disabled={lines.length === 0 && !patientName}>
              New estimate (clear)
            </button>
            {printReason && lines.length > 0 && <div className="small">{printReason}</div>}
          </div>
        </footer>

        {adding && <AddLineDialog data={data} onSave={addLine} onClose={() => setAdding(false)} />}
        {editing && <AddLineDialog key={editing.id} data={data} initial={editing} onSave={(n) => saveEdit(editing.id, n)} onClose={() => setEditing(null)} />}
        {preview && (
          <Modal label="Patient copy preview" onClose={() => setPreview(false)}>
            <div className="preview">
              <div className="preview-bar">
                <button type="button" className="btn" onClick={doPrint} disabled={!canPrint}>
                  Print
                </button>
                <button type="button" className="btn sky" onClick={() => setPreview(false)}>
                  Close
                </button>
                {printReason && <span className="note">{printReason}</span>}
              </div>
              <div className="scroll">
                {sheet}
              </div>
            </div>
          </Modal>
        )}
      </div>

      {/* The only thing that prints. Rendered always so Print works without opening the preview. */}
      <div className="print-only">
        {sheet}
      </div>
    </>
  );
}
