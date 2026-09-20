"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../balances-core.js");

function calculate(month, birdiePurchases, adjustments = []) {
  return BalanceCalculator.calculateMonthBalances({
    month,
    attendance: [
      { date: `${month}-10`, players: [{ name: "Player", spots: 1 }] },
    ],
    courtBlocks: [],
    birdiePurchases,
    payments: [],
    adjustments,
  });
}

const inventoryPurchase = {
  id: "birdie-manual",
  date: "2026-06-01",
  tubes: 10,
  amount: 300,
  paidBy: "Alice",
  status: "active",
  recordType: "inventory_purchase",
  unitPrice: 30,
  batch: "Blue label",
};
const juneUsage = {
  id: "birdie-usage-june",
  date: "2026-06-10",
  tubes: 1,
  amount: 30,
  paidBy: "",
  status: "active",
  recordType: "usage",
  unitPrice: 30,
  batch: "Blue label",
};

{
  const result = calculate("2026-06", [inventoryPurchase, juneUsage]);
  const alice = result.members.find((member) => member.name === "Alice");
  const player = result.members.find((member) => member.name === "Player");
  assert.equal(alice.credits, 300, "buyer gets the full purchase-month credit");
  assert.equal(alice.netBalance, -300);
  assert.equal(player.birdieFee, 30, "players are charged only for tubes used");
}

{
  const julyUsage = {
    ...juneUsage,
    id: "birdie-usage-july",
    date: "2026-07-10",
  };
  const result = calculate("2026-07", [inventoryPurchase, juneUsage, julyUsage]);
  assert.equal(
    result.members.some((member) => member.name === "Alice"),
    false,
    "the buyer is not credited again when inventory is used later",
  );
  assert.equal(
    result.members.find((member) => member.name === "Player").birdieFee,
    30,
  );
}

{
  const finalizedPurchase = {
    ...inventoryPurchase,
    id: "finalized-2026-06-birdie-inventory-1",
  };
  const result = calculate("2026-06", [finalizedPurchase, juneUsage], [
    {
      playerName: "Alice",
      amount: 300,
      status: "active",
      note: "Imported finalized monthly paid credit",
    },
  ]);
  assert.equal(
    result.members.find((member) => member.name === "Alice").credits,
    300,
    "finalized inventory uses its imported adjustment without double credit",
  );
}

{
  const finalizedPurchase = {
    ...inventoryPurchase,
    id: "finalized-2026-06-birdie-inventory-1",
    reimbursedDate: "2026-07-31",
  };
  const legacyAdjustment = {
    playerName: "Alice",
    amount: 300,
    status: "active",
    note: "Imported finalized shuttle purchase credit",
  };
  const june = calculate("2026-06", [finalizedPurchase], [legacyAdjustment]);
  const july = calculate("2026-07", [finalizedPurchase]);
  assert.equal(
    june.members.find((member) => member.name === "Alice").credits,
    0,
    "moving a finalized purchase replaces its legacy credit in the old month",
  );
  assert.equal(
    july.members.find((member) => member.name === "Alice").credits,
    300,
    "a finalized purchase is credited in its explicit reimbursement month",
  );
}

{
  const result = BalanceCalculator.calculateMonthBalances({
    month: "2026-06",
    attendance: [
      { date: "2026-06-05", players: [{ name: "Friday Player", spots: 1 }] },
      { date: "2026-06-07", players: [{ name: "Sunday Player", spots: 1 }] },
    ],
    courtBlocks: [
      { date: "2026-06-05", amount: 20, status: "active" },
      { date: "2026-06-07", amount: 20, status: "active" },
      { date: "2026-06-07", amount: 55.25, status: "canceled" },
    ],
    birdiePurchases: [
      {
        date: "2026-06-07",
        amount: 25,
        status: "active",
        recordType: "usage",
      },
    ],
    payments: [],
    adjustments: [],
  });
  const friday = result.members.find((member) => member.name === "Friday Player");
  const sunday = result.members.find((member) => member.name === "Sunday Player");
  assert.equal(friday.courtFee, 20);
  assert.equal(sunday.courtFee, 20, "Sunday weight must not change court fees");
  assert.equal(friday.birdieFee, 10);
  assert.equal(sunday.birdieFee, 15, "Sunday weight applies only to birdie fees");
}

{
  const aprilPurchaseReimbursedInMay = {
    ...inventoryPurchase,
    id: "birdie-april-reimbursed-may",
    date: "2026-04-12",
    reimbursedDate: "2026-05-31",
  };
  const april = calculate("2026-04", [aprilPurchaseReimbursedInMay]);
  const may = calculate("2026-05", [aprilPurchaseReimbursedInMay]);
  assert.equal(
    april.members.some((member) => member.name === "Alice"),
    false,
    "an April purchase reimbursed in May is not credited in April",
  );
  assert.equal(
    may.members.find((member) => member.name === "Alice").credits,
    300,
    "the purchaser credit moves to the reimbursement month",
  );
}

console.log("balances-core tests passed");
