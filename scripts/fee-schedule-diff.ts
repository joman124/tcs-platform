/**
 * Dry run of the Fee Schedule sync: reads the Billing Fee Schedule and the directory's FeeRates tab through Graph,
 * prints what a sync would change, and writes nothing. See docs/fee-schedule-sync.md.
 *
 *   npm run fee-schedule-diff -- [--json] [--row-offset N] [--numeric-text usable] [--limit N]
 *
 * Needs AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, DIRECTORY_DRIVE_ID, DIRECTORY_ITEM_ID in the environment,
 * and an Entra app that can read the Billing site. FEE_SCHEDULE_DRIVE_ID / FEE_SCHEDULE_ITEM_ID override the Billing copy.
 */
import { readUsedRange } from '../src/data/graph';
import { FEE_SCHEDULE_LAYOUT, FeeScheduleLayoutError } from '../src/sync/feeSchedule';
import { runFeeScheduleDiff } from '../src/sync/feeScheduleDiff';

// Billing Department copy (source of truth, docs/HANDOFF.md §5). Identifiers, not secrets.
const BILLING_DRIVE = 'b!5tnb6bLSWU2cr0Fyqdme8sr-r_CXXlJCv_nIcpkR8cYC3SF8On0DTaP4Asyu0SBf';
const BILLING_ITEM = '016S6WHA37ZNV3LWBGB5CZUHTAZIVPIYLB';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const need = (n: string) => {
    if (!process.env[n]) throw new Error(`Missing environment variable ${n}.`);
    return process.env[n]!;
  };
  const feeDrive = process.env.FEE_SCHEDULE_DRIVE_ID || BILLING_DRIVE;
  const feeItem = process.env.FEE_SCHEDULE_ITEM_ID || BILLING_ITEM;
  const offset = value('--row-offset');
  const limit = value('--limit');
  const run = await runFeeScheduleDiff(
    {
      feeSchedule: () => readUsedRange(feeDrive, feeItem, FEE_SCHEDULE_LAYOUT.sheetName),
      currentFeeRates: async () => (await readUsedRange(need('DIRECTORY_DRIVE_ID'), need('DIRECTORY_ITEM_ID'), 'FeeRates')).values,
    },
    {
      ...(offset !== undefined ? { rowOffset: Number(offset) } : {}),
      ...(value('--numeric-text') === 'usable' ? { numericText: 'usable' as const } : {}),
      ...(limit !== undefined ? { limit: Number(limit) } : {}),
    },
  );
  console.log(flag('--json') ? JSON.stringify({ report: run.sync.report, diff: run.diff }, null, 2) : run.text);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(e instanceof FeeScheduleLayoutError ? 2 : 1);
});
