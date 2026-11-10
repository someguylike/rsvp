"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createAppsScriptContext() {
  const context = vm.createContext({ console });
  vm.runInContext(
    fs.readFileSync(
      path.resolve(__dirname, "..", "google-apps-script", "Code.gs"),
      "utf8",
    ),
    context,
  );
  context.LockService = {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
  };
  return context;
}

// Like Sheets: a leading apostrophe marks plain text and isn't returned.
function fromSheetInput(value) {
  return typeof value === "string" && value.startsWith("'") ? value.slice(1) : value;
}

function createRosterSheet(rows) {
  const data = rows.map((row) => row.slice());
  // Every cell write as Sheets receives it: { row, column, value }.
  const cellWrites = [];
  return {
    data,
    cellWrites,
    header: [],
    getLastRow: () => data.length + 1,
    getLastColumn() {
      return Math.max(this.header.length, ...data.map((row) => row.length));
    },
    getRange(row, column, numRows = 1, numColumns = 1) {
      return {
        getValues: () =>
          Array.from({ length: numRows }, (_, rowOffset) =>
            Array.from(
              { length: numColumns },
              (_, columnOffset) =>
                data[row - 2 + rowOffset]?.[column - 1 + columnOffset] ?? "",
            ),
          ),
        setValues(values) {
          values.forEach((valueRow, rowOffset) => {
            valueRow.forEach((value, columnOffset) => {
              cellWrites.push({
                row: row + rowOffset,
                column: column + columnOffset,
                value,
              });
              data[row - 2 + rowOffset][column - 1 + columnOffset] = fromSheetInput(value);
            });
          });
        },
      };
    },
    appendRow(values) {
      data.push(values.map(fromSheetInput));
      values.forEach((value, index) =>
        cellWrites.push({ row: data.length + 1, column: index + 1, value }),
      );
    },
  };
}

function withRoster(rows) {
  const context = createAppsScriptContext();
  const sheet = createRosterSheet(rows);
  context.getRosterSheet_ = () => sheet;
  context.requireAdmin_ = () => {};
  context.requirePlayerWithoutHistoricalReferences_ = () => {};
  context.renamePlayerEverywhere_ = () => ({});
  return { context, sheet };
}

const writesTo = (sheet, column) =>
  sheet.cellWrites.filter((write) => write.column === column);
const lastWriteTo = (sheet, column) => writesTo(sheet, column).pop()?.value;

{
  const { normalizeBbcMembership_ } = createAppsScriptContext();

  assert.equal(normalizeBbcMembership_("12345"), "12345");
  assert.equal(normalizeBbcMembership_("00123"), "00123");
  assert.equal(normalizeBbcMembership_("  bbc   12-34 "), "BBC 12-34");
  assert.equal(normalizeBbcMembership_("a"), "A");
  assert.equal(normalizeBbcMembership_("A".repeat(20)), "A".repeat(20));
  assert.equal(normalizeBbcMembership_(""), "");
  assert.equal(normalizeBbcMembership_("   "), "");
  assert.equal(normalizeBbcMembership_(undefined), "");
  [
    "-123",
    "=1+1",
    "+123",
    "@123",
    "'123",
    "123-",
    "1_2",
    "12.34",
    "12/34",
    "A".repeat(21),
    "=HYPERLINK(\"x\")",
    "１２３",
  ].forEach((value) => {
    assert.throws(
      () => normalizeBbcMembership_(value),
      /BBC membership number/,
      `must be rejected: ${value}`,
    );
  });
}

{
  // The client mirror in roster.js must accept and reject the same values.
  const source = fs.readFileSync(path.resolve(__dirname, "..", "roster.js"), "utf8");
  const start = source.indexOf("  function normalizeBbcMembership(value) {");
  assert.ok(start >= 0, "roster.js has normalizeBbcMembership");
  const end = source.indexOf("\n  }\n", start) + 4;
  const clientNormalize = vm.runInNewContext(`(${source.slice(start, end).trim()})`);
  const { normalizeBbcMembership_ } = createAppsScriptContext();
  [
    "12345",
    "00123",
    "  bbc   12-34 ",
    "a",
    "A".repeat(20),
    "A".repeat(21),
    "-123",
    "=1+1",
    "+123",
    "@123",
    "123-",
    "1_2",
    "12.34",
    "１２３",
    "",
    "   ",
  ].forEach((value) => {
    let server = "";
    try {
      server = normalizeBbcMembership_(value);
    } catch (error) {
      server = "";
    }
    assert.equal(clientNormalize(value), server, `client/server parity for ${value}`);
  });
}

