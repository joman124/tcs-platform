import { displayName, fmt } from './format';
import type { Benefits, LineInput, LineResult, Provider, Responsibility } from '@/src/engine';

export interface PrintLine {
  serviceName: string;
  /** CPT code(s) from the workbook; absent on custom lines. */
  code?: string;
  /** Absent on a custom line with no specific provider. */
  provider?: Provider;
  input: LineInput;
  result: LineResult;
}

const money = (cents: number | null): string => (cents === null ? '—' : fmt(cents));
const pct = (p: number | null): string => (p === null ? '—' : `${p}%`);

/**
 * Patient estimate, modelled on a hospital "Patient Estimate" (DECISIONS #36). Page 1: who it is for, the services with
 * code, visits and estimated total, the patient's benefits, and the estimated allowable vs the estimated patient
 * responsibility. Page 2: how the estimate was worked out, and definitions. No plan names, credentials, warnings or
 * buttons. Prints on US Letter.
 */
export function PrintSheet({
  patientName,
  dateText,
  insurance,
  lines,
  responsibility,
  benefits,
  estimateId,
  demo,
}: {
  patientName: string;
  dateText: string;
  insurance: string;
  lines: PrintLine[];
  responsibility: Responsibility;
  benefits: Benefits;
  estimateId: string;
  demo: boolean;
}) {
  const hasInsurance = responsibility.insuranceAllowableCents > 0;
  const footer = (
    <div className="pfoot">
      <span>
        <b>Created on</b> {dateText}
      </span>
      {estimateId && (
        <span>
          <b>Estimate ID</b> {estimateId}
        </span>
      )}
    </div>
  );
  return (
    <section className="paper" aria-label="Patient copy">
      {demo && <div className="watermark">SAMPLE DATA</div>}
      <div className="brand">
        <div className="mark">
          MENTAL HEALTH CENTER <span>of</span>
          <b>AMERICA</b>
        </div>
        <div className="contact">info@mentalhealthcenter.com</div>
      </div>
      <h2 className="ptitle">Patient Estimate</h2>

      <div className="pinfo">
        <div>
          <span className="lbl">Prepared for:</span> <b className="pname-print">{patientName || '—'}</b>
        </div>
        <dl>
          <dt>Date:</dt>
          <dd>{dateText}</dd>
          {insurance && (
            <>
              <dt>Insurance Company:</dt>
              <dd>{insurance}</dd>
            </>
          )}
        </dl>
      </div>

      <table className="services">
        <thead>
          <tr>
            <th>Code - Service</th>
            <th>Provider</th>
            <th className="num">Per visit</th>
            <th className="num">Visits</th>
            <th className="num">Est. Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.code ? `${l.code} - ${l.serviceName}` : l.serviceName}</td>
              <td>{l.provider ? displayName(l.provider.name) : ''}</td>
              <td className="num">{fmt(l.result.perVisitCents ?? 0)}</td>
              <td className="num">{l.result.sessions ?? 1}</td>
              <td className="num">{fmt(l.result.totalCents ?? 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="num">
              <b>Estimated Allowable</b>
            </td>
            <td className="num">
              <b>{fmt(responsibility.allowableCents)}</b>
            </td>
          </tr>
        </tfoot>
      </table>

      {hasInsurance && (
        <table className="benefits" aria-label="Benefit summary">
          <tbody>
            <tr>
              <th>Insurance/Payer</th>
              <td>{insurance || responsibility.payers.join(', ') || '—'}</td>
            </tr>
            <tr>
              <th>Estimated Allowable (insurance)</th>
              <td>{fmt(responsibility.insuranceAllowableCents)}</td>
            </tr>
            <tr>
              <th>Deductible</th>
              <td>{money(benefits.deductibleCents)}</td>
            </tr>
            <tr>
              <th>Deductible Remaining</th>
              <td>{money(benefits.deductibleRemainingCents)}</td>
            </tr>
            <tr>
              <th>Out of Pocket</th>
              <td>{money(benefits.outOfPocketCents)}</td>
            </tr>
            <tr>
              <th>Out of Pocket Remaining</th>
              <td>{money(benefits.outOfPocketRemainingCents)}</td>
            </tr>
            <tr>
              <th>Co-Pay (per visit)</th>
              <td>{money(benefits.copayCents)}</td>
            </tr>
            <tr>
              <th>Co-Insurance</th>
              <td>{pct(benefits.coinsurancePct)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="boxes">
        <div>
          <span>Estimated Allowable</span>
          <b>{fmt(responsibility.allowableCents)}</b>
        </div>
        <div className="resp">
          <span>Estimated Patient Responsibility</span>
          <b id="print-responsibility">{responsibility.patientCents === null ? 'Pending benefits check' : fmt(responsibility.patientCents)}</b>
        </div>
      </div>

      <p className="disclaimer">
        This estimate is based on the services and schedule planned today and is <u>not a guarantee</u> of what you will be billed. Actual charges can change with
        the number of visits, the services your provider recommends, and your insurance company&apos;s decision on your claim. If you have insurance, your benefits
        (deductible, co-pay, co-insurance and out-of-pocket maximum) determine what you owe.
      </p>
      {footer}

      <div className="page2">
        <h3>Estimate for Services</h3>
        <p>
          Thank you for choosing Mental Health Center of America. We hope this <b>estimate</b> helps you plan for the care you need. Here are answers to common
          questions about it.
        </p>
        <h3>How was this estimate decided?</h3>
        <p>For each visit billed to insurance, in order:</p>
        <p>(Allowed amount − remaining deductible − co-pay) × co-insurance % = co-insurance amount</p>
        <p>Remaining deductible + co-pay + co-insurance amount = amount you owe for that visit, until your out-of-pocket maximum is reached.</p>
        <p>Services you pay for yourself (self-pay) are owed in full.</p>
        <h3>How do I know if this estimate is correct?</h3>
        <p>This is a good faith <b>estimate</b> based on the information we had when your services were planned, including the benefits you or your insurer gave us.</p>
        <h3>Does my insurance plan cover these services?</h3>
        <p>
          Please contact your insurance company before your visits to find out what your plan covers. After your visits, your insurer reviews each claim and
          decides what it covers. You are responsible for any services your plan does not cover.
        </p>
        <h3>What if I change insurance or my insurance doesn&apos;t cover this care?</h3>
        <p>This estimate is valid only for the insurance shown. If your insurance changes, contact us for a new estimate.</p>
        <h3>Does this estimate show the final amount?</h3>
        <p>
          No. The final amount depends on the care you actually receive and on your insurer&apos;s decision. Other providers involved in your care may bill you
          separately; those amounts are not part of this estimate.
        </p>
        <h3>Definitions</h3>
        <table className="defs">
          <tbody>
            <tr>
              <th>Visit Co-Pay</th>
              <td>The amount your insurance company expects you to pay at each visit.</td>
            </tr>
            <tr>
              <th>Deductible</th>
              <td>The amount you pay each year before your plan starts paying benefits.</td>
            </tr>
            <tr>
              <th>Co-Insurance</th>
              <td>The percentage of the allowed amount that your insurance requires you to pay.</td>
            </tr>
            <tr>
              <th>Out of Pocket</th>
              <td>The most you pay in a plan year; after you reach it, you no longer pay deductible, co-pay or co-insurance.</td>
            </tr>
            <tr>
              <th>Estimated Allowable</th>
              <td>The contracted (insurance) or self-pay amount for the services planned.</td>
            </tr>
            <tr>
              <th>Your Responsibility</th>
              <td>The estimated amount you will be responsible for paying.</td>
            </tr>
          </tbody>
        </table>
        {footer}
      </div>
    </section>
  );
}
