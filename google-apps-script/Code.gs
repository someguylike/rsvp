const SHEET_NAME = "RSVPs";
const EXPORT_SPREADSHEET_ID = "19vferggiMR8Qf4wn2GSJl7TZ9rekSEbDVl-anCfem4w";
const PREVIEW_MAX_ROWS = 120;
const PREVIEW_MAX_COLUMNS = 80;
const EXPORT_MIN_HEADCOUNT = 2;
const PLAY_DAYS = [2, 4, 5, 0];
const HEADERS = [
  "Play Date",
  "Player Name",
  "Vote",
  "Guest Count",
  "Submitted At",
  "Updated At",
];
const PLAYERS = [
  "Alex Yeung",
  "Anh Khoa Tran (Truc Phuong)",
  "Bao Ta",
  "Cuong (MC) Nguyen",
  "Cuong Tipu",
  "Danny Phan",
  "Derek Blaiotta (Hoa Pham's fr)",
  "Duy Nguyen",
  "Harvey Le",
  "Hoan Nguyen",
  "Hoang Huynh",
  "Hung Cao (Truong Do)",
  "Huong Le",
  "Huy Nguyen (Harvey's fr)",
  "Huy Viet Nguyen",
  "Jordan Scherr",
  "Khang Nguyen",
  "Khang Vinh",
  "KhiemHoang Tran",
  "Luan Nguyen",
  "Nam Pham",
  "Nick Nguyen",
  "Phuc Anh",
  "Phuoc Truong",
  "Son Nguyen",
  "Thanh Nguyen",
  "Thanh Thanh Tran (Tu Do's friend)",
  "Thien Nguyen",
  "Thinh Do (Lily Do)",
  "Thinh Pham",
  "Thuy Duong",
  "Todd Nguyen",
  "Tr Nguyen (Trung)",
  "Tri Ho",
  "Truc Phuong",
  "Trung Van Nguyễn",
  "Truong Do",
  "Tu Anh Do",
  "Tuan Pham",
  "Tuan Phan/Hien",
  "Uyen",
  "Viet Do",
  "Vu Nguyen",
];

