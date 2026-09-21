"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

{
  const courtRow = [
    "court-1",
    "2026-05",
    "2026-05-24",
    "07:00",
    2,
    1,
    55.25,
    "Hoan Nguyen",
    "active",
    "CourtReserve",
    "",
    "",
    "",
    "",
  ];
  let deletedRow = 0;
  let refreshedMonth = "";
  const sheet = {
    getRange: () => ({ getValues: () => [[...courtRow]] }),
    deleteRow: (row) => {
      deletedRow = row;
    },
  };
  context.getBillingCourtSheet_ = () => sheet;
  context.findBillingRowById_ = () => 2;
  context.refreshBillingMemberBalanceSnapshotIfFinalized_ = (month) => {
    refreshedMonth = month;
  };

  assert.throws(
    () => context.removeBillingCourtBlock_({ month: "2026-05", id: "court-1" }),
    /Cancel the court block before deleting it/,
  );
  courtRow[8] = "canceled";
  assert.equal(
    context.removeBillingCourtBlock_({ month: "2026-05", id: "court-1" }),
    "court-1",
  );
  assert.equal(deletedRow, 2, "the canceled row is physically deleted");
  assert.equal(refreshedMonth, "2026-05");
}

{
  const purchaseRow = [
    "birdie-1",
    "2026-05",
    "2026-05-10",
    10,
    300,
    "Alice",
    "active",
    "",
    "",
    "",
    "",
    "inventory_purchase",
    0,
    0,
    "",
    "",
    30,
    "Blue label",
    "",
    "",
    "",
  ];
  const range = {
    getValues: () => [[...purchaseRow]],
    setValues: ([values]) => {
      purchaseRow.splice(0, purchaseRow.length, ...values);
    },
  };
  const refreshedCreditMonths = [];
  context.getBillingBirdiePurchaseSheet_ = () => ({ getRange: () => range });
  context.findBillingRowById_ = () => 2;
  context.refreshBillingMemberBalanceSnapshotIfFinalized_ = (
    month,
    source,
    force,
  ) => {
    refreshedCreditMonths.push({ month, source, force });
  };

  const marked = context.saveBillingBirdiePurchaseReimbursement_({
    month: "2026-05",
    id: "birdie-1",
    reimbursed: "true",
    actor: "Admin",
  });
  assert.equal(marked.reimbursedDate, "2026-05-31");
  assert.equal(marked.reimbursedAmount, 300);
  assert.equal(marked.reimbursedBy, "Admin");

  const overridden = context.saveBillingBirdiePurchaseReimbursement_({
    month: "2026-05",
    id: "birdie-1",
    reimbursed: "true",
    reimbursedDate: "2026-06-02",
    actor: "Admin",
  });
  assert.equal(overridden.reimbursedDate, "2026-06-02");
  assert.deepEqual(
    refreshedCreditMonths.slice(-2).map((entry) => [entry.month, entry.force]),
    [["2026-05", true], ["2026-06", true]],
    "moving a reimbursement refreshes both affected monthly snapshots",
  );
  assert.throws(
    () => context.saveBillingBirdiePurchaseReimbursement_({
      month: "2026-05",
      id: "birdie-1",
      reimbursed: "true",
      reimbursedDate: "2026-02-30",
      actor: "Admin",
    }),
    /Reimbursement date is invalid/,
  );

  const cleared = context.saveBillingBirdiePurchaseReimbursement_({
    month: "2026-05",
    id: "birdie-1",
    reimbursed: "false",
    actor: "Admin",
  });
  assert.equal(cleared.reimbursedDate, "");
  assert.equal(cleared.reimbursedAmount, 0);
  assert.equal(cleared.reimbursedBy, "");
}

{
  let statusRow = null;
  const lifecycle = [];
  const sheet = {
    appendRow: (values) => {
      statusRow = [...values];
    },
    getRange: () => ({
      setValues: ([values]) => {
        statusRow = [...values];
      },
    }),
  };
  context.getBillingMonthStatusSheet_ = () => sheet;
  context.findBillingMonthRow_ = () => (statusRow ? 2 : null);
  context.getBillingMonth_ = () => ({ attendance: [], courtBlocks: [] });
  context.rebuildBillingMemberBalanceSnapshot_ = (month) => {
    lifecycle.push(`rebuild:${month}`);
  };
  context.deleteBillingMemberBalanceSnapshot_ = (month) => {
    lifecycle.push(`delete:${month}`);
  };

  context.saveBillingMonthStatus_({
    month: "2026-05",
    status: "finalized",
    actor: "Admin",
  });
  context.saveBillingMonthStatus_({
    month: "2026-05",
    status: "draft",
    actor: "Admin",
  });
  context.saveBillingMonthStatus_({
    month: "2026-05",
    status: "finalized",
    actor: "Admin",
  });

  assert.deepEqual(lifecycle, [
    "rebuild:2026-05",
    "delete:2026-05",
    "rebuild:2026-05",
  ]);
}

console.log("billing action tests passed");
