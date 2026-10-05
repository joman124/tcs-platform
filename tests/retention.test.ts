import { describe, expect, it, vi } from 'vitest';
import { cutoffDate, handleRetention, pruneLog, retentionEnabled, type GraphFetch } from '../src/data/retention';

const NOW = new Date('2026-10-05T03:00:00Z');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Fake Graph list: pages of items, records every call. Batch deletes answer 204 unless told otherwise. */
function fakeGraph(pages: { id: string; date?: string }[][], batchStatus: (id: string) => number = () => 204) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const graph: GraphFetch = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path === '/$batch') {
      const { requests } = JSON.parse(String(init?.body)) as { requests: { id: string; method: string; url: string }[] };
      return json({ responses: requests.map((r) => ({ id: r.id, status: batchStatus(r.url.split('/').pop()!) })) });
    }
    const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 0);
    const value = pages[page]!.map((i) => ({ id: i.id, fields: i.date === undefined ? {} : { EstimateDate: i.date } }));
    const nextLink = page + 1 < pages.length ? `https://graph.microsoft.com/v1.0/sites/s/lists/l/items?page=${page + 1}` : undefined;
    return json({ value, ...(nextLink ? { '@odata.nextLink': nextLink } : {}) });
  });
  return { graph, calls };
}
const deletedIds = (calls: { path: string; init?: RequestInit }[]) =>
  calls.filter((c) => c.path === '/$batch').flatMap((c) => (JSON.parse(String(c.init?.body)) as { requests: { method: string; url: string }[] }).requests.map((r) => `${r.method} ${r.url}`));

describe('retentionEnabled', () => {
  const base = { LOG_SITE_ID: 's', LOG_LIST_ID: 'l', LOG_RETENTION_ENABLED: '1', AZURE_CLIENT_SECRET: 'x' };
  it('is off by default and needs the log settings', () => {
    expect(retentionEnabled({})).toBe(false);
    expect(retentionEnabled({ ...base, LOG_RETENTION_ENABLED: undefined })).toBe(false);
    expect(retentionEnabled({ ...base, LOG_RETENTION_ENABLED: 'true' })).toBe(false);
    expect(retentionEnabled({ ...base, LOG_LIST_ID: '' })).toBe(false);
    expect(retentionEnabled(base)).toBe(true);
  });
  it('never runs in demo mode', () => {
    expect(retentionEnabled({ LOG_SITE_ID: 's', LOG_LIST_ID: 'l', LOG_RETENTION_ENABLED: '1', DEMO_MODE: '1' })).toBe(false);
  });
});

describe('cutoffDate', () => {
  it('is the same date 12 months earlier', () => {
    expect(cutoffDate(NOW)).toBe('2025-10-05');
    expect(cutoffDate(new Date('2027-01-31T12:00:00Z'))).toBe('2026-01-31');
  });
  it('clamps to the end of a shorter month', () => {
    expect(cutoffDate(new Date('2028-02-29T00:00:00Z'))).toBe('2027-02-28');
    expect(cutoffDate(new Date('2026-03-31T00:00:00Z'), 1)).toBe('2026-02-28');
  });
});

