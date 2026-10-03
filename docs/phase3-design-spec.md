# Phase 3 — Design spec (Admin Builder + Patient Copy)

Source of brand tokens: `mhca_guidelines 2021.pdf` (CorporateDrive / Admin / Marketing & BD / Assets - Marketing Resources). Nothing assumed except where marked.

## Tokens (Figma variables)

| Token | Hex | Brand name | Use |
|---|---|---|---|
| `light/sky` | #ABC8E7 | PMS 2707 U | Fills, row banding |
| `light/mint` | #9ED8B3 | PMS 573 U | Success / OK states |
| `light/rose` | #D5A9A5 | PMS 196 U | Warnings (soft) |
| `light/stone` | #EAE8DF | Cool Gray 1 U | Page background, table banding |
| `dark/navy` | #001654 | Reflex Blue U | Primary text, header, buttons |
| `dark/forest` | #053A30 | PMS 561 U | Secondary dark |
| `dark/wine` | #510722 | PMS 202 U | Errors / blocked |
| `dark/gold` | #CB9700 | PMS 7406 U | Accent, totals rule |

Rule from the guidelines: never pair two light tones or two dark tones for written content. Text is navy/forest/wine on stone/sky/mint, or stone on navy.

Typography: Gill Sans — Light for body, Semibold for headlines and emphasis. Web/print fallback stack: `"Gill Sans","Gill Sans MT",Calibri,sans-serif` (Gill Sans is not installed on every machine; ASSUMPTION: fallback acceptable).

Logo: horizontal lockup (preferred), single-color navy. ASSUMPTION: logo file still to be exported from the guidelines PDF or supplied.

## A. Admin Builder (screen, desktop)

1. Header: "Treatment Plan Estimate" · patient name field (browser memory only).
2. Line list. "Add service" opens a row: service dropdown (patient-facing names, active services only) → provider dropdown (only providers linked in ProviderServices) → modal Cash / Insurance (disabled option if provider does not accept it) → plan picker (only plans the provider is Credentialed/Pending for, via PayerMap).
3. Rate auto-fills: bundle total for payer x tier, or cash price (provider override first). Frequency: total sessions OR per-week x weeks. Line total.
4. States on a line: OK (mint), Pending credential warning (rose), Out-of-network warning with "switch to cash" (rose), Blocked / no contracted rate (wine, offers cash), Rate unusable ($0, blank, quarantined, quarantined payer) (wine, cannot print).
5. Stale-rate warning on insurance lines (admin only, never printed).
6. Sticky footer: Grand total · "Scheduling plan" (provider · service · how often) · [Print patient copy] [New estimate (clear)].

## B. Patient Copy (print, US Letter, 0.75in margins)

- Logo + "Mental Health Center of America" · info@mentalhealthcenter.com (no street address)
- Patient name · date
- Table: Service · Provider · How often · Per visit · Total (rows never split across pages; header repeats)
- Estimated total (gold rule above)
- No disclaimer line (Phase 0 decision).
- Nothing else: no CPT, add-ons, tiers, payer names, KPIs, credentialing, buttons.
