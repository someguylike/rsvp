# Play RSVP

Static RSVP page for weekly play sessions.

## What it does

- Player name is limited to a fixed roster dropdown.
- Date uses one-tap options for the next Tuesday, Thursday, Friday, and Sunday, plus an optional calendar picker.
- Reserved spots defaults to `1` for the player; increase it to include guests.
- Reserved spots `0` means not going and removes that player/date reservation.
- Submit writes to Google Sheets through Apps Script.
- Dedup key is `Play Date + normalized Player Name`; duplicate submissions update the existing row.
- Existing RSVPs show a confirmation dialog before they are overwritten.
- After submit and when the date changes, the page shows the reserved participant tally for that date.
- `export.html` exports a selected month, then renders clickable group heatmap and player-filtered overview.
- `billing.html` renders monthly billing from attendance, editable court blocks, birdie purchases, and local payment statuses.
- `admin.html` lets an admin edit the current month attendance in a player-by-date table.
- `roster.html` lets an admin add, remove, and update roster Venmo and Messenger details.

## Recommended Hosting

Use GitHub Pages for the static website and Google Apps Script as the free backend that writes to Google Sheets.

GitHub Pages can host `index.html`, `styles.css`, and `app.js` for free, but it cannot safely store Google credentials or update a private Sheet by itself. Apps Script fills that backend role and runs as the Google account that owns the Sheet.

## Repo Layout

- `index.html`, `app.js`, `styles.css`: public RSVP page.
- `admin.html`, `admin.js`: admin page for editing player/date attendance counts.
- `roster.html`, `roster.js`: admin page for roster membership, Venmo, and Messenger details.
- `export.html`, `export.js`: admin page for monthly roster export.
- `billing.html`, `billing.js`: billing page for court block entry, birdie cost entry, and member balance calculation.
- `payment.html`, `balances.js`, `balances-core.js`: Payment page with monthly balances, paid-month history, and one Venmo action per amount due.
- `billing-parser.js`: parsers for finalized monthly billing CSVs and CourtReserve transaction/reservation exports.
- `vendor/jszip.min.js`: MIT-licensed JSZip browser build used to read XLSX files locally.
- `google-apps-script/Code.gs`: Apps Script backend source. Paste this into Apps Script and deploy it as the Web App backend.

## Google Sheets Setup

1. Create or open the Google Sheet that should store RSVPs.
2. In the Sheet, open `Extensions > Apps Script`.
3. Paste the contents of `google-apps-script/Code.gs`.
4. Deploy with `Deploy > New deployment > Web app`.
5. Set `Execute as` to yourself.
6. Set `Who has access` to the people who should RSVP. If players are outside your Google Workspace, use `Anyone`.
7. Copy the Web App URL.
8. In `app.js`, set:

```js
const APPS_SCRIPT_URL = "YOUR_WEB_APP_URL";
```

Also set the same Web App URL in `export.js`.

The fixed player roster lives in two places and must stay in sync:

- `app.js`: client-side searchable player list.
- `google-apps-script/Code.gs`: server-side roster validation and export columns.

## GitHub Pages Setup

1. Create a GitHub repository.
2. Put the site files at the repository root.
3. Commit and push.
4. In GitHub, open `Settings > Pages`.
5. Under `Build and deployment`, select `Deploy from a branch`.
6. Choose the main branch and `/root`.
7. Open the published GitHub Pages URL.

## Install And Continue Development

```bash
git clone https://github.com/someguylike/rsvp.git
cd rsvp
```

This is a static site. No package install is required. Open `index.html` directly, or run a tiny local server:

```bash
python3 -m http.server 8000
```

Then open:

- RSVP page: `http://localhost:8000/`
- Admin add page: `http://localhost:8000/admin.html`
- Roster management page: `http://localhost:8000/roster.html`
- Export page: `http://localhost:8000/export.html`
- Billing page: `http://localhost:8000/billing.html`
- Browser tests: `http://localhost:8000/tests/rsvp-rules.test.html`
- Billing parser tests: `http://localhost:8000/tests/billing-parser.test.html`

Development workflow:

