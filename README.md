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

## Recommended Hosting

Use GitHub Pages for the static website and Google Apps Script as the free backend that writes to Google Sheets.

GitHub Pages can host `index.html`, `styles.css`, and `app.js` for free, but it cannot safely store Google credentials or update a private Sheet by itself. Apps Script fills that backend role and runs as the Google account that owns the Sheet.

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

To seed the dropdown with known players, set this in `app.js`:

```js
const DEFAULT_PLAYERS = ["Player One", "Player Two"];
```

## GitHub Pages Setup

1. Create a GitHub repository.
2. Put `index.html`, `styles.css`, and `app.js` at the repository root.
3. Commit and push.
4. In GitHub, open `Settings > Pages`.
5. Under `Build and deployment`, select `Deploy from a branch`.
6. Choose the main branch and `/root`.
7. Open the published GitHub Pages URL.

## Notes From Tool Research

- Google Forms is append-first. It does not natively upsert by `player + date`.
- Tally/Jotform can create nicer forms and sync to Sheets, but true dedupe/update still needs automation.
- Team tools like BenchApp handle RSVP per player/event well, but they are not Sheets-first.
- A custom static page plus Apps Script is the simplest free path that preserves your exact UX and Google Sheet ownership.