describe('pruneLog', () => {
  it('deletes only rows dated before the cutoff, across pages, in batches of 20', async () => {
    const old = Array.from({ length: 25 }, (_, i) => ({ id: `o${i}`, date: '2025-01-15T00:00:00Z' }));
    const { graph, calls } = fakeGraph([old.slice(0, 15), [...old.slice(15), { id: 'keep-cutoff', date: '2025-10-05' }, { id: 'keep-new', date: '2026-09-01' }]]);
    const r = await pruneLog({ graph, siteId: 's', listId: 'l', now: NOW });
    expect(r).toMatchObject({ cutoff: '2025-10-05', scanned: 27, expired: 25, deleted: 25, dryRun: false, capped: false });
    const del = deletedIds(calls);
    expect(del).toHaveLength(25);
    expect(del.every((d) => d.startsWith('DELETE /sites/s/lists/l/items/o'))).toBe(true);
    expect(calls.filter((c) => c.path === '/$batch')).toHaveLength(2); // 20 + 5
  });

  it('asks Graph for old rows by the indexed EstimateDate column', async () => {
    const { graph, calls } = fakeGraph([[]]);
    await pruneLog({ graph, siteId: 's', listId: 'l', now: NOW });
    expect(calls[0]!.path).toContain("$filter=fields/EstimateDate lt '2025-10-05'");
  });

  it('never deletes a row without a valid date, even if the query returned it', async () => {
    const { graph, calls } = fakeGraph([[{ id: 'no-date' }, { id: 'bad', date: 'soon' }, { id: 'new', date: '2026-10-01' }, { id: 'old', date: '2024-12-31' }]]);
    const r = await pruneLog({ graph, siteId: 's', listId: 'l', now: NOW });
    expect(r.deleted).toBe(1);
    expect(deletedIds(calls)).toEqual(['DELETE /sites/s/lists/l/items/old']);
  });

  it('dry run counts but deletes nothing', async () => {
    const { graph, calls } = fakeGraph([[{ id: 'old', date: '2024-01-01' }]]);
    const r = await pruneLog({ graph, siteId: 's', listId: 'l', now: NOW, dryRun: true });
    expect(r).toMatchObject({ expired: 1, deleted: 0, dryRun: true });
    expect(calls.some((c) => c.path === '/$batch')).toBe(false);
  });

  it('stops at the per-run cap', async () => {
    const { graph } = fakeGraph([Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, date: '2024-01-01' }))]);
    const r = await pruneLog({ graph, siteId: 's', listId: 'l', now: NOW, maxDeletes: 4 });
    expect(r).toMatchObject({ expired: 4, deleted: 4, capped: true });
  });

  it('a row already gone counts as deleted; any other failure is reported', async () => {
    const gone = fakeGraph([[{ id: 'a', date: '2024-01-01' }, { id: 'b', date: '2024-01-01' }]], (id) => (id === 'b' ? 404 : 204));
    expect((await pruneLog({ graph: gone.graph, siteId: 's', listId: 'l', now: NOW })).deleted).toBe(2);
    const denied = fakeGraph([[{ id: 'a', date: '2024-01-01' }]], () => 403);
    await expect(pruneLog({ graph: denied.graph, siteId: 's', listId: 'l', now: NOW })).rejects.toThrow(/could not be deleted/);
  });

  it('a failed read deletes nothing', async () => {
    const graph: GraphFetch = vi.fn(async () => json({}, 403));
    await expect(pruneLog({ graph, siteId: 's', listId: 'l', now: NOW })).rejects.toThrow(/Reading the log list failed \(403\)/);
    expect(graph).toHaveBeenCalledTimes(1);
  });
});

describe('handleRetention (the cron route)', () => {
  const env = { LOG_SITE_ID: 's', LOG_LIST_ID: 'l', LOG_RETENTION_ENABLED: '1', CRON_SECRET: 'cron-test-secret', AZURE_CLIENT_SECRET: 'x' };

  it('does not exist while off or in demo mode, and makes no Graph call', async () => {
    const { graph } = fakeGraph([[]]);
    for (const e of [{ ...env, LOG_RETENTION_ENABLED: '' }, { LOG_SITE_ID: 's', LOG_LIST_ID: 'l', LOG_RETENTION_ENABLED: '1', CRON_SECRET: 'c', DEMO_MODE: '1' }]) {
      expect((await handleRetention({ authorization: `Bearer ${e.CRON_SECRET}`, dryRun: false }, e, { graph, now: NOW })).status).toBe(404);
    }
    expect(graph).not.toHaveBeenCalled();
  });

  it('needs the CRON_SECRET bearer token', async () => {
    const { graph } = fakeGraph([[]]);
    expect((await handleRetention({ authorization: null, dryRun: false }, env, { graph, now: NOW })).status).toBe(401);
    expect((await handleRetention({ authorization: 'Bearer wrong', dryRun: false }, env, { graph, now: NOW })).status).toBe(401);
    expect((await handleRetention({ authorization: 'Bearer ', dryRun: false }, { ...env, CRON_SECRET: '' }, { graph, now: NOW })).status).toBe(401);
    expect(graph).not.toHaveBeenCalled();
  });

  it('prunes with the right token and reports the result', async () => {
    const { graph } = fakeGraph([[{ id: 'old', date: '2024-01-01' }]]);
    const r = await handleRetention({ authorization: 'Bearer cron-test-secret', dryRun: false }, env, { graph, now: NOW });
    expect(r).toEqual({ status: 200, body: { cutoff: '2025-10-05', scanned: 1, expired: 1, deleted: 1, dryRun: false, capped: false } });
  });

  it('a Graph failure is a 502 with the reason', async () => {
    const graph: GraphFetch = async () => json({}, 500);
    const r = await handleRetention({ authorization: 'Bearer cron-test-secret', dryRun: true }, env, { graph, now: NOW });
    expect(r.status).toBe(502);
  });
});
