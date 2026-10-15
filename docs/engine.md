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
4. Insurance: provider must accept insurance; plan must exist. A provider can bill under a supervisor (`billsUnder`): the supervisor must be Active and credentialed, and the supervisor's tier rates apply (e.g. postdocs under a PsyD). `excludedPayers` blocks payers that provider cannot see even if the supervisor can. Out-of-network blocks and offers the cash switch; unconfirmed network and plans with no Fee Schedule payer block (cash offered).
5. LPC, LAC, LMFT, Postdoc, BA and MA + Medicare is blocked, and no cash fallback is offered. A provider with no credential on file cannot be priced for insurance or offered tiered services (counseling); cash works on tier-free services.
6. A quarantined payer (Medicare for now) blocks, cash offered.
7. Provider must be Credentialed with the parent payer; Pending is allowed with a warning; anything else blocks (cash offered).
8. Rate = ContractedRate for service x payer x provider tier. Missing, DNB, blank, quarantined or $0 blocks (cash offered).
9. Stale payer rates add an admin-only info issue. Issues are never printed on the patient copy.

**Custom lines** (`payment: { type: 'custom', perVisitCents }`, service id `CUSTOM_SERVICE_ID` = `CUSTOM`) skip rules 1 and 3–9: the admin's typed price is used as is. The provider is optional (`providerId: ''`); a named provider must exist and be Active. The price must be whole cents from $0.01 to $100,000 (`CUSTOM_MAX_CENTS`). Frequency (rule 2) and the cost views apply as for any line. The line's description is its service name in the UI; it is printed but never logged.

## Patient responsibility (`benefits.ts`)

`patientResponsibility(inputs, results, benefits)` walks every insurance visit in line order: the remaining deductible is paid first, then the co-pay (never more than what is left of the visit), then co-insurance % on the rest; the visit's amount counts toward the out-of-pocket remaining and nothing more is owed once it reaches zero. Blank deductible remaining falls back to the deductible; blank co-pay and co-insurance are $0 and 0%; no out-of-pocket figure means no cap. Cash and custom lines are self-pay (owed in full, outside the deductible). With insurance lines and no benefits at all, the insurance share is `null` ("Pending benefits check"), never $0. Integer cents; co-insurance rounds half up per visit.

## Cost views

All figures come from priced lines only. Blocked lines are excluded and `canPrint` is false while any line is blocked (or there are no lines).

- **Full treatment plan** = sum of every priced line's total (per-visit x sessions).
- **Weekly** = sum over repeating lines (more than one session) of line total / that line's span in weeks. Single-session lines (e.g. an evaluation) are one-time and are not in weekly or monthly.
- **Monthly** = weekly x 52 / 12.
- A repeating line given as "total sessions" with no span has no weekly/monthly figure; it stays in the full plan and is flagged (`recurringWithoutSpan`).
- Rounding: cents, half up, per line.

Open question for the UI: whether the printed patient copy shows the view the admin selected or all three.
