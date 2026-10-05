import { describe, expect, it, vi } from 'vitest';
import { parseWorkbook, type Sheets } from '../src/data/workbook';
import {
  colIndex,
  colLetter,
  FEE_RATES_HEADER,
  FeeScheduleLayoutError,
  parseAddress,
  syncFeeSchedule,
  toCashPricesSheet,
  toFeeRatesSheet,
  type Cell,
} from '../src/sync/feeSchedule';
import { diffFeeRates, formatDiffReport, readCurrentFeeRates, runFeeScheduleDiff } from '../src/sync/feeScheduleDiff';
import { feeScheduleSheet, sheetRow } from './feeScheduleFixture';
import { sheets as directory } from './workbookSheets';

const run = (values: Cell[][] = feeScheduleSheet(), opts = {}) => syncFeeSchedule(values, opts);
const cell = (source: string) => run().feeRates.find((r) => r.source === source);

describe('column helpers', () => {
  it('round-trips letters and indexes', () => {
    for (const l of ['A', 'H', 'N', 'Z', 'AA', 'AQ', 'BK', 'BU']) expect(colLetter(colIndex(l))).toBe(l);
    expect(colIndex('A')).toBe(0);
    expect(colIndex('AB')).toBe(27);
  });
  it('reads the top-left of a usedRange address', () => {
    expect(parseAddress("'Fee Schedule'!A1:BU160")).toEqual({ startRow: 1, startCol: 0 });
    expect(parseAddress('Sheet1!$C$5:$Z$9')).toEqual({ startRow: 5, startCol: 2 });
    expect(() => parseAddress('nonsense')).toThrow();
  });
});