function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};
  const callback = params.callback || "callback";

  try {
    if (params.action === "list") {
      return jsonp_(callback, {
        ok: true,
        tally: getTally_(required_(params.playDate, "Missing play date")),
      });
    }

    if (params.action === "delete") {
      const result = deleteRsvp_(params);
      return jsonp_(callback, {
        ok: true,
        action: result.action,
        row: result.row,
        tally: result.tally,
      });
    }

    if (params.action === "cleanup") {
      const result = cleanupNonRosterRows_();
      return jsonp_(callback, {
        ok: true,
        action: "cleanup",
        deletedCount: result.deletedCount,
        deletedNames: result.deletedNames,
      });
    }

    if (params.action === "exportMonth") {
      const result = exportMonthRoster_(
        required_(params.month, "Missing export month"),
      );
      return jsonp_(callback, {
        ok: true,
        action: "exportMonth",
        sheetName: result.sheetName,
        exportedDates: result.exportedDates,
        previewRows: result.previewRows,
        url: result.url,
      });
    }

    if (params.action === "viewMonth") {
      const result = viewMonthRoster_(
        required_(params.month, "Missing export month"),
      );
      return jsonp_(callback, {
        ok: true,
        action: "viewMonth",
        sheetName: result.sheetName,
        exportedDates: result.exportedDates,
        previewRows: result.previewRows,
        url: result.url,
      });
    }

    if (params.action) {
      throw new Error(`Unsupported action: ${params.action}`);
    }

    const result = upsertRsvp_(params);
    return jsonp_(callback, {
      ok: true,
      action: result.action,
      row: result.row,
      existing: result.existing || null,
      tally: result.tally,
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

function deleteRsvp_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const playDate = required_(params.playDate, "Missing play date");
    const playerName = required_(params.playerName, "Missing player name").trim();
    validatePlayerName_(playerName);
    const sheet = getSheet_();
    const rows = findExistingRows_(sheet, playDate, playerName);

    if (rows.length === 0) {
      return {
        action: "not_found",
        row: null,
        tally: getTally_(playDate),
      };
    }

    rows.sort((first, second) => second - first).forEach((row) => {
      sheet.deleteRow(row);
    });
    return {
      action: "deleted",
      row: rows[0],
      tally: getTally_(playDate),
    };
  } finally {
    lock.releaseLock();
  }
}

function upsertRsvpWithLock_(params) {
  const playDate = required_(params.playDate, "Missing play date");
  const playerName = sanitizeText_(
    required_(params.playerName, "Missing player name").trim(),
  );
  validatePlayerName_(playerName);
  const vote = sanitizeText_(params.vote || "Yes");
  const guestCount = Math.max(0, Number(params.guestCount || 0));
  const submittedAt = params.submittedAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();

  if (!Number.isFinite(guestCount)) {
    throw new Error("Invalid guest count");
  }

  const sheet = getSheet_();
  const matchingRows = findExistingRows_(sheet, playDate, playerName);
  const row = matchingRows[0] || null;
  const existingRsvp = row ? getRsvpAtRow_(sheet, row) : null;

  if (normalize_(vote) === "no") {
    if (row) {
      matchingRows.sort((first, second) => second - first).forEach((rowNumber) => {
        sheet.deleteRow(rowNumber);
      });
      return {
        action: "deleted",
        row,
        tally: getTally_(playDate),
      };
    }

    return {
      action: "not_found",
      row: null,
      tally: getTally_(playDate),
    };
  }

  const values = [playDate, playerName, vote, guestCount, submittedAt, updatedAt];

  if (row) {
    deleteDuplicateRows_(sheet, matchingRows, row);
    if (normalize_(existingRsvp.vote) !== "no" && params.confirmOverride !== "true") {
      return {
        action: "needs_confirmation",
        row,
        existing: existingRsvp,
        tally: getTally_(playDate),
      };
    }

    const originalSubmittedAt = sheet.getRange(row, 5).getValue() || submittedAt;
    values[4] = originalSubmittedAt;
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    return { action: "updated", row, tally: getTally_(playDate) };
  }

  sheet.appendRow(values);
  return {
    action: "created",
    row: sheet.getLastRow(),
    tally: getTally_(playDate),
  };
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
  const rows = findExistingRows_(sheet, playDate, playerName);
  return rows[0] || null;
}

function findExistingRows_(sheet, playDate, playerName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const normalizedName = normalize_(playerName);
  const rows = [];

  for (let index = 0; index < data.length; index += 1) {
    const rowDate = normalizeDate_(data[index][0]);
    const rowName = normalize_(data[index][1]);
    if (rowDate === playDate && rowName === normalizedName) {
      rows.push(index + 2);
    }
  }

  return rows;
}

function deleteDuplicateRows_(sheet, rows, keepRow) {
  rows
    .filter((row) => row !== keepRow)
    .sort((first, second) => second - first)
    .forEach((row) => {
      sheet.deleteRow(row);
    });
}

function getRsvpAtRow_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, 6).getValues()[0];
  return {
    playDate: normalizeDate_(values[0]),
    playerName: String(values[1] || "").trim(),
    vote: String(values[2] || "").trim(),
    guestCount: Math.max(0, Number(values[3] || 0)),
    submittedAt: String(values[4] || ""),
    updatedAt: String(values[5] || ""),
  };
}

function cleanupNonRosterRows_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    const deletedNames = [];

    if (lastRow < 2) {
      return { deletedCount: 0, deletedNames };
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const playerName = String(rows[index][1] || "").trim();
      if (!isRosterPlayer_(playerName)) {
        deletedNames.push(playerName || "(blank)");
        sheet.deleteRow(index + 2);
      }
    }

    return {
      deletedCount: deletedNames.length,
      deletedNames,
    };
  } finally {
    lock.releaseLock();
  }
}

