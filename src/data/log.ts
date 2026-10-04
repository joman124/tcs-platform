import { graphFetch } from './graph';
import type { LogRowInput } from './logValidation';

export const logConfigured = (): boolean => Boolean(process.env.LOG_SITE_ID && process.env.LOG_LIST_ID);

/** Append de-identified rows to the SharePoint list, 20 per Graph batch. */
export async function appendLogRows(rows: LogRowInput[]): Promise<void> {
  const site = process.env.LOG_SITE_ID;
  const list = process.env.LOG_LIST_ID;
  if (!site || !list) throw new Error('Logging is not configured.');
  for (let i = 0; i < rows.length; i += 20) {
    const chunk = rows.slice(i, i + 20);
    const requests = chunk.map((r, j) => ({
      id: String(j + 1),
      method: 'POST',
      url: `/sites/${site}/lists/${list}/items`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        fields: {
          Title: r.estimateId,
          EstimateId: r.estimateId,
          EstimateDate: r.date,
          ServiceId: r.serviceId,
          ProviderId: r.providerId,
          PaymentType: r.paymentType,
          Payer: r.payer,
          PerVisit: r.perVisitCents / 100,
          Sessions: r.sessions,
          LineTotal: r.totalCents / 100,
          EstimateFullPlanTotal: r.estimateFullPlanCents / 100,
        },
      },
    }));
    const res = await graphFetch('/$batch', { method: 'POST', body: JSON.stringify({ requests }) });
    if (!res.ok) throw new Error(`Log write failed (${res.status}).`);
    const json = (await res.json()) as { responses: { status: number }[] };
    if (json.responses.some((x) => x.status >= 300)) throw new Error('Log write partially failed.');
  }
}
