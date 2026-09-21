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
const requireDraftBillingMonth = context.requireDraftBillingMonth_;
const findBillingRowById = context.findBillingRowById_;
context.requireDraftBillingMonth_ = () => {};

function createAppsScriptContext() {
  const isolatedContext = vm.createContext({ console });
  vm.runInContext(
    fs.readFileSync(
      path.resolve(__dirname, "..", "google-apps-script", "Code.gs"),
      "utf8",
    ),
    isolatedContext,
  );
  isolatedContext.LockService = {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
  };
  return isolatedContext;
}

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
  assert.throws(
    () => context.removeBillingCourtBlock_({ month: "2026-06", id: "court-1" }),
    /does not belong to this billing month/,
    "a request month cannot mutate a court row owned by another month",
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
  assert.equal(context.validatePlayDate_("2026-05-24"), "2026-05-24");
  assert.throws(() => context.validatePlayDate_("2026-02-30"), /invalid/);
  assert.throws(() => context.validatePlayDate_("2026-05-25"), /must be Tuesday/);
  assert.equal(
    context.validateBirdieDateForMonth_(
      "2026-04-15",
      "2026-05",
      "inventory_purchase",
      "Birdie date",
    ),
    "2026-04-15",
    "inventory purchases may predate the owner month",
  );
  assert.throws(
    () => context.validateBirdieDateForMonth_(
      "2026-04-15",
      "2026-05",
      "usage",
      "Birdie date",
    ),
    /must belong to billing month 2026-05/,
  );
}

{
  context.getBillingMonthStatus_ = () => ({ status: "finalized" });
  assert.throws(
    () => requireDraftBillingMonth("2026-05"),
    /Reopen billing month 2026-05 as Draft/,
  );
  context.getBillingMonthStatus_ = () => ({ status: "draft" });
  assert.doesNotThrow(() => requireDraftBillingMonth("2026-05"));
}

{
  assert.equal(
    context.areBillingMembersSettled_([
      { name: "Player", spots: 1, netBalance: 20, paymentStatus: "Paid" },
      {
        name: "Organizer",
        spots: 0,
        netBalance: -20,
        paymentStatus: "Credit carryover",
      },
    ]),
    true,
  );
  assert.equal(
    context.areBillingMembersSettled_([
      { name: "Player", spots: 1, netBalance: 20, paymentStatus: "Paid" },
      {
        name: "Organizer",
        spots: 0,
        netBalance: -20,
        paymentStatus: "Not requested",
      },
    ]),
    false,
    "an unsettled credit-only member keeps the month open",
  );
}

{
  const adjustmentRows = [];
  const adjustmentSheet = {
    getLastRow: () => adjustmentRows.length + 1,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => {
        if (row === 2 && rowCount === adjustmentRows.length) {
          return adjustmentRows.map((values) => values.slice(0, columnCount));
        }
        return [adjustmentRows[row - 2].slice(column - 1, column - 1 + columnCount)];
      },
      setValues: ([values]) => {
        adjustmentRows[row - 2] = [...values];
      },
    }),
    appendRow: (values) => adjustmentRows.push([...values]),
  };
  const paymentSheet = {
    getLastRow: () => 1,
  };
  context.getBillingAdjustmentSheet_ = () => adjustmentSheet;
  context.getBillingPaymentSheet_ = () => paymentSheet;
  context.findBillingRowById_ = findBillingRowById;
  context.validatePlayerName_ = () => {};
  context.refreshBillingMemberBalanceSnapshotIfFinalized_ = () => {};

  context.saveBillingAdjustment_({
    month: "2026-05",
    id: "adjustment-1",
    playerName: "Nam Pham",
    amount: "5",
    actor: "Admin",
  });
  context.saveBillingAdjustment_({
    month: "2026-05",
    id: "adjustment-2",
    playerName: "Nam Pham",
    amount: "7",
    actor: "Admin",
  });
  assert.equal(adjustmentRows.length, 2, "same-member adjustments remain separate rows");
  assert.deepEqual(adjustmentRows.map((row) => row[0]), [
    "adjustment-1",
    "adjustment-2",
  ]);
}

