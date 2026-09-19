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

console.log("balances-core tests passed");
