const SHEET_NAME = "RSVPs";
const ROSTER_SHEET_NAME = "Roster";
const AUDIT_SHEET_NAME = "RSVP Audit Log";
const EXPORT_SPREADSHEET_ID = "19vferggiMR8Qf4wn2GSJl7TZ9rekSEbDVl-anCfem4w";
const PREVIEW_MAX_ROWS = 120;
const PREVIEW_MAX_COLUMNS = 80;
const EXPORT_MIN_PARTICIPANTS = 2;
const ADMIN_TOKEN_TTL_SECONDS = 21600;
const PLAY_DAYS = [2, 4, 5, 0];
const HEADERS = [
  "Play Date",
  "Player Name",
  "Vote",
  "Participant Count",
  "Submitted At",
  "Updated At",
];
const ROSTER_HEADERS = ["Name", "Venmo", "Facebook", "Cellphone"];
const AUDIT_HEADERS = [
  "Logged At",
  "Action",
  "Play Date",
  "Player Name",
  "Participant Count",
  "Row",
  "Browser ID",
  "Browser Signature",
  "Client Device",
  "Client Time Zone",
  "Client Language",
  "Client Screen",
  "Client IP",
  "Submitted At",
  "Existing RSVP",
  "Public IP",
  "Public IP Source",
  "Client User Agent",
  "Client Platform",
  "Client Vendor",
  "Client Referrer",
  "Page URL",
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
    if (params.action === "adminLogin") {
      const result = adminLogin_(params);
      return jsonp_(callback, {
        ok: true,
        token: result.token,
        expiresAt: result.expiresAt,
      });
    }

    if (params.action === "validateAdmin") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "validateAdmin",
      });
    }

    if (params.action === "listRoster") {
      return jsonp_(callback, {
        ok: true,
        roster: getRoster_(),
      });
    }

    if (params.action === "saveRosterMember") {
      const result = saveRosterMember_(params);
      return jsonp_(callback, {
        ok: true,
        action: result.action,
        renameCounts: result.renameCounts || null,
        roster: result.roster,
      });
    }

    if (params.action === "removeRosterMember") {
      requireAdmin_(params);
      const result = removeRosterMember_(params);
      return jsonp_(callback, {
        ok: true,
        action: "removeRosterMember",
        removed: result.removed,
        roster: result.roster,
      });
    }

    if (params.action === "adminUpsertRsvp") {
      requireAdmin_(params);
      const result = upsertRsvp_(params);
      return jsonp_(callback, {
        ok: true,
        action: result.action,
        row: result.row,
        existing: result.existing || null,
        audit: result.audit || null,
        tally: result.tally,
      });
    }

    if (params.action === "listAudit") {
      requireAdmin_(params);
      const audit = getAuditLog_(params);
      return jsonp_(callback, {
        ok: true,
        action: "listAudit",
        entries: audit.entries,
        diagnostics: audit.diagnostics,
      });
    }

    if (params.action === "auditDiagnostics") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "auditDiagnostics",
        diagnostics: getAuditDiagnostics_(params),
      });
    }

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
        audit: result.audit || null,
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
      audit: result.audit || null,
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

function adminLogin_(params) {
  const password = required_(params.password, "Missing password");
  const expectedPassword = PropertiesService.getScriptProperties().getProperty(
    "ADMIN_PASSWORD",
  );

  if (!expectedPassword) {
    throw new Error("Admin password is not configured");
  }

  if (password !== expectedPassword) {
    throw new Error("Incorrect admin password");
  }

  const token = Utilities.getUuid();
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_SECONDS * 1000;
  CacheService.getScriptCache().put(
    getAdminTokenCacheKey_(token),
    "true",
    ADMIN_TOKEN_TTL_SECONDS,
  );

  return { token, expiresAt };
}

function requireAdmin_(params) {
  const token = required_(params.adminToken, "Admin login required");
  const isValid =
    CacheService.getScriptCache().get(getAdminTokenCacheKey_(token)) === "true";

  if (!isValid) {
    throw new Error("Admin login expired. Please log in again.");
  }
}

