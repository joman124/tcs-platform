import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { runDiagnostics, type Check } from '@/src/data/diagnostics';
import { BenefitsSheetCheck } from '@/components/BenefitsSheetCheck';
import { listWorksheets, readFeeSchedule, readSheet } from '@/src/data/graph';
import { isDemo, loadData } from '@/src/data/load';
import { readLogList } from '@/src/data/log';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Estimator readiness' };

const Mark = ({ ok }: { ok: boolean | null }) => <b>{ok === null ? 'Off' : ok ? 'OK' : 'Problem'}</b>;
const failed = <T,>(c: Check<T>): string | null => (c.ok ? null : c.error);

/**
 * Readiness for the real-data check. Signed-in MHCA accounts only, and it does not exist in demo mode (no sign-in
 * there). Shows setting names, never values; reads the workbook and the log list but never writes.
 */
export default async function Diagnostics() {
  if (isDemo()) notFound();
  const session = await auth();
  if (!session?.user) redirect('/api/auth/signin?callbackUrl=/diagnostics');

  const env = process.env;
  const r = await runDiagnostics({
    env,
    listWorksheets: () => listWorksheets(env.DIRECTORY_DRIVE_ID ?? '', env.DIRECTORY_ITEM_ID ?? ''),
    readSheet: (name) => readSheet(env.DIRECTORY_DRIVE_ID ?? '', env.DIRECTORY_ITEM_ID ?? '', name),
    readFeeSchedule,
    readLogList,
    loadData: () => loadData(),
  });

  return (
    <main className="setup diag">
      <h1>Estimator readiness</h1>
      <p>Checked {new Date(r.generatedAt).toLocaleString('en-US')}. Setting values are never shown. Nothing is written.</p>

      <h2>Settings</h2>
      <table aria-label="Settings">
        <thead>
          <tr>
            <th>Name</th>
            <th>Purpose</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {r.settings.map((s) => (
            <tr key={s.name}>
              <td className="mono-cell">{s.name}</td>
              <td>{s.purpose}</td>
              <td>{s.present ? 'Present' : s.required ? 'Missing' : 'Not set (optional)'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>
        Directory workbook: <Mark ok={r.workbook.ok && r.workbook.value.parsed.ok} />
      </h2>
      {r.workbook.ok ? (
        <>
          <table aria-label="Workbook tabs">
            <thead>
              <tr>
                <th>Tab</th>
                <th className="num">Rows</th>
              </tr>
            </thead>
            <tbody>
              {r.workbook.value.tabs.map((t) => (
                <tr key={t.tab}>
                  <td>{t.tab}</td>
                  <td className="num">{t.present ? t.rows : 'missing'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.workbook.value.parsed.ok ? (
            <p>
              Parsed with live Fee Schedule rates: {r.workbook.value.parsed.value.providers} providers, {r.workbook.value.parsed.value.services} services ({r.workbook.value.parsed.value.offered} names in the picker, {r.workbook.value.parsed.value.billable} billable to insurance), {r.workbook.value.parsed.value.plans} plans.
            </p>
          ) : (
            <p className="mono">{failed(r.workbook.value.parsed)}</p>
          )}
        </>
      ) : (
        <p className="mono">{r.workbook.error}</p>
      )}

      <h2>
        Fee Schedule (live rates): <Mark ok={r.feeSchedule.ok && r.feeSchedule.value.missingPayers.length === 0} />
      </h2>
      {r.feeSchedule.ok ? (
        r.feeSchedule.value.visits > 0 ? (
          <p>
            Header row {r.feeSchedule.value.headerRow}, data from row {r.feeSchedule.value.firstDataRow}: {r.feeSchedule.value.visits} visits, {r.feeSchedule.value.usable} usable rate cells, {r.feeSchedule.value.quarantined} quarantined, {r.feeSchedule.value.ambiguous} Medicare (on hold).
            {r.feeSchedule.value.missingPayers.length > 0 && ` Payers in the workbook with no Fee Schedule column (always blocked): ${r.feeSchedule.value.missingPayers.join(', ')}.`}
            {r.feeSchedule.value.rowShift !== 0 && ` The workbook's row numbers are on the old numbering (3 higher than the sheet); the app corrects them automatically, so no change to the workbook is needed.`}
          </p>
        ) : (
          <p>Read, but not checked against the workbook (see the workbook result above).</p>
        )
      ) : (
        <p className="mono">{r.feeSchedule.error}</p>
      )}

      <h2>
        Estimate log list: <Mark ok={r.log.ok} />
      </h2>
      <p>{r.log.ok === null ? r.log.reason : r.log.ok ? `Readable (HTTP ${r.log.value.status}). Read-only check; nothing was written.` : r.log.error}</p>

      <h2>
        Patient benefits sheet: <Mark ok={r.benefits.configured ? true : null} />
      </h2>
      {r.benefits.configured ? (
        <BenefitsSheetCheck
          source={{
            clientId: env.AZURE_CLIENT_ID ?? '',
            tenantId: env.AZURE_TENANT_ID ?? '',
            drive: env.BENEFITS_DRIVE_ID || (env.DIRECTORY_DRIVE_ID ?? ''),
            item: env.BENEFITS_ITEM_ID ?? '',
            ...(env.BENEFITS_SHEET ? { sheet: env.BENEFITS_SHEET } : {}),
            ...(session.user.email ? { loginHint: session.user.email } : {}),
          }}
        />
      ) : (
        <p>No benefits sheet (BENEFITS_ITEM_ID is not set): benefits are typed in by hand.</p>
      )}

      <h2>
        Loaded data: <Mark ok={r.loaded.ok} />
      </h2>
      <p>{r.loaded.ok ? `Directory data in use was loaded ${new Date(r.loaded.value.loadedAt).toLocaleString('en-US')} (source: ${r.loaded.value.source}).` : r.loaded.error}</p>

      <p>
        <a href="/">Back to the estimator</a>
      </p>
    </main>
  );
}
