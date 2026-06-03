# Play RSVP

Static RSVP page for weekly play sessions.

## What it does

- Player name is limited to a fixed roster dropdown.
- Date uses one-tap options for the next Tuesday, Thursday, Friday, and Sunday, plus an optional calendar picker.
- Vote defaults to `Yes`.
- A `No` vote removes that player/date RSVP instead of storing a `No` row.
- Guest count defaults to `0`.
- Submit writes to Google Sheets through Apps Script.
- Dedup key is `Play Date + normalized Player Name`; duplicate submissions update the existing row.
- Existing RSVPs show a confirmation dialog before they are overwritten.
- After submit and when the date changes, the page shows the Yes RSVP tally for that date.
- `export.html` exports a selected month, then renders clickable group heatmap and player-filtered overview.

## Recommended Hosting

Use GitHub Pages for the static website and Google Apps Script as the free backend that writes to Google Sheets.

GitHub Pages can host `index.html`, `styles.css`, and `app.js` for free, but it cannot safely store Google credentials or update a private Sheet by itself. Apps Script fills that backend role and runs as the Google account that owns the Sheet.

## Repo Layout

- `index.html`, `app.js`, `styles.css`: public RSVP page.
- `export.html`, `export.js`: admin page for monthly roster export.
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
- Export page: `http://localhost:8000/export.html`

Development workflow:

1. Edit `index.html`, `app.js`, `export.html`, `export.js`, or `styles.css`.
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

The backend source is intentionally checked into this public repo at `google-apps-script/Code.gs`.

Apps Script deployment is manual:

1. Open the RSVP Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Replace `Code.gs` with the repo version.
4. Click Save.
5. Go to `Deploy > Manage deployments`.
6. Edit the Web App deployment.
7. Select **New version**.
8. Deploy.

The Web App URL must stay in both `app.js` and `export.js`.

## Admin Export

Open `export.html`, choose a month, and click `Export Month`. After export, the page shows a shareable month URL like `export.html?month=2026-06`; opening that URL renders the existing exported tab.

The export writes to the spreadsheet ID configured in `google-apps-script/Code.gs` as `EXPORT_SPREADSHEET_ID`.

Each export recreates the selected month tab as a clean attendance table. It does not copy existing formatting or formulas.

Output format:

- Tab name: `Month YYYY`, for example `March 2026`.
- Row 1: `Name` plus play dates with at least 2 total headcount.
- Rows: one row per player.
- Cell value: blank when not joining, `1` when the player joins alone, `n` when the player brings `n - 1` guests.

## Notes From Tool Research

- Google Forms is append-first. It does not natively upsert by `player + date`.
- Tally/Jotform can create nicer forms and sync to Sheets, but true dedupe/update still needs automation.
- Team tools like BenchApp handle RSVP per player/event well, but they are not Sheets-first.
- A custom static page plus Apps Script is the simplest free path that preserves your exact UX and Google Sheet ownership.