function exportMonthRoster_(month) {
  validateMonth_(month);

  const sourceSheet = getSheet_();
  const targetSpreadsheet = SpreadsheetApp.openById(EXPORT_SPREADSHEET_ID);
  const exportSheetName = formatMonthTabName_(month);
  let exportSheet = targetSpreadsheet.getSheetByName(exportSheetName);

  if (exportSheet) {
    targetSpreadsheet.deleteSheet(exportSheet);
  }
  exportSheet = targetSpreadsheet.insertSheet(exportSheetName);

  const totalsByDate = {};
  const monthDates = getExportDatesForMonth_(sourceSheet, month).filter((date) => {
    totalsByDate[date] = getRsvpTotalsByPlayerForDate_(sourceSheet, date);
    return getTotalHeadcount_(totalsByDate[date]) >= EXPORT_MIN_HEADCOUNT;
  });
  const header = ["Name"].concat(monthDates.map((date) => formatDisplayDate_(date)));
  const matrix = [header].concat(
    PLAYERS.map((player) => {
      const normalizedPlayer = normalize_(player);
      return [player].concat(
        monthDates.map((date) => {
          const total = totalsByDate[date][normalizedPlayer];
          return total ? Math.trunc(total) : "";
        }),
      );
    }),
  );

  exportSheet
    .getRange(1, 1, matrix.length, matrix[0].length)
    .setValues(matrix);
  exportSheet.setFrozenRows(1);
  exportSheet.setFrozenColumns(1);
  exportSheet.getRange(1, 1, 1, matrix[0].length).setFontWeight("bold");
  exportSheet.getRange(1, 1, matrix.length, 1).setFontWeight("bold");
  if (matrix.length > 1 && matrix[0].length > 1) {
    exportSheet
      .getRange(2, 2, matrix.length - 1, matrix[0].length - 1)
      .setNumberFormat("0");
  }
  exportSheet.autoResizeColumns(1, exportSheet.getLastColumn());
  SpreadsheetApp.flush();

  return {
    sheetName: exportSheetName,
    exportedDates: monthDates.length,
    previewRows: getPreviewRows_(exportSheet),
    url: `${targetSpreadsheet.getUrl()}#gid=${exportSheet.getSheetId()}`,
  };
}

function viewMonthRoster_(month) {
  validateMonth_(month);

  const targetSpreadsheet = SpreadsheetApp.openById(EXPORT_SPREADSHEET_ID);
  const exportSheetName = formatMonthTabName_(month);
  const exportSheet = targetSpreadsheet.getSheetByName(exportSheetName);

  if (!exportSheet) {
    throw new Error(`Export ${exportSheetName} has not been created yet`);
  }

  return {
    sheetName: exportSheetName,
    exportedDates: getExportedDateCount_(exportSheet),
    previewRows: getPreviewRows_(exportSheet),
    url: `${targetSpreadsheet.getUrl()}#gid=${exportSheet.getSheetId()}`,
  };
}

function getPreviewRows_(sheet) {
  const lastRow = Math.min(sheet.getLastRow(), PREVIEW_MAX_ROWS);
  const lastColumn = Math.min(sheet.getLastColumn(), PREVIEW_MAX_COLUMNS);

  if (lastRow < 1 || lastColumn < 1) {
    return [];
  }

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  return trimEmptyEdges_(values);
}

function trimEmptyEdges_(values) {
  let lastRow = values.length - 1;
  let lastColumn = values.reduce((maxColumn, row) => {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (String(row[index] || "").trim()) {
        return Math.max(maxColumn, index);
      }
    }
    return maxColumn;
  }, 0);

  while (lastRow >= 0 && values[lastRow].every((cell) => !String(cell || "").trim())) {
    lastRow -= 1;
  }

  if (lastRow < 0) {
    return [];
  }

  return values.slice(0, lastRow + 1).map((row) => row.slice(0, lastColumn + 1));
}