describe('syncFeeSchedule: layout', () => {
  it('finds the header and tier rows and every payer at its configured columns', () => {
    const { report } = run();
    expect([report.headerRow, report.firstDataRow]).toEqual([1, 4]);
    expect(report.warnings).toEqual([]);
    expect(report.payers.map((p) => `${p.payer} ${p.doctoral}/${p.masters}`)).toEqual([
      'Aetna N/P', 'UHC/Optum/UMR S/U', 'UHC Advantage X/Z', 'Cigna AB/AD', 'BCBS AG/AI', 'Medicare AM/AO', 'Medicare 2020 AP/AQ',
      'ACN/EHN/Intel AS/AT', 'TriWest/Tricare AV/AX', 'AHCCCS AZ/BB', 'AZCH BD/BF', 'Allwell/Ambetter BI/BK',
    ]);
  });

  it('a moved column fails loudly instead of mispricing', () => {
    const v = feeScheduleSheet();
    v[0]![colIndex('N')] = 'UHC / Optum/UMR'; // Aetna's header replaced
    expect(() => run(v)).toThrow(FeeScheduleLayoutError);
    expect(() => run(v)).toThrow(/column N should be the Aetna header but reads "UHC \/ Optum\/UMR"/);
  });

  it('a payer block shifted one column right fails on its tier labels', () => {
    const v = feeScheduleSheet();
    v[2]![colIndex('AD')] = '';
    v[2]![colIndex('AE')] = 'LPC / LCSW NP/PA';
    expect(() => run(v)).toThrow(/Cigna master's column AD should be labelled LPC\/LCSW but reads ""/);
  });

  it('lists every layout problem at once', () => {
    const v = feeScheduleSheet();
    v[0]![colIndex('X')] = 'Something else';
    v[0]![colIndex('H')] = 'Price';
    try {
      run(v);
      throw new Error('expected a throw');
    } catch (e) {
      expect((e as FeeScheduleLayoutError).problems).toHaveLength(2);
    }
  });

  it('a sheet without the header row is rejected', () => {
    expect(() => run([sheetRow({ A: 'Something' })])).toThrow(/no header row/);
  });

  it('finds the misaligned Allwell header by its text, wherever it moves', () => {
    const v = feeScheduleSheet();
    for (const row of v) {
      // shift BI..BK one column right (BI becomes blank)
      row.splice(colIndex('BI'), 0, '');
      row.length = Math.max(row.length, colIndex('BU') + 1);
    }
    const { report, feeRates } = run(v);
    expect(report.payers.find((p) => p.payer === 'Allwell/Ambetter')).toMatchObject({ doctoral: 'BJ', masters: 'BL' });
    expect(report.warnings).toContain('Allwell/Ambetter found in columns BJ/BL, expected BI/BK.');
    expect(feeRates.find((r) => r.payer === 'Allwell/Ambetter' && r.visitRow === 5 && !r.isAddOn && r.tier === 'PhD/PsyD/MD/DO')).toMatchObject({ source: 'BJ5', rate: 161 });
  });

  it('never reads the unlabelled column left of the Allwell block', () => {
    expect(run().feeRates.some((r) => r.source.startsWith('BH'))).toBe(false);
  });

  it('a title line above the header is tolerated, reported, and rows are numbered from the sheet as it is', () => {
    const v = [sheetRow({ A: 'MHCA Fee Schedule (title)' }), ...feeScheduleSheet()];
    const { report, feeRates } = run(v);
    expect([report.headerRow, report.firstDataRow]).toEqual([2, 5]);
    expect(report.warnings.join(' ')).toMatch(/Data starts at row 5, expected 4/);
    expect(feeRates.find((r) => r.cpt === '90791')?.visitRow).toBe(6);
  });

  it('honours the usedRange start row', () => {
    const { feeRates, report } = run(feeScheduleSheet(), { startRow: 10 });
    expect(report.headerRow).toBe(10);
    expect(feeRates.find((r) => r.cpt === '90791')?.source).toBe('N14');
  });
});

describe('syncFeeSchedule: visits and cells', () => {
  it('maps doctoral and master\'s columns to the workbook tier labels', () => {
    expect(cell('N5')).toMatchObject({ visitRow: 5, visitLabel: 'Interview', cpt: '90791', isAddOn: false, payer: 'Aetna', tier: 'PhD/PsyD/MD/DO', rate: 150, status: 'ok' });
    expect(cell('P5')).toMatchObject({ tier: 'LPC/LCSW/NP/PA', rate: 120, status: 'ok' });
    expect(cell('BK5')).toMatchObject({ payer: 'Allwell/Ambetter', rate: 128.8 });
  });

  it('a visit is the parent row plus the "+" rows under it', () => {
    expect(cell('N6')).toMatchObject({ visitRow: 5, cpt: '96130', isAddOn: true, optional: false });
    expect(cell('N8')).toMatchObject({ visitRow: 5, cpt: '99203', isAddOn: true });
  });

  it('"(optional)" add-ons are flagged, so bundles leave them out by default', () => {
    expect(cell('N7')).toMatchObject({ visitRow: 5, optional: true });
    expect(run().report.optionalAddOns).toEqual([{ row: 7, cpt: '96136', visitRow: 5 }]);
  });

  it('add-on rows with a note are included and listed for review', () => {
    expect(run().report.addOnNotes.map((n) => n.row)).toEqual([8, 17, 22]); // row 23 has no CPT, so it is skipped (listed under addOnsWithoutCpt)
  });

  it('text and error cells are unusable; numbers stored as text are unusable unless asked for', () => {
    expect(cell('AD10')).toMatchObject({ status: 'text', rate: null, raw: 'DNB' });
    expect(cell('U10')).toMatchObject({ status: 'error', rate: null });
    expect(cell('Z10')).toMatchObject({ status: 'text', rate: null, raw: '$81.60' });
    expect(run().report.numericText).toEqual([{ source: 'Z10', treatedAs: 'unusable' }]);
    const lenient = run(feeScheduleSheet(), { numericText: 'usable' });
    expect(lenient.feeRates.find((r) => r.source === 'Z10')).toMatchObject({ status: 'ok', rate: 81.6 });
  });

  it('blank and zero cells are unusable', () => {
    const v = feeScheduleSheet();
    v[4]![colIndex('N')] = '';
    v[4]![colIndex('P')] = 0;
    const { feeRates } = run(v);
    expect(feeRates.find((r) => r.source === 'N5')?.status).toBe('blank');
    expect(feeRates.find((r) => r.source === 'P5')?.status).toBe('zero');
  });

  it('quarantines a cell more than 25% from the median for its CPT (same payer and tier)', () => {
    const { report } = run();
    expect(cell('N13')).toMatchObject({ status: 'quarantined', rate: 200 });
    expect(cell('N10')?.status).toBe('ok');
    expect(cell('P13')?.status).toBe('ok'); // the master's cell on the same row is fine
    expect(report.quarantined).toEqual([{ source: 'N13', visitRow: 13, visitLabel: 'Mislabeled row', cpt: '90837', payer: 'Aetna', tier: 'PhD/PsyD/MD/DO', rate: 200, median: 100 }]);
  });

  it('exactly 25% from the median is kept', () => {
    const v = feeScheduleSheet();
    v[12]![colIndex('N')] = 125;
    expect(run(v).report.quarantined).toEqual([]);
  });

  it('Medicare blocks are always ambiguous and never quarantined or usable', () => {
    const { feeRates, report } = run();
    const medicare = feeRates.filter((r) => r.payer.startsWith('Medicare'));
    expect(medicare.length).toBeGreaterThan(0);
    expect(medicare.every((r) => r.status === 'ambiguous')).toBe(true);
    expect(report.quarantined.some((q) => q.payer.startsWith('Medicare'))).toBe(false);
    expect(report.ambiguous).toBe(medicare.length);
  });

  it('non-CPT parent rows have no rate of their own but anchor their "+" rows', () => {
    const { feeRates, report } = run();
    expect(feeRates.some((r) => r.visitRow === 4)).toBe(false);
    expect(report.nonCptParents).toEqual([
      { row: 4, label: 'Package Evaluation (invented)', code: 'PKGXX', addOns: 0 },
      { row: 16, label: 'Consult (invented)', code: 'CONSULT', addOns: 1 },
      { row: 21, label: 'Neurofeedback (invented)', code: '', addOns: 1 },
      { row: 25, label: 'Ketamine visit (invented)', code: 'Inital', addOns: 1 },
    ]);
    expect(cell('N17')).toMatchObject({ visitRow: 16, cpt: '90837', isAddOn: true });
  });

  it('a labelled row with no code anchors the "+" rows under it (Neurofeedback layout)', () => {
    expect(cell('N22')).toMatchObject({ visitRow: 21, visitLabel: 'Neurofeedback (invented)', cpt: '90837', isAddOn: true });
  });

  it('an unlabelled row with a CPT belongs to the visit above it (KAP layout), but not after a note row', () => {
    const { report } = run();
    expect(cell('N26')).toMatchObject({ visitRow: 25, cpt: '90837', isAddOn: true });
    expect(report.unlabelledComponents).toEqual([{ row: 26, cpt: '90837', visitRow: 25 }]);
    expect(report.orphanAddOns).toContainEqual({ row: 28, label: '', cpt: '90832' });
    expect(run().feeRates.some((r) => r.source === 'N28')).toBe(false);
  });

  it('a heading or note row with no code and no "+" rows is not a visit', () => {
    expect(run().cashPrices.some((c) => c.row === 19 || c.row === 27)).toBe(false);
  });

  it('skips "+" rows with no parent or no CPT', () => {
    const { feeRates, report } = run();
    expect(report.orphanAddOns[0]).toEqual({ row: 15, label: '+', cpt: '96131' });
    expect(report.addOnsWithoutCpt).toEqual([{ row: 18, label: '+' }, { row: 23, label: '+ Neurofeedback (30 min)' }]);
    expect(feeRates.some((r) => r.source.endsWith('15') && r.cpt === '96131')).toBe(false);
  });

  it('counts add up', () => {
    const { report, feeRates } = run();
    const r = report;
    expect(r.cells).toBe(feeRates.length);
    expect(r.usable + r.unusable.blank + r.unusable.zero + r.unusable.text + r.unusable.error + r.quarantined.length + r.ambiguous).toBe(r.cells);
    expect(r.visits).toBe(9); // rows 4, 5, 10, 11, 12, 13, 16, 21, 25
  });

  it('cash prices come from column H for every parent row', () => {
    const { cashPrices } = run();
    expect(cashPrices.map((c) => [c.row, c.price, c.status])).toEqual([
      [4, 900, 'ok'], [5, 300, 'ok'], [10, 200, 'ok'], [11, null, 'text'], [12, 0, 'zero'], [13, 250, 'ok'], [16, 100, 'ok'], [21, 180, 'ok'], [25, 500, 'ok'],
    ]);
    expect(toCashPricesSheet(cashPrices)[0]).toEqual(['Fee Schedule row', 'Appointment type', 'Raw cash text (col H)', 'Cash price', 'Status']);
  });
});

describe('FeeRates output feeds the directory loader unchanged', () => {
  it('has the exact FeeRates header and prices a bundle (optional add-on excluded, quarantine blocks)', () => {
    const { feeRates } = run();
    const tab = toFeeRatesSheet(feeRates);
    expect(tab[0]).toEqual([...FEE_RATES_HEADER]);
    const sheets: Sheets = {
      ...directory,
      FeeRates: tab as unknown[][],
      ServiceComponents: [
        ['Service ID', 'Visit row (Fee Schedule parent row)', 'Quantity', 'Include optional add-ons (Y/N)'],
        ['S3', 5, 1, 'N'],
        ['S1', 13, 1, 'N'],
        ['S2', 10, 2, 'N'],
      ],
    };
    const data = parseWorkbook(sheets, new Date('2026-10-03'));
    const rate = (s: string, payer: string, tier: 'T1' | 'T2') => data.rates.find((r) => r.serviceId === s && r.payer === payer && r.tier === tier)!;
    // Interview 150 + 96130 110 + 99203 60 = 320 (the optional 96136 is left out)
    expect(rate('S3', 'Aetna', 'T1')).toMatchObject({ total: 320, status: 'OK' });
    expect(rate('S1', 'Aetna', 'T1').status).toBe('No contracted rate - offer cash'); // row 13's Aetna doctoral cell is quarantined
    expect(rate('S1', 'Aetna', 'T2')).toMatchObject({ total: 80, status: 'OK' });
    expect(rate('S2', 'Cigna', 'T2').status).toBe('No contracted rate - offer cash'); // DNB
    expect(rate('S2', 'Cigna', 'T1')).toMatchObject({ total: 206, status: 'OK' }); // 103 x 2 visits
  });
});

describe('diffFeeRates', () => {
  const synced = () => run().feeRates;
  const asCurrent = (offset = 0) => readCurrentFeeRates(toFeeRatesSheet(synced()).map((r, i) => (i === 0 ? r : [Number(r[0]) + offset, ...r.slice(1)])));

  it('no differences against itself', () => {
    const d = diffFeeRates(asCurrent(), synced());
    expect([d.rowOffset, d.changed.length, d.added.length, d.removed.length]).toEqual([0, 0, 0, 0]);
    expect(d.matched).toBe(synced().length);
  });

  it('reports a changed rate and a newly unusable cell', () => {
    const next = synced().map((r) => (r.source === 'N5' ? { ...r, rate: 155 } : r.source === 'P5' ? { ...r, rate: null, status: 'text' as const } : r));
    const d = diffFeeRates(asCurrent(), next);
    expect(d.changed.map((c) => [c.key, c.before.rate, c.after.rate, c.after.status])).toEqual([
      ['row 5 90791 Aetna PhD/PsyD/MD/DO', 150, 155, 'ok'],
      ['row 5 90791 Aetna LPC/LCSW/NP/PA', 120, null, 'text'],
    ]);
  });

  it('a different reason for an unusable cell is not a change', () => {
    const next = synced().map((r) => (r.source === 'AD10' ? { ...r, status: 'blank' as const, raw: '' } : r));
    expect(diffFeeRates(asCurrent(), next).changed).toEqual([]);
  });

  it('detects a snapshot numbered 3 rows higher than the sheet (the Phase 1 numbering)', () => {
    const d = diffFeeRates(asCurrent(3), synced());
    expect(d.rowOffset).toBe(-3);
    expect(d.rowOffsetDetected).toBe(true);
    expect([d.changed.length, d.added.length, d.removed.length]).toEqual([0, 0, 0]);
    const text = formatDiffReport(run().report, d);
    expect(text).toMatch(/line up with the sheet only when shifted by -3 \(detected\)/);
    expect(text).toContain('The workbook has not been renumbered yet');
  });

  it('any other offset is flagged as unexpected, and none once the workbook is renumbered', () => {
    expect(formatDiffReport(run().report, diffFeeRates(asCurrent(-3), synced()))).toContain('it may have been renumbered twice');
    expect(formatDiffReport(run().report, diffFeeRates(asCurrent(), synced()))).not.toContain('WARNING: the current FeeRates');
  });

  it('a given offset is used as is', () => {
    const d = diffFeeRates(asCurrent(3), synced(), 0);
    expect([d.rowOffset, d.rowOffsetDetected]).toEqual([0, false]);
    expect(d.matched).toBeLessThan(synced().length);
    expect(d.added.length).toBeGreaterThan(0);
    expect(d.removed.length).toBeGreaterThan(0);
  });

  it('reports rows and payers present on only one side', () => {
    const current = asCurrent().filter((r) => !(r.visitRow === 11)).concat([{ visitRow: 99, cpt: '90832', payer: 'Old Payer', tier: 'PhD/PsyD/MD/DO', rate: 50, status: 'ok' }]);
    const d = diffFeeRates(current, synced(), 0);
    expect(d.removed).toEqual(['row 99 90832 Old Payer PhD/PsyD/MD/DO']);
    expect(d.added.every((k) => k.startsWith('row 11 '))).toBe(true);
    expect(d.payersOnlyInCurrent).toEqual(['Old Payer']);
  });

  it('a current tab missing a needed column is rejected', () => {
    expect(() => readCurrentFeeRates([['Visit row', 'Payer']])).toThrow(/no 'Component CPT' column/);
  });

  it('the text report says it is a dry run and lists the review items', () => {
    const text = formatDiffReport(run().report, diffFeeRates(asCurrent(), synced()));
    expect(text).toMatch(/^Fee Schedule sync: dry run\. Nothing was written\./);
    expect(text).toContain('Quarantined (more than 25% from the median for the CPT, same payer and tier): 1');
    expect(text).toContain('N13 row 13 Mislabeled row 90837 Aetna PhD/PsyD/MD/DO: $200.00 vs median $100.00');
    expect(text).toContain('Medicare AM/AO (ambiguous, blocked)');
  });
});

describe('runFeeScheduleDiff (reads injected, nothing written)', () => {
  it('syncs the sheet at its usedRange address and diffs against the current tab', async () => {
    const values = feeScheduleSheet();
    const current = toFeeRatesSheet(syncFeeSchedule(values).feeRates).map((r, i) => (i === 0 ? r : [Number(r[0]) + 3, ...r.slice(1)]));
    const reads = { feeSchedule: vi.fn(async () => ({ address: "'Fee Schedule'!A1:BU28", values })), currentFeeRates: vi.fn(async () => current) };
    const out = await runFeeScheduleDiff(reads);
    expect(reads.feeSchedule).toHaveBeenCalledTimes(1);
    expect(out.diff.rowOffset).toBe(-3);
    expect(out.diff.changed).toEqual([]);
    expect(out.text).toMatch(/dry run\. Nothing was written/);
  });

  it('a moved column stops the run with a layout error', async () => {
    const values = feeScheduleSheet();
    values[0]![colIndex('AG')] = 'Moved';
    await expect(runFeeScheduleDiff({ feeSchedule: async () => ({ address: 'A1:BU28', values }), currentFeeRates: async () => [] })).rejects.toThrow(FeeScheduleLayoutError);
  });
});
