"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const backendSource = fs.readFileSync(
  path.join(root, "google-apps-script/Code.gs"), "utf8",
);
const createBackend = () => {
  const context = vm.createContext({ console });
  vm.runInContext(backendSource, context);
  context.jsonp_ = (callback, payload) => payload;
  return context;
};

async function testAdminPage() {
  const makeElement = () => ({
    value: "", dataset: {}, children: [], classList: { toggle() {} },
    addEventListener() {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
  });
  const elements = new Map();
  const context = vm.createContext({
    console,
    window: { addEventListener() {} },
    document: {
      createElement: makeElement,
      querySelector: (selector) => {
        if (!elements.has(selector)) {
          elements.set(selector, makeElement());
        }
        return elements.get(selector);
      },
    },
  });
  // Expose the actual page load/save functions without login or network setup.
  const source = fs.readFileSync(path.join(root, "admin.js"), "utf8");
  assert(source.includes("  initialize();"));
  vm.runInContext(source.replace("  initialize();", `
    window.testAdmin = {
      getPlayDatesForMonth, loadMonth, saveChanges,
      configure(request) {
        adminToken = "admin-token";
        PLAYERS = ["Alice"];
        requestAppsScript = request;
        getAuditMetadata = async () => ({});
        renderAuditDateFilter = () => {};
        loadAudit = () => {};
      },
      readCount(name, date) { return rosterValues.get(getKey(name, date)); },
      editCount(name, date, count) { changedValues.set(getKey(name, date), count); }
    };
  `), context);
  const page = context.window.testAdmin;
  assert.equal(page.getPlayDatesForMonth("2026-11").length, 30);
  assert(page.getPlayDatesForMonth("2026-11").includes("2026-11-04"),
    "Wednesday must be available even before anyone has voted");
  assert(page.getPlayDatesForMonth("2026-11").includes("2026-11-30"),
    "all dates remain editable, including the end of the current month");
  assert.equal(page.getPlayDatesForMonth("2028-02").length, 29);
  assert.equal(page.getPlayDatesForMonth("2026-13").length, 0);
  elements.get("#roster-month").value = "2026-11";
  const requests = [];
  page.configure(async (payload) => {
    requests.push(payload);
    return { attendance: [
      { date: "2026-11-04", players: [{ name: "Alice", spots: 2 }] },
      { date: "2026-10-28", players: [{ name: "Alice", spots: 5 }] },
    ] };
  });
  await page.loadMonth("2026-11");
  assert.equal(requests.length, 1, "load every date in one monthly request");
  assert.equal(requests[0].action, "listAdminAttendance");
  assert.equal(requests[0].adminToken, "admin-token");
  assert.equal(page.readCount("Alice", "2026-11-04"), 2);
  assert.equal(page.readCount("Alice", "2026-10-28"), undefined);
  const [thead, tbody] = elements.get("#roster-table").children;
  assert.equal(thead.children[0].children.length, 31, "name plus every calendar date is displayed");
  assert.equal(thead.children[0].children[4].dataset.date, "2026-11-04");
  assert.equal(tbody.children[0].children[4].children[0].dataset.date, "2026-11-04");
  assert(tbody.children[0].children[4].children[0].children.some(
    (option) => option.value === "2" && option.selected,
  ), "the Wednesday cell displays its saved RSVP count");
  page.editCount("Alice", "2026-11-04", 3);
  await page.saveChanges();
  assert.equal(requests[1].action, "adminUpsertRsvp");
  assert.equal(requests[1].playDate, "2026-11-04");
  assert.equal(requests[1].participantCount, 3);
  assert.equal(requests[1].adminToken, "admin-token");
}

function testMonthlyRead() {
  const backend = createBackend();
  const rows = [
    ["2026-11-04", "Alice", "Yes", 2],
    ["2026-11-04", "Bob", "Yes", 1],
    ["2026-11-07", "Alice", "Yes", 1],
    ["2026-10-28", "Alice", "Yes", 1],
    ["2026-11-04", "Unknown", "Yes", 5],
    ["2026-11-04", "Alice", "No", 1],
  ];
  let reads = 0;
  backend.requireAdmin_ = (params) => {
    if (params.adminToken !== "admin-token") throw new Error("Admin login required");
  };
  backend.getRosterNameSet_ = () => ({ alice: true, bob: true });
  backend.getSheet_ = () => ({
    getLastRow: () => rows.length + 1,
    getRange: () => ({ getValues: () => { reads += 1; return rows; } }),
  });
  const call = (params) => backend.doGet({ parameter: {
    action: "listAdminAttendance", month: "2026-11", ...params,
  } });
  assert.match(call({}).error, /Admin login required/);
  assert.equal(reads, 0, "unauthorized callers cannot read monthly attendance");
  const response = call({ adminToken: "admin-token" });
  assert.equal(response.ok, true);
  assert.equal(reads, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(response.attendance)), [
    { date: "2026-11-04", players: [{ name: "Alice", spots: 2 }, { name: "Bob", spots: 1 }] },
    { date: "2026-11-07", players: [{ name: "Alice", spots: 1 }] },
  ], "include nonstandard dates and low-count sessions for admin corrections");
  assert.match(call({ adminToken: "admin-token", month: "2026-13" }).error,
    /Month must be between/);
}