function getAdminTokenCacheKey_(token) {
  return `admin:${token}`;
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
      const audit = appendAuditLog_(params, "delete_not_found", null, null);
      return {
        action: "not_found",
        row: null,
        audit,
        tally: getTally_(playDate),
      };
    }

    const existingRsvp = getRsvpAtRow_(sheet, rows[0]);
    rows.sort((first, second) => second - first).forEach((row) => {
      sheet.deleteRow(row);
    });
    const audit = appendAuditLog_(params, "deleted", rows[0], existingRsvp);
    return {
      action: "deleted",
      row: rows[0],
      audit,
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
  const participantCount = clampSubmittedParticipantCount_(
    params.participantCount,
  );
  const vote =
    participantCount > 0 && normalize_(params.vote || "Yes") !== "no"
      ? "Yes"
      : "No";
  const submittedAt = params.submittedAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();

  const sheet = getSheet_();
  const matchingRows = findExistingRows_(sheet, playDate, playerName);
  const row = matchingRows[0] || null;
  const existingRsvp = row ? getRsvpAtRow_(sheet, row) : null;
  let audit;

  if (normalize_(vote) === "no") {
    if (row) {
      matchingRows.sort((first, second) => second - first).forEach((rowNumber) => {
        sheet.deleteRow(rowNumber);
      });
      audit = appendAuditLog_(params, "deleted", row, existingRsvp);
      return {
        action: "deleted",
        row,
        audit,
        tally: getTally_(playDate),
      };
    }

    audit = appendAuditLog_(params, "delete_not_found", null, null);
    return {
      action: "not_found",
      row: null,
      audit,
      tally: getTally_(playDate),
    };
  }

  const values = [
    playDate,
    playerName,
    vote,
    participantCount,
    submittedAt,
    updatedAt,
  ];

  if (row) {
    deleteDuplicateRows_(sheet, matchingRows, row);
    if (normalize_(existingRsvp.vote) !== "no" && params.confirmOverride !== "true") {
      audit = appendAuditLog_(params, "needs_confirmation", row, existingRsvp);
      return {
        action: "needs_confirmation",
        row,
        existing: existingRsvp,
        audit,
        tally: getTally_(playDate),
      };
    }

    const originalSubmittedAt = sheet.getRange(row, 5).getValue() || submittedAt;
    values[4] = originalSubmittedAt;
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    audit = appendAuditLog_(params, "updated", row, existingRsvp);
    return { action: "updated", row, audit, tally: getTally_(playDate) };
  }

  sheet.appendRow(values);
  const appendedRow = sheet.getLastRow();
  audit = appendAuditLog_(params, "created", appendedRow, null);
  return {
    action: "created",
    row: appendedRow,
    audit,
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

function getAuditSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(AUDIT_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(AUDIT_SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, AUDIT_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = AUDIT_HEADERS.some((header, index) => currentHeaders[index] !== header);

  if (needsHeaders) {
    headerRange.setValues([AUDIT_HEADERS]);
    sheet.setFrozenRows(1);
  }
  sheet.getRange("C:C").setNumberFormat("@");

  return sheet;
}

function appendAuditLog_(params, action, row, existingRsvp) {
  try {
    const sheet = getAuditSheet_();
    const auditPlayDate = normalizeDate_(params.playDate || "");
    const values = [
      new Date().toISOString(),
      action,
      sanitizeText_(auditPlayDate),
      sanitizeText_(params.playerName || ""),
      sanitizeText_(params.participantCount || ""),
      row || "",
      sanitizeText_(params.browserId || ""),
      sanitizeText_(params.browserSignature || ""),
      sanitizeText_(params.clientDeviceClass || ""),
      sanitizeText_(params.clientTimeZone || ""),
      sanitizeText_(params.clientLanguage || ""),
      sanitizeText_(params.clientScreen || ""),
      sanitizeText_(params.clientIp || "Unavailable in Apps Script"),
      sanitizeText_(params.submittedAt || ""),
      existingRsvp ? JSON.stringify(existingRsvp) : "",
      sanitizeText_(params.clientPublicIp || ""),
      sanitizeText_(params.clientPublicIpSource || ""),
      sanitizeText_(params.clientUserAgent || ""),
      sanitizeText_(params.clientPlatform || ""),
      sanitizeText_(params.clientVendor || ""),
      sanitizeText_(params.clientReferrer || ""),
      sanitizeText_(params.clientPageUrl || ""),
    ];
    sheet.appendRow(values);
    return {
      ok: true,
      sheet: AUDIT_SHEET_NAME,
      row: sheet.getLastRow(),
      action,
      playDate: auditPlayDate,
    };
  } catch (error) {
    const message = `Could not append RSVP audit log: ${error.message}`;
    console.warn(message);
    return {
      ok: false,
      sheet: AUDIT_SHEET_NAME,
      action,
      playDate: normalizeDate_(params.playDate || ""),
      error: message,
    };
  }
}

function getAuditLog_(params) {
  const month = sanitizeText_(params.month || "");
  const playDate = normalizeDate_(params.playDate || "");
  const playerName = sanitizeText_(params.playerName || "");
  const limit = Math.min(
    500,
    Math.max(1, parseInt(String(params.limit || "250"), 10) || 250),
  );
  const sheet = getAuditSheet_();
  const lastRow = sheet.getLastRow();
  const diagnostics = getAuditDiagnosticsFromSheet_(sheet, params);

  if (lastRow < 2) {
    return {
      entries: [],
      diagnostics,
    };
  }

  const entries = sheet
    .getRange(2, 1, lastRow - 1, AUDIT_HEADERS.length)
    .getValues()
    .map((row, index) => auditRowToEntry_(row, index + 2))
    .filter((entry) => {
      if (month && !entry.playDate.startsWith(month)) {
        return false;
      }
      if (playDate && entry.playDate !== playDate) {
        return false;
      }
      if (playerName && normalize_(entry.playerName) !== normalize_(playerName)) {
        return false;
      }
      return true;
    })
    .sort((first, second) => {
      const dateOrder = second.playDate.localeCompare(first.playDate);
      if (dateOrder !== 0) {
        return dateOrder;
      }
      return second.loggedAt.localeCompare(first.loggedAt);
    })
    .slice(0, limit);

  return {
    entries,
    diagnostics,
  };
}

function getAuditDiagnostics_(params) {
  return getAuditDiagnosticsFromSheet_(getAuditSheet_(), params);
}

function getAuditDiagnosticsFromSheet_(sheet, params) {
  const month = sanitizeText_(params.month || "");
  const playDate = normalizeDate_(params.playDate || "");
  const playerName = sanitizeText_(params.playerName || "");
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), AUDIT_HEADERS.length);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const recentCount = Math.max(0, Math.min(5, lastRow - 1));
  const recentRows =
    recentCount > 0
      ? sheet
          .getRange(
            lastRow - recentCount + 1,
            1,
            recentCount,
            AUDIT_HEADERS.length,
          )
          .getValues()
          .map((row, index) =>
            auditRowToEntry_(row, lastRow - recentCount + 1 + index),
          )
          .reverse()
      : [];
  const matchingRecentRows = recentRows.filter((entry) => {
    if (month && !entry.playDate.startsWith(month)) {
      return false;
    }
    if (playDate && entry.playDate !== playDate) {
      return false;
    }
    if (playerName && normalize_(entry.playerName) !== normalize_(playerName)) {
      return false;
    }
    return true;
  });

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    auditSheetName: sheet.getName(),
    auditSheetId: sheet.getSheetId(),
    lastRow,
    lastColumn,
    dataRows: Math.max(0, lastRow - 1),
    filters: {
      month,
      playDate,
      playerName,
    },
    recentRows,
    matchingRecentRows,
  };
}

