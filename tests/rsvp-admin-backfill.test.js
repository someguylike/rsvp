"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

(async () => {
  const elements = new Map();
  const storage = new Map();
  const makeElement = () => ({
    value: "", hidden: false, dataset: {}, children: [], handlers: {},
    classList: { toggle() {} },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    removeAttribute(name) { delete this[name]; },
  });
  let authState = { isLoggedIn: false, token: "", expiresAt: 0 };
  let result = { ok: true, action: "created", tally: { players: [] } };
  let failure = null;
  const requests = [];
  const confirmations = [];
  const context = vm.createContext({
    console, URL, Intl,
    navigator: {},
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    document: {
      referrer: "", addEventListener() {},
      createElement: makeElement,
      querySelector: (selector) => {
        if (!elements.has(selector)) elements.set(selector, makeElement());
        return elements.get(selector);
      },
    },
    window: {
      location: { href: "https://example.test/index.html" },
      addEventListener() {}, clearTimeout() {},
      RsvpRules: {
        isUnvoteLocked: () => true,
        getStartOfMonthValue: () => "2026-11-01",
      },
      RsvpAdminAuth: {
        ready: Promise.resolve(), onChange() {}, getState: () => authState,
      },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(source.replace("  initialize();", `
    window.testRsvp = {
      buildAppsScriptUrl, requestRsvpMutation, canSelectNotGoing,
      updateAdminBackfill, submitRsvp, removeExistingRsvp,
      configure(transport, confirm, payload) {
        requestViaJsonp = transport;
        askOverrideConfirmation = confirm;
        collectPayload = () => ({ ...payload });
        enrichPayloadWithAuditMetadata = async (value) => value;
        selectedPlayerName = payload.playerName;
        updatePlayerMemory = () => {};
        applyMutationTally = () => {};
        loadTally = () => {};
      }
    };
  `), context);
  const page = context.window.testRsvp;
  const payload = {
    playerName: "Hoan Nguyen", playDate: "2026-10-28", participantCount: 2,
    vote: "Yes", browserId: "test-browser",
  };
  page.configure(async (request) => {
    requests.push(request);
    if (failure) throw failure;
    return result;
  }, (existing, request) => confirmations.push(request), payload);
  elements.get("#play-date").value = payload.playDate;
  const submit = () => elements.get("#rsvp-form").handlers.submit({ preventDefault() {} });

  page.updateAdminBackfill();
  assert.equal(elements.get("#custom-play-date").min, "2026-11-01");
  assert.equal(elements.get("#admin-backfill-notice").hidden, true);
  assert.equal(page.canSelectNotGoing(payload.playDate), false);
  await submit();
  assert.equal(requests.length, 0, "logged-out users cannot submit past the cutoff");
  assert.match(elements.get("#status").textContent, /closed/);
  assert(page.buildAppsScriptUrl({ action: "list" }).includes("4x64VQ/exec"));

  authState = { isLoggedIn: true, token: "test-admin-token", expiresAt: Date.now() + 60000 };
  page.updateAdminBackfill();
  assert.equal(elements.get("#custom-play-date").min, undefined);
  assert.equal(elements.get("#admin-backfill-notice").hidden, false);
  assert.equal(page.canSelectNotGoing(payload.playDate), true);
  assert(elements.get("#participant-count").children.some((option) => option.value === "0"));
  await submit();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].action, "adminUpsertRsvp");
  assert.equal(requests[0].adminToken, "test-admin-token");
  assert.equal(requests[0].playDate, "2026-10-28");
  assert.equal(requests[0].participantCount, 2);
  assert(page.buildAppsScriptUrl(requests[0]).includes("ah0EF/exec"));
  assert(page.buildAppsScriptUrl({ action: "list" }).includes("ah0EF/exec"),
    "admin refresh reads fresh data instead of the public tally cache");
  assert(!storage.get("play-rsvp.lastRsvp").includes("adminToken"));

  result = { ok: true, action: "needs_confirmation", existing: { participantCount: 1 } };
  await page.submitRsvp(payload);
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].adminToken, undefined);
  result = { ok: true, action: "updated", tally: { players: [] } };
  await page.submitRsvp({ ...confirmations[0], confirmOverride: "true" });
  assert.equal(requests.at(-1).confirmOverride, "true");
  assert.equal(requests.at(-1).action, "adminUpsertRsvp");

  result = { ok: true, action: "deleted", tally: { players: [] } };
  await page.removeExistingRsvp(payload);
  assert.equal(requests.at(-1).action, "adminUpsertRsvp");
  assert.equal(requests.at(-1).participantCount, 0);
  assert.equal(requests.at(-1).vote, "No");

  failure = new Error("Reopen billing month 2026-10 as Draft before changing source data");
  const beforeFailure = requests.length;
  await page.submitRsvp(payload);
  assert.match(elements.get("#status").textContent, /Reopen billing month/);
  assert.equal(requests.length, beforeFailure + 1,
    "a rejected admin write must not retry as a public write");
  failure = null;

  authState = { ...authState, expiresAt: Date.now() - 1 };
  page.updateAdminBackfill();
  assert.equal(page.canSelectNotGoing(payload.playDate), false);
  const beforeExpired = requests.length;
  await submit();
  assert.equal(requests.length, beforeExpired, "expired login cannot bypass the cutoff");

  authState = { isLoggedIn: false, token: "", expiresAt: 0 };
  await page.requestRsvpMutation({ ...payload, action: "delete" });
  assert.equal(requests.at(-1).action, "delete");
  assert.equal(requests.at(-1).adminToken, undefined);
  assert(page.buildAppsScriptUrl(requests.at(-1)).includes("4x64VQ/exec"));
  console.log("RSVP admin backfill tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
