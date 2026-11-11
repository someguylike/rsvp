"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
process.env.TZ = "America/Los_Angeles";
const root = path.resolve(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const file of ["google-apps-script/Code.gs", "google-apps-script/rsvp-web-app/Code.gs"]) {
  const backend = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), backend);
  let reads = 0;
  let rosterReads = 0;
  const cache = new Map();
  backend.CacheService = { getScriptCache: () => ({
    get: (key) => cache.get(key) || null,
    put: (key, value) => cache.set(key, value),
    remove: (key) => cache.delete(key),
  }) };
  backend.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  const rows = [
    ["2026-11-11", "Alice", "Yes", 1],
    ["2026-11-11", "Bob", "Yes", 2],
    ["2026-11-14", "Alice", "Yes", 1],
    ["2026-11-15", "Bob", "Yes", 2],
    ["2026-11-18", "Bob", "Yes", 1],
    ["2026-11-12", "Alice", "No", 3],
    ["2026-11-13", "Unknown", "Yes", 5],
    ["2026-11-10", "Alice", "Yes", 0],
    ["2026-11-08", "Alice", "Yes", 1],
  ];
  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange: (row, col, count, width) => {
      assert.equal(row, 2);
      assert.equal(col, 1);
      assert(width === 4 || width === 6);
      return { getValues: () => { reads += 1; return rows; } };
    },
  };
  backend.getRsvpSheetForRead_ = () => sheet;
  backend.getSheet_ = () => sheet;
  backend.getRosterNameSet_ = () => { rosterReads += 1; return { alice: true, bob: true }; };
  backend.jsonp_ = (callback, payload) => payload;
  const payload = {
    action: "list", playDate: "2026-11-11",
    startDate: "2026-11-09", endDate: "2026-11-15",
  };
  const response = backend.doGet({ parameter: payload });
  assert.equal(response.ok, true, file);
  assert.equal(response.tally.totalCount, 3);
  assert.equal(reads, 1, "selected tally and week counts share one source read");
  assert.equal(rosterReads, 1, "selected tally and week counts share one roster read");
  assert.deepEqual(plain(response.tally.votedDates), {
    startDate: "2026-11-09", endDate: "2026-11-15",
    dates: [
      { date: "2026-11-11", totalCount: 3 },
      { date: "2026-11-14", totalCount: 1 },
      { date: "2026-11-15", totalCount: 2 },
    ],
  }, "include 1+ votes Monday–Sunday; exclude previous Sunday, No, zero, unknown and future dates");
  if (file.includes("rsvp-web-app")) {
    backend.doGet({ parameter: payload });
    assert.equal(reads, 1, "the existing tally cache also serves the week counts");
    const realGetCachedTally = backend.getCachedTally_;
    let cacheChecks = 0;
    backend.getCachedTally_ = () => ++cacheChecks === 1 ? null : {
      playDate: "2026-11-11", totalCount: 4, playerCount: 1,
      players: [{ name: "Alice", participantCount: 4 }],
    };
    const newer = backend.doGet({ parameter: payload });
    assert.equal(newer.tally.totalCount, 4, "a concurrent writer's tally wins");
    assert.equal(newer.tally.votedDates.dates.find((day) => day.date === "2026-11-11").totalCount, 4);
    assert.equal(reads, 2, "adding weekly counts to a writer's tally needs no second source read");
    backend.getCachedTally_ = realGetCachedTally;
    cache.clear();
  }
  const beforeInvalid = reads;
  for (const [startDate, endDate, message] of [
    ["2026-11-15", "2026-11-09", /1 to 31 days/],
    ["2026-11-01", "2026-12-02", /1 to 31 days/],
    ["2026-02-30", "2026-03-02", /invalid/],
  ]) {
    const result = backend.doGet({ parameter: { ...payload, startDate, endDate } });
    assert.equal(result.ok, false);
    assert.match(result.error, message);
  }
  assert.equal(reads, beforeInvalid, "invalid ranges fail before reading source data");
  assert.equal(backend.doGet({ parameter: { action: "list", playDate: "2026-11-11" } }).ok, true,
    "existing clients can still request a single date without a range");
  rows.length = 0;
  cache.clear();
  const empty = backend.doGet({ parameter: payload });
  assert.equal(empty.tally.totalCount, 0);
  assert.deepEqual(plain(empty.tally.votedDates.dates), []);
}

