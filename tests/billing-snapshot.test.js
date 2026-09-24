"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const browserContext = vm.createContext({ window: {} });
vm.runInContext(
  fs.readFileSync(path.join(root, "balances-core.js"), "utf8"),
  browserContext,
);

const appsScriptContext = vm.createContext({ console });
const appsScriptSource = fs.readFileSync(
  path.join(root, "google-apps-script", "Code.gs"),
  "utf8",
);
vm.runInContext(
  appsScriptSource,
  appsScriptContext,
);

const billing = {
  month: "2026-06",
  attendance: [
    {
      date: "2026-06-05",
      players: [
        { name: "Alice", spots: 1 },
        { name: "Bob", spots: 3 },
      ],
    },
    {
      date: "2026-06-07",
      players: [
        { name: "Alice", spots: 1 },
        { name: "Cara", spots: 3 },
      ],
    },
  ],
  courtBlocks: [
    {
      date: "2026-06-05",
      amount: 60,
      paidBy: "Alice",
      status: "active",
    },
    {
      date: "2026-06-07",
      amount: 50,
      paidBy: "Bob",
      status: "active",
    },
    {
      date: "2026-06-07",
      amount: 20,
      paidBy: "Cara",
      status: "canceled",
    },
  ],
  birdiePurchases: [
    {
      id: "purchase-june",
      date: "2026-06-01",
      reimbursedDate: "2026-07-31",
      amount: 120,
      paidBy: "Cara",
      status: "active",
      recordType: "inventory_purchase",
    },
    {
      id: "usage-june",
      date: "2026-06-07",
      amount: 36,
      paidBy: "",
      status: "active",
      recordType: "usage",
    },
    {
      id: "usage-may",
      date: "2026-05-31",
      amount: 24,
      paidBy: "",
      status: "active",
      recordType: "usage",
    },
  ],
  payments: [{ playerName: "Bob", status: "Paid" }],
  adjustments: [
    {
      playerName: "Alice",
      amount: 5,
      status: "active",
    },
  ],
};

const browserResult = browserContext.window.BalanceCalculator.calculateMonthBalances(
  billing,
);
const snapshotMembers = appsScriptContext.calculateBillingMemberBalances_(billing);

assert.deepEqual(
  JSON.parse(JSON.stringify(snapshotMembers)),
  JSON.parse(JSON.stringify(browserResult.members)),
  "Apps Script snapshots must match the browser billing calculation",
);
assert.equal(
  snapshotMembers.find((member) => member.name === "Cara").credits,
  0,
  "Apps Script snapshots move inventory credit to the reimbursement month",
);

const movedFinalizedPurchase = {
  month: "2026-06",
  id: "finalized-2026-06-birdie-inventory-1",
  date: "2026-06-01",
  reimbursedDate: "2026-07-31",
  amount: 300,
  paidBy: "Cara",
  status: "active",
  recordType: "inventory_purchase",
};
const legacyCredit = {
  id: "finalized-2026-06-credit-cara",
  playerName: "Cara",
  amount: 300,
  note: "Imported finalized shuttle purchase credit",
  status: "active",
};
const juneLegacy = appsScriptContext.calculateBillingMemberBalances_({
  month: "2026-06",
  attendance: [],
  courtBlocks: [],
  birdiePurchases: [movedFinalizedPurchase],
  payments: [],
  adjustments: [legacyCredit],
});
const julyMoved = appsScriptContext.calculateBillingMemberBalances_({
  month: "2026-07",
  attendance: [],
  courtBlocks: [],
  birdiePurchases: [movedFinalizedPurchase],
  payments: [],
  adjustments: [],
});
assert.equal(juneLegacy.find((member) => member.name === "Cara").credits, 0);
assert.equal(julyMoved.find((member) => member.name === "Cara").credits, 300);

const snapshotRows = [
  ["2026-06", "", 0, 0, 0, 0, 0, 0, "2026-07-01T00:00:00Z", 4],
  ["2026-06", "Alice", 1, 1, 20, 5, 0, 25, "2026-07-01T00:00:00Z", 4],
  ["2026-07", "", 0, 0, 0, 0, 0, 0, "2026-08-01T00:00:00Z", 4],
  ["2026-07", "Bob", 2, 2, 30, 10, 5, 35, "2026-08-01T00:00:00Z", 4],
];
appsScriptContext.getFinalizedBillingMonths_ = () => ["2026-06", "2026-07"];
appsScriptContext.getBillingMemberBalanceSheet_ = () => ({
  getLastRow: () => snapshotRows.length + 1,
  getRange: () => ({ getValues: () => snapshotRows }),
});
appsScriptContext.getBillingPaymentSummaries_ = () => ({
  "2026-06\nalice": { status: "Paid", source: "Admin" },
  "2026-07\nbob": { status: "Requested", source: "" },
});
appsScriptContext.formatMonthLabel_ = (month) => ({
  "2026-06": "June 2026",
  "2026-07": "July 2026",
}[month] || month);
appsScriptContext.getPastBillingSourceMonths_ = () => [
  "2026-05",
  "2026-06",
  "2026-07",
];

const openSnapshots = appsScriptContext.listBillingBalanceSnapshots_();
assert.equal(openSnapshots.snapshotReady, true);
assert.deepEqual(JSON.parse(JSON.stringify(openSnapshots.finalizedMonths)), [
  "2026-06",
  "2026-07",
]);
assert.deepEqual(JSON.parse(JSON.stringify(appsScriptContext.getDraftBillingMonths_())), [
  "2026-05",
]);
assert.deepEqual(
  JSON.parse(JSON.stringify(openSnapshots.balances)),
  [
    {
      month: "2026-07",
      members: [
        {
          name: "Bob",
          spots: 2,
          weightedSpots: 2,
          courtFee: 30,
          birdieFee: 10,
          credits: 5,
          netBalance: 35,
          paymentStatus: "Requested",
        },
      ],
      calculatedAt: "2026-08-01T00:00:00Z",
    },
  ],
  "globally paid months stay stored but are excluded from payment loading",
);

