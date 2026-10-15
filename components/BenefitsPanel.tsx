'use client';

import { useState } from 'react';
import { lookUpInBrowser, type BenefitsLookupSource } from './benefitsBrowser';
import { BENEFIT_FIELDS, benefitsToForm, type BenefitsForm, type BenefitsKey } from './benefitsForm';

/**
 * Date of birth, the benefits lookup and the benefit fields. The lookup runs in this browser: it reads the benefits sheet
 * from SharePoint with the staff member's Microsoft sign-in and finds the patient's row here, so nothing about the patient
 * goes to the estimator's server. It fills the fields, which the admin can still correct; with no row, the admin types
 * the figures in.
 */
export function BenefitsPanel({
  patientName,
  dob,
  setDob,
  form,
  setForm,
  insurance,
  setInsurance,
  errors,
  source,
}: {
  patientName: string;
  dob: string;
  setDob: (v: string) => void;
  form: BenefitsForm;
  setForm: (f: BenefitsForm) => void;
  insurance: string;
  setInsurance: (v: string) => void;
  errors: Partial<Record<BenefitsKey, string>>;
  source: BenefitsLookupSource;
}) {
  const lookupEnabled = source !== null;
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canLookUp = patientName.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(dob) && !busy;

  async function lookUp() {
    setBusy(true);
    setMsg('Looking up…');
    try {
      if (source === null) return;
      const j = await lookUpInBrowser(source, patientName.trim(), dob);
      if (j.status === 'found') {
        setForm(benefitsToForm(j.benefits));
        if (j.insurance) setInsurance(j.insurance);
        setMsg('Filled in from the benefits sheet. Check the figures before printing.');
      } else if (j.status === 'ambiguous') setMsg(`${j.count} rows in the benefits sheet match this name and date of birth. Enter the benefits by hand, and ask for the sheet to be corrected.`);
      else if (j.status === 'no-columns') setMsg('The benefits sheet’s columns were not recognised (see /diagnostics). Enter the benefits by hand.');
      else setMsg('No row in the benefits sheet for this name and date of birth. Enter the benefits by hand.');
    } catch (e) {
      setMsg(`${e instanceof Error ? e.message : 'The lookup failed.'} Enter the benefits by hand.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card benefits-panel">
      <div className="bp-head">
        <div>
          <label htmlFor="dob">Date of birth</label>
          <input id="dob" type="date" className="field narrow" value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="insurance">Insurance company</label>
          <input id="insurance" className="field" value={insurance} maxLength={60} onChange={(e) => setInsurance(e.target.value)} autoComplete="off" placeholder="From the plan when blank" />
        </div>
        {lookupEnabled && (
          <button type="button" className="btn sky" id="benefits-lookup" onClick={lookUp} disabled={!canLookUp} title={canLookUp ? undefined : 'Enter the patient name and date of birth first.'}>
            Look up benefits
          </button>
        )}
      </div>
      {msg && (
        <p className="note" role="status" id="benefits-msg">
          {msg}
        </p>
      )}
      <div className="bp-grid">
        {BENEFIT_FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.id}>{f.label}</label>
            <input id={f.id} className="field narrow" inputMode="decimal" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} autoComplete="off" />
            {errors[f.key] && (
              <p className="attn" role="alert">
                {errors[f.key]}
              </p>
            )}
          </div>
        ))}
      </div>
      <span className="hint">
        Benefits are held in this browser only and never logged.{lookupEnabled ? ' The lookup reads the benefits sheet from Microsoft 365 directly; nothing about the patient goes to the estimator’s server.' : ''}
      </span>
    </div>
  );
}