function auditRowToEntry_(row, sheetRow) {
  const existingRsvp = parseAuditExistingRsvp_(row[14]);
  return {
    row: sheetRow,
    loggedAt: formatAuditValue_(row[0]),
    action: String(row[1] || ""),
    playDate: normalizeDate_(row[2]),
    playerName: String(row[3] || ""),
    participantCount: String(row[4] || ""),
    rsvpRow: String(row[5] || ""),
    browserId: String(row[6] || ""),
    browserSignature: String(row[7] || ""),
    clientDevice: String(row[8] || ""),
    clientTimeZone: String(row[9] || ""),
    clientLanguage: String(row[10] || ""),
    clientScreen: String(row[11] || ""),
    clientIp: String(row[12] || ""),
    submittedAt: formatAuditValue_(row[13]),
    existingParticipantCount: existingRsvp
      ? String(existingRsvp.participantCount || "")
      : "",
    existingVote: existingRsvp ? String(existingRsvp.vote || "") : "",
    clientPublicIp: String(row[15] || ""),
    clientPublicIpSource: String(row[16] || ""),
    clientUserAgent: String(row[17] || ""),
    clientPlatform: String(row[18] || ""),
    clientVendor: String(row[19] || ""),
    clientReferrer: String(row[20] || ""),
    clientPageUrl: String(row[21] || ""),
  };
}