{
  // Admin saves: set, keep when the param is missing, clear, reject invalid.
  const { context, sheet } = withRoster([["Ann", "@ann", "", "", "ann@example.com", ""]]);

  context.saveRosterMember_({ playerName: "Ann", venmo: "@ann", bbcMembership: "00123" });
  assert.equal(sheet.data[0][5], "00123");
  assert.equal(lastWriteTo(sheet, 6), "'00123", "written as plain text");
  assert.equal(sheet.data[0][4], "ann@example.com", "Zelle untouched");

  const bbcWrites = writesTo(sheet, 6).length;
  context.saveRosterMember_({ playerName: "Ann", venmo: "@ann2" });
  assert.equal(
    sheet.data[0][5],
    "00123",
    "a save without bbcMembership (older cached page) keeps the stored value",
  );
  context.saveRosterMember_({ playerName: "Ann", venmo: "@ann2", bbcMembership: "00123" });
  assert.equal(writesTo(sheet, 6).length, bbcWrites, "an unchanged value isn't rewritten");

  context.saveRosterMember_({ oldPlayerName: "Ann", playerName: "Anna", venmo: "@ann" });
  assert.deepEqual([...sheet.data[0]], ["Anna", "@ann", "", "", "ann@example.com", "00123"]);

  assert.throws(
    () =>
      context.saveRosterMember_({ playerName: "Anna", venmo: "@ann", bbcMembership: "=1+1" }),
    /BBC membership number/,
  );
  assert.equal(sheet.data[0][5], "00123");

  context.saveRosterMember_({ playerName: "Anna", venmo: "@ann", bbcMembership: "" });
  assert.equal(sheet.data[0][5], "", "an admin can clear it");
  assert.equal(lastWriteTo(sheet, 6), "");

  context.saveRosterMember_({ playerName: "Cat", venmo: "@cat", bbcMembership: "bbc-7" });
  assert.deepEqual([...sheet.data[1]], ["Cat", "@cat", "", "", "", "BBC-7"]);
  assert.equal(lastWriteTo(sheet, 6), "'BBC-7");
}

{
  // Anonymous completes: fill only an empty value.
  const { context, sheet } = withRoster([
    ["Ann", "@ann", "", "", "", ""],
    ["Bob", "@bob", "", "", "", "777"],
  ]);

  const result = context.completeRosterMemberInfo_({
    playerName: "Ann",
    venmo: "@ann",
    bbcMembership: "4567",
  });
  assert.deepEqual(Array.from(result.updatedFields), ["BBC membership #"]);
  assert.equal(sheet.data[0][5], "4567");
  assert.equal(lastWriteTo(sheet, 6), "'4567", "written as plain text");
  assert.deepEqual(
    sheet.cellWrites.map((write) => [write.row, write.column]),
    [[2, 6]],
    "only the changed cell is written",
  );

  assert.throws(
    () => context.completeRosterMemberInfo_({ playerName: "Bob", bbcMembership: "777" }),
    /no missing member info/,
    "the same value is not a change",
  );
  assert.throws(
    () => context.completeRosterMemberInfo_({ playerName: "Bob", bbcMembership: "888" }),
    /Admin login is required to change an existing BBC membership number/,
  );
  assert.throws(
    () => context.completeRosterMemberInfo_({ playerName: "Ann", bbcMembership: "-5" }),
    /BBC membership number/,
  );
  assert.equal(sheet.data[1][5], "777");
}

