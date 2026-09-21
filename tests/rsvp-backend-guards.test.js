"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ console });
vm.runInContext(
  fs.readFileSync(
    path.resolve(
      __dirname,
      "..",
      "google-apps-script",
      "rsvp-web-app",
      "Code.gs",
    ),
    "utf8",
  ),
  context,
);

assert.equal(context.validatePlayDate_("2026-05-24"), "2026-05-24");
assert.throws(() => context.validatePlayDate_("2026-02-30"), /invalid/);
assert.throws(() => context.validatePlayDate_("2026-05-25"), /must be Tuesday/);

context.isBillingMonthFinalized_ = () => true;
assert.throws(
  () => context.requirePublicRsvpMutationAllowed_("2100-01-01"),
  /billing month is finalized/,
);

context.isBillingMonthFinalized_ = () => false;
context.isUnvoteLocked_ = () => true;
assert.throws(
  () => context.requirePublicRsvpMutationAllowed_("2100-01-01"),
  /RSVP changes close/,
);

context.isUnvoteLocked_ = () => false;
assert.doesNotThrow(() =>
  context.requirePublicRsvpMutationAllowed_("2100-01-01"),
);

context.LockService = {
  getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
};
context.getRosterNameSet_ = () => ({ "nam pham": true });
let sourceReads = 0;
context.getSheet_ = () => {
  sourceReads += 1;
  return {};
};
context.requirePublicRsvpMutationAllowed_ = () => {
  throw new Error("guarded mutation");
};
assert.throws(
  () => context.upsertRsvpWithLock_({
    playDate: "2026-05-24",
    playerName: "Nam Pham",
    participantCount: 1,
  }),
  /guarded mutation/,
);
assert.throws(
  () => context.deleteRsvp_({
    playDate: "2026-05-24",
    playerName: "Nam Pham",
  }),
  /guarded mutation/,
);
assert.equal(sourceReads, 0, "blocked public writes do not access the RSVP source sheet");

let duplicateDeletes = 0;
context.requirePublicRsvpMutationAllowed_ = () => {};
context.invalidateTallyCache_ = () => {};
context.appendAuditLog_ = () => ({});
context.deleteDuplicateRows_ = () => {
  duplicateDeletes += 1;
};
context.buildAndCacheTally_ = () => ({ players: [], totalCount: 0 });
context.getSheet_ = () => ({
  getLastRow: () => 3,
  getRange: () => ({
    getValues: () => [
      ["2026-05-24", "Nam Pham", "Yes", 1, "", ""],
      ["2026-05-24", "Nam Pham", "Yes", 1, "", ""],
    ],
  }),
});
const confirmation = context.upsertRsvpWithLock_({
  playDate: "2026-05-24",
  playerName: "Nam Pham",
  participantCount: 2,
});
assert.equal(confirmation.action, "needs_confirmation");
assert.equal(
  duplicateDeletes,
  0,
  "a confirmation response must not delete duplicate source rows",
);

console.log("RSVP backend guard tests passed");
