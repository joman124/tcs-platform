import { demoData } from './demo';
import { readDirectoryWorkbook } from './graph';
import { parseWorkbook } from './workbook';
import type { EngineData } from '../engine/types';

export interface Loaded {
  data: EngineData;
  loadedAt: number;
  source: 'demo' | 'sharepoint';
}

const TTL_MS = 5 * 60 * 1000;
let cache: Loaded | null = null;
let inflight: Promise<Loaded> | null = null;

import { isDemoMode } from './mode';

export const isDemo = (): boolean => isDemoMode();

/** Directory data with a 5-minute server-side cache. `force` bypasses it (admin "Refresh data"). */
export async function loadData(force = false): Promise<Loaded> {
  if (isDemo()) return { data: demoData, loadedAt: Date.now(), source: 'demo' };
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = (async () => {
      const sheets = await readDirectoryWorkbook();
      cache = { data: parseWorkbook(sheets), loadedAt: Date.now(), source: 'sharepoint' };
      return cache;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function clearCache(): void {
  cache = null;
}
