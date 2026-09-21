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
vm.runInContext(
  fs.readFileSync(path.join(root, "google-apps-script", "Code.gs"), "utf8"),
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
  ["2026-06", "", 0, 0, 0, 0, 0, 0, "2026-07-01T00:00:00Z", 3],
  ["2026-06", "Alice", 1, 1, 20, 5, 0, 25, "2026-07-01T00:00:00Z", 3],
  ["2026-07", "", 0, 0, 0, 0, 0, 0, "2026-08-01T00:00:00Z", 3],
  ["2026-07", "Bob", 2, 2, 30, 10, 5, 35, "2026-08-01T00:00:00Z", 3],
];
appsScriptContext.getFinalizedBillingMonths_ = () => ["2026-06", "2026-07"];
appsScriptContext.getBillingMemberBalanceSheet_ = () => ({
  getLastRow: () => snapshotRows.length + 1,
  getRange: () => ({ getValues: () => snapshotRows }),
});
appsScriptContext.getBillingPaymentStatuses_ = () => ({
  "2026-06\nalice": "Paid",
  "2026-07\nbob": "Requested",
});
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
    },
  ],
  "globally paid months stay stored but are excluded from payment loading",
);

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

console.log("billing snapshot parity tests passed");
