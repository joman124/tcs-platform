# MHCA Treatment Plan Estimator

An administrator builds a patient's treatment-plan cost estimate, then prints a clean patient copy (weekly, monthly and full-plan cost).

- **Engine** (`src/engine`): pricing and rules, pure TypeScript. See `docs/engine.md`.
- **Data** (`src/data`): reads the provider directory workbook and, for rates and cash prices, the Billing Fee Schedule from SharePoint through Microsoft Graph (server-side, read-only, 5-minute cache plus a "Refresh data" button), and writes de-identified log rows to a SharePoint list.
- **App** (`app`, `components`): Next.js. Microsoft sign-in restricted to the MHCA tenant.
- **Decisions and assumptions**: `DECISIONS.md`.
- **Session handoff** (status, open items, issues, where things live): `docs/HANDOFF.md`.

## Privacy

The estimate (including the patient name) lives only in browser memory. Nothing is saved to localStorage, cookies, IndexedDB or the server, and a reload, a new tab or 15 idle minutes start blank. After printing, only de-identified line figures (service, provider, payer, amounts, no name, no free text) are sent to the log, and the server rejects any other field. A custom line's typed description prints on the patient copy but is logged only as service `CUSTOM`.

## Setup

**Step-by-step, copy-paste guide: [`docs/SETUP-CHECKLIST.md`](docs/SETUP-CHECKLIST.md)** (Graph Explorer requests with the known IDs filled in, the message for the MHCA admin, and the Vercel variables). Then verify with [`docs/phase5-checklist.md`](docs/phase5-checklist.md). In short:

1. Register an Entra app in the MHCA tenant (single tenant). Add the redirect URI `https://<domain>/api/auth/callback/microsoft-entra-id`.
2. Grant it application permission **Sites.Selected**, then give it **read** on the site holding the directory workbook and **write** on the site holding the log list (admin consent).
3. Upload `MHCA-Provider-Directory.xlsx` to SharePoint and find its drive id and item id.
4. Create the log list from `docs/estimate-log-list.json` (see `docs/estimate-log-sharepoint.md`).
5. Set the variables in `.env.example` in Vercel (Production and Preview).

## Develop and test

```
npm install
npm test            # unit tests (engine, workbook loader, log validation)
npm run typecheck
npm run build && npm run e2e   # browser tests against a build in demo mode (needs Chromium; UPDATE_SAMPLE=1 also rewrites docs/samples/sample-patient-copy.pdf)
DEMO_MODE=1 AUTH_SECRET=x npm run dev   # demo data, no sign-in
```

Demo mode serves invented data with a "SAMPLE DATA" watermark and turns itself off when real settings are present.
