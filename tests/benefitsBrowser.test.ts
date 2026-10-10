import { describe, expect, it, vi } from 'vitest';
import { fetchBenefitsSheet, GRAPH, lookUpInBrowser, type BenefitsSource } from '../components/benefitsBrowser';

const src: BenefitsSource = { clientId: 'c', tenantId: 't', drive: 'b!drive', item: '01ITEM' };
/** Invented patients only. */
const values = [['Patient Name', 'DOB', 'Co-Pay'], ['Test, Jane', 29221, 30]];

function fakeFetch(status = 200) {
  const calls: { url: string; auth: string | undefined }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization });
    if (status !== 200) return new Response('{}', { status });
    if (url.endsWith('/worksheets?$select=name')) return new Response(JSON.stringify({ value: [{ name: 'Benefits' }, { name: 'Other' }] }));
    return new Response(JSON.stringify({ values }));
  });
  return { fn, calls };
}

describe('benefits lookup in the browser', () => {
  it('reads the sheet from Microsoft Graph only, with the staff member token, first tab by default', async () => {
    const { fn, calls } = fakeFetch();
    expect(await fetchBenefitsSheet('tok', src, fn)).toEqual(values);
    expect(calls.map((c) => c.url)).toEqual([
      `${GRAPH}/drives/b!drive/items/01ITEM/workbook/worksheets?$select=name`,
      `${GRAPH}/drives/b!drive/items/01ITEM/workbook/worksheets('Benefits')/usedRange(valuesOnly=true)?$select=values`,
    ]);
    expect(calls.every((c) => c.url.startsWith('https://graph.microsoft.com/') && c.auth === 'Bearer tok')).toBe(true);
  });

  it('a named tab is read directly', async () => {
    const { fn, calls } = fakeFetch();
    await fetchBenefitsSheet('tok', { ...src, sheet: 'Q4 Benefits' }, fn);
    expect(calls.map((c) => c.url)).toEqual([`${GRAPH}/drives/b!drive/items/01ITEM/workbook/worksheets('Q4%20Benefits')/usedRange(valuesOnly=true)?$select=values`]);
  });

  it('no access says how to get it', async () => {
    await expect(fetchBenefitsSheet('tok', src, fakeFetch(403).fn)).rejects.toThrow(/added to the estimator site/);
    await expect(fetchBenefitsSheet('tok', src, fakeFetch(404).fn)).rejects.toThrow(/not found/);
  });

  it('demo mode looks up the bundled invented sheet without any request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await lookUpInBrowser('demo', 'Jane Test', '1980-01-01')).toMatchObject({ status: 'found', insurance: 'Aetna' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