{
  // A stored value that fails validation (typed into the Sheet by hand, or a
  // date Sheets made of it) must not block other saves, and an unchanged cell
  // is never rewritten (a Date must never be stringified into it).
  const date = new Date(2026, 0, 2);
  const { context, sheet } = withRoster([
    ["Ann", "@ann", "", "", "", "#123"],
    ["Bob", "@bob", "", "", "", date],
  ]);
  const roster = context.getRoster_();
  const annStored = roster[0].bbcMembership;
  const bobStored = roster[1].bbcMembership;
  assert.equal(annStored, "#123");

  context.saveRosterMember_({ playerName: "Ann", venmo: "@ann", bbcMembership: annStored });
  context.saveRosterMember_({ playerName: "Ann", venmo: "@ann", note: "admin note" });
  context.saveRosterMember_({ playerName: "Bob", venmo: "@bob", bbcMembership: bobStored });
  context.saveRosterMember_({ oldPlayerName: "Bob", playerName: "Bobby", venmo: "@bob" });
  assert.deepEqual(writesTo(sheet, 6), [], "admin saves leave an unchanged cell alone");
  assert.equal(sheet.data[0][5], "#123");
  assert.equal(sheet.data[1][5], date);
  assert.throws(
    () => context.saveRosterMember_({ playerName: "Ann", venmo: "@ann", bbcMembership: "#124" }),
    /BBC membership number/,
    "a changed value is still validated",
  );

  const annResult = context.completeRosterMemberInfo_({
    playerName: "Ann",
    venmo: "@ann",
    note: "hi",
    bbcMembership: annStored,
  });
  assert.deepEqual(Array.from(annResult.updatedFields), ["Note"]);
  const bobResult = context.completeRosterMemberInfo_({
    playerName: "Bobby",
    venmo: "@bob",
    note: "hey",
    bbcMembership: bobStored,
  });
  assert.deepEqual(Array.from(bobResult.updatedFields), ["Note"]);
  assert.deepEqual(writesTo(sheet, 6), [], "member updates leave an unchanged cell alone");
  assert.equal(sheet.data[0][5], "#123");
  assert.equal(sheet.data[1][5], date, "the date cell is untouched");
  assert.equal(
    sheet.cellWrites.some((write) => write.value instanceof Date || /GMT/.test(String(write.value))),
    false,
    "no Date is ever written back",
  );
  assert.throws(
    () => context.completeRosterMemberInfo_({ playerName: "Ann", bbcMembership: "999" }),
    /Admin login is required to change an existing BBC membership number/,
  );
}

{
  // listRoster: BBC membership is public; Zelle stays admin-only.
  const { context } = withRoster([["Ann", "@ann", "", "", "ann@example.com", "123"]]);
  context.ContentService = {
    MimeType: { JAVASCRIPT: "js" },
    createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
  };
  context.hasAdminToken_ = (token) => token === "good";
  const call = (params) => {
    const { text } = context.doGet({ parameter: { callback: "cb", ...params } });
    return JSON.parse(text.slice(3, -2));
  };
  const anonymous = call({ action: "listRoster" });
  assert.equal(anonymous.roster[0].bbcMembership, "123");
  assert.equal("zelle" in anonymous.roster[0], false);
  assert.equal("hasZelle" in anonymous.roster[0], false);
  const admin = call({ action: "listRoster", adminToken: "good" });
  assert.equal(admin.roster[0].bbcMembership, "123");
  assert.equal(admin.roster[0].zelle, "ann@example.com");
}

{
  // Column F is a real column now: migrations neither merge nor delete it.
  const { context, sheet } = withRoster([
    ["Ann", "@ann", "", "note A", "ann@bank.example", "123"],
  ]);
  sheet.header = ["Name", "Venmo", "Facebook", "Note", "Zelle", "BBC Membership"];
  sheet.getRange = ((getRange) =>
    function (row, column, numRows, numColumns) {
      if (row === 1) {
        return { getValues: () => [sheet.header.slice(column - 1, column - 1 + (numColumns || 1))] };
      }
      return getRange.call(this, row, column, numRows, numColumns);
    })(sheet.getRange);
  sheet.deleteColumns = () => assert.fail("must not delete columns");
  context.migrateRosterSheet_(sheet);
  assert.deepEqual([...sheet.data[0]], ["Ann", "@ann", "", "note A", "ann@bank.example", "123"]);
}

{
  // getRosterSheet_ adds the header (and a column if the sheet is too narrow).
  const context = createAppsScriptContext();
  const header = ["Name", "Venmo", "Facebook", "Note", "Zelle"];
  let maxColumns = 5;
  const inserted = [];
  const sheet = {
    getLastRow: () => 1,
    getLastColumn: () => header.length,
    getMaxColumns: () => maxColumns,
    insertColumnsAfter(after, count) {
      inserted.push([after, count]);
      maxColumns += count;
    },
    getRange(row, column, numRows, numColumns) {
      assert.ok(column - 1 + numColumns <= maxColumns, "range inside the sheet");
      return {
        getValues: () => [header.slice(column - 1, column - 1 + numColumns)],
        setValues: (values) => header.splice(0, values[0].length, ...values[0]),
      };
    },
    setFrozenRows() {},
  };
  context.getRsvpSpreadsheet_ = () => ({ getSheetByName: () => sheet });
  context.getRosterSheet_();
  assert.deepEqual(inserted, [[5, 1]]);
  assert.deepEqual(header, ["Name", "Venmo", "Facebook", "Note", "Zelle", "BBC Membership"]);
}

console.log("roster-bbc tests passed");