function testPastWednesdayBackfill() {
  const backend = createBackend();
  let saved;
  let finalized = false;
  backend.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  backend.requireAdmin_ = () => {};
  backend.validatePlayerName_ = () => {};
  backend.getBillingMonthStatus_ = () => ({ status: finalized ? "finalized" : "draft" });
  backend.isUnvoteLocked_ = () => true;
  backend.findExistingRows_ = () => [];
  backend.getSheet_ = () => ({ appendRow: (row) => { saved = row; }, getLastRow: () => 2 });
  backend.getTally_ = () => ({});
  backend.appendAuditLog_ = () => ({});
  const params = {
    action: "adminUpsertRsvp", adminToken: "admin-token",
    playDate: "2026-11-04", playerName: "Alice", participantCount: 4,
  };
  assert.equal(backend.upsertRsvpWithLock_(params).action, "created");
  assert.equal(saved[0], "2026-11-04");
  assert.equal(saved[3], 4);
  assert.throws(() => backend.upsertRsvpWithLock_({ ...params, action: undefined }),
    /RSVP changes close/, "public requests remain subject to the cutoff");
  finalized = true;
  assert.throws(() => backend.upsertRsvpWithLock_(params),
    /Reopen billing month/, "backfilling a finalized month requires reopening it");
}

function testWednesdayCostsAndReport() {
  const backend = createBackend();
  const browser = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, "balances-core.js"), "utf8"), browser);
  const billing = {
    month: "2026-11",
    attendance: [
      { date: "2026-11-04", players: [{ name: "Alice", spots: 4 }] },
      { date: "2026-11-08", players: [{ name: "Bob", spots: 4 }] },
    ],
    courtBlocks: [
      { date: "2026-11-04", amount: 40, paidBy: "Alice", status: "active" },
      { date: "2026-11-08", amount: 60, paidBy: "Bob", status: "active" },
    ],
    birdiePurchases: [{ date: "2026-11-30", amount: 50, recordType: "usage", status: "active" }],
  };
  const members = backend.calculateBillingMemberBalances_(billing);
  assert.deepEqual(JSON.parse(JSON.stringify(members)),
    JSON.parse(JSON.stringify(browser.window.BalanceCalculator.calculateMonthBalances(billing).members)));
  assert.equal(members[0].courtFee, 40);
  assert.equal(members[0].credits, 40);
  assert.equal(members[0].birdieFee, 20, "Wednesday uses normal birdie weight");
  assert.equal(members[1].birdieFee, 30, "only Sunday has 1.5 birdie weight");
  backend.getRosterNames_ = () => ["Alice", "Bob"];
  const rows = [
    ["2026-11-04", "Alice", "Yes", 4],
    ["2026-11-08", "Bob", "Yes", 4],
  ];
  const matrix = backend.buildMonthRosterMatrix_({
    getLastRow: () => rows.length + 1,
    getRange: () => ({ getValues: () => rows }),
  }, "2026-11");
  assert.equal(matrix[0][1], "11/04/2026", "report includes the backfilled Wednesday");
  assert.equal(matrix[1][1], 4);
}

(async () => {
  await testAdminPage();
  testMonthlyRead();
  testPastWednesdayBackfill();
  testWednesdayCostsAndReport();
  console.log("Admin attendance tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