1. Edit `index.html`, `app.js`, `admin.html`, `admin.js`, `roster.html`, `roster.js`, `export.html`, `export.js`, or `styles.css`.
2. If frontend assets change, bump the query string on the referenced JS/CSS file in the HTML to avoid stale GitHub Pages/browser cache.
3. If backend behavior changes, edit `google-apps-script/Code.gs`.
4. Paste the full `Code.gs` into Apps Script.
5. Deploy a **New version** of the Apps Script Web App.
6. Commit and push changes to `main`.

```bash
git status
git add .
git commit -m "Describe the change"
git push
```

GitHub Pages will publish from `main` after a short delay.

## Apps Script Backend Notes

The backend source is intentionally checked into this public repo.

- `google-apps-script/rsvp-web-app/Code.gs`: small public RSVP backend for `index.html` only.
- `google-apps-script/Code.gs`: full admin backend for roster, report, billing, backfill, and admin tools.

The public RSVP backend keeps each date's tally in Apps Script cache for 45
seconds. Public RSVP writes replace that cached tally immediately. The browser
shows a clearly labeled local snapshot while it refreshes, refreshes the
selected date every 30 seconds while visible, and refreshes immediately when a
hidden tab becomes visible again. Direct Sheet edits and edits through the
separate admin backend can take up to one cache window plus the next browser
refresh to appear.

Use two Apps Script Web App deployments so the hot RSVP form does not cold-start the larger Billing/export/admin backend.

Full admin backend deployment is manual:

1. Open the RSVP Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Replace `Code.gs` with the repo version.
4. Click Save.
5. Go to `Deploy > Manage deployments`.
6. Edit the Web App deployment.
7. Select **New version**.
8. Deploy.

The Admin page checks both Apps Script deployments against the versions expected
by the website. When deployment-relevant backend code changes, bump
`ADMIN_BACKEND_VERSION` or `RSVP_BACKEND_VERSION` in the corresponding
`Code.gs`, then update the matching expected version in `deployment-health.js`.
The warning clears only after the new Apps Script versions are deployed.

The full admin backend Web App URL must stay in:

- `admin-auth.js`
- `admin.js`
- `backfill-finalized.js`
- `billing.js`
- `export.js`
- `roster.js`

The dedicated RSVP backend Web App URL must stay in `app.js` and in
`roster.js` as `RSVP_PUBLIC_APPS_SCRIPT_URL`.

RSVP backend deployment is also manual:

1. Open the same RSVP Google Sheet.
2. Create a separate Apps Script project for the RSVP Web App, or open the existing RSVP-only project if it already exists.
3. Replace its `Code.gs` with `google-apps-script/rsvp-web-app/Code.gs`.
4. If the project is standalone, set script property `RSVP_SPREADSHEET_ID` to the RSVP Google Sheet ID.
5. Click Save.
6. Deploy it as a Web App with the same access settings as the current public backend.
7. Copy the RSVP Web App URL into `app.js` as `APPS_SCRIPT_URL`.
8. Bump the `app.js` query string in `index.html`.
9. Commit and push the URL/cachebuster change.

## Production Reset

Before launching for real use, clear testing RSVP rows from the Google Sheet:

1. Open the RSVP Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Replace `Code.gs` with the repo version and save.
4. In the function dropdown, choose `resetRsvpDataForProduction`.
5. Click Run.
6. Deploy a **New version** of the Web App.

This removes all rows below the `RSVPs` header and removes old extra columns.

## Admin Export

Open `export.html`, choose a month, and click `Export Month`. After export, the page shows a shareable month URL like `export.html?month=2026-06`; opening that URL renders the saved export tab when it is current, or a live preview if the saved tab is missing current RSVP dates.

The export writes to the spreadsheet ID configured in `google-apps-script/Code.gs` as `EXPORT_SPREADSHEET_ID`.

Each export recreates the selected month tab as a clean attendance table. It does not copy existing formatting or formulas.

Output format:

- Tab name: `Month YYYY`, for example `March 2026`.
- Row 1: `Name` plus play dates with at least 4 participants.
- Rows: one row per player.
- Cell value: blank when not joining, otherwise the total reserved spots for that player.

## CourtReserve Court Fee Import

The Billing page imports a booker's CourtReserve **All Transactions** XLSX:

1. Export all transactions from CourtReserve Billing.
2. In Billing, open **Court Fees > Import CourtReserve transactions** and upload the XLSX.
3. Optionally attach an Active-reservations screenshot or HTML/XML export as an audit.
4. Review the reconciled rows, then import the selected court blocks.

