(function (global) {
  "use strict";

  function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function getRecordType(purchase) {
    return String(purchase?.recordType || "purchase").replace(/-/g, "_");
  }

  function getBirdieCreditDate(purchase) {
    if (getRecordType(purchase) === "inventory_purchase") {
      return String(
        purchase?.reimbursedDate || purchase?.reimbursedAt || purchase?.date || "",
      ).slice(0, 10);
    }
    return String(purchase?.date || "").slice(0, 10);
  }

  function getFinalizedPurchaseMonth(purchase) {
    const idMatch = String(purchase?.id || "").match(/^finalized-(\d{4}-\d{2})-/i);
    return String(purchase?.month || idMatch?.[1] || purchase?.date || "").slice(0, 7);
  }

  function getExactPurchaseIdsForAmount(purchases, amount) {
    const target = Math.round(Math.abs(Number(amount || 0)) * 100);
    const sums = new Map([[0, []]]);
    purchases.forEach((purchase) => {
      const cents = Math.round(Math.abs(Number(purchase.amount || 0)) * 100);
      Array.from(sums.entries())
        .sort(([first], [second]) => second - first)
        .forEach(([sum, ids]) => {
          const next = sum + cents;
          if (next <= target && !sums.has(next)) {
            sums.set(next, [...ids, purchase.id]);
          }
        });
    });
    return new Set(sums.get(target) || []);
  }

  function getLegacyAdjustmentOffsets(billing, month) {
    const offsets = new Map();
    (billing.adjustments || []).forEach((adjustment) => {
      if (!/^Imported finalized .*credit$/i.test(String(adjustment.note || ""))) {
        return;
      }
      const candidates = (billing.birdiePurchases || []).filter(
        (purchase) =>
          getRecordType(purchase) === "inventory_purchase" &&
          /^finalized-/i.test(String(purchase.id || "")) &&
          getFinalizedPurchaseMonth(purchase) === month &&
          String(purchase.paidBy || "") === String(adjustment.playerName || ""),
      );
      const coveredIds = getExactPurchaseIdsForAmount(candidates, adjustment.amount);
      const offset = candidates
        .filter(
          (purchase) =>
            coveredIds.has(purchase.id) &&
            Boolean(purchase.reimbursedDate || purchase.reimbursedAt),
        )
        .reduce((sum, purchase) => sum + Number(purchase.amount || 0), 0);
      offsets.set(adjustment, Math.min(Number(adjustment.amount || 0), offset));
    });
    return offsets;
  }

  function getDateWeight(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    if (!year || !month || !day) {
      return 1;
    }
    return new Date(year, month - 1, day).getDay() === 0 ? 1.5 : 1;
  }

  function calculateMonthBalances(source) {
    const billing = source || {};
    const month = String(billing.month || "");
    const members = new Map();
    const courtByDate = new Map();

    function ensureMember(name) {
      const normalizedName = String(name || "").trim();
      if (!normalizedName) {
        return null;
      }
      if (!members.has(normalizedName)) {
        members.set(normalizedName, {
          name: normalizedName,
          spots: 0,
          weightedSpots: 0,
          courtFee: 0,
          birdieFee: 0,
          credits: 0,
          netBalance: 0,
          paymentStatus: "Not requested",
        });
      }
      return members.get(normalizedName);
    }

    (billing.courtBlocks || [])
      .filter((block) => block.status === "active")
      .forEach((block) => {
        courtByDate.set(
          block.date,
          (courtByDate.get(block.date) || 0) + Number(block.amount || 0),
        );
        const payer = ensureMember(block.paidBy);
        if (payer) {
          payer.credits += Number(block.amount || 0);
        }
      });

    const billedBirdiePurchases = (billing.birdiePurchases || []).filter(
      (purchase) =>
        purchase.status !== "canceled" &&
        String(purchase.date || "").startsWith(`${month}-`) &&
        getRecordType(purchase) !== "inventory_purchase",
    );
    (billing.birdiePurchases || [])
      .filter(
        (purchase) =>
          purchase.status !== "canceled" &&
          getBirdieCreditDate(purchase).startsWith(`${month}-`) &&
          getRecordType(purchase) !== "usage" &&
          !(
            getRecordType(purchase) === "inventory_purchase" &&
            /^finalized-/i.test(String(purchase.id || "")) &&
            !Boolean(purchase.reimbursedDate || purchase.reimbursedAt)
          ),
      )
      .forEach((purchase) => {
        const payer = ensureMember(purchase.paidBy);
        if (payer) {
          payer.credits += Number(purchase.amount || 0);
        }
      });

    const legacyAdjustmentOffsets = getLegacyAdjustmentOffsets(billing, month);
    (billing.adjustments || [])
      .filter((adjustment) => adjustment.status !== "canceled")
      .forEach((adjustment) => {
        const member = ensureMember(adjustment.playerName);
        if (member) {
          member.credits +=
            Number(adjustment.amount || 0) -
            Number(legacyAdjustmentOffsets.get(adjustment) || 0);
        }
      });

    let totalWeightedSpots = 0;
    (billing.attendance || []).forEach((day) => {
      const spots = (day.players || []).reduce(
        (sum, player) => sum + Number(player.spots || 0),
        0,
      );
      const weight = getDateWeight(day.date);
      const courtPerSpot = spots > 0 ? (courtByDate.get(day.date) || 0) / spots : 0;
      totalWeightedSpots += spots * weight;
      (day.players || []).forEach((entry) => {
        const member = ensureMember(entry.name);
        if (!member) {
          return;
        }
        const playerSpots = Number(entry.spots || 0);
        member.spots += playerSpots;
        member.weightedSpots += playerSpots * weight;
        member.courtFee += courtPerSpot * playerSpots;
      });
    });

    const birdieTotal = billedBirdiePurchases.reduce(
      (sum, purchase) => sum + Number(purchase.amount || 0),
      0,
    );
    const birdiePerWeightedSpot = totalWeightedSpots > 0
      ? birdieTotal / totalWeightedSpots
      : 0;

    (billing.payments || []).forEach((payment) => {
      const member = ensureMember(payment.playerName);
      if (member && payment.status) {
        member.paymentStatus = payment.status;
      }
    });

    members.forEach((member) => {
      member.birdieFee = member.weightedSpots * birdiePerWeightedSpot;
      member.netBalance = roundMoney(
        member.courtFee + member.birdieFee - member.credits,
      );
      member.courtFee = roundMoney(member.courtFee);
      member.birdieFee = roundMoney(member.birdieFee);
      member.credits = roundMoney(member.credits);
    });

    return {
      month,
      members: Array.from(members.values()).sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    };
  }

  function getAmountDue(member) {
    if (!member || String(member.paymentStatus || "").toLowerCase() === "paid") {
      return 0;
    }
    return roundMoney(Math.max(0, Number(member.netBalance || 0)));
  }

  global.BalanceCalculator = {
    calculateMonthBalances,
    getAmountDue,
  };
})(window);
