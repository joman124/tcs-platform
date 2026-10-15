import type { EngineData } from '../engine/types';

/**
 * DEMO DATA. Invented providers, plans and prices for local development and automated tests.
 * Only used when DEMO_MODE=1. Never present demo output to a patient.
 */
export const demoData: EngineData = {
  providers: [
    { id: 'D01', name: 'Doctoral, Dana', credential: 'PsyD', status: 'Active', accepts: 'Both' },
    { id: 'D02', name: 'Counselor, Casey', credential: 'LPC', status: 'Active', accepts: 'Both' },
    { id: 'D03', name: 'Cash, Chris', credential: 'MA', status: 'Active', accepts: 'Cash' },
    { id: 'D04', name: 'Prescriber, Pat', credential: 'PA', status: 'Active', accepts: 'Insurance' },
    { id: 'D05', name: 'Resident, Dr.', credential: 'Postdoc', status: 'Active', accepts: 'Both', billsUnder: 'D01', excludedPayers: ['Medicare', 'UHC/Optum/UMR'] },
    { id: 'D06', name: 'Second, Sam', credential: 'LCSW', status: 'Active', accepts: 'Both' },
    { id: 'D07', name: 'Former, Frankie', credential: 'PsyD', status: 'Inactive', accepts: 'Both' },
  ],
  providerServices: [
    ...['D01', 'D05'].flatMap((p) => [{ providerId: p, serviceId: 'S-IND-D', ...(p === 'D05' ? { cashOverride: 195 } : {}) }, { providerId: p, serviceId: 'S-ADHD' }, { providerId: p, serviceId: 'S-GRP' }]),
    { providerId: 'D01', serviceId: 'S-CPL' },
    { providerId: 'D02', serviceId: 'S-IND-M' },
    { providerId: 'D02', serviceId: 'S-CPL' },
    { providerId: 'D02', serviceId: 'S-GRP' },
    { providerId: 'D03', serviceId: 'S-IND-M', cashOverride: 95 },
    { providerId: 'D03', serviceId: 'S-GRP' },
    { providerId: 'D04', serviceId: 'S-MM' },
    { providerId: 'D06', serviceId: 'S-IND-M' },
    { providerId: 'D06', serviceId: 'S-CPL' },
    { providerId: 'D07', serviceId: 'S-IND-D' },
    { providerId: 'D01', serviceId: 'S-TMS' },
    { providerId: 'D01', serviceId: 'S-IOP' },
  ],
  services: [
    { id: 'S-IND-M', codes: '90837', name: 'Individual Counseling', active: true, perSession: true, cashPrice: 195, cashStatus: 'ok', allowedTiers: ['T2'] },
    { id: 'S-IND-D', codes: '90837', name: 'Individual Counseling', active: true, perSession: true, cashPrice: 250, cashStatus: 'ok', allowedTiers: ['T1'] },
    { id: 'S-CPL', codes: '90847', name: 'Couples Counseling', active: true, perSession: true, cashPrice: 225, cashStatus: 'ok' },
    { id: 'S-GRP', codes: '90853', name: 'Group Counseling', active: true, perSession: true, cashPrice: 80, cashStatus: 'ok' },
    { id: 'S-MM', codes: '99214', name: 'Medication Management', active: true, perSession: true, cashPrice: 175, cashStatus: 'ok' },
    { id: 'S-ADHD', codes: '90791, 96130', name: 'ADHD Evaluation', active: true, perSession: false, cashPrice: 1800, cashStatus: 'ok' },
    // Switched off in the workbook; still offered (every service on the tab is). TMS has an insurance rate; IOP has no price at all.
    { id: 'S-TMS', codes: '90867', name: 'TMS Session', active: false, perSession: true, cashPrice: 300, cashStatus: 'ok' },
    { id: 'S-IOP', codes: 'S9480', name: 'Intensive Outpatient Program', active: false, perSession: false, cashPrice: null, cashStatus: 'blank' },
  ],
  rates: [
    { serviceId: 'S-IND-M', payer: 'Aetna', tier: 'T2', total: 103.31, status: 'OK' },
    { serviceId: 'S-IND-D', payer: 'Aetna', tier: 'T1', total: 137.75, status: 'OK' },
    { serviceId: 'S-IND-M', payer: 'Cigna', tier: 'T2', total: 110.3, status: 'OK' },
    { serviceId: 'S-IND-D', payer: 'Cigna', tier: 'T1', total: 147.07, status: 'OK' },
    { serviceId: 'S-IND-M', payer: 'Medicare', tier: 'T2', total: 113.12, status: 'Payer quarantined' },
    { serviceId: 'S-IND-D', payer: 'Medicare', tier: 'T1', total: 139.79, status: 'Payer quarantined' },
    { serviceId: 'S-CPL', payer: 'Aetna', tier: 'T1', total: 104.01, status: 'OK' },
    { serviceId: 'S-CPL', payer: 'Aetna', tier: 'T2', total: 92.4, status: 'OK' },
    { serviceId: 'S-GRP', payer: 'Aetna', tier: 'T1', total: 27.49, status: 'OK' },
    { serviceId: 'S-MM', payer: 'Aetna', tier: 'T2', total: 83.65, status: 'OK' },
    { serviceId: 'S-ADHD', payer: 'Aetna', tier: 'T1', total: 875.03, status: 'OK' },
    { serviceId: 'S-ADHD', payer: 'Aetna', tier: 'T2', total: 0, status: 'No contracted rate - offer cash' },
    { serviceId: 'S-TMS', payer: 'Aetna', tier: 'T1', total: 210.5, status: 'OK' },
  ],
  credentialing: [
    { providerId: 'D01', payer: 'Aetna', status: 'Credentialed' },
    { providerId: 'D01', payer: 'Cigna', status: 'Credentialed' },
    { providerId: 'D01', payer: 'Medicare', status: 'Credentialed' },
    { providerId: 'D01', payer: 'UHC/Optum/UMR', status: 'Credentialed' },
    { providerId: 'D02', payer: 'Aetna', status: 'Credentialed' },
    { providerId: 'D02', payer: 'Medicare', status: 'Credentialed' },
    { providerId: 'D04', payer: 'Aetna', status: 'Credentialed' },
    { providerId: 'D06', payer: 'Aetna', status: 'Pending' },
  ],
  planMap: [
    { subPlan: 'Aetna Commercial Plans', parentPayer: 'Aetna', network: 'In' },
    { subPlan: 'Aetna Focus HMO', parentPayer: 'Aetna', network: 'Out' },
    { subPlan: 'Cigna Local Plans', parentPayer: 'Cigna', network: 'In' },
    { subPlan: 'Medicare Part B', parentPayer: 'Medicare', network: 'In' },
    { subPlan: 'UMR', parentPayer: 'UHC/Optum/UMR', network: 'In' },
  ],
  payers: [
    { payer: 'Aetna', quarantined: false, stale: false },
    { payer: 'Cigna', quarantined: false, stale: true },
    { payer: 'Medicare', quarantined: true, stale: true },
    { payer: 'UHC/Optum/UMR', quarantined: false, stale: false },
  ],
};

/**
 * DEMO benefits sheet: invented patients for trying the benefits lookup. Dates of birth are Excel serial numbers, as the
 * real sheet's usually are (29221 = 1980-01-01).
 */
export const demoBenefitsSheet: unknown[][] = [
  ['Patient Name', 'DOB', 'Insurance', 'Co-Pay', 'Deductible', 'Deductible Remaining', 'Co-Insurance', 'Out of Pocket', 'Out of Pocket Remaining'],
  ['Test, Jane', 29221, 'Aetna', 30, 1500, 400, 0.2, 5000, 3200],
  ['Sample, Sam', '7/4/1975', 'Cigna', '$0.00', '$500.00', '$0.00', '10%', '$3,000.00', '$1,250.00'],
];
