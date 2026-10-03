import {
  bundleRate,
  type FeeRateCell,
  type ServiceComponent,
} from '../engine/rates';
import { tierOf } from '../engine/rules';
import type {
  Accepts,
  ContractedRate,
  Credential,
  CredentialStatus,
  CredentialingEntry,
  EngineData,
  Network,
  PayerInfo,
  PlanMapEntry,
  Provider,
  ProviderService,
  ProviderStatus,
  Service,
  Tier,
} from '../engine/types';

export type Sheet = unknown[][];
export type Sheets = Record<string, Sheet>;

export const SHEETS = [
  'Providers',
  'Services',
  'ServiceComponents',
  'ProviderServices',
  'Credentialing',
  'PayerMap',
  'PayerKey',
  'FeeRates',
  'CashPrices',
] as const;

const TIER_BY_LABEL: Record<string, Tier> = { 'PhD/PsyD/MD/DO': 'T1', 'LPC/LCSW/NP/PA': 'T2' };
const CREDENTIALS: readonly string[] = ['PsyD', 'PhD', 'MD', 'DO', 'PA', 'PA-C', 'NP', 'PMHNP', 'LCSW', 'LPC', 'LAC', 'LMFT', 'Postdoc', 'BA', 'MA'];

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const yes = (v: unknown): boolean => str(v).toUpperCase() === 'Y';

type Row = Record<string, unknown>;

/** Turn a sheet into row objects keyed by header text. Rows with an empty first cell are dropped. */
export function rows(sheet: Sheet | undefined, name: string): Row[] {
  if (!sheet || sheet.length === 0) throw new Error(`Directory workbook tab "${name}" is missing or empty.`);
  const header = (sheet[0] ?? []).map(str);
  return sheet
    .slice(1)
    .filter((r) => str(r[0]) !== '')
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** Read a column whose full header may carry a long suffix: match by prefix. */
function col(r: Row, prefix: string): unknown {
  for (const k of Object.keys(r)) if (k.startsWith(prefix)) return r[k];
  return undefined;
}

/** Excel serial date (days since 1899-12-30) or ISO/US text to a Date, else null. */
export function toDate(v: unknown): Date | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400 * 1000));
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const STATUS_RANK: Record<CredentialStatus, number> = { Credentialed: 4, Pending: 3, 'Needs review': 2, 'Not eligible': 1, 'Do not submit': 0 };

