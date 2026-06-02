const SHEET_NAME = "RSVPs";
const HEADERS = [
  "Play Date",
  "Player Name",
  "Vote",
  "Guest Count",
  "Submitted At",
  "Updated At",
];

function doGet(event) {
  const callback = event.parameter.callback || "callback";

  try {
    const result = upsertRsvp_(event.parameter);
    return jsonp_(callback, {
      ok: true,
      action: result.action,
      row: result.row,
    });
  } catch (error) {
    return jsonp_(callback, {
      ok: false,
      error: error.message,
    });
  }
}

function upsertRsvp_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    return upsertRsvpWithLock_(params);
  } finally {
    lock.releaseLock();
  }
}

function upsertRsvpWithLock_(params) {
  const playDate = required_(params.playDate, "Missing play date");
  const playerName = sanitizeText_(
    required_(params.playerName, "Missing player name").trim(),
  );
  const vote = sanitizeText_(params.vote || "Yes");
  const guestCount = Math.max(0, Number(params.guestCount || 0));
  const submittedAt = params.submittedAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();

  if (!Number.isFinite(guestCount)) {
    throw new Error("Invalid guest count");
  }

  const sheet = getSheet_();
  const row = findExistingRow_(sheet, playDate, playerName);
  const values = [playDate, playerName, vote, guestCount, submittedAt, updatedAt];

  if (row) {
    const originalSubmittedAt = sheet.getRange(row, 5).getValue() || submittedAt;
    values[4] = originalSubmittedAt;
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    return { action: "updated", row };
  }

  sheet.appendRow(values);
  return { action: "created", row: sheet.getLastRow() };
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = HEADERS.some((header, index) => currentHeaders[index] !== header);

  if (needsHeaders) {
    headerRange.setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function findExistingRow_(sheet, playDate, playerName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const normalizedName = normalize_(playerName);

  for (let index = 0; index < data.length; index += 1) {
    const rowDate = normalizeDate_(data[index][0]);
    const rowName = normalize_(data[index][1]);
    if (rowDate === playDate && rowName === normalizedName) {
      return index + 2;
    }
  }

  return null;
}

function normalize_(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeText_(value) {
  const text = String(value || "").trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function normalizeDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
  }

  return String(value || "").trim();
}

function required_(value, message) {
  if (!String(value || "").trim()) {
    throw new Error(message);
  }
  return String(value);
}

function jsonp_(callback, payload) {
  const safeCallback = String(callback).replace(/[^\w.$]/g, "");
  return ContentService.createTextOutput(
    `${safeCallback}(${JSON.stringify(payload)});`,
  ).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
