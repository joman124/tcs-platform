import { displayName, fmt, freqText } from './format';
import type { LineInput, LineResult, PlanSummary, Provider, Service } from '@/src/engine';

export interface PrintLine {
  serviceName: string;
  /** Absent on a custom line with no specific provider. */
  provider?: Provider;
  input: LineInput;
  result: LineResult;
}

/**
 * Patient copy. Prints on US Letter. Only what helps the patient know what they are scheduled for and
 * what it costs: no CPT codes, add-on rows, plan or tier names, credentialing, warnings or buttons.
 * Shows the weekly, monthly and full-plan figures together.
 */
export function PrintSheet({ patientName, dateText, lines, summary, demo }: { patientName: string; dateText: string; lines: PrintLine[]; summary: PlanSummary; demo: boolean }) {
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
      <div className="meta">
        <div>
          <b>Patient</b> &nbsp;{patientName || '—'}
        </div>
        <div>
          <b>Date</b> &nbsp;{dateText}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Provider</th>
            <th>How often</th>
            <th className="num">Per visit</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.serviceName}</td>
              <td>{l.provider ? displayName(l.provider.name) : ''}</td>
              <td>{freqText(l.input.frequency, l.result.sessions ?? 1)}</td>
              <td className="num">{fmt(l.result.perVisitCents ?? 0)}</td>
              <td className="num">{fmt(l.result.totalCents ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tot">
        <div className="l">Estimated total</div>
        <div className="v">{fmt(summary.fullPlanCents)}</div>
      </div>
      <div className="three">
        <div>
          Per week<b>{fmt(summary.weeklyCents)}</b>
          {summary.oneTimeCents > 0 && <small>repeating visits</small>}
        </div>
        <div>
          Per month<b>{fmt(summary.monthlyCents)}</b>
          {summary.oneTimeCents > 0 && <small>repeating visits</small>}
        </div>
        <div>
          Full treatment plan<b>{fmt(summary.fullPlanCents)}</b>
        </div>
      </div>
    </section>
  );
}

export type { Service };
