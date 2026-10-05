# Setup checklist: connecting the estimator to real MHCA data

Work through these in order. Every request below is ready to paste into **Graph Explorer** (https://developer.microsoft.com/graph/graph-explorer), signed in with your MHCA account. Each step says exactly which value to copy from the response.

**Never paste a secret into a chat, an email or this repo.** Secrets are the Entra client secret and `AUTH_SECRET`. They go straight into Vercel. Site, drive, item and list IDs are identifiers, not secrets.

> **Graph Explorer permissions.** Before the first request, open **Modify permissions** in Graph Explorer and consent to `Sites.Read.All` (for the GET requests). Step 4 also needs `Sites.Manage.All`. If Graph Explorer says an admin must consent, send the step to the MHCA admin instead.
>
> In each request, replace only the parts in `<ANGLE BRACKETS>` with a value you copied earlier. Everything else is filled in already.

---

## 1. Decide where the workbook and log list live

**Recommended: a small dedicated SharePoint site** (for example "MHCA Estimator") that holds only `MHCA-Provider-Directory.xlsx` and the estimate log list.

Why:
- The app's access is granted **per site** (`Sites.Selected`). Whatever site holds the workbook, the app can read *all* of it.
- The CorporateDrive site also holds files with patient names (caseload and candidate lists). Putting the workbook there would give the app access to those files.
- A dedicated site keeps the grant to two files, makes it easy to limit who sees the log (billing leadership), and makes the 12-month retention simple to manage.

**Ask the MHCA admin (copy and send):**

> Please create a SharePoint team site named "MHCA Estimator" (private; members: me and billing leadership). It will hold only the provider directory workbook and a de-identified estimate log list for the Treatment Plan Estimator app. Please send me its web address once it exists.

If you decide to stay on CorporateDrive instead, use the CorporateDrive variants marked **(CorporateDrive)** below.

## 2. Find the site ID

**2a. Your SharePoint host name.** Run:

```
GET https://graph.microsoft.com/v1.0/drives/b!XkYzqW_YEkW5_2R3Md-UIzQYp9g0Zg1Ipi2h88AzMTDQZnSHUZG-QK0zkkpP20pA/root?$select=webUrl,parentReference
```

Copy the host name from `webUrl`: the part between `https://` and the next `/` (it ends in `.sharepoint.com`). Call it `<HOST>`.

**2b. The new site's ID.** The site's web address looks like `https://<HOST>/sites/<SITE-PATH>`. Run:

```
GET https://graph.microsoft.com/v1.0/sites/<HOST>:/sites/<SITE-PATH>?$select=id,displayName,webUrl
```

Copy `id` (three parts separated by commas: host name, then two long IDs). This is the **site ID**. Call it `<SITE-ID>`.

**(CorporateDrive)** The `parentReference.siteId` in the 2a response is the CorporateDrive site ID. If the response has no `siteId`, take `<SITE-PATH>` from its `webUrl` (the part after `/sites/` up to the next `/`) and run 2b.

## 3. Upload the workbook and find its IDs

1. **Make sure it is the latest build.** It must have a `Services` tab whose column N is headed **"Allowed tiers"**. Older copies price counseling wrongly; the app now refuses to load them and names the missing column. If unsure, ask for the latest file to be re-sent.
2. **Renumber the Fee Schedule rows by −3 (once).** The workbook's row numbers came from the Phase 1 read, which counted 3 rows too many (decided 2026-10-05; see `docs/fee-schedule-sync.md`). Subtract 3 from the numbers in these four columns, and nothing else:

   | Tab | Column |
   |---|---|
   | `FeeRates` | Visit row |
   | `ServiceComponents` | Visit row (Fee Schedule parent row) |
   | `Services` | Cash price row (Fee Schedule) |
   | `CashPrices` | Fee Schedule row |

   In Excel, for each column:
   1. Type `-3` in any empty cell outside the tables and copy it (Ctrl+C).
   2. Click the **first number** under the column header, then press **Ctrl+Shift+Down** to select down to the last filled cell. **Select only filled cells:** Excel turns a selected blank cell into −3. If the column has gaps, do each filled block separately.
   3. Right-click → **Paste Special** → Paste: **Values**, Operation: **Add** → OK.

   Then delete the `-3` helper cell and check:
   - In `FeeRates`, the first **Interview** (90791) row's Visit row now reads **5** (it read 8 before).
   - In each of the four columns, no cell reads −3 or less, and none of the other columns changed.

   The `FeeRates` "Source cell" text (e.g. `N25`) is only a note for people; the app does not read it, and the Fee Schedule sync rewrites it later. Leave it.
3. Open it once in Excel (desktop or web) and confirm no cell shows an error. Save.
4. Upload `MHCA-Provider-Directory.xlsx` to the new site's **Documents** library (top level), using the browser.

**3a. Drive ID** (the Documents library):

```
GET https://graph.microsoft.com/v1.0/sites/<SITE-ID>/drive?$select=id,name,webUrl
```

Copy `id` (starts with `b!`). This is **`DIRECTORY_DRIVE_ID`**.

**3b. Item ID** (the workbook):

```
GET https://graph.microsoft.com/v1.0/drives/<DIRECTORY_DRIVE_ID>/root:/MHCA-Provider-Directory.xlsx?$select=id,name,lastModifiedDateTime
```

Copy `id` (starts with `01`). This is **`DIRECTORY_ITEM_ID`**. If you put the file in a folder, use `root:/<Folder>/MHCA-Provider-Directory.xlsx`.

**(CorporateDrive)** The drive ID is already known: `b!XkYzqW_YEkW5_2R3Md-UIzQYp9g0Zg1Ipi2h88AzMTDQZnSHUZG-QK0zkkpP20pA`. For the item ID run:

```
GET https://graph.microsoft.com/v1.0/drives/b!XkYzqW_YEkW5_2R3Md-UIzQYp9g0Zg1Ipi2h88AzMTDQZnSHUZG-QK0zkkpP20pA/root:/Admin/Claude/TCS-creator/MHCA-Provider-Directory.xlsx?$select=id,name,lastModifiedDateTime
```

**3c. Check the build** (optional but quick):

```
GET https://graph.microsoft.com/v1.0/drives/<DIRECTORY_DRIVE_ID>/items/<DIRECTORY_ITEM_ID>/workbook/worksheets('Services')/range(address='N1')?$select=values
```

**Expected:** `values` contains text starting with "Allowed tiers". If it is empty or different, the uploaded copy is out of date.

> The copy in your personal OneDrive (drive `b!nlQsWChhb0u7Okr2aJHS7dpHN_y5RrBEqk_XYLQLvh32pBsOT1piS7JST3Bi-s2-`, item `01QUYAHRNQ2ZGYGXMELRBYJ5M45GSKWVBU`) was for testing only. Do not point the app at it.

## 4. Create the estimate log list

Needs `Sites.Manage.All` consent in Graph Explorer (or ask the admin to run it). Set the method to **POST** and paste this body:

```
POST https://graph.microsoft.com/v1.0/sites/<SITE-ID>/lists
```

```json
{
  "displayName": "Estimate Log (de-identified)",
  "description": "One row per priced estimate line. No patient identifiers. Written by the estimator app only.",
  "list": { "template": "genericList" },
  "columns": [
    { "name": "EstimateId", "text": {}, "indexed": true },
    { "name": "EstimateDate", "dateTime": { "format": "dateOnly" }, "indexed": true },
    { "name": "ServiceId", "text": {} },
    { "name": "ProviderId", "text": {} },
    { "name": "PaymentType", "choice": { "choices": ["cash", "insurance"], "displayAs": "dropDownMenu" } },
    { "name": "Payer", "text": {} },
    { "name": "PerVisit", "number": { "decimalPlaces": "two", "minimum": 0 } },
    { "name": "Sessions", "number": { "decimalPlaces": "none", "minimum": 1 } },
    { "name": "LineTotal", "number": { "decimalPlaces": "two", "minimum": 0 } },
    { "name": "EstimateFullPlanTotal", "number": { "decimalPlaces": "two", "minimum": 0 } }
  ]
}
```

(The same body is in `docs/estimate-log-list.json`.)

From the response copy `id` (a GUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). This is **`LOG_LIST_ID`**. **`LOG_SITE_ID`** is the `<SITE-ID>` from step 2b.

Then, in the browser: open the list → **Settings** (gear) → **List settings** → **Permissions for this list** → **Stop inheriting permissions** → remove everyone except billing leadership. Rows are kept 12 months (see `DECISIONS.md`).

## 5. Entra app and site access (MHCA admin)

You said an MHCA admin already gave consent; this step confirms exactly what is needed. **Send the admin this message, word for word, after filling in the site web address:**

> Hello, for the MHCA Treatment Plan Estimator app, please:
>
> 1. In Microsoft Entra admin center → App registrations, check (or create) an app named **"MHCA Treatment Plan Estimator"**: supported account types **"Accounts in this organizational directory only"** (single tenant); platform **Web**; redirect URI **`https://mhca-estimator.vercel.app/api/auth/callback/microsoft-entra-id`**.
> 2. Under **API permissions**, add Microsoft Graph **Application** permission **`Sites.Selected`** (and keep the default delegated `User.Read`), then **Grant admin consent for MHCA**. Please do not add `Sites.Read.All` or `Sites.ReadWrite.All`: the app should reach only the sites granted below.
> 3. Grant the app access to the **"MHCA Estimator"** site (`<site web address>`) with the **write** role (it reads the directory workbook and adds rows to the estimate log list there). Graph request, run as an admin with `Sites.FullControl.All`:
>
>    `POST https://graph.microsoft.com/v1.0/sites/<SITE-ID>/permissions`
>
>    ```json
>    { "roles": ["write"], "grantedToIdentities": [{ "application": { "id": "<APPLICATION (CLIENT) ID>", "displayName": "MHCA Treatment Plan Estimator" } }] }
>    ```
>
>    or in PnP PowerShell: `Grant-PnPAzureADAppSitePermission -AppId <APPLICATION (CLIENT) ID> -DisplayName "MHCA Treatment Plan Estimator" -Site <site web address> -Permissions Write` (newer PnP versions call it `Grant-PnPEntraIDAppSitePermission`)
> 4. Optional, for the Fee Schedule price check: **read** on the Billing Department site, the same way with `"roles": ["read"]`.
> 5. Create a **client secret** (Certificates & secrets) and give it to me in person or through our password manager, not by email or chat. Please tell me its expiry date.
>
> Thank you.

**(CorporateDrive or two sites)** If the workbook and the log list are on different sites, ask for **read** on the workbook's site and **write** on the log list's site instead.

Find the Billing site ID for item 4 with:

```
GET https://graph.microsoft.com/v1.0/drives/b!5tnb6bLSWU2cr0Fyqdme8sr-r_CXXlJCv_nIcpkR8cYC3SF8On0DTaP4Asyu0SBf/root?$select=webUrl,parentReference
```

and copy `parentReference.siteId` (if it is missing, take the site path from `webUrl` and use the request in step 2b).

**Check the grants afterwards:**

```
GET https://graph.microsoft.com/v1.0/sites/<SITE-ID>/permissions
```

**Expected:** an entry whose `grantedToIdentitiesV2` names "MHCA Treatment Plan Estimator" with role `write`.

**Tenant ID** (if you do not have it from the app's Overview page):

```
GET https://graph.microsoft.com/v1.0/organization?$select=id,displayName
```

Copy `id`. This is **`AZURE_TENANT_ID`**.

## 6. Vercel environment variables

In Vercel: team **joman124's projects** → project **mhca-estimator** → **Settings** → **Environment Variables**. Add each one for **Production**. Tick **Sensitive** for the two secrets.

| Name | Where it comes from |
|---|---|
| `AZURE_TENANT_ID` | Entra app Overview, "Directory (tenant) ID" (or step 5) |
| `AZURE_CLIENT_ID` | Entra app Overview, "Application (client) ID" |
| `AZURE_CLIENT_SECRET` | The client secret **value** (Sensitive). Paste it directly from the admin's handover; nowhere else |
| `AUTH_SECRET` | A new random string (Sensitive). Generate one on your computer with `openssl rand -base64 32` |
| `DIRECTORY_DRIVE_ID` | Step 3a |
| `DIRECTORY_ITEM_ID` | Step 3b |
| `LOG_SITE_ID` | Step 2b |
| `LOG_LIST_ID` | Step 4 |

Notes:
- Leave the existing Preview variable `DEMO_MODE=1` alone. Demo mode turns itself off wherever the real settings exist.
- After the variables are saved, a deployment is needed for them to take effect. Once the overnight PR's `vercel.json` is merged, `main` no longer deploys to production automatically: production changes only when you approve a release and someone redeploys deliberately (Vercel → Deployments → the latest `main` deployment → **Redeploy**, target Production).
- Sign-in only works on `https://mhca-estimator.vercel.app` (the registered redirect URI), not on preview URLs.

## 7. Check it

1. Open `https://mhca-estimator.vercel.app/diagnostics` and sign in. Every required setting should say **Present**, the workbook **OK** with a row count per tab, the log list **OK**.
2. Then run `docs/phase5-checklist.md` from the top.

## 8. Send these back (names only)

Reply with this list filled in. **Do not include any secret or ID value**; "set" or "not yet" is enough.

- Site chosen: dedicated "MHCA Estimator" site, or CorporateDrive
- Workbook uploaded, and the step 3c check shows "Allowed tiers": yes / no
- Fee Schedule rows renumbered by −3 (first Interview visit row reads 5): yes / no
- Excel opened, no errors: yes / no
- Log list created and permissions limited to billing leadership: yes / no
- Admin confirmed: app is single tenant with the redirect URI; `Sites.Selected` with admin consent; **write** on the estimator site (or read/write on the two sites); optional read on Billing; secret expiry date
- Vercel Production variables set (one line each): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AUTH_SECRET`, `DIRECTORY_DRIVE_ID`, `DIRECTORY_ITEM_ID`, `LOG_SITE_ID`, `LOG_LIST_ID`
- `/diagnostics` result: the Settings, Directory workbook, Estimate log list and Loaded data lines (OK / Problem, and any message shown)
- Small answers: spelling of **Denish** Gusich; first names of Dr. Lee, Dr. Nine and Dr. Arbuckle-Washington; logo file (when available)