async function testDateChoices() {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ["2026-11-10T10:00:00-08:00"])); }
    static now() { return new Date("2026-11-10T10:00:00-08:00").getTime(); }
  }
  const elements = new Map();
  const storage = new Map();
  const makeElement = () => {
    const classes = new Set();
    return {
      value: "", dataset: {}, children: [], handlers: {}, attributes: {},
      classList: {
        contains: (name) => classes.has(name),
        add: (name) => classes.add(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener(key, handler) { this.handlers[key] = handler; },
      querySelectorAll() { return this.children; },
      focus() {}, showPicker() {},
    };
  };
  let isAdmin = false;
  const context = vm.createContext({
    Date: FixedDate, URL, console,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    document: {
      addEventListener() {}, createElement: makeElement,
      querySelector: (selector) => {
        if (!elements.has(selector)) elements.set(selector, makeElement());
        return elements.get(selector);
      },
    },
    window: {
      addEventListener() {}, clearTimeout() {},
      RsvpRules: { getStartOfMonthValue: () => "2026-11-01" },
      RsvpAdminAuth: { onChange() {}, getState: () => ({
        isLoggedIn: isAdmin, token: "test-token", expiresAt: FixedDate.now() + 60000,
      }) },
    },
  });
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  vm.runInContext(source.replace("  initialize();", `
    window.dateTests = {
      renderDateOptions, selectPlayDate, loadTally, applyMutationTally,
      getVotedDateRange, buildAppsScriptUrl,
      resetMemory() { votedDateCounts.clear(); tallySnapshotsByDate.clear(); },
      configure(request) {
        requestAppsScript = request;
        updatePlayerMemory = () => {};
        renderParticipantOptions = () => {};
        renderTally = () => {};
        scheduleTallyRefresh = () => {};
      }
    };
  `), context);
  const page = context.window.dateTests;
  const shortcuts = () => elements.get("#date-options").children;
  const values = () => shortcuts().map((button) => button.dataset.date);
  const selectedDate = () => elements.get("#play-date").value;
  const dates = [
    { date: "2026-11-08", totalCount: 5 },
    { date: "2026-11-11", totalCount: 1 },
    { date: "2026-11-14", totalCount: 3 },
    { date: "2026-11-12", totalCount: 2 },
    { date: "2026-11-15", totalCount: 2 },
    { date: "2026-11-18", totalCount: 2 },
    { date: "2026-11-16", totalCount: 0 },
  ];
  const makeResponse = (payload) => ({ tally: {
    playDate: payload.playDate, totalCount: 2, playerCount: 1,
    players: [{ name: "Alice", participantCount: 2 }],
    votedDates: { startDate: "2026-11-09", endDate: "2026-11-15", dates },
  } });
  const requests = [];
  let respond = makeResponse;
  page.configure(async (payload) => {
    requests.push(payload);
    assert.equal(payload.action, "list", "there is no separate date discovery request");
    assert.equal(payload.startDate, "2026-11-09");
    assert.equal(payload.endDate, "2026-11-15");
    return respond(payload);
  });
  await page.renderDateOptions();
  assert.equal(requests.length, 1, "initial tally and date shortcuts load in one request");
  assert.deepEqual(values(), [
    "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
    "2026-11-14", "2026-11-15", "custom",
  ], "merge current-week voted dates with standard choices; exclude Nov 8");
  await page.selectPlayDate("2026-11-15");
  const cacheKey = "play-rsvp.tally.2026-11-15";
  assert(storage.has(cacheKey), "week counts reuse the existing per-date tally storage");
  assert(![...storage.keys()].some((key) => key.includes("votedDates")),
    "no separate weekly browser cache is created");

  page.resetMemory();
  let finishRead;
  respond = () => new Promise((resolve) => { finishRead = resolve; });
  const refreshing = page.loadTally("2026-11-15");
  assert(values().includes("2026-11-11"), "existing cached tally shows voted dates before the response");
  assert(!values().includes("2026-11-08"));
  assert.equal(selectedDate(), "2026-11-15", "background refresh preserves selection");
  finishRead(makeResponse({ playDate: "2026-11-15" }));
  await refreshing;
  respond = makeResponse;

  const sundayCache = JSON.parse(storage.get(cacheKey));
  sundayCache.tally.votedDates = {
    startDate: "2026-11-02", endDate: "2026-11-08",
    dates: [{ date: "2026-11-08", totalCount: 5 }],
  };
  storage.set(cacheKey, JSON.stringify(sundayCache));
  page.resetMemory();
  respond = () => new Promise((resolve) => { finishRead = resolve; });
  const newWeek = page.loadTally("2026-11-15");
  assert(!values().includes("2026-11-08"), "an old cached week cannot add last Sunday");
  finishRead(makeResponse({ playDate: "2026-11-15" }));
  await newWeek;
  respond = makeResponse;

  const wednesday = shortcuts().find((button) => button.dataset.date === "2026-11-11");
  assert.match(wednesday.children[1].textContent, /1 spot$/);
  wednesday.handlers.click();
  await page.loadTally("2026-11-11");
  assert.equal(selectedDate(), "2026-11-11", "a voted date is directly selectable");
  page.applyMutationTally("2026-11-11", { totalCount: 0, players: [] });
  assert(!values().includes("2026-11-11"));
  assert.equal(selectedDate(), "2026-11-11", "removing the last vote preserves the selected date");
  assert.equal(elements.get("#custom-play-date").value, "2026-11-11");
  assert(!JSON.parse(storage.get("play-rsvp.tally.2026-11-11")).tally.votedDates.dates
    .some((day) => day.date === "2026-11-11"), "mutation updates the existing tally cache too");

  await page.selectPlayDate("2026-11-09", { isCustom: true });
  page.applyMutationTally("2026-11-09", { totalCount: 1, players: [] });
  assert(values().includes("2026-11-09"), "a first vote adds a current-week date immediately");
  await page.selectPlayDate("2026-11-16", { isCustom: true });
  page.applyMutationTally("2026-11-16", { totalCount: 1, players: [] });
  assert(!values().includes("2026-11-16"), "next week's extra dates stay under Other date");
  await page.selectPlayDate("2026-11-12");
  page.applyMutationTally("2026-11-12", { totalCount: 0, players: [] });
  assert(values().includes("2026-11-12"), "standard dates stay even without votes");

  await page.selectPlayDate("2026-11-14");
  respond = () => new Promise((resolve) => { finishRead = resolve; });
  const oldRead = page.loadTally("2026-11-14");
  page.applyMutationTally("2026-11-14", { totalCount: 0, players: [] });
  finishRead(makeResponse({ playDate: "2026-11-14" }));
  await oldRead;
  assert(!values().includes("2026-11-14"), "an older tally response cannot undo a local removal");
  const beforeFailure = values();
  respond = () => { throw new Error("offline"); };
  await page.loadTally("2026-11-14");
  assert.deepEqual(values(), beforeFailure, "failed refresh keeps existing date choices usable");

  isAdmin = true;
  assert(page.buildAppsScriptUrl({ action: "list" }).includes("ah0EF/exec"));
  isAdmin = false;
  assert(page.buildAppsScriptUrl({ action: "list" }).includes("4x64VQ/exec"));
  assert.deepEqual(plain(page.getVotedDateRange(new Date("2026-11-10T12:00:00-08:00"))),
    { startDate: "2026-11-09", endDate: "2026-11-15" });
  assert.deepEqual(plain(page.getVotedDateRange(new Date("2026-11-30T12:00:00-08:00"))),
    { startDate: "2026-11-30", endDate: "2026-12-06" }, "weeks cross month boundaries");
  assert.deepEqual(plain(page.getVotedDateRange(new Date("2026-11-01T12:00:00-08:00"))),
    { startDate: "2026-10-26", endDate: "2026-11-01" }, "Sunday ends the week across DST");
}

testDateChoices().then(() => console.log("RSVP voted date tests passed"))
  .catch((error) => { console.error(error); process.exitCode = 1; });
