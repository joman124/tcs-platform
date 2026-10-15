import { describeSheet, lookUpBenefits, type BenefitsLookup } from '../src/data/benefitsSheet';
import { demoBenefitsSheet } from '../src/data/demo';

/**
 * The benefits lookup runs entirely in the browser (DECISIONS #38): the staff member signs in to Microsoft with their own
 * account, the browser reads the benefits sheet straight from SharePoint through Microsoft Graph, and finds the row
 * itself. Patient names, dates of birth and benefits travel only between Microsoft and this browser; the estimator's
 * server (Vercel, which has no BAA) never sees them. The sheet's rows are held only for the duration of one lookup.
 */

/** Where the sheet is and how to sign in. Identifiers only; nothing here is a secret. */
export interface BenefitsSource {
  clientId: string;
  tenantId: string;
  drive: string;
  item: string;
  /** Tab name; the first tab when absent. */
  sheet?: string;
  /** The signed-in staff member's email, so Microsoft can sign them in without asking which account. */
  loginHint?: string;
}

/** 'demo' = the invented demo sheet bundled with the page; null = no lookup (benefits typed by hand). */
export type BenefitsLookupSource = BenefitsSource | 'demo' | null;

export const GRAPH = 'https://graph.microsoft.com/v1.0';
/** Delegated: what the signed-in staff member can already open in SharePoint, read-only. */
export const GRAPH_SCOPES = ['Files.Read.All'];

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** The sheet's values, read-only, with the staff member's token. Every request goes to graph.microsoft.com only. */
export async function fetchBenefitsSheet(token: string, src: BenefitsSource, fetchFn: FetchFn = fetch): Promise<unknown[][]> {
  const headers = { Authorization: `Bearer ${token}` };
  const base = `${GRAPH}/drives/${encodeURIComponent(src.drive)}/items/${encodeURIComponent(src.item)}/workbook/worksheets`;
  const fail = (status: number): never => {
    if (status === 401 || status === 403) throw new Error('Your Microsoft account cannot open the benefits sheet. Ask to be added to the estimator site.');
    if (status === 404) throw new Error('The benefits sheet was not found. Check BENEFITS_ITEM_ID and BENEFITS_SHEET.');
    throw new Error(`Reading the benefits sheet failed (${status}).`);
  };
  let sheet = src.sheet;
  if (!sheet) {
    const res = await fetchFn(`${base}?$select=name`, { headers, cache: 'no-store' });
    if (!res.ok) fail(res.status);
    sheet = ((await res.json()) as { value: { name: string }[] }).value[0]?.name;
    if (!sheet) throw new Error('The benefits sheet has no tabs.');
  }
  const res = await fetchFn(`${base}('${encodeURIComponent(sheet)}')/usedRange(valuesOnly=true)?$select=values`, { headers, cache: 'no-store' });
  if (!res.ok) fail(res.status);
  return ((await res.json()) as { values?: unknown[][] }).values ?? [];
}

type Msal = import('@azure/msal-browser').PublicClientApplication;
// One sign-in client per page, so lookups after the first are silent. Tokens live in memory only and go with the page.
let msal: Promise<Msal> | null = null;

/** A Graph token for the signed-in staff member: silently when possible, else a Microsoft sign-in popup. */
async function graphToken(src: BenefitsSource): Promise<string> {
  msal ??= import('@azure/msal-browser').then(async ({ PublicClientApplication }) => {
    const app = new PublicClientApplication({
      auth: { clientId: src.clientId, authority: `https://login.microsoftonline.com/${src.tenantId}`, redirectUri: `${window.location.origin}/msal-redirect.html` },
      // Nothing in localStorage or sessionStorage: tokens and sign-in state stay in memory.
      cache: { cacheLocation: 'memoryStorage', temporaryCacheLocation: 'memoryStorage' },
    });
    await app.initialize();
    return app;
  });
  const app = await msal;
  const request = { scopes: GRAPH_SCOPES, ...(src.loginHint ? { loginHint: src.loginHint } : {}) };
  const account = app.getAllAccounts()[0];
  try {
    return account ? (await app.acquireTokenSilent({ scopes: GRAPH_SCOPES, account })).accessToken : (await app.ssoSilent(request)).accessToken;
  } catch {
    // No silent token (first use, consent needed, or third-party cookies blocked): ask Microsoft in a popup.
    try {
      return (await app.acquireTokenPopup(request)).accessToken;
    } catch (e) {
      if (e instanceof Error && /popup/i.test(e.message)) throw new Error('The Microsoft sign-in window was blocked. Allow pop-ups for this site and try again.');
      throw e;
    }
  }
}

async function readSheet(source: BenefitsSource | 'demo'): Promise<unknown[][]> {
  return source === 'demo' ? demoBenefitsSheet : fetchBenefitsSheet(await graphToken(source), source);
}

/** Find one patient's benefits, in the browser. */
export async function lookUpInBrowser(source: BenefitsSource | 'demo', name: string, dob: string): Promise<BenefitsLookup> {
  return lookUpBenefits(await readSheet(source), name, dob);
}

/** For /diagnostics: recognised columns and the row count, worked out in the browser. No names or values. */
export async function checkSheetInBrowser(source: BenefitsSource | 'demo'): Promise<ReturnType<typeof describeSheet>> {
  return describeSheet(await readSheet(source));
}