const selfReportedMembers = appsScriptContext.getBillingSnapshotMembers_(
  {
    membersByMonth: {
      "2026-07": [
        {
          name: "Bob",
          spots: 2,
          weightedSpots: 2,
          courtFee: 30,
          birdieFee: 10,
          credits: 5,
          netBalance: 35,
        },
      ],
    },
  },
  "2026-07",
  {
    "2026-07\nbob": { status: "Paid", source: "Member self-report" },
  },
);
assert.equal(selfReportedMembers[0].paymentStatus, "Paid");
assert.equal(selfReportedMembers[0].paymentSource, "Member self-report");

const snapshotMonths = appsScriptContext.listBillingMonthSnapshots_();
assert.equal(snapshotMonths.snapshotReady, true);
assert.deepEqual(
  JSON.parse(JSON.stringify(snapshotMonths.months)),
  [
    {
      month: "2026-06",
      label: "June 2026",
      playerCount: 1,
      allPaid: true,
      billable: true,
      calculatedAt: "2026-07-01T00:00:00Z",
    },
    {
      month: "2026-07",
      label: "July 2026",
      playerCount: 1,
      allPaid: false,
      billable: true,
      calculatedAt: "2026-08-01T00:00:00Z",
    },
  ],
  "member month discovery reads only finalized snapshots",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(appsScriptContext.getBillingMonths_(false))),
  JSON.parse(JSON.stringify(snapshotMonths.months)),
  "the public month-list path never falls back to raw monthly recalculation",
);

const julySnapshot = appsScriptContext.getBillingMonthSnapshot_("2026-07");
assert.equal(julySnapshot.source, "balance_snapshot");
assert.equal(julySnapshot.calculationVersion, 4);
assert.equal(julySnapshot.members[0].netBalance, 35);
assert.equal(julySnapshot.members[0].paymentStatus, "Requested");
assert.deepEqual(JSON.parse(JSON.stringify(julySnapshot.summary)), {
  totalSpots: 2,
  totalWeightedSpots: 2,
  courtTotal: 30,
  birdieTotal: 10,
});
assert.deepEqual(JSON.parse(JSON.stringify(julySnapshot.attendance)), []);

appsScriptContext.getFinalizedBillingMonths_ = () => [
  "2026-06",
  "2026-07",
  "2026-08",
];
const incompleteSnapshots = appsScriptContext.listBillingBalanceSnapshots_();
assert.equal(incompleteSnapshots.snapshotReady, false);
assert.deepEqual(JSON.parse(JSON.stringify(incompleteSnapshots.missingMonths)), [
  "2026-08",
]);

{
  const sourceBilling = {
    month: "2026-07",
    attendance: [],
    courtBlocks: [],
    birdiePurchases: [],
    payments: [],
    adjustments: [],
    monthStatus: { status: "finalized" },
  };
  let refreshCall = null;
  appsScriptContext.LockService = {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
  };
  appsScriptContext.getBillingMonth_ = () => sourceBilling;
  appsScriptContext.refreshBillingMemberBalanceSnapshotIfFinalized_ =
    (month, billingValue, force) => {
      refreshCall = { month, billingValue, force };
      return { month, memberCount: 0 };
    };
  const refreshed = appsScriptContext.refreshBillingMonthSnapshot_({
    month: "2026-07",
  });
  assert.equal(refreshed.billing, sourceBilling);
  assert.equal(refreshCall.month, "2026-07");
  assert.equal(refreshCall.billingValue, sourceBilling);
  assert.equal(refreshCall.force, true, "admin refresh must force a snapshot rebuild");
  assert.match(
    appsScriptSource,
    /if \(params\.action === "refreshBillingMonth"\) \{\s*requireAdmin_\(params\);/,
    "refreshBillingMonth must remain admin-only",
  );
}

{
  let rawReads = 0;
  let adminChecks = 0;
  appsScriptContext.jsonp_ = (_callback, payload) => payload;
  appsScriptContext.hasAdminAccess_ = () => false;
  appsScriptContext.getBillingMonth_ = () => {
    rawReads += 1;
    throw new Error("public request read raw billing data");
  };
  appsScriptContext.getBillingMonthSnapshot_ = (month) => ({
    month,
    source: "balance_snapshot",
  });
  const publicResult = appsScriptContext.doGet({
    parameter: {
      action: "listBillingMonth",
      month: "2026-07",
      callback: "testCallback",
    },
  });
  assert.equal(publicResult.ok, true);
  assert.equal(publicResult.billing.source, "balance_snapshot");
  assert.equal(rawReads, 0, "public month detail must not read raw billing data");

  appsScriptContext.requireAdmin_ = () => {
    adminChecks += 1;
  };
  appsScriptContext.refreshBillingMonthSnapshot_ = () => ({
    billing: { month: "2026-07" },
    snapshot: { month: "2026-07" },
  });
  const refreshResult = appsScriptContext.doGet({
    parameter: {
      action: "refreshBillingMonth",
      month: "2026-07",
      callback: "testCallback",
    },
  });
  assert.equal(refreshResult.ok, true);
  assert.equal(adminChecks, 1, "snapshot refresh must require admin access");
}

console.log("billing snapshot parity tests passed");
