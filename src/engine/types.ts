/** Credential tier: rates are keyed by payer x tier x CPT, never by individual provider. */
export type Tier = 'T1' | 'T2'; // T1 = PhD/PsyD/MD/DO, T2 = LPC/LCSW/NP/PA

export type Credential =
  | 'PsyD' | 'PhD' | 'MD' | 'DO'
  | 'PA' | 'PA-C' | 'NP' | 'PMHNP' | 'LCSW' | 'LPC' | 'LAC' | 'LMFT';

export type ProviderStatus = 'Active' | 'Onboarding' | 'Inactive' | 'Needs review';
export type Accepts = 'Cash' | 'Insurance' | 'Both';

export interface Provider {
  id: string;
  name: string;
  credential: Credential;
  status: ProviderStatus;
  accepts: Accepts;
  /** Dollars. Blank (undefined) = use the Fee Schedule cash price. */
  cashOverride?: number;
}

export type CashStatus = 'ok' | 'zero' | 'blank' | 'text' | 'error';

export interface Service {
  id: string;
  /** Patient-facing name; several Fee Schedule services may share one (e.g. Master's vs Doctoral counseling). */
  name: string;
  active: boolean;
  /** Dollars from the Fee Schedule "Private Pay" column. */
  cashPrice: number | null;
  cashStatus: CashStatus;
  /**
   * Single-visit service priced per session (counseling, med management). Only these use a provider's
   * cash override: a per-session override must never reprice an evaluation bundle.
   */
  perSession: boolean;
  /** If set, only providers whose tier is listed can deliver this Fee Schedule service. */
  allowedTiers?: Tier[];
}

export type RateStatus = 'OK' | 'Payer quarantined' | 'No contracted rate - offer cash' | 'Blank';

/** One row of the ContractedRates tab: service x payer x tier. */
export interface ContractedRate {
  serviceId: string;
  payer: string;
  tier: Tier;
  /** Dollars per visit/package: parent CPT + its add-on rows. */
  total: number;
  status: RateStatus;
}

export type CredentialStatus = 'Credentialed' | 'Pending' | 'Not eligible' | 'Do not submit' | 'Needs review';

export interface CredentialingEntry {
  providerId: string;
  /** Fee Schedule payer (parent), e.g. "Aetna", "UHC/Optum/UMR". */
  payer: string;
  status: CredentialStatus;
}

export type Network = 'In' | 'Out' | 'Needs review';

export interface PlanMapEntry {
  subPlan: string;
  /** Empty string = no Fee Schedule parent payer. */
  parentPayer: string;
  network: Network;
}

export interface PayerInfo {
  payer: string;
  quarantined: boolean;
  /** Rate header older than 12 months (admin-only warning). */
  stale: boolean;
}

/** Credentials that cannot bill Medicare directly (they bill under a PsyD). */
export const NO_MEDICARE_CREDENTIALS: readonly Credential[] = ['LPC', 'LAC', 'LMFT'];

/** ProviderServices tab: which Fee Schedule services each provider offers. */
export interface ProviderService {
  providerId: string;
  serviceId: string;
}

export interface EngineData {
  providers: Provider[];
  providerServices: ProviderService[];
  services: Service[];
  rates: ContractedRate[];
  credentialing: CredentialingEntry[];
  planMap: PlanMapEntry[];
  payers: PayerInfo[];
}

export type Frequency =
  | { kind: 'total'; sessions: number; /** weeks the sessions are spread over (needed for weekly/monthly views) */ spanWeeks?: number }
  | { kind: 'weekly'; perWeek: number; weeks: number };

export type Payment = { type: 'cash' } | { type: 'insurance'; subPlan: string };

export interface LineInput {
  serviceId: string;
  providerId: string;
  payment: Payment;
  frequency: Frequency;
}

export type IssueSeverity = 'block' | 'warn' | 'info';

export interface Issue {
  severity: IssueSeverity;
  code: string;
  /** Admin-facing text. Never printed on the patient copy. */
  message: string;
}

export interface LineResult {
  ok: boolean;
  issues: Issue[];
  /** Cents, null when the line could not be priced. */
  perVisitCents: number | null;
  sessions: number | null;
  totalCents: number | null;
  /** Weeks the sessions are spread over; null if unknown. */
  spanWeeks: number | null;
  /** More than one session: counts toward the recurring weekly/monthly views. */
  recurring: boolean;
  /** True when an insurance line could not be priced but cash can be offered. */
  cashFallbackAvailable: boolean;
  /** Parent payer used for insurance lines (admin-only). */
  payer?: string;
}
