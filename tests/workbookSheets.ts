import type { Sheets } from '../src/data/workbook';

/** Synthetic workbook shaped like the real directory tabs. */
export const sheets: Sheets = {
  Providers: [
    ['Provider ID', 'Name', 'Credential', 'Credential tier', 'NPI', 'Status', 'Accepts', 'Cash rate override ($, blank = Fee Schedule price)', 'Monthly patient minimum (KPI)', 'Can bill Medicare directly', 'Notes', 'Bills under (Provider ID)', 'Excluded payers (comma-separated Fee Schedule payers)'],
    ['P1', 'Doc, Dana', 'PsyD', '=formula', '', 'Active', 'Both', null, null, '', '', null, null],
    ['P2', 'Resident, Dr.', 'Postdoc', '', '', 'Active', 'Both', null, null, '', '', 'P1', 'Medicare, UHC/Optum/UMR'],
    ['P3', 'New, Nat', null, '', '', 'Active', 'Cash', null, null, '', '', null, null],
    [null, null, null, '=IF(...)', null, null, null, null, null, null, null, null, null],
  ],
  Services: [
    ['Service ID', 'Fee Schedule name', 'Patient-facing name', 'Component CPTs', 'Duration', 'Active in estimator (Y/N)', 'Cash price row (Fee Schedule)', 'Cash price (from Fee Schedule)', 'Cash price status', 'Display mode', 'Notes', 'Per-session service (provider cash override applies) Y/N', 'Cash price override (this workbook only; Fee Schedule is read-only)', 'Allowed tiers (T1 = x; blank = any)'],
    ['S1', 'Ind', 'Individual Counseling', '90837', '1 hr', 'Y', 10, '=f', '=f', 'One line', '', 'Y', null, 'T1'],
    ['S2', 'Couples', 'Couples Counseling', '90847', '1 hr', 'Y', 11, '=f', '=f', 'One line', '', 'Y', 225, null],
    ['S3', 'Eval', 'ADHD Evaluation', '90791', '', 'Y', 12, '=f', '=f', 'One line', '', 'N', null, null],
  ],
  ServiceComponents: [
    ['Service ID', 'Visit row (Fee Schedule parent row)', 'Quantity', 'Include optional add-ons (Y/N)', 'Visit label', 'Component CPTs'],
    ['S1', 20, 1, 'N', 'Ind', ''],
    ['S3', 30, 1, 'N', 'Interview', ''],
    ['S3', 31, 2, 'N', 'Follow up', ''],
  ],
  ProviderServices: [
    ['Provider ID', 'Service ID', 'Provider name (auto)', 'Service (auto)', 'Cash price override ($; blank = service cash price)'],
    ['P1', 'S1', '=f', '=f', null],
    ['P2', 'S1', '=f', '=f', 195],
    ['P1', 'S3', '=f', '=f', null],
    [null, null, '=f', '=f', null],
  ],
  Credentialing: [
    ['Provider ID', 'Provider (auto)', 'Payer (dashboard column)', 'Status (normalized)', 'Effective date', 'Raw text', 'Fee Schedule payer'],
    ['P1', '=f', 'Aetna', 'Pending', null, 'Submitted', 'Aetna'],
    ['P1', '=f', 'Aetna (other)', 'Credentialed', null, 'In network', 'Aetna'],
    ['P1', '=f', 'Cigna', 'Needs review', null, 'x', 'Cigna'],
    ['P1', '=f', 'Lucit', 'Credentialed', null, 'x', ''],
  ],
  PayerMap: [
    ['Sub-plan', 'Parent payer (Fee Schedule)', 'Network', 'Notes'],
    ['Aetna Commercial', 'Aetna', 'In', ''],
    ['Medicare Part B', 'Medicare', 'In', ''],
  ],
  PayerKey: [
    ['Fee Schedule payer', 'Rate header date', 'Stale (>12 months)', 'Quarantined', 'Quarantine reason'],
    ['Aetna', '2026-06-02', '=f', 'N', ''],
    ['Cigna', '2025-01-01', '=f', 'N', ''],
    ['Medicare', 46000, '=f', 'Y', 'hold'],
    ['Unknown', null, '=f', 'N', ''],
  ],
  FeeRates: [
    ['Visit row', 'Visit label', 'Component CPT', 'Is add-on', 'Optional add-on', 'Payer', 'Credential tier', 'Rate', 'Status', 'Raw cell text', 'Source cell'],
    [20, 'Ind', '90837', 'N', 'N', 'Aetna', 'PhD/PsyD/MD/DO', 137.75, 'ok', '$137.75', 'N25'],
    [20, 'Ind', '90837', 'N', 'N', 'Aetna', 'LPC/LCSW/NP/PA', 103.31, 'ok', '$103.31', 'P25'],
    [30, 'Interview', '90791', 'N', 'N', 'Aetna', 'PhD/PsyD/MD/DO', 148.9, 'ok', '', ''],
    [30, 'Interview', '96130', 'Y', 'N', 'Aetna', 'PhD/PsyD/MD/DO', 111.4, 'ok', '', ''],
    [30, 'Interview', '96136', 'Y', 'Y', 'Aetna', 'PhD/PsyD/MD/DO', 38.46, 'ok', '', ''],
    [31, 'Follow up', '90832', 'N', 'N', 'Aetna', 'PhD/PsyD/MD/DO', 70.47, 'ok', '', ''],
    [31, 'Follow up', '96130', 'Y', 'N', 'Aetna', 'PhD/PsyD/MD/DO', null, 'quarantined', '', ''],
    [20, 'Ind', '90837', 'N', 'N', 'Medicare', 'PhD/PsyD/MD/DO', 140, 'ok', '', ''],
  ],
  CashPrices: [
    ['Fee Schedule row', 'Appointment type', 'Raw cash text (col H)', 'Cash price', 'Status'],
    [10, 'Ind', '$250', 250, 'ok'],
    [11, 'Couples', '$195', 195, 'ok'],
    [12, 'Eval', '$1,800', 1800, 'ok'],
  ],
};
