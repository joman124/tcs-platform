import { CUSTOM_SERVICE_ID } from '../engine/types';

/**
 * Server-side gate for the de-identified estimate log. Only whitelisted fields with strict shapes pass,
 * so a patient name or any free text cannot be written to SharePoint even if the client misbehaves.
 */
export interface LogRowInput {
  estimateId: string;
  date: string;
  serviceId: string;
  providerId: string;
  paymentType: 'cash' | 'insurance' | 'custom';
  payer: string;
  perVisitCents: number;
  sessions: number;
  totalCents: number;
  estimateFullPlanCents: number;
}

const KEYS = ['estimateId', 'date', 'serviceId', 'providerId', 'paymentType', 'payer', 'perVisitCents', 'sessions', 'totalCents', 'estimateFullPlanCents'];
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const PAYER = /^[A-Za-z0-9 /&.-]{0,40}$/;
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** IDs that exist in the loaded directory. Anything else (including free text) is rejected. */
export interface KnownIds {
  providers: ReadonlySet<string>;
  services: ReadonlySet<string>;
  payers: ReadonlySet<string>;
}

export function validateLogPayload(body: unknown, known: KnownIds): { ok: true; rows: LogRowInput[] } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { rows?: unknown }).rows)) return { ok: false, error: 'Expected { rows: [...] }.' };
  const raw = (body as { rows: unknown[] }).rows;
  if (Object.keys(body as object).length !== 1) return { ok: false, error: 'Unexpected fields.' };
  if (raw.length < 1 || raw.length > 50) return { ok: false, error: 'Between 1 and 50 rows required.' };
  const rows: LogRowInput[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return { ok: false, error: 'Row must be an object.' };
    const o = r as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k))) return { ok: false, error: 'Row has unexpected or missing fields.' };
    if (typeof o.estimateId !== 'string' || !ID.test(o.estimateId)) return { ok: false, error: 'Bad estimateId.' };
    if (typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return { ok: false, error: 'Bad date.' };
    if (typeof o.serviceId !== 'string' || !ID.test(o.serviceId)) return { ok: false, error: 'Bad serviceId.' };
    if (typeof o.providerId !== 'string' || (o.providerId !== '' && !ID.test(o.providerId))) return { ok: false, error: 'Bad providerId.' };
    if (o.paymentType !== 'cash' && o.paymentType !== 'insurance' && o.paymentType !== 'custom') return { ok: false, error: 'Bad paymentType.' };
    if (typeof o.payer !== 'string' || !PAYER.test(o.payer)) return { ok: false, error: 'Bad payer.' };
    if (o.paymentType !== 'insurance' && o.payer !== '') return { ok: false, error: 'Cash and custom rows carry no payer.' };
    if (o.paymentType === 'insurance' && !known.payers.has(o.payer)) return { ok: false, error: 'Unknown payer.' };
    // A custom line (admin's own description and price) logs as service CUSTOM, with or without a provider. Its description is never sent.
    const custom = o.paymentType === 'custom';
    if (custom !== (o.serviceId === CUSTOM_SERVICE_ID)) return { ok: false, error: 'Custom rows, and only custom rows, use service CUSTOM.' };
    if (!(custom && o.providerId === '') && !known.providers.has(o.providerId)) return { ok: false, error: 'Unknown provider.' };
    if (!custom && !known.services.has(o.serviceId)) return { ok: false, error: 'Unknown service.' };
    if (!isInt(o.perVisitCents, 1, 10_000_000) || !isInt(o.sessions, 1, 1000) || !isInt(o.totalCents, 1, 100_000_000) || !isInt(o.estimateFullPlanCents, 1, 1_000_000_000)) return { ok: false, error: 'Bad amount.' };
    rows.push(o as unknown as LogRowInput);
  }
  return { ok: true, rows };
}