{
  const standaloneRow = [
    "adjustment-1",
    "2026-05",
    "Nam Pham",
    9,
    "Corrected",
    "active",
    "",
    "",
    "",
    "",
  ];
  const embeddedRow = [
    "2026-05",
    "Nam Pham",
    "Paid",
    "",
    "",
    "adjustment-1",
    5,
    "Legacy",
    "active",
    "",
    "",
    "",
    "",
  ];
  context.getRsvpSpreadsheet_ = () => ({
    getSheetByName: () => ({
      getLastRow: () => 2,
      getRange: () => ({ getValues: () => [[...standaloneRow]] }),
    }),
  });
  context.getBillingPaymentSheet_ = () => ({
    getLastRow: () => 2,
    getRange: () => ({ getValues: () => [[...embeddedRow]] }),
  });
  const adjustments = context.getBillingAdjustments_("2026-05");
  assert.equal(adjustments.length, 1);
  assert.equal(adjustments[0].amount, 9, "standalone adjustments override legacy IDs");

  const paymentRows = [embeddedRow, ["2026-05", "Nam Pham", "Requested", "", "", ""]];
  const paymentSheet = {
    getLastRow: () => paymentRows.length + 1,
    getRange: () => ({ getValues: () => paymentRows }),
  };
  assert.equal(
    context.findBillingPaymentRow_(paymentSheet, "2026-05", "Nam Pham"),
    3,
    "payment writes prefer the canonical row without an embedded adjustment",
  );
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

  context.getBillingMonth_ = () => ({
    month: "2026-05",
    attendance: [],
    courtBlocks: [],
    birdiePurchases: [
      {
        date: "2026-05-31",
        amount: 10,
        status: "active",
        recordType: "usage",
      },
    ],
  });
  assert.throws(
    () => context.saveBillingMonthStatus_({
      month: "2026-05",
      status: "finalized",
      actor: "Admin",
    }),
    /Cannot finalize birdie charges without a play date/,
  );
  assert.equal(statusRow, null, "failed reconciliation does not finalize the month");
  context.getBillingMonth_ = () => ({
    month: "2026-05",
    attendance: [],
    courtBlocks: [],
    birdiePurchases: [],
  });

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

{
  context.validatePlayerName_ = () => {};
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
  assert.equal(sourceReads, 0, "blocked public writes do not access RSVP rows");

  context.requireAdmin_ = () => {};
  context.requireDraftBillingMonth_ = () => {
    throw new Error("draft required");
  };
  assert.throws(
    () => context.upsertRsvpWithLock_({
      action: "adminUpsertRsvp",
      playDate: "2026-05-24",
      playerName: "Nam Pham",
      participantCount: 1,
    }),
    /draft required/,
  );

  let duplicateDeletes = 0;
  context.requirePublicRsvpMutationAllowed_ = () => {};
  context.findExistingRows_ = () => [2, 3];
  context.getRsvpAtRow_ = () => ({ vote: "Yes" });
  context.appendAuditLog_ = () => ({});
  context.getTally_ = () => ({ players: [], totalCount: 0 });
  context.deleteDuplicateRows_ = () => {
    duplicateDeletes += 1;
  };
  const confirmation = context.upsertRsvpWithLock_({
    playDate: "2026-05-24",
    playerName: "Nam Pham",
    participantCount: 2,
  });
  assert.equal(confirmation.action, "needs_confirmation");
  assert.equal(
    duplicateDeletes,
    0,
    "confirmation must not delete duplicate RSVP rows",
  );
}

{
  context.getRsvpSpreadsheet_ = () => ({
    getSheetByName: (name) =>
      name === "RSVPs"
        ? {
            getLastRow: () => 2,
            getRange: () => ({ getValues: () => [["Nam Pham"]] }),
          }
        : null,
  });
  assert.throws(
    () => context.requirePlayerWithoutHistoricalReferences_("Nam Pham", "remove"),
    /historical RSVP or billing references exist in RSVPs/,
  );
  assert.doesNotThrow(() =>
    context.requirePlayerWithoutHistoricalReferences_("New Player", "remove"),
  );
}

{
  function assertReimbursementRejectedBeforeWrite(finalizedMonth, nextDate) {
    const isolated = createAppsScriptContext();
    const purchaseRow = [
      "birdie-1",
      "2026-05",
      "2026-04-15",
      10,
      300,
      "Nam Pham",
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
      "2026-06-02",
      300,
      "Admin",
    ];
    let writes = 0;
    isolated.getBillingMonthStatus_ = (month) => ({
      status: month === finalizedMonth ? "finalized" : "draft",
    });
    isolated.getBillingBirdiePurchaseSheet_ = () => ({
      getRange: () => ({
        getValues: () => [[...purchaseRow]],
        setValues: () => {
          writes += 1;
        },
      }),
    });
    isolated.findBillingRowById_ = () => 2;

    assert.throws(
      () => isolated.saveBillingBirdiePurchaseReimbursement_({
        month: "2026-05",
        id: "birdie-1",
        reimbursed: "true",
        reimbursedDate: nextDate,
        actor: "Admin",
      }),
      new RegExp(`Reopen billing month ${finalizedMonth} as Draft`),
    );
    assert.equal(writes, 0, "all affected months are checked before reimbursement write");
  }

  assertReimbursementRejectedBeforeWrite("2026-06", "2026-07-02");
  assertReimbursementRejectedBeforeWrite("2026-07", "2026-07-02");
}

{
  const isolated = createAppsScriptContext();
  const oldName = "Nam Pham";
  let rosterWrites = 0;
  let rosterDeletes = 0;
  const rosterSheet = {
    getLastRow: () => 2,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => [[oldName, "@nampham", "", ""].slice(0, columnCount)],
      setValues: () => {
        rosterWrites += 1;
      },
    }),
    deleteRow: () => {
      rosterDeletes += 1;
    },
  };
  const referenceSheet = {
    getLastRow: () => 2,
    getRange: () => ({ getValues: () => [[oldName]] }),
  };
  isolated.requireAdmin_ = () => {};
  isolated.getRosterSheet_ = () => rosterSheet;
  isolated.getRsvpSpreadsheet_ = () => ({
    getSheetByName: (name) => (name === "RSVPs" ? referenceSheet : null),
  });

  assert.throws(
    () => isolated.saveRosterMember_({
      oldPlayerName: oldName,
      playerName: "Nam P.",
      venmo: "@nampham",
    }),
    /historical RSVP or billing references exist/,
  );
  assert.equal(rosterWrites, 0, "rename guard runs before the roster write");
  assert.throws(
    () => isolated.removeRosterMember_({ playerName: oldName }),
    /historical RSVP or billing references exist/,
  );
  assert.equal(rosterDeletes, 0, "remove guard runs before deleting the roster row");
}