function parseAuditExistingRsvp_(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    return null;
  }
}

function formatAuditValue_(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value || "");
}

function getRosterSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(ROSTER_SHEET_NAME);
  let shouldSeedRoster = false;

  if (!sheet) {
    sheet = spreadsheet.insertSheet(ROSTER_SHEET_NAME);
    shouldSeedRoster = true;
  }

  migrateRosterSheet_(sheet);

  const headerRange = sheet.getRange(1, 1, 1, ROSTER_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = ROSTER_HEADERS.some(
    (header, index) => currentHeaders[index] !== header,
  );

  if (needsHeaders) {
    headerRange.setValues([ROSTER_HEADERS]);
    sheet.setFrozenRows(1);
  }

  if (shouldSeedRoster && sheet.getLastRow() < 2) {
    sheet
      .getRange(2, 1, PLAYERS.length, ROSTER_HEADERS.length)
      .setValues(PLAYERS.map((name) => [name, "", "", "", ""]));
  }

  return sheet;
}

function migrateRosterSheet_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 2) {
    return;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const hasLegacyPaymentInfo =
    headers[0] === "Name" &&
    headers[1] === "Payment Info" &&
    headers[2] === "Venmo";

  if (hasLegacyPaymentInfo && sheet.getLastRow() >= 2) {
    const lastRow = sheet.getLastRow();
    const venmoValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
    sheet.getRange(2, 2, lastRow - 1, 1).setValues(venmoValues);
  }

  if (lastColumn > ROSTER_HEADERS.length) {
    sheet.deleteColumns(
      ROSTER_HEADERS.length + 1,
      lastColumn - ROSTER_HEADERS.length,
    );
  }
}

function getRoster_() {
  const sheet = getRosterSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, ROSTER_HEADERS.length)
    .getValues()
    .map((row) => ({
      name: String(row[0] || "").trim(),
      venmo: String(row[1] || "").trim(),
      messenger: String(row[2] || "").trim(),
      cellphone: String(row[3] || "").trim(),
    }))
    .filter((member) => member.name)
    .sort((first, second) => first.name.localeCompare(second.name));
}

function getRosterNames_() {
  return getRoster_().map((member) => member.name);
}

function findRosterRow_(sheet, playerName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const normalizedName = normalize_(playerName);
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (let index = 0; index < rows.length; index += 1) {
    if (normalize_(rows[index][0]) === normalizedName) {
      return index + 2;
    }
  }

  return null;
}