The importer uses the reservation `Date/Time` as the play date, not the transaction date. Each active `Fee` row becomes one booking; `Payment` and `Payment (AC)` rows verify settlement without doubling the cost. Full refunds remove canceled charges, exact refunds can remove individual courts from a multi-court time block, and partial refunds, unpaid balances, payment mismatches, unknown payers, and existing overlapping blocks are left unselected for review. Identical fee rows at the same location and time remain separate booking rows.

An HTML/XML reservation audit compares active reservation counts and court labels automatically. A screenshot is displayed beside the preview for manual checking. If the normal browser save omits rendered bookings, drag the **Save CourtReserve HTML** link from the import panel to the bookmarks bar once and use it from the filtered CourtReserve page.

Transaction groups use stable IDs, so importing the same export again updates or flags existing rows instead of silently duplicating fees.

Canceled court blocks never contribute to the active court total or member balances and are hidden from the court table by default. **Show canceled** exposes them when an admin needs to restore or permanently delete one; permanent deletion also removes its row from `Billing Court Blocks` and refreshes any open finalized-month snapshot.

Billing includes only play dates with at least four total RSVP spots. Dates
below that threshold remain visible as excluded audit rows, contribute no court
or birdie charge, and cannot receive or restore an active court block. A month
cannot be finalized while it contains an active court block on an excluded date.

## Birdie Inventory Credits

The purchaser receives credit for the full inventory purchase in its reimbursement month, defaulting to the purchase month when no reimbursement date is recorded. Tube usage is charged to players in the month the tubes are used, without allocating those later usage charges back to individual inventory purchases. Historical finalized imports retain their existing aggregate credit until an individual purchase receives an explicit reimbursement date; the calculation then replaces that purchase's matching legacy credit instead of counting it twice.

Each inventory purchase has a **Reimburse** action. The reimbursement date defaults to the final day of the purchase month; the admin can replace it with the actual date before saving or change it later. The date, purchase amount, and admin are recorded in `Billing Birdie Purchases` (`Reimbursed Date`, `Reimbursed Amount`, and `Reimbursed By`). The purchaser credit follows the reimbursement month, so moving an April purchase's reimbursement into May removes that credit from April and adds it to May. Purchases without a recorded reimbursement date retain the purchase-month default. **Undo** clears the reimbursement record and returns the credit to the purchase month.

## Payment Page Cache

Finalizing a billing month writes one derived balance row per member to the `Billing Member Balances` sheet. These rows are a rebuildable cache; attendance, court blocks, birdie records, adjustments, and payment statuses remain the source data. Editing an unpaid finalized month automatically rebuilds its snapshot. Changing it back to Draft removes the snapshot. Once every attendee is marked Paid, the retained snapshot is left unchanged unless the month is reopened for payment or the backfill is run explicitly.

The status lifecycle is deterministic: **Finalized → Draft** deletes that month's rows from `Billing Member Balances`, so the Payment page calculates the draft from source data; **Draft → Finalized** recreates all member snapshot rows from the current source data.

After deploying this backend change, run `backfillBillingMemberBalanceSnapshots` once from the Apps Script editor to create snapshots for existing finalized months. A calculation-version change also requires running that function again. Until every finalized month has a current snapshot, the Payment page safely falls back to loading and calculating the original monthly data.

The Payment page loads open finalized balances with one backend request, merges current payment statuses, and displays those precomputed amounts immediately. Past draft months then load from their source records in parallel and appear as each calculation finishes. Globally paid-off months are excluded. Paid snapshots remain in the sheet for audit/history but are not recalculated or returned during normal payment loading. The browser also displays its previously saved result immediately while refreshing.

Meta/Messenger in-app browsers use the Apps Script JSONP path directly so they do not wait for a fetch attempt that those browsers commonly block. In Messenger, Venmo actions use a direct app link with a visible payment-website fallback; other browsers retain the normal HTTPS Venmo payment link.

## Notes From Tool Research

- Google Forms is append-first. It does not natively upsert by `player + date`.
- Tally/Jotform can create nicer forms and sync to Sheets, but true dedupe/update still needs automation.
- Team tools like BenchApp handle RSVP per player/event well, but they are not Sheets-first.
- A custom static page plus Apps Script is the simplest free path that preserves your exact UX and Google Sheet ownership.