function getExportDatesForMonth_(sheet, month) {
  validateMonth_(month);
  const dateSet = {};
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const current = new Date(year, monthIndex, 1);

  while (current.getMonth() === monthIndex) {
    if (PLAY_DAYS.indexOf(current.getDay()) !== -1) {
      dateSet[formatDate_(current)] = true;
    }
    current.setDate(current.getDate() + 1);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    rows.forEach((row) => {
      const date = normalizeDate_(row[0]);
      if (date.indexOf(`${month}-`) === 0) {
        dateSet[date] = true;
      }
    });
  }

  return Object.keys(dateSet).sort();
}

function getRsvpTotalsByPlayerForDate_(sheet, playDate) {
  const lastRow = sheet.getLastRow();
  const totals = {};

  if (lastRow < 2) {
    return totals;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  rows.forEach((row) => {
    const rowDate = normalizeDate_(row[0]);
    const playerName = String(row[1] || "").trim();
    const vote = normalize_(row[2]);
    const guestCount = Math.max(0, Math.trunc(Number(row[3] || 0)));

    if (rowDate !== playDate || vote !== "yes" || !isRosterPlayer_(playerName)) {
      return;
    }

    totals[normalize_(playerName)] = 1 + (Number.isFinite(guestCount) ? guestCount : 0);
  });

  return totals;
}

function getTotalHeadcount_(totalsByPlayer) {
  return Object.keys(totalsByPlayer).reduce(
    (sum, player) => sum + Number(totalsByPlayer[player] || 0),
    0,
  );
}

function formatMonthTabName_(month) {
  validateMonth_(month);
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "MMMM yyyy");
}

function validateMonth_(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Month must use YYYY-MM format");
  }

  const monthNumber = Number(month.slice(5, 7));
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error("Month must be between 01 and 12");
  }
}

function getExportedDateCount_(sheet) {
  const previewRows = getPreviewRows_(sheet);
  if (previewRows.length === 0) {
    return 0;
  }

  return previewRows[0].filter(
    (value, index) => index > 0 && /^\d{2}\/\d{2}\/\d{4}$/.test(String(value || "")),
  ).length;
}

function formatDisplayDate_(dateValue) {
  const parts = String(dateValue).split("-");
  if (parts.length !== 3) {
    return dateValue;
  }

  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function getTally_(playDate) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const tally = {
    playDate,
    playerCount: 0,
    guestCount: 0,
    totalCount: 0,
    players: [],
  };

  if (lastRow < 2) {
    return tally;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

  rows.forEach((row) => {
    const rowDate = normalizeDate_(row[0]);
    const playerName = String(row[1] || "").trim();
    const vote = normalize_(row[2]);
    const guestCount = Math.max(0, Number(row[3] || 0));

    if (rowDate !== playDate || vote !== "yes" || !isRosterPlayer_(playerName)) {
      return;
    }

    const normalizedPlayer = normalize_(playerName);
    const existingPlayer = tally.players.find(
      (player) => normalize_(player.name) === normalizedPlayer,
    );

    if (existingPlayer) {
      existingPlayer.guestCount += Number.isFinite(guestCount) ? guestCount : 0;
    } else {
      tally.players.push({
        name: playerName,
        guestCount: Number.isFinite(guestCount) ? guestCount : 0,
      });
    }
  });

  tally.players.sort((first, second) => first.name.localeCompare(second.name));
  tally.playerCount = tally.players.length;
  tally.guestCount = tally.players.reduce(
    (sum, player) => sum + player.guestCount,
    0,
  );
  tally.totalCount = tally.playerCount + tally.guestCount;

  return tally;
}

function normalize_(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDate_(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRosterPlayer_(playerName) {
  const normalizedName = normalize_(playerName);
  return PLAYERS.some((player) => normalize_(player) === normalizedName);
}

function validatePlayerName_(playerName) {
  if (!isRosterPlayer_(playerName)) {
    throw new Error("Please choose a player from the roster");
  }
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