function saveRosterMember_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    requireAdmin_(params);
    const oldName = sanitizeText_(params.oldPlayerName || params.oldName || "");
    const name = sanitizeText_(
      required_(params.playerName || params.name, "Missing player name").trim(),
    );
    const venmo = normalizeVenmo_(required_(params.venmo, "Missing Venmo"));
    const messenger = normalizeMessenger_(
      required_(params.messenger, "Missing Facebook profile"),
    );
    const cellphone = sanitizeText_(params.cellphone || "");
    const sheet = getRosterSheet_();
    const oldRow = oldName ? findRosterRow_(sheet, oldName) : null;
    const row = findRosterRow_(sheet, name);
    const values = [name, venmo, messenger, cellphone];

    if (oldName && normalize_(oldName) !== normalize_(name)) {
      if (!oldRow) {
        throw new Error("Original roster member was not found");
      }
      if (row) {
        throw new Error("A roster member with the new name already exists");
      }

      sheet.getRange(oldRow, 1, 1, ROSTER_HEADERS.length).setValues([values]);
      const renameCounts = renamePlayerEverywhere_(oldName, name);
      return {
        action: "renamed",
        renameCounts,
        roster: getRoster_(),
      };
    }

    if (row) {
      sheet.getRange(row, 1, 1, ROSTER_HEADERS.length).setValues([values]);
      return {
        action: "updated",
        roster: getRoster_(),
      };
    }

    sheet.appendRow(values);
    return {
      action: "created",
      roster: getRoster_(),
    };
  } finally {
    lock.releaseLock();
  }
}

function removeRosterMember_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const name = required_(params.playerName || params.name, "Missing player name")
      .trim();
    const sheet = getRosterSheet_();
    const row = findRosterRow_(sheet, name);

    if (row) {
      sheet.deleteRow(row);
    }

    return {
      removed: Boolean(row),
      roster: getRoster_(),
    };
  } finally {
    lock.releaseLock();
  }
}

function renamePlayerEverywhere_(oldName, newName) {
  return {
    rsvpRows: renamePlayerInSheetColumn_(getSheet_(), 2, oldName, newName),
    auditRows: renamePlayerInSheetColumn_(getAuditSheet_(), 4, oldName, newName),
    auditExistingRows: renamePlayerInAuditExistingRsvps_(oldName, newName),
    exportRows: renamePlayerInExportSheets_(oldName, newName),
  };
}

function renamePlayerInSheetColumn_(sheet, column, oldName, newName) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const range = sheet.getRange(2, column, lastRow - 1, 1);
  const values = range.getValues();
  let changed = 0;

  values.forEach((row) => {
    if (normalize_(row[0]) === normalize_(oldName)) {
      row[0] = newName;
      changed += 1;
    }
  });

  if (changed > 0) {
    range.setValues(values);
  }

  return changed;
}

function renamePlayerInAuditExistingRsvps_(oldName, newName) {
  const sheet = getAuditSheet_();
  const lastRow = sheet.getLastRow();
  const existingRsvpColumn = 15;

  if (lastRow < 2) {
    return 0;
  }

  const range = sheet.getRange(2, existingRsvpColumn, lastRow - 1, 1);
  const values = range.getValues();
  let changed = 0;

  values.forEach((row) => {
    const existingRsvp = parseAuditExistingRsvp_(row[0]);
    if (
      existingRsvp &&
      normalize_(existingRsvp.playerName) === normalize_(oldName)
    ) {
      existingRsvp.playerName = newName;
      row[0] = JSON.stringify(existingRsvp);
      changed += 1;
    }
  });

  if (changed > 0) {
    range.setValues(values);
  }

  return changed;
}

function renamePlayerInExportSheets_(oldName, newName) {
  try {
    const spreadsheet = SpreadsheetApp.openById(EXPORT_SPREADSHEET_ID);
    return spreadsheet
      .getSheets()
      .reduce(
        (total, sheet) =>
          total + renamePlayerInSheetColumn_(sheet, 1, oldName, newName),
        0,
      );
  } catch (error) {
    console.warn(`Could not update exported roster names: ${error.message}`);
    return 0;
  }
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
  const values = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  return {
    playDate: normalizeDate_(values[0]),
    playerName: String(values[1] || "").trim(),
    vote: String(values[2] || "").trim(),
    participantCount: clampStoredParticipantCount_(values[3]),
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

function resetRsvpDataForProduction() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }

    if (sheet.getLastColumn() > HEADERS.length) {
      sheet.deleteColumns(
        HEADERS.length + 1,
        sheet.getLastColumn() - HEADERS.length,
      );
    }

    return {
      clearedRows: Math.max(0, lastRow - 1),
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
    return getTotalParticipants_(totalsByDate[date]) >= EXPORT_MIN_PARTICIPANTS;
  });
  const header = ["Name"].concat(monthDates.map((date) => formatDisplayDate_(date)));
  const matrix = [header].concat(
    getRosterNames_().map((player) => {
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
    const participantCount = clampStoredParticipantCount_(row[3]);

    if (rowDate !== playDate || vote !== "yes" || !isRosterPlayer_(playerName)) {
      return;
    }

    totals[normalize_(playerName)] = Number.isFinite(participantCount)
      ? participantCount
      : 1;
  });

  return totals;
}

