# Pricing & rules engine

Pure TypeScript, no UI, no network, no storage. Lives in `src/engine`; tests in `tests/` use synthetic data only.

```
npm install
npm test          # vitest
npm run typecheck
```

## Pieces

| File | Purpose |
|---|---|
| `rates.ts` | `bundleRate`: contracted total for a service = sum over its visits of (parent CPT + add-ons) x quantity, per payer and tier. Same semantics as the workbook's ContractedRates formulas. Any unusable cell blocks the bundle. Optional add-ons excluded unless requested. |
| `rules.ts` | `priceLine`: prices one estimate line or blocks it with admin-facing issues. Also the pickers: `serviceNames`, `providersForService`, `plansForProvider`, `resolveService`. |
| `plan.ts` | `summarize` and the three cost views (`weekly`, `monthly`, `plan`). |
| `money.ts` | Integer-cents arithmetic and USD formatting. |

## Rules in `priceLine` (in order)

1. Provider must be Active, service active, and linked in ProviderServices; the service's allowed tier must match the provider's credential tier.
2. Frequency: weekly (`perWeek` x `weeks`) or total sessions (optional `spanWeeks`). Zero, negative or non-integer inputs block; fractional products round with a warning.
3. Cash: provider must accept cash. Price = the provider+service override from ProviderServices, else the provider-wide override (per-session services only), else the Fee Schedule cash price (or the workbook's Services override, e.g. couples $225). $0, blank or unparsed prices block.
4. Insurance: provider must accept insurance; plan must exist. Out-of-network blocks and offers the cash switch; unconfirmed network and plans with no Fee Schedule payer block (cash offered).
5. LPC, LAC, LMFT, Postdoc, BA and MA + Medicare is blocked, and no cash fallback is offered. A provider with no credential on file cannot be priced for insurance or offered tiered services (counseling); cash works on tier-free services.
6. A quarantined payer (Medicare for now) blocks, cash offered.
7. Provider must be Credentialed with the parent payer; Pending is allowed with a warning; anything else blocks (cash offered).
8. Rate = ContractedRate for service x payer x provider tier. Missing, DNB, blank, quarantined or $0 blocks (cash offered).
9. Stale payer rates add an admin-only info issue. Issues are never printed on the patient copy.

## Cost views

All figures come from priced lines only. Blocked lines are excluded and `canPrint` is false while any line is blocked (or there are no lines).

- **Full treatment plan** = sum of every priced line's total (per-visit x sessions).
- **Weekly** = sum over repeating lines (more than one session) of line total / that line's span in weeks. Single-session lines (e.g. an evaluation) are one-time and are not in weekly or monthly.
- **Monthly** = weekly x 52 / 12.
- A repeating line given as "total sessions" with no span has no weekly/monthly figure; it stays in the full plan and is flagged (`recurringWithoutSpan`).
- Rounding: cents, half up, per line.

Open question for the UI: whether the printed patient copy shows the view the admin selected or all three.
