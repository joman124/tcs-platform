import { SHEETS, type Sheets } from './workbook';

/** Microsoft Graph, app-only (client credentials). Server-side only: never import from client code. */
const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}.`);
  return v;
};

let tokenCache: { token: string; expires: number } | null = null;

export async function graphToken(): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;
  const tenant = need('AZURE_TENANT_ID');
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: need('AZURE_CLIENT_ID'),
      client_secret: need('AZURE_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Microsoft token request failed (${res.status}).`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await graphToken();
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    cache: 'no-store',
  });
}

/** A tab's used range: its top-left address (e.g. `'Fee Schedule'!A1:BU160`) and cell values. Read-only. */
export async function readUsedRange(drive: string, item: string, sheet: string): Promise<{ address: string; values: unknown[][] }> {
  const res = await graphFetch(`/drives/${drive}/items/${item}/workbook/worksheets('${encodeURIComponent(sheet)}')/usedRange(valuesOnly=true)?$select=address,values`);
  if (!res.ok) throw new Error(`Reading tab "${sheet}" failed (${res.status}).`);
  return (await res.json()) as { address: string; values: unknown[][] };
}

export async function readSheet(drive: string, item: string, sheet: string): Promise<unknown[][]> {
  return (await readUsedRange(drive, item, sheet)).values;
}

/** Names of the workbook's tabs. A 404 here means the workbook itself was not found or is not shared with the app. */
export async function listWorksheets(drive: string, item: string): Promise<string[]> {
  const res = await graphFetch(`/drives/${drive}/items/${item}/workbook/worksheets?$select=name`);
  if (res.status === 404) throw new Error('The directory workbook was not found. Check DIRECTORY_DRIVE_ID and DIRECTORY_ITEM_ID, and that the workbook is shared with the app.');
  if (!res.ok) throw new Error(`Reading the directory workbook failed (${res.status}).`);
  const json = (await res.json()) as { value: { name: string }[] };
  return json.value.map((w) => w.name);
}

/**
 * Read every tab the app needs from the directory workbook. Read-only. Tabs that do not exist are left out, so the
 * version check in parseWorkbook can name them instead of failing on a bare 404.
 */
export async function readDirectoryWorkbook(): Promise<Sheets> {
  const drive = need('DIRECTORY_DRIVE_ID');
  const item = need('DIRECTORY_ITEM_ID');
  const present = new Set(await listWorksheets(drive, item));
  const entries = await Promise.all(SHEETS.filter((s) => present.has(s)).map(async (s) => [s, await readSheet(drive, item, s)] as const));
  return Object.fromEntries(entries);
}

/** Billing Department copy of the Fee Schedule (source of truth, docs/HANDOFF.md §5). Identifiers, not secrets. */
export const BILLING_FEE_SCHEDULE = {
  drive: 'b!5tnb6bLSWU2cr0Fyqdme8sr-r_CXXlJCv_nIcpkR8cYC3SF8On0DTaP4Asyu0SBf',
  item: '016S6WHA37ZNV3LWBGB5CZUHTAZIVPIYLB',
  sheet: 'Fee Schedule',
};

/** The live Fee Schedule tab (read-only). FEE_SCHEDULE_DRIVE_ID / FEE_SCHEDULE_ITEM_ID override the Billing copy. */
export async function readFeeSchedule(): Promise<{ address: string; values: unknown[][] }> {
  const drive = process.env.FEE_SCHEDULE_DRIVE_ID || BILLING_FEE_SCHEDULE.drive;
  const item = process.env.FEE_SCHEDULE_ITEM_ID || BILLING_FEE_SCHEDULE.item;
  const res = await graphFetch(`/drives/${drive}/items/${item}/workbook/worksheets('${encodeURIComponent(BILLING_FEE_SCHEDULE.sheet)}')/usedRange(valuesOnly=true)?$select=address,values`);
  if (res.status === 403 || res.status === 401) throw new Error('The app cannot read the Fee Schedule: it needs read access to the Billing Department site (docs/SETUP-CHECKLIST.md, step 5).');
  if (res.status === 404) throw new Error('The Fee Schedule was not found. Check FEE_SCHEDULE_DRIVE_ID and FEE_SCHEDULE_ITEM_ID, or that the "Fee Schedule" tab still exists.');
  if (!res.ok) throw new Error(`Reading the Fee Schedule failed (${res.status}).`);
  return (await res.json()) as { address: string; values: unknown[][] };
}

/** The patients' benefits sheet is optional: the lookup appears only when BENEFITS_ITEM_ID is set. */
export const benefitsConfigured = (env: Record<string, string | undefined> = process.env): boolean => Boolean(env.BENEFITS_ITEM_ID?.trim());