export function parseWorkbook(sheets: Sheets, now: Date = new Date()): EngineData {
  // ---- Providers
  const providers: Provider[] = rows(sheets.Providers, 'Providers').map((r) => {
    const cred = str(col(r, 'Credential')); // first match is "Credential"
    const credential = CREDENTIALS.includes(cred) ? (cred as Credential) : null;
    const override = num(col(r, 'Cash rate override'));
    const billsUnder = str(col(r, 'Bills under'));
    const excluded = str(col(r, 'Excluded payers'));
    return {
      id: str(r['Provider ID']),
      name: str(r['Name']),
      credential,
      status: (str(r['Status']) as ProviderStatus) || 'Needs review',
      accepts: (str(r['Accepts']) as Accepts) || 'Cash',
      ...(override !== null && override > 0 ? { cashOverride: override } : {}),
      ...(billsUnder ? { billsUnder } : {}),
      ...(excluded ? { excludedPayers: excluded.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
    };
  });

  // ---- Cash prices (Fee Schedule snapshot) and services
  const cash = new Map<number, { price: number | null; status: string }>();
  for (const r of rows(sheets.CashPrices, 'CashPrices')) {
    cash.set(Number(r['Fee Schedule row']), { price: num(r['Cash price']), status: str(r['Status']) });
  }
  const services: Service[] = rows(sheets.Services, 'Services').map((r) => {
    const override = num(col(r, 'Cash price override'));
    const row = Number(col(r, 'Cash price row'));
    const fromSheet = cash.get(row);
    const tiers = str(col(r, 'Allowed tiers'))
      .split(',')
      .map((t) => t.trim())
      .filter((t): t is Tier => t === 'T1' || t === 'T2');
    const price = override !== null ? override : (fromSheet?.price ?? null);
    const status = override !== null ? 'ok' : (fromSheet?.status ?? 'blank');
    return {
      id: str(r['Service ID']),
      name: str(r['Patient-facing name']),
      active: yes(col(r, 'Active in estimator')),
      perSession: yes(col(r, 'Per-session service')),
      cashPrice: price,
      cashStatus: (status === 'ok' && price !== null && price > 0 ? 'ok' : status === 'zero' || price === 0 ? 'zero' : status === 'blank' ? 'blank' : status === 'error' ? 'error' : 'text') as Service['cashStatus'],
      ...(tiers.length ? { allowedTiers: tiers } : {}),
    };
  });

  // ---- Provider <-> service links
  const providerServices: ProviderService[] = rows(sheets.ProviderServices, 'ProviderServices')
    .filter((r) => str(r['Service ID']) !== '')
    .map((r) => {
      const o = num(col(r, 'Cash price override'));
      return { providerId: str(r['Provider ID']), serviceId: str(r['Service ID']), ...(o !== null && o > 0 ? { cashOverride: o } : {}) };
    });

  // ---- Payers
  const payers: PayerInfo[] = rows(sheets.PayerKey, 'PayerKey').map((r) => {
    const d = toDate(r['Rate header date']);
    const stale = d === null ? true : now.getTime() - d.getTime() > 365 * 86400 * 1000;
    return { payer: str(r['Fee Schedule payer']), quarantined: yes(r['Quarantined']), stale };
  });

  // ---- Contracted rates: computed here from FeeRates + ServiceComponents (no reliance on Excel recalculation)
  const cells: FeeRateCell[] = rows(sheets.FeeRates, 'FeeRates').map((r) => ({
    visitRow: Number(r['Visit row']),
    cpt: str(r['Component CPT']),
    isAddOn: yes(r['Is add-on']),
    optional: yes(r['Optional add-on']),
    payer: str(r['Payer']),
    tier: TIER_BY_LABEL[str(r['Credential tier'])] ?? 'T2',
    rate: num(r['Rate']),
    status: str(r['Status']),
  }));
  const comps = new Map<string, ServiceComponent[]>();
  for (const r of rows(sheets.ServiceComponents, 'ServiceComponents')) {
    const id = str(r['Service ID']);
    const list = comps.get(id) ?? [];
    list.push({ visitRow: Number(r['Visit row (Fee Schedule parent row)']), quantity: Number(r['Quantity']) || 1, includeOptional: yes(col(r, 'Include optional')) });
    comps.set(id, list);
  }
  const rates: ContractedRate[] = [];
  for (const [serviceId, components] of comps) {
    for (const p of payers) {
      for (const tier of ['T1', 'T2'] as Tier[]) {
        const b = bundleRate(components, cells, p.payer, tier, p.quarantined);
        rates.push({ serviceId, payer: p.payer, tier, total: b.totalCents / 100, status: b.status });
      }
    }
  }

  // ---- Credentialing: keep the best status per provider and Fee Schedule payer
  const best = new Map<string, CredentialingEntry>();
  for (const r of rows(sheets.Credentialing, 'Credentialing')) {
    const payer = str(r['Fee Schedule payer']);
    if (!payer) continue;
    const status = str(r['Status (normalized)']) as CredentialStatus;
    if (!(status in STATUS_RANK)) continue;
    const key = `${str(r['Provider ID'])}|${payer}`;
    const cur = best.get(key);
    if (!cur || STATUS_RANK[status] > STATUS_RANK[cur.status]) best.set(key, { providerId: str(r['Provider ID']), payer, status });
  }

  const planMap: PlanMapEntry[] = rows(sheets.PayerMap, 'PayerMap').map((r) => ({
    subPlan: str(r['Sub-plan']),
    parentPayer: str(r['Parent payer (Fee Schedule)']),
    network: (str(r['Network']) as Network) || 'Needs review',
  }));

  // Providers with a known credential must resolve to a tier (sanity check for bad rows).
  for (const p of providers) if (p.credential !== null && tierOf(p.credential) === null) throw new Error(`Provider ${p.id} has an unusable credential.`);

  return { providers, providerServices, services, rates, credentialing: [...best.values()], planMap, payers };
}
