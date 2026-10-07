// End-to-end checks against a production build in demo mode (invented data). Run: npm run build && npm run e2e
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const PORT = 3111;
const BASE = `http://localhost:${PORT}`;
// The committed sample (docs/samples) is only rewritten on request, so a test run leaves the working tree clean.
const SAMPLE_PDF = process.env.UPDATE_SAMPLE === '1' ? 'docs/samples/sample-patient-copy.pdf' : join(tmpdir(), 'mhca-sample-patient-copy.pdf');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`); };

try { await fetch(BASE); console.error(`Port ${PORT} is already in use; stop the other server first.`); process.exit(2); } catch {}
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { env: { ...process.env, DEMO_MODE: '1', AUTH_SECRET: 'local-test-secret' }, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} };
process.on('exit', stop);
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const newPage = async (ctxOpts = {}) => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...ctxOpts }); const page = await ctx.newPage(); return { ctx, page }; };

/** Add a line through the dialog. pay: 'cash' or a plan name. */
async function addLine(page, { service, provider, pay, mode = 'week', a = '1', b = '4' }) {
  await page.click('#add-service');
  await page.selectOption('#svc', { label: service });
  await page.selectOption('#prov', { label: provider });
  if (pay === 'cash') await page.click('#pay-cash');
  else { await page.click('#pay-ins'); await page.click(`button[role=radio]:has-text("${pay}")`); }
  if (await page.locator('#f1').count()) {
    if (mode === 'total') { await page.click('button:has-text("Total sessions")'); }
    await page.fill('#f1', a); await page.fill('#f2', b);
  }
}
const confirmAdd = async (page) => { await page.click('#add-confirm'); await page.waitForSelector('#add-confirm', { state: 'detached' }); };
const rowCount = (page) => page.locator('tr[data-testid=line]').count();
const lineTotal = async (page, i) => (await page.locator('tr[data-testid=line]').nth(i).locator('td').nth(5).innerText()).trim();
const printText = async (page) => { await page.emulateMedia({ media: 'print' }); const t = await page.locator('.print-only').innerText(); await page.emulateMedia({ media: 'screen' }); return t; };

try {
  // 1. Cash-only provider
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.click('#add-service'); await page.selectOption('#svc', { label: 'Individual Counseling' }); await page.selectOption('#prov', { label: 'Chris Cash, MA' });
    ok('cash-only provider: insurance option disabled', await page.locator('#pay-ins').isDisabled());
    await page.click('#pay-cash'); await page.fill('#f1', '1'); await page.fill('#f2', '4');
    ok('cash-only provider: $95 x 4 weeks = $380.00', (await page.locator('#line-total').innerText()) === '$380.00');
    await ctx.close(); }

  // 2. Insurance-only provider
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.click('#add-service'); await page.selectOption('#svc', { label: 'Medication Management' }); await page.selectOption('#prov', { label: 'Pat Prescriber, PA' });
    ok('insurance-only provider: cash option disabled', await page.locator('#pay-cash').isDisabled());
    await page.click('#pay-ins'); await page.click('button[role=radio]:has-text("Aetna Commercial")');
    ok('insurance-only provider: contracted rate shown ($83.65)', (await page.locator('#rate-value').innerText()) === '$83.65');
    await ctx.close(); }

  // 3. LPC + Medicare blocked
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await addLine(page, { service: 'Individual Counseling', provider: 'Casey Counselor, LPC', pay: 'Medicare Part B' });
    ok('LPC + Medicare: blocked with message', (await page.locator('[role=alert]').first().innerText()).includes('cannot bill Medicare'));
    ok('LPC + Medicare: cannot be added', await page.locator('#add-confirm').isDisabled());
    await ctx.close(); }

  // 3b. quarantined payer for a PsyD, out-of-network switch to cash
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await addLine(page, { service: 'Individual Counseling', provider: 'Dana Doctoral, PsyD', pay: 'Medicare Part B' });
    ok('Medicare on hold for PsyD too', (await page.locator('[role=alert]').first().innerText()).includes('on hold'));
    await page.click('button[role=radio]:has-text("Aetna Focus HMO")');
    ok('out-of-network: offers switch to cash', await page.locator('button:has-text("Switch to cash pay")').isVisible());
    await page.click('button:has-text("Switch to cash pay")');
    ok('out-of-network: switch to cash prices at $250', (await page.locator('#rate-value').innerText()) === '$250.00');
    await ctx.close(); }

  // 4 + 5 + 6. PsyD vs LPC rates, testing bundle, one service split across two providers, cost views
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.fill('#patient', 'Test Patient');
    await addLine(page, { service: 'Individual Counseling', provider: 'Dana Doctoral, PsyD', pay: 'Aetna Commercial Plans', a: '1', b: '12' }); await confirmAdd(page);
    await addLine(page, { service: 'Individual Counseling', provider: 'Casey Counselor, LPC', pay: 'Aetna Commercial Plans', a: '1', b: '12' }); await confirmAdd(page);
    ok('PsyD vs LPC same service + payer: different rates', (await lineTotal(page, 0)) === '$1,653.00' && (await lineTotal(page, 1)) === '$1,239.72', `${await lineTotal(page, 0)} / ${await lineTotal(page, 1)}`);
    ok('one service split across two providers: two lines', (await rowCount(page)) === 2);
    await addLine(page, { service: 'ADHD Evaluation', provider: 'Dana Doctoral, PsyD', pay: 'Aetna Commercial Plans', mode: 'total', a: '1', b: '' }); await confirmAdd(page);
    ok('testing bundle total from rate rows ($875.03)', (await lineTotal(page, 2)) === '$875.03', await lineTotal(page, 2));
    // cost views: weekly = 137.75 + 103.31 = 241.06 (ADHD is one time); monthly = 241.06*52/12 = 1044.60; full = 1653.00+1239.72+875.03
    const view = async (v) => { await page.click(`button[data-view=${v}]`); return (await page.locator('#view-total').innerText()).trim(); };
    ok('cost view: weekly', (await view('weekly')) === '$241.06');
    ok('cost view: monthly', (await view('monthly')) === '$1,044.59' || (await view('monthly')) === '$1,044.60');
    ok('cost view: full plan', (await view('plan')) === '$3,767.75');
    const t = await printText(page);
    ok('patient copy shows weekly, monthly and full plan', /Per week/.test(t) && /Per month/.test(t) && /Full treatment plan/.test(t));
    ok('weekly/monthly are labeled as repeating visits when a one-time service is present', /repeating visits/.test(t));
    ok('patient copy omits CPT, payer, status and admin words', !/Aetna|9\d{4}|Credential|Ready|Blocked|Medicare|PsyD|LPC|Insurance/.test(t), t);
    ok('patient copy has contact line and no street address', t.includes('info@mentalhealthcenter.com') && !/\d{3,5} [A-Z][a-z]+ (St|Street|Ave|Avenue|Rd|Road|Blvd|Dr)\b/.test(t));
    ok('patient copy has patient name and date', t.includes('Test Patient') && /20\d\d/.test(t));
    await ctx.close(); }

  // 7. Page break with 12 lines + sample PDF
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.fill('#patient', 'Sample Patient');
    const specs = [
      ['Individual Counseling', 'Dana Doctoral, PsyD', 'Aetna Commercial Plans'], ['Individual Counseling', 'Casey Counselor, LPC', 'Aetna Commercial Plans'],
      ['Couples Counseling', 'Sam Second, LCSW', 'cash'], ['Group Counseling', 'Chris Cash, MA', 'cash'], ['Medication Management', 'Pat Prescriber, PA', 'Aetna Commercial Plans'],
      ['ADHD Evaluation', 'Dana Doctoral, PsyD', 'cash'],
    ];
    for (let k = 0; k < 5; k++) for (const [service, provider, pay] of specs) {
      if (service === 'Couples Counseling' && provider.startsWith('Sam')) { await addLine(page, { service, provider, pay: 'cash', a: '1', b: '8' }); }
      else await addLine(page, { service, provider, pay, a: '1', b: '6' });
      if (service === 'ADHD Evaluation') { await page.click('button:has-text("Total sessions")'); await page.fill('#f1', '1'); await page.fill('#f2', ''); }
      await confirmAdd(page);
    }
    ok('30 lines added', (await rowCount(page)) === 30);
    mkdirSync(dirname(SAMPLE_PDF), { recursive: true });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    writeFileSync(SAMPLE_PDF, pdf);
    const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [SAMPLE_PDF]).toString())[1]);
    ok('30-line estimate spans more than one US Letter page', pages >= 2, `pages=${pages}`);
    const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(execFileSync('pdfinfo', [SAMPLE_PDF]).toString());
    ok('PDF page size is US Letter (612 x 792 pt)', Math.abs(Number(size[1]) - 612) < 2 && Math.abs(Number(size[2]) - 792) < 2, size?.[0]);
    // no row split across pages: every row that starts on a page (service name at the left) has its amounts on the same line of the same page
    const bbox = execFileSync('pdftotext', ['-bbox', SAMPLE_PDF, '-']).toString();
    let split = false, headers = 0, rowsSeen = 0;
    for (const pg of bbox.split('<page ').slice(1)) {
      const words = [...pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]*)<\/word>/g)].map((m) => ({ x: +m[1], y: +m[2], t: m[3] }));
      headers += words.filter((w) => w.t === 'visit' || w.t === 'Per').length ? 1 : 0;
      for (const w of words.filter((w) => w.x < 120 && /^(Individual|Couples|Group|Medication|ADHD)$/.test(w.t))) {
        rowsSeen++;
        if (!words.some((v) => Math.abs(v.y - w.y) < 8 && v.x > 440 && v.t.startsWith('$'))) split = true;
      }
    }
    ok('no table row is split across pages', !split && rowsSeen >= 30, `rows seen=${rowsSeen}`);
    ok('table header repeats on every page', headers >= pages, `headers=${headers} pages=${pages}`);
    ok('demo output carries a SAMPLE DATA watermark', (await printText(page)).includes('SAMPLE DATA'));
    await ctx.close(); }

  // 8. Clear flows: after print, New estimate, reload, idle
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.fill('#patient', 'Clear Me');
    await addLine(page, { service: 'Individual Counseling', provider: 'Chris Cash, MA', pay: 'cash' }); await confirmAdd(page);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.getByText('Printed. Clear for the next patient?').waitFor({ timeout: 3000 });
    ok('after print: prompts to clear for next patient', await page.getByText('Printed. Clear for the next patient?').isVisible());
    await page.click('.bar button:has-text("Clear")');
    ok('after print: clearing empties name and lines', (await page.inputValue('#patient')) === '' && (await rowCount(page)) === 0);
    await addLine(page, { service: 'Individual Counseling', provider: 'Chris Cash, MA', pay: 'cash' }); await confirmAdd(page);
    await page.click('button:has-text("New estimate (clear)")');
    ok('new estimate: asks for confirmation first', (await rowCount(page)) === 1 && (await page.getByText('Clear this estimate?').isVisible()));
    await page.click('button:has-text("Yes, clear")');
    ok('new estimate: clears after confirm', (await rowCount(page)) === 0);
    await page.fill('#patient', 'Reload Me');
    await addLine(page, { service: 'Individual Counseling', provider: 'Chris Cash, MA', pay: 'cash' }); await confirmAdd(page);
    const storage = await page.evaluate(async () => ({ ls: localStorage.length, ss: sessionStorage.length, idb: (indexedDB.databases ? (await indexedDB.databases()).length : 0), cookie: document.cookie }));
    ok('nothing stored in localStorage, sessionStorage, IndexedDB or cookies', storage.ls === 0 && storage.ss === 0 && storage.idb === 0 && storage.cookie === '', JSON.stringify(storage));
    await page.reload();
    ok('reload starts blank', (await page.inputValue('#patient')) === '' && (await rowCount(page)) === 0);
    await ctx.close(); }
  { const { ctx, page } = await newPage(); await page.clock.install(); await page.goto(BASE);
    await page.fill('#patient', 'Idle Patient');
    await addLine(page, { service: 'Individual Counseling', provider: 'Chris Cash, MA', pay: 'cash' }); await confirmAdd(page);
    await page.clock.fastForward('16:00');
    ok('idle for 15 minutes clears the estimate', (await rowCount(page)) === 0 && (await page.getByText('cleared after 15 minutes').isVisible()));
    await ctx.close(); }

  // 9. Two admins at once, and no patient name leaves the browser
  { const A = await newPage(), B = await newPage();
    const sent = [];
    for (const { page } of [A, B]) page.on('request', (r) => { if (r.method() !== 'GET') sent.push(r.postData() ?? ''); });
    await A.page.goto(BASE); await B.page.goto(BASE);
    await A.page.fill('#patient', 'Alpha Patient'); await B.page.fill('#patient', 'Bravo Patient');
    await addLine(A.page, { service: 'Individual Counseling', provider: 'Chris Cash, MA', pay: 'cash' }); await confirmAdd(A.page);
    await addLine(B.page, { service: 'Medication Management', provider: 'Pat Prescriber, PA', pay: 'Aetna Commercial Plans' }); await confirmAdd(B.page);
    ok('two admins at once stay independent', (await rowCount(A.page)) === 1 && (await rowCount(B.page)) === 1 && (await A.page.inputValue('#patient')) === 'Alpha Patient' && (await B.page.inputValue('#patient')) === 'Bravo Patient');
    ok('no patient name in any request body', !sent.some((b) => /Alpha|Bravo/.test(b)));
    const rejected = await A.page.evaluate(async () => (await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: [{ estimateId: 'x', date: '2026-10-03', serviceId: 'S-IND-M', providerId: 'D03', paymentType: 'cash', payer: '', perVisitCents: 9500, sessions: 1, totalCents: 9500, estimateFullPlanCents: 9500, patientName: 'Alpha Patient' }] }) })).status);
    ok('server rejects a log row that carries a patient name', rejected === 400, String(rejected));
    const cleanRow = await A.page.evaluate(async () => (await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: [{ estimateId: 'x', date: '2026-10-03', serviceId: 'S-IND-M', providerId: 'D03', paymentType: 'cash', payer: '', perVisitCents: 9500, sessions: 1, totalCents: 9500, estimateFullPlanCents: 9500 }] }) })).json());
    ok('server accepts a clean de-identified row (logging off in demo)', cleanRow.logged === false);
    await A.ctx.close(); await B.ctx.close(); }

  // 10. Postdoc bills under supervisor; blocked payer
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.click('#add-service'); await page.selectOption('#svc', { label: 'Individual Counseling' }); await page.selectOption('#prov', { label: 'Dr. Resident, Postdoc' });
    const plans = await page.locator('#pay-ins').click().then(() => page.locator('button[role=radio]').allInnerTexts());
    ok('postdoc plan list excludes Medicare and UHC', !plans.some((t) => /Medicare|UMR/.test(t)) && plans.some((t) => /Aetna Commercial/.test(t)), plans.join('|'));
    await page.click('button[role=radio]:has-text("Aetna Commercial")');
    ok('postdoc insurance uses the supervisor PsyD rate ($137.75)', (await page.locator('#rate-value').innerText()) === '$137.75');
    await page.click('#pay-cash');
    ok('postdoc cash price is $195.00', (await page.locator('#rate-value').innerText()) === '$195.00');
    await ctx.close(); }

  // 12. Edit a line after it has been added
  const row = (page, i) => page.locator('tr[data-testid=line]').nth(i);
  const editRow = async (page, i) => { await row(page, i).getByRole('button', { name: /^Edit / }).click(); await page.waitForSelector('[role=dialog][aria-label="Edit service"]'); };
  const saveEdit = async (page) => { await page.click('#save-confirm'); await page.waitForSelector('#save-confirm', { state: 'detached' }); };
  const rowText = async (page, i) => (await row(page, i).innerText()).replace(/\s+/g, ' ');
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.fill('#patient', 'Edit Patient');
    await addLine(page, { service: 'Individual Counseling', provider: 'Casey Counselor, LPC', pay: 'Aetna Commercial Plans', a: '1', b: '4' }); await confirmAdd(page);
    ok('edit: each row has an Edit button next to Remove', (await page.locator('button[aria-label="Edit Individual Counseling"]').count()) === 1 && (await page.locator('button[aria-label="Remove Individual Counseling"]').count()) === 1);
    await editRow(page, 0);
    const prefilled = { svc: await page.inputValue('#svc'), prov: await page.inputValue('#prov'), ins: await page.getAttribute('#pay-ins', 'aria-pressed'), plan: await page.getAttribute('button[role=radio]:has-text("Aetna Commercial Plans")', 'aria-checked'), f1: await page.inputValue('#f1'), f2: await page.inputValue('#f2') };
    ok('edit: dialog is titled "Edit service" with a "Save changes" button', (await page.locator('.modal h2').innerText()) === 'Edit service' && (await page.locator('#save-confirm').innerText()) === 'Save changes');
    ok('edit: service, provider, payment, plan and frequency are prefilled', JSON.stringify(prefilled) === JSON.stringify({ svc: 'Individual Counseling', prov: 'D02', ins: 'true', plan: 'true', f1: '1', f2: '4' }), JSON.stringify(prefilled));
    await page.selectOption('#prov', { label: 'Dana Doctoral, PsyD' });
    ok('edit: changing the provider clears the payment choice', (await page.getAttribute('#pay-ins', 'aria-pressed')) === 'false' && (await page.locator('#save-confirm').isDisabled()));
    await page.click('#pay-ins'); await page.click('button[role=radio]:has-text("Aetna Commercial Plans")');
    await page.fill('#f1', '2'); await page.fill('#f2', '6');
    await saveEdit(page);
    ok('edit: provider and frequency change update the line total ($137.75 x 12 = $1,653.00)', (await rowCount(page)) === 1 && (await lineTotal(page, 0)) === '$1,653.00' && (await rowText(page, 0)).includes('Dana Doctoral'), await rowText(page, 0));
    ok('edit: footer total and scheduling plan follow the edit', (await page.locator('#view-total').innerText()) === '$1,653.00' && (await page.locator('.foot .plan').innerText()).includes('Dana Doctoral · Individual Counseling · 2 times a week for 6 weeks'));
    await page.click('button:has-text("Preview patient copy")');
    const pv = await page.locator('.preview .paper').innerText();
    ok('edit: preview shows the edited line', pv.includes('Dana Doctoral') && pv.includes('2 times a week for 6 weeks') && !pv.includes('Casey'));
    await page.click('.preview-bar button:has-text("Close")');
    const t = await printText(page);
    ok('edit: print copy shows the edited values only', t.includes('Dana Doctoral') && t.includes('2 times a week for 6 weeks') && t.includes('$1,653.00') && !t.includes('Casey') && !t.includes('$413.24'), t);
    // Cancel and Escape change nothing
    await editRow(page, 0); await page.fill('#f1', '3'); await page.click('.dlg-actions button:has-text("Cancel")');
    ok('edit: Cancel leaves the line exactly as it was', (await lineTotal(page, 0)) === '$1,653.00' && (await page.locator('[role=dialog]').count()) === 0);
    await editRow(page, 0); await page.selectOption('#prov', { label: 'Dr. Resident, Postdoc' }); await page.keyboard.press('Escape');
    ok('edit: Escape closes without saving', (await page.locator('[role=dialog]').count()) === 0 && (await rowText(page, 0)).includes('Dana Doctoral') && (await lineTotal(page, 0)) === '$1,653.00');
    // Position among three lines
    await addLine(page, { service: 'Couples Counseling', provider: 'Sam Second, LCSW', pay: 'cash', a: '1', b: '8' }); await confirmAdd(page);
    await addLine(page, { service: 'Group Counseling', provider: 'Chris Cash, MA', pay: 'cash', a: '1', b: '10' }); await confirmAdd(page);
    await editRow(page, 1); await page.fill('#f2', '5'); await saveEdit(page);
    const order = [];
    for (let i = 0; i < 3; i++) order.push((await row(page, i).locator('td').first().innerText()).trim());
    ok('edit: the edited line keeps its position among three lines', order.join('|') === 'Individual Counseling|Couples Counseling|Group Counseling' && (await lineTotal(page, 1)) === '$1,125.00', `${order.join('|')} ${await lineTotal(page, 1)}`);
    await row(page, 2).getByRole('button', { name: /^Remove / }).click();
    ok('edit: Remove still works', (await rowCount(page)) === 2 && !(await page.locator('table[aria-label="Estimate lines"]').innerText()).includes('Group Counseling'));
    await ctx.close(); }

  // 13. "Refresh data" reloads the directory and wipes the estimate (user decision 2026-10-05)
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.fill('#patient', 'Refresh Patient');
    await addLine(page, { service: 'Individual Counseling', provider: 'Chris Cash, MA', pay: 'cash' }); await confirmAdd(page);
    await Promise.all([page.waitForEvent('load'), page.click('button:has-text("Refresh data")')]);
    await page.waitForSelector('#patient');
    ok('refresh data wipes the estimate (name and lines)', (await page.inputValue('#patient')) === '' && (await rowCount(page)) === 0);
    await ctx.close(); }

  // 15. Dialog accessibility: focus in on open, trapped while open, Escape closes, focus back to the trigger
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    const active = () => page.evaluate(() => { const a = document.activeElement; return { id: a?.id ?? '', label: a?.getAttribute('aria-label') ?? '', text: (a?.textContent ?? '').trim().slice(0, 30), inDialog: !!a?.closest('[role=dialog]') }; });
    await page.focus('#add-service'); await page.keyboard.press('Enter');
    await page.waitForSelector('[role=dialog][aria-label="Add service"]');
    ok('a11y: opening Add service moves focus to the first field', (await active()).id === 'svc', JSON.stringify(await active()));
    let trapped = true;
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); if (!(await active()).inDialog) trapped = false; }
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Shift+Tab'); if (!(await active()).inDialog) trapped = false; }
    ok('a11y: Tab and Shift+Tab stay inside the dialog', trapped);
    await page.focus('#kind-directory'); await page.keyboard.press('Shift+Tab');
    ok('a11y: Shift+Tab from the first control (the kind toggle) wraps to the last enabled one (Cancel; Add is disabled until priced)', (await active()).inDialog && (await active()).text === 'Cancel', JSON.stringify(await active()));
    await page.keyboard.press('Escape');
    ok('a11y: Escape closes and focus returns to "+ Add service"', (await page.locator('[role=dialog]').count()) === 0 && (await active()).id === 'add-service', JSON.stringify(await active()));
    await addLine(page, { service: 'Individual Counseling', provider: 'Chris Cash, MA', pay: 'cash' }); await confirmAdd(page);
    await page.locator('button[aria-label="Edit Individual Counseling"]').click();
    ok('a11y: opening Edit moves focus into the dialog', (await active()).inDialog && (await active()).id === 'svc');
    await page.fill('#f2', '6'); await page.click('#save-confirm');
    ok('a11y: after Save, focus returns to the row\'s Edit button', (await active()).label === 'Edit Individual Counseling', JSON.stringify(await active()));
    await page.click('button:has-text("Preview patient copy")');
    ok('a11y: opening the preview moves focus into it', (await active()).inDialog);
    let pTrapped = true;
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); if (!(await active()).inDialog) pTrapped = false; }
    ok('a11y: focus is trapped in the preview', pTrapped);
    await page.keyboard.press('Escape');
    ok('a11y: Escape closes the preview and focus returns to its button', (await page.locator('[role=dialog]').count()) === 0 && (await active()).text === 'Preview patient copy', JSON.stringify(await active()));
    await ctx.close(); }

  // 17. Every service on the Services tab is offered, even when switched off in the workbook (DECISIONS #32)
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.click('#add-service');
    const options = await page.locator('#svc option').allInnerTexts();
    ok('service picker: a switched-off service with an insurance rate is offered (TMS)', options.includes('TMS Session'), options.join('|'));
    ok('service picker: a switched-off service with no price is listed too (IOP)', options.includes('Intensive Outpatient Program'));
    await page.selectOption('#svc', { label: 'TMS Session' }); await page.selectOption('#prov', { label: 'Dana Doctoral, PsyD' });
    await page.click('#pay-ins'); await page.click('button[role=radio]:has-text("Aetna Commercial")');
    ok('service picker: the switched-off billable service prices from its insurance rate ($210.50)', (await page.locator('#rate-value').innerText()) === '$210.50');
    await page.selectOption('#svc', { label: 'Intensive Outpatient Program' }); await page.selectOption('#prov', { label: 'Dana Doctoral, PsyD' }); await page.click('#pay-cash');
    ok('service picker: a service with no price says why it cannot be priced, and cannot be added', (await page.getByText('Cash price is $0, blank, or unparsed').isVisible()) && (await page.locator('#add-confirm').isDisabled()));
    await ctx.close(); }

  // 18. Custom service: the admin types the description and price per visit; provider optional (user request 2026-10-06)
  { const { ctx, page } = await newPage(); await page.goto(BASE);
    await page.fill('#patient', 'Custom Patient');
    await addLine(page, { service: 'Individual Counseling', provider: 'Chris Cash, MA', pay: 'cash' }); await confirmAdd(page); // $95 x 4 = $380
    await page.click('#add-service'); await page.click('#kind-custom');
    ok('custom: Add stays off until a description and a price are entered', await page.locator('#add-confirm').isDisabled());
    await page.fill('#custom-desc', 'Lab work (invented)'); await page.fill('#custom-price', 'abc');
    ok('custom: a price that is not an amount is explained and cannot be added', (await page.getByText('Enter an amount such as 45 or 45.50.').isVisible()) && (await page.locator('#add-confirm').isDisabled()));
    await page.fill('#custom-price', '0');
    ok('custom: a $0 price is blocked', (await page.getByText('Enter a price per visit greater than $0.').isVisible()) && (await page.locator('#add-confirm').isDisabled()));
    await page.fill('#custom-price', '45');
    await page.click('button:has-text("Total sessions")'); await page.fill('#f1', '1'); await page.fill('#f2', '');
    ok('custom: rate and line total come from the typed price ($45.00)', (await page.locator('#rate-value').innerText()) === '$45.00' && (await page.locator('#line-total').innerText()) === '$45.00');
    await confirmAdd(page);
    const custRow = page.locator('tr[data-testid=line]').nth(1);
    const cells = await custRow.locator('td').allInnerTexts();
    ok('custom: the row shows the description, no provider and "Custom price"', cells[0] === 'Lab work (invented)' && cells[1].trim() === '—' && cells[2] === 'Custom price' && cells[4] === '$45.00', cells.join('|'));
    ok('custom: added to the full plan ($380 + $45 = $425.00)', (await page.locator('#view-total').innerText()) === '$425.00');
    // Edit: prefilled, then change the price, add a provider and make it weekly
    await page.locator('button[aria-label="Edit Lab work (invented)"]').click();
    ok('custom edit: focus starts in the description', await page.evaluate(() => document.activeElement?.id === 'custom-desc'));
    ok('custom edit: opens on Custom service with the description and price filled in', (await page.locator('#kind-custom').getAttribute('aria-pressed')) === 'true' && (await page.inputValue('#custom-desc')) === 'Lab work (invented)' && (await page.inputValue('#custom-price')) === '45.00');
    await page.fill('#custom-desc', 'Home visit (invented)'); await page.fill('#custom-price', '120.50');
    await page.selectOption('#custom-prov', { label: 'Dana Doctoral, PsyD' });
    await page.click('button:has-text("Per week × weeks")'); await page.fill('#f1', '1'); await page.fill('#f2', '2');
    await page.click('#save-confirm');
    const edited = await page.locator('tr[data-testid=line]').nth(1).locator('td').allInnerTexts();
    ok('custom edit: saved in place with the provider and the new price', (await rowCount(page)) === 2 && edited[0] === 'Home visit (invented)' && edited[1].startsWith('Dana Doctoral') && edited[4] === '$120.50' && edited[5] === '$241.00', edited.join('|'));
    ok('custom edit: full plan updated ($380 + $241 = $621.00)', (await page.locator('#view-total').innerText()) === '$621.00');
    const sheet = await printText(page);
    ok('custom: the patient copy lists the description, provider and amounts', sheet.includes('Home visit (invented)') && sheet.includes('$120.50') && sheet.includes('$241.00') && sheet.includes('$621.00'));
    ok('custom: printing is allowed', await page.locator('#print').isEnabled());
    // A directory line can still be added after a custom one, and the toggle switches back.
    await page.click('#add-service'); await page.click('#kind-custom'); await page.click('#kind-directory');
    ok('custom: switching back shows the directory pickers', (await page.locator('#svc').isVisible()) && (await page.locator('#custom-desc').count()) === 0);
    await page.keyboard.press('Escape');
    // Log gate: a custom row is accepted as service CUSTOM; the description can never be sent in its place.
    const post = (row) => page.evaluate(async (r) => (await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: [r] }) })).status, row);
    const base = { estimateId: 'x', date: '2026-10-06', serviceId: 'CUSTOM', providerId: '', paymentType: 'custom', payer: '', perVisitCents: 4500, sessions: 1, totalCents: 4500, estimateFullPlanCents: 4500 };
    ok('custom log row: accepted by the server (service CUSTOM, no provider, no payer)', (await post(base)) === 200);
    ok('custom log row: the description in place of the service id is rejected', (await post({ ...base, serviceId: 'Lab work (invented)' })) === 400);
    await ctx.close(); }

  // 14. The diagnostics page does not exist in demo mode (no sign-in there)
  { const r = await fetch(`${BASE}/diagnostics`, { redirect: 'manual' });
    ok('diagnostics: not found in demo mode', r.status === 404, String(r.status));
    const ret = await fetch(`${BASE}/api/log-retention`, { redirect: 'manual', headers: { authorization: 'Bearer anything' } });
    ok('log retention: does nothing in demo mode (404)', ret.status === 404, String(ret.status)); }

  // 11. Outside demo mode every page and API route requires an MHCA sign-in
  { const port2 = PORT + 1;
    const prod = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port2)], { env: { ...process.env, DEMO_MODE: '', AUTH_SECRET: 'local-test-secret', AZURE_TENANT_ID: '00000000-0000-0000-0000-000000000000', AZURE_CLIENT_ID: 'client-id-for-e2e', AZURE_CLIENT_SECRET: 'secret-value-for-e2e', DIRECTORY_DRIVE_ID: '', DIRECTORY_ITEM_ID: '', LOG_SITE_ID: '', LOG_LIST_ID: '' }, stdio: 'ignore', detached: true });
    for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${port2}/api/auth/providers`); break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
    const page = await fetch(`http://localhost:${port2}/`, { redirect: 'manual' });
    ok('signed-out visitors are redirected to Microsoft sign-in', page.status >= 300 && page.status < 400 && (page.headers.get('location') ?? '').includes('/api/auth/signin'), `${page.status} ${page.headers.get('location')}`);
    const log = await fetch(`http://localhost:${port2}/api/log`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json' }, body: '{"rows":[]}' });
    ok('log endpoint is not reachable signed out', log.status !== 200 && log.status !== 400);
    const refresh = await fetch(`http://localhost:${port2}/api/refresh`, { method: 'POST', redirect: 'manual' });
    ok('refresh endpoint is not reachable signed out', refresh.status !== 200);
    const providers = await (await fetch(`http://localhost:${port2}/api/auth/providers`)).json();
    ok('only the Microsoft Entra provider is offered', Object.keys(providers).join() === 'microsoft-entra-id', Object.keys(providers).join());
    const ret = await fetch(`http://localhost:${port2}/api/log-retention`, { redirect: 'manual' });
    ok('log retention: off by default (404, no sign-in redirect for the cron route)', ret.status === 404, String(ret.status));
    const diag = await fetch(`http://localhost:${port2}/diagnostics`, { redirect: 'manual' });
    ok('diagnostics: signed-out visitors are redirected to sign-in', diag.status >= 300 && diag.status < 400 && (diag.headers.get('location') ?? '').includes('/api/auth/signin'), `${diag.status} ${diag.headers.get('location')}`);
    // Signed in (a session minted with this server's test secret). No directory IDs are set, so nothing goes to the network.
    const session = await encode({ token: { name: 'Test Admin', email: 'admin@example.test', sub: 'test-admin' }, secret: 'local-test-secret', salt: 'authjs.session-token' });
    const signedIn = await fetch(`http://localhost:${port2}/diagnostics`, { redirect: 'manual', headers: { cookie: `authjs.session-token=${session}` } });
    const html = await signedIn.text();
    ok('diagnostics: signed in, lists settings by name and which are missing', signedIn.status === 200 && html.includes('AZURE_CLIENT_SECRET') && html.includes('DIRECTORY_ITEM_ID') && /Missing/.test(html) && /Present/.test(html), String(signedIn.status));
    ok('diagnostics: never shows a setting value', !html.includes('secret-value-for-e2e') && !html.includes('local-test-secret') && !html.includes('client-id-for-e2e'));
    try { process.kill(-prod.pid, 'SIGTERM'); } catch {} }

  // 16. A deployment with no settings at all (production before setup): a plain "not set up" page, never a 500
  { const port3 = PORT + 2;
    const bare = { ...process.env, DEMO_MODE: '' };
    for (const k of ['AUTH_SECRET', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'DIRECTORY_DRIVE_ID', 'DIRECTORY_ITEM_ID', 'LOG_SITE_ID', 'LOG_LIST_ID']) delete bare[k];
    const unset = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port3)], { env: bare, stdio: 'ignore', detached: true });
    try {
      for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${port3}/`); break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
      const codes = {};
      for (const p of ['/', '/diagnostics', '/api/auth/providers', '/api/auth/signin', '/api/log', '/api/refresh']) codes[p] = (await fetch(`http://localhost:${port3}${p}`, { redirect: 'manual', method: p === '/api/log' || p === '/api/refresh' ? 'POST' : 'GET' })).status;
      ok('no settings: every page and API answers 503, none 500', Object.values(codes).every((c) => c === 503), JSON.stringify(codes));
      const page = await (await fetch(`http://localhost:${port3}/`)).text();
      ok('no settings: the page says setup is unfinished and names no setting', page.includes('Estimator is not set up yet') && !/AUTH_SECRET|AZURE_|DIRECTORY_/.test(page));
    } finally { try { process.kill(-unset.pid, 'SIGTERM'); } catch {} } }
} finally {
  await browser.close(); stop();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
