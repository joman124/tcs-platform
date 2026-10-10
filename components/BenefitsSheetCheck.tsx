'use client';

import { useState } from 'react';
import { checkSheetInBrowser, type BenefitsSource } from './benefitsBrowser';

/**
 * Checks the benefits sheet's columns from this browser (with the signed-in staff member's Microsoft account), so the
 * sheet is never read by the estimator's server. Shows recognised columns and the row count only, never a name or value.
 */
export function BenefitsSheetCheck({ source }: { source: BenefitsSource }) {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    setResult('Checking…');
    try {
      const d = await checkSheetInBrowser(source);
      setResult(
        d.headerRow === null
          ? 'Problem: no header row with a patient name and a date of birth column was found in the first 10 rows.'
          : `OK: header row ${d.headerRow}, ${d.rows} patient rows. Columns recognised: ${d.matched.join(', ')}.${d.missing.length ? ` Not found (send these headings to be mapped): ${d.missing.join(', ')}.` : ''} No names or values are shown.`,
      );
    } catch (e) {
      setResult(`Problem: ${e instanceof Error ? e.message : 'the sheet could not be read.'}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p>Set up. The sheet is read by your browser with your Microsoft account, never by the estimator&apos;s server.</p>
      <button type="button" className="btn sky" onClick={check} disabled={busy} id="benefits-check">
        Check the benefits sheet&apos;s columns
      </button>
      {result && <p id="benefits-check-result">{result}</p>}
    </div>
  );
}
