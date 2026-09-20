"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ window: {} });
context.window.window = context.window;
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, "..", "billing-parser.js"), "utf8"),
  context,
);

const rows = [
  ["Date", "Type", "Amount", "Unpaid Amount", "Paid Date", "Payment Type", "Category", "Date/Time", "Member"],
  ["5/11/2026", "Payment", "$29.78", "$0.00", "5/11/2026", "Credit Card", "Early Access - Bellevue", "Tue, May 12th, 6a - 8a", "Hoan Nguyen"],
  ["5/11/2026", "Fee", "$29.78", "$0.00", "5/11/2026", "Credit Card", "Early Access - Bellevue", "Tue, May 12th, 6a - 8a", "Hoan Nguyen"],
  ["5/23/2026", "Refund - Account Credit", "$55.25", "$0.00", "5/23/2026", "Account Credit", "Early Access - Renton", "Sun, May 24th, 7a - 9a", "Hoan Nguyen"],
  ["5/17/2026", "Payment", "$55.25", "$0.00", "5/17/2026", "Credit Card", "Early Access - Renton", "Sun, May 24th, 7a - 9a", "Hoan Nguyen"],
  ["5/17/2026", "Fee", "$55.25", "$0.00", "5/17/2026", "Credit Card", "Early Access - Renton", "Sun, May 24th, 7a - 9a", "Hoan Nguyen"],
];

const result = context.window.BillingParser.parseCourtReserveTransactionRows(rows, {
  year: 2026,
  players: ["Hoan Nguyen"],
});

assert.equal(result.bookings.length, 1);
assert.equal(result.bookings[0].date, "2026-05-12");
assert.equal(result.totals.activeAmount, 29.78);
assert.equal(result.canceled.length, 1);
assert.equal(result.canceled[0].date, "2026-05-24");
assert.equal(result.canceled[0].grossAmount, 55.25);
assert.equal(result.canceled[0].refundAmount, 55.25);
assert.equal(result.canceled[0].amount, 0);

console.log("CourtReserve parser tests passed");
