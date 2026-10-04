# Phase 1 — Fee Schedule review list

Source: Billing Department `MHCA Fee Schedule.xlsx` (modified 2026-10-01), read-only. Nothing in the source was changed.

## Quarantined cells (treated as unparsed/blocked until you fix the source)

| Cell | Visit (parent row label) | CPT | Payer | Tier | Value | Median for CPT |
|---|---|---|---|---|---|---|
| AD51 | row Ketamine Assisted Psychotherapy (KAP) (Troche) | 90837 | Cigna | LPC/LCSW/NP/PA | $82.00 | $59.00 |
| AX121 | row Autism/ADHD Combined (Day 2) | 90837 | TriWest/Tricare | LPC/LCSW/NP/PA | $58.73 | $114.79 |
| AV121 | row Autism/ADHD Combined (Day 2) | 90837 | TriWest/Tricare | PhD/PsyD/MD/DO | $78.30 | $153.05 |
| AT90 | row Neurocognitive Testing | 96131 | ACN/EHN/Intel | LPC/LCSW/NP/PA | $110.58 | $84.97 |
| AS90 | row Neurocognitive Testing | 96131 | ACN/EHN/Intel | PhD/PsyD/MD/DO | $130.10 | $99.96 |
| BB90 | row Neurocognitive Testing | 96131 | AHCCCS | LPC/LCSW/NP/PA | $127.45 | $90.17 |
| BB112 | row Autism Follow up | 96131 | AHCCCS | LPC/LCSW/NP/PA | $127.45 | $90.17 |
| AZ90 | row Neurocognitive Testing | 96131 | AHCCCS | PhD/PsyD/MD/DO | $127.45 | $90.17 |
| AZ112 | row Autism Follow up | 96131 | AHCCCS | PhD/PsyD/MD/DO | $127.45 | $90.17 |
| BF90 | row Neurocognitive Testing | 96131 | AZCH | LPC/LCSW/NP/PA | $121.08 | $85.66 |
| BF112 | row Autism Follow up | 96131 | AZCH | LPC/LCSW/NP/PA | $121.08 | $85.66 |
| BD90 | row Neurocognitive Testing | 96131 | AZCH | PhD/PsyD/MD/DO | $121.08 | $85.66 |
| BD112 | row Autism Follow up | 96131 | AZCH | PhD/PsyD/MD/DO | $121.08 | $85.66 |
| N90 | row Neurocognitive Testing | 96131 | Aetna | PhD/PsyD/MD/DO | $111.40 | $78.88 |
| BK90 | row Neurocognitive Testing | 96131 | Allwell/Ambetter | LPC/LCSW/NP/PA | $89.02 | $63.03 |
| BI90 | row Neurocognitive Testing | 96131 | Allwell/Ambetter | PhD/PsyD/MD/DO | $104.73 | $74.16 |
| AG90 | row Neurocognitive Testing | 96131 | BCBS | PhD/PsyD/MD/DO | $100.70 | $72.04 |
| AB90 | row Neurocognitive Testing | 96131 | Cigna | PhD/PsyD/MD/DO | $119.00 | $91.00 |
| AX90 | row Neurocognitive Testing | 96131 | TriWest/Tricare | LPC/LCSW/NP/PA | $98.64 | $69.84 |
| AV90 | row Neurocognitive Testing | 96131 | TriWest/Tricare | PhD/PsyD/MD/DO | $116.05 | $82.17 |
| X90 | row Neurocognitive Testing | 96131 | UHC Advantage | PhD/PsyD/MD/DO | $114.47 | $80.96 |
| S90 | row Neurocognitive Testing | 96131 | UHC/Optum/UMR | PhD/PsyD/MD/DO | $120.30 | $86.75 |
| AT145 | row MCMI Test - Admin | 96136 | ACN/EHN/Intel | LPC/LCSW/NP/PA | $32.13 | $42.94 |
| AX124 | row Autism/ADHD Combined (Day 2) | 96136 | TriWest/Tricare | LPC/LCSW/NP/PA | $69.84 | $34.06 |
| AV124 | row Autism/ADHD Combined (Day 2) | 96136 | TriWest/Tricare | PhD/PsyD/MD/DO | $82.17 | $40.07 |

Known mislabeled rows: row 90 (labeled 96131, holds 96130 prices); row 112 (AHCCCS/AZCH hold 96130 prices); row 121 (TriWest 90837 holds 90832 prices); row 124 (TriWest 96136 holds 96131 prices).

## Other findings

- `DNB`/`N/A` text in 151 rate cells; `OON`/`INN` in IOP row 154. Estimator offers a cash switch for these.
- `#DIV/0!` in 11 cells, all in the `% of` columns (Q, V, AJ), not rates.
- Medicare block (AL–AQ) is ambiguous; **Medicare is quarantined until Billing confirms which columns are the contracted rate.**
- Allwell/Ambetter columns (BH–BK) are misaligned with their headers.
- Credentialing Dashboard: Bagdade date of hire reads `090/01/26`; several rows lack NPI/status.
- Headers dated 2025 (Medicare 1/9/2025, ACN 4/17/2025, others 7/8/2025): admin stale-rate warning when over 12 months old.
