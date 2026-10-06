import { demoData } from './demo';
import { readDirectoryWorkbook, readFeeSchedule } from './graph';
import { withLiveFeeSchedule } from './liveRates';
import { checkWorkbook, parseWorkbook } from './workbook';
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

/** Directory data plus live Fee Schedule rates, with a 5-minute server-side cache. `force` bypasses it (admin "Refresh data"). */
export async function loadData(force = false): Promise<Loaded> {
  if (isDemo()) return { data: demoData, loadedAt: Date.now(), source: 'demo' };
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = (async () => {
      const [sheets, fee] = await Promise.all([readDirectoryWorkbook(), readFeeSchedule()]);
      // The workbook's own tabs are checked first (its FeeRates snapshot is what proves the row numbering lines up),
      // then rates and cash prices are replaced with a live sync of the Fee Schedule.
      checkWorkbook(sheets);
      cache = { data: parseWorkbook(withLiveFeeSchedule(sheets, fee).sheets), loadedAt: Date.now(), source: 'sharepoint' };
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