{
  const isolated = createAppsScriptContext();
  let statusWrites = 0;
  isolated.getBillingMonth_ = () => ({
    month: "2026-05",
    attendance: [],
    courtBlocks: [],
    birdiePurchases: [],
  });
  isolated.rebuildBillingMemberBalanceSnapshot_ = () => {
    throw new Error("snapshot write failed");
  };
  isolated.getBillingMonthStatusSheet_ = () => ({
    appendRow: () => {
      statusWrites += 1;
    },
    getRange: () => ({
      setValues: () => {
        statusWrites += 1;
      },
    }),
  });
  isolated.findBillingMonthRow_ = () => 2;

  assert.throws(
    () => isolated.saveBillingMonthStatus_({
      month: "2026-05",
      status: "finalized",
      actor: "Admin",
    }),
    /snapshot write failed/,
  );
  assert.equal(statusWrites, 0, "failed snapshot rebuild leaves status unchanged");
}

{
  const isolated = createAppsScriptContext();
  let deletedRows = 0;
  const sourceRows = [
    ["2026-05-24", "Former Member"],
    ["2026-06-02", "Former Member"],
  ];
  isolated.getSheet_ = () => ({
    getLastRow: () => sourceRows.length + 1,
    getRange: () => ({ getValues: () => sourceRows }),
    deleteRow: () => {
      deletedRows += 1;
    },
  });
  isolated.getRosterNameSet_ = () => ({});
  isolated.requireDraftBillingMonths_ = (months) => {
    assert.deepEqual(Array.from(months), ["2026-05", "2026-06"]);
    throw new Error("finalized month found");
  };

  assert.throws(() => isolated.cleanupNonRosterRows_(), /finalized month found/);
  assert.equal(deletedRows, 0, "cleanup validates every month before deleting rows");
}

{
  const isolated = createAppsScriptContext();
  let cleanupCalls = 0;
  isolated.requireAdmin_ = () => {
    throw new Error("Admin login required");
  };
  isolated.cleanupNonRosterRows_ = () => {
    cleanupCalls += 1;
    return { deletedCount: 0, deletedNames: [] };
  };
  isolated.jsonp_ = (callback, payload) => payload;
  const result = isolated.doGet({ parameter: { action: "cleanup" } });
  assert.equal(result.ok, false);
  assert.match(result.error, /Admin login required/);
  assert.equal(cleanupCalls, 0, "cleanup action authenticates before mutation");
}

console.log("billing action tests passed");
