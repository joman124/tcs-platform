# Phase 5: real-data verification checklist

Run this once the Entra app, the directory workbook, the log list and the Vercel variables are in place (`docs/SETUP-CHECKLIST.md`). It is the first time the real Graph read, Entra sign-in and SharePoint log write are exercised. Use a deployment that has the real settings (production, or a preview with real settings on the stable domain; sign-in only works on the redirect URI registered in Entra).

Use an invented patient name such as "Test Patient". Never type a real patient's name during this check.

Tick each box and write down anything that differs from the expected value.

## A. Readiness

1. [ ] Open `https://<domain>/diagnostics` signed out. **Expected:** you are sent to Microsoft sign-in.
2. [ ] Sign in with an MHCA account. **Expected:** the readiness page opens.
   - [ ] Settings: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AUTH_SECRET`, `DIRECTORY_DRIVE_ID`, `DIRECTORY_ITEM_ID` all say **Present**; `LOG_SITE_ID` and `LOG_LIST_ID` say **Present** (logging on). No value is shown anywhere.
   - [ ] Directory workbook: **OK**. Every tab has a row count (none "missing"). Roughly: Providers 35, ProviderServices 126, Services 31. "Parsed with live Fee Schedule rates: … providers, … services (… offered in the picker), … plans" appears with no error. If it says the row numbers are "3 higher", the workbook was not renumbered (setup checklist step 3.2).
   - [ ] Fee Schedule (live rates): **OK**. Header row 1, data from row 4; about 42 visits; no "payers with no Fee Schedule column". If it says the app cannot read the Fee Schedule, the Billing-site read grant is missing (setup checklist step 5).
   - [ ] If it says "This directory workbook is an older build: …", the uploaded copy is out of date (usually no `Services` "Allowed tiers" column). Replace it with the latest build and reload. Do not continue until this is OK.
   - [ ] Estimate log list: **OK** ("Readable (HTTP 200)"). This check only reads.
   - [ ] Loaded data: a time within the last few minutes, source `sharepoint`.
3. [ ] Sign in with an account from another tenant (a personal Microsoft account). **Expected:** sign-in is refused.

## B. Prices (cross-check each against the Fee Schedule)

Rates and cash prices are read live from the Billing Fee Schedule.

0. [ ] Open "+ Add service". **Expected:** the service list holds every service on the workbook's Services tab that is billable to insurance (about 30), including TMS and Treatment Consult, plus any cash-only service switched on in the workbook.

For each line: open the estimator, choose "+ Add service", pick the service and provider, then the payment. Read "Rate per visit" in the dialog.

| # | Service | Provider (any active provider with this credential works) | Payment | Expected per visit |
|---|---|---|---|---|
| 4 | Individual Counseling | A PsyD credentialed with Aetna (e.g. Dr. John Mansoor) | Insurance, an Aetna commercial plan | **$137.75** |
| 5 | Individual Counseling | An LPC credentialed with Aetna (e.g. Glenn Goodrich) | Insurance, the same Aetna plan | **$103.31** |
| 6 | ADHD Evaluation | A PsyD credentialed with Aetna (e.g. Dr. Shasteen) | Insurance, Aetna | **$875.03** (bundle at PsyD tier) |
| 7 | Individual Counseling | Dr. Lee (postdoc) | Cash | **$195.00** |
| 8 | Couples Counseling | Any couples provider | Cash | **$225.00** (not the Fee Schedule's $195) |
| 9 | Individual Counseling | A PsyD credentialed with Medicare | Insurance, Medicare | **Blocked**: "Medicare rates are on hold until the Fee Schedule is confirmed." Cash offered. |
| 10 | Individual Counseling | An LPC | Insurance, Medicare | **Blocked**: LPC providers cannot bill Medicare directly. No cash switch offered. |
| 11 | Individual Counseling | Dr. Lee (postdoc) | Insurance | Plan list has **no Medicare and no UHC/Optum/UMR**; an Aetna plan prices at **$137.75** (Dr. Mansoor's PsyD rate). |
| 12 | Individual Counseling | Autumn Prak or Gentry Tays | Cash | **$95.00**; Insurance is disabled. |

## C. Estimate, editing and print copy

13. [ ] Enter "Test Patient". Add lines 4 (1 per week, 12 weeks), 5 (1 per week, 12 weeks) and 6 (total sessions 1). **Expected:** line totals $1,653.00, $1,239.72, $875.03; Full plan $3,767.75; Per week $241.06; Per month $1,044.59 or $1,044.60.
14. [ ] Choose **Edit** on line 5. **Expected:** the dialog says "Edit service", everything is prefilled. Change weeks to 8 and "Save changes". **Expected:** the line stays second; line total $826.48; Full plan $3,354.51.
15. [ ] Choose **Edit** on a line, change something, then **Cancel**. **Expected:** nothing changed.
16. [ ] "Preview patient copy". **Expected:** the edited values (8 weeks); no CPT codes, plan names, credentials or warnings; weekly, monthly and full-plan figures; "info@mentalhealthcenter.com"; no SAMPLE DATA watermark.
17. [ ] Print (to PDF is fine). **Expected:** US Letter; then "Printed. Clear for the next patient?" appears.

## D. The log (SharePoint list)

18. [ ] Open the log list. **Expected:** exactly **one new row per printed line** (3 rows for step 17), all with the same EstimateId and today's date.
19. [ ] **No patient name in any row** (search the list for "Test Patient": no results). Columns hold only IDs, payment type, payer, amounts and sessions.
20. [ ] The row for line 5 shows the **edited** values (Sessions 8, LineTotal 826.48), not the values from before the edit. Editing before printing logs only the final values.
21. [ ] Choose "Keep", print again without changes. **Expected:** no new rows (an estimate is logged once). Then edit any line and print again. **Expected:** a new set of rows with a new EstimateId.

## E. Clearing

22. [ ] Choose "Clear" after printing. **Expected:** name and lines are gone.
23. [ ] Add a line, reload the page. **Expected:** blank estimate.
24. [ ] Add a line, then choose "Refresh data". **Expected:** the page reloads with fresh directory data and the estimate is wiped (name and lines gone).
25. [ ] Leave an estimate idle for 15 minutes. **Expected:** cleared, with a message.

## Report back

Send the ticked list and any differences (amounts, messages, row counts). Never send screenshots containing patient information or any setting values.