function getTotalParticipants_(totalsByPlayer) {
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
    const participantCount = clampStoredParticipantCount_(row[3]);

    if (rowDate !== playDate || vote !== "yes" || !isRosterPlayer_(playerName)) {
      return;
    }

    const normalizedPlayer = normalize_(playerName);
    const existingPlayer = tally.players.find(
      (player) => normalize_(player.name) === normalizedPlayer,
    );

    if (existingPlayer) {
      existingPlayer.participantCount += Number.isFinite(participantCount)
        ? participantCount
        : 1;
      return;
    } else {
      tally.players.push({
        name: playerName,
        participantCount: Number.isFinite(participantCount)
          ? participantCount
          : 1,
      });
    }
  });

  tally.players.sort((first, second) => first.name.localeCompare(second.name));
  tally.playerCount = tally.players.length;
  tally.totalCount = tally.players.reduce(
    (sum, player) => sum + player.participantCount,
    0,
  );

  return tally;
}

function normalize_(value) {
  return String(value || "").trim().toLowerCase();
}

function clampSubmittedParticipantCount_(value) {
  const count = Math.trunc(Number(value || 0));
  return Number.isFinite(count) ? Math.min(5, Math.max(0, count)) : 1;
}

function clampStoredParticipantCount_(value) {
  const count = Math.trunc(Number(value || 1));
  return Number.isFinite(count) ? Math.min(5, Math.max(1, count)) : 1;
}

function formatDate_(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRosterPlayer_(playerName) {
  const normalizedName = normalize_(playerName);
  return getRosterNames_().some((player) => normalize_(player) === normalizedName);
}

function validatePlayerName_(playerName) {
  if (!isRosterPlayer_(playerName)) {
    throw new Error("Please choose a player from the roster");
  }
}

function normalizeVenmo_(value) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(?:https?:\/\/)?(?:(?:www|account)\.)?venmo\.com\/(?:u\/)?([A-Za-z0-9_.-]+)\/?$/i,
  );
  const handle = match ? match[1] : text.replace(/^@/, "");

  if (!/^[A-Za-z0-9_.-]{2,30}$/.test(handle)) {
    throw new Error("Enter a valid Venmo handle or Venmo profile URL");
  }

  return `@${handle}`;
}

function normalizeMessenger_(value) {
  const text = String(value || "").trim();
  const messengerMatch = text.match(
    /^(?:https?:\/\/)?m\.me\/([A-Za-z0-9._-]{3,80})\/?(?:[?#].*)?$/i,
  );
  if (messengerMatch) {
    return `https://www.facebook.com/${messengerMatch[1]}`;
  }

  const profileIdMatch = text.match(
    /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/profile\.php\?id=([0-9]+)(?:[&#].*)?$/i,
  );
  if (profileIdMatch) {
    return `https://www.facebook.com/profile.php?id=${profileIdMatch[1]}`;
  }

  const facebookMatch = text.match(
    /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/([A-Za-z0-9._-]{3,80})\/?(?:[?#].*)?$/i,
  );
  const handle = facebookMatch ? facebookMatch[1] : text.replace(/^@/, "");

  if (
    !/^[A-Za-z0-9._-]{3,80}$/.test(handle) ||
    handle.toLowerCase() === "profile.php"
  ) {
    throw new Error("Enter a valid Facebook profile URL or profile handle");
  }

  return `https://www.facebook.com/${handle}`;
}

function sanitizeText_(value) {
  const text = String(value || "").trim();
  return /^[=+\-]/.test(text) ? `'${text}` : text;
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
