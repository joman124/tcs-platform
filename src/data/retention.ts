import { isDemoMode } from './mode';

/**
 * 12-month retention for the de-identified estimate log. Off unless LOG_RETENTION_ENABLED=1, never in demo mode, and
 * only callable with the CRON_SECRET that Vercel Cron sends. Deletes list items whose EstimateDate is older than the
 * cutoff; nothing else is touched. The Graph client is injected so this is tested without the network.
 */

type Env = Record<string, string | undefined>;
export type GraphFetch = (path: string, init?: RequestInit) => Promise<Response>;

export const RETENTION_MONTHS = 12;
/** Upper bound per run, so one call stays well inside a function's time limit. The next run continues. */
export const MAX_DELETES_PER_RUN = 2000;

export const retentionEnabled = (env: Env): boolean =>
  env.LOG_RETENTION_ENABLED === '1' && !isDemoMode(env) && Boolean(env.LOG_SITE_ID) && Boolean(env.LOG_LIST_ID);

/** YYYY-MM-DD `months` before `now` (UTC), clamped to the end of a shorter month (29 Feb -> 28 Feb). */
export function cutoffDate(now: Date, months = RETENTION_MONTHS): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - months;
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(now.getUTCDate(), lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface PruneResult {
  cutoff: string;
  /** Items returned by the query. */
  scanned: number;
  /** Items older than the cutoff (deleted unless dryRun). */
  expired: number;
  deleted: number;
  dryRun: boolean;
  /** True when MAX_DELETES_PER_RUN was reached; the next run carries on. */
  capped: boolean;
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export async function pruneLog(opts: { graph: GraphFetch; siteId: string; listId: string; now: Date; dryRun?: boolean; maxDeletes?: number }): Promise<PruneResult> {
  const { graph, siteId, listId, now } = opts;
  const dryRun = opts.dryRun ?? false;
  const max = opts.maxDeletes ?? MAX_DELETES_PER_RUN;
  const cutoff = cutoffDate(now);
  const items = `/sites/${siteId}/lists/${listId}/items`;
  // EstimateDate is an indexed column (docs/estimate-log-list.json), so it can be filtered on.
  let next: string | null = `${items}?$select=id&$expand=fields($select=EstimateDate)&$filter=fields/EstimateDate lt '${cutoff}'&$top=200`;
  const expired: string[] = [];
  let scanned = 0;
  while (next && expired.length < max) {
    const res: Response = await graph(next, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
    if (!res.ok) throw new Error(`Reading the log list failed (${res.status}).`);
    const page = (await res.json()) as { value: { id: string; fields?: { EstimateDate?: string } }[]; '@odata.nextLink'?: string };
    for (const item of page.value) {
      scanned += 1;
      // Re-check every date here rather than trusting the filter: a row without a valid date is never deleted.
      const d = item.fields?.EstimateDate?.slice(0, 10);
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoff && expired.length < max) expired.push(item.id);
    }
    next = page['@odata.nextLink'] ? page['@odata.nextLink'].replace(GRAPH_BASE, '') : null;
  }
  let deleted = 0;
  if (!dryRun) {
    for (let i = 0; i < expired.length; i += 20) {
      const chunk = expired.slice(i, i + 20);
      const requests = chunk.map((id, j) => ({ id: String(j + 1), method: 'DELETE', url: `${items}/${id}` }));
      const res = await graph('/$batch', { method: 'POST', body: JSON.stringify({ requests }) });
      if (!res.ok) throw new Error(`Deleting old log rows failed (${res.status}); ${deleted} deleted so far.`);
      const json = (await res.json()) as { responses: { status: number }[] };
      // 404 means the row is already gone, which is the goal.
      deleted += json.responses.filter((r) => r.status < 300 || r.status === 404).length;
      if (json.responses.some((r) => r.status >= 300 && r.status !== 404)) throw new Error(`Some old log rows could not be deleted; ${deleted} deleted so far.`);
    }
  }
  return { cutoff, scanned, expired: expired.length, deleted, dryRun, capped: expired.length >= max };
}

/**
 * The cron route's logic. Returns 404 when retention is off or in demo mode (the route effectively does not exist),
 * 401 without the right CRON_SECRET bearer token, otherwise prunes. `?dryRun=1` only counts.
 */
export async function handleRetention(req: { authorization: string | null; dryRun: boolean }, env: Env, deps: { graph: GraphFetch; now: Date }): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!retentionEnabled(env)) return { status: 404, body: { error: 'Not found' } };
  if (!env.CRON_SECRET || req.authorization !== `Bearer ${env.CRON_SECRET}`) return { status: 401, body: { error: 'Unauthorized' } };
  try {
    const result = await pruneLog({ graph: deps.graph, siteId: env.LOG_SITE_ID!, listId: env.LOG_LIST_ID!, now: deps.now, dryRun: req.dryRun });
    return { status: 200, body: { ...result } };
  } catch (e) {
    return { status: 502, body: { error: e instanceof Error ? e.message : 'Retention failed' } };
  }
}
