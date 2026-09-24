(function (global) {
  "use strict";

  const MIN_BILLABLE_PARTICIPANTS = 4;

  function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function toMoneyCents(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  }

  function compareAllocationRows(first, second) {
    if (first.remainder !== second.remainder) {
      return second.remainder - first.remainder;
    }
    if (first.name < second.name) {
      return -1;
    }
    if (first.name > second.name) {
      return 1;
    }
    return first.index - second.index;
  }

  function allocateCentsByWeight(totalCents, entries) {
    const roundedTotal = Math.round(Number(totalCents || 0));
    const sign = roundedTotal < 0 ? -1 : 1;
    const absoluteTotal = Math.abs(roundedTotal);
    const rows = (entries || []).map((entry, index) => ({
      index,
      name: String(entry?.name || ""),
      weight: Math.max(0, Math.round(Number(entry?.weight || 0))),
      cents: 0,
      remainder: 0,
    }));
    const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);

    if (!absoluteTotal || !totalWeight) {
      return rows.map(() => 0);
    }

    rows.forEach((row) => {
      const numerator = absoluteTotal * row.weight;
      row.cents = Math.floor(numerator / totalWeight);
      row.remainder = numerator % totalWeight;
    });

    const centsRemaining =
      absoluteTotal - rows.reduce((sum, row) => sum + row.cents, 0);
    const rankedRows = rows
      .filter((row) => row.weight > 0)
      .sort(compareAllocationRows);
    for (let index = 0; index < centsRemaining; index += 1) {
      rankedRows[index % rankedRows.length].cents += 1;
    }

    return rows
      .sort((first, second) => first.index - second.index)
      .map((row) => row.cents * sign);
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

  function getAttendanceSpotCount(day) {
    return (day?.players || []).reduce(
      (sum, player) => sum + Number(player.spots || 0),
      0,
    );
  }

  function getBillableAttendance(attendance) {
    return (attendance || []).filter(
      (day) => getAttendanceSpotCount(day) >= MIN_BILLABLE_PARTICIPANTS,
    );
  }

  function calculateMonthBalances(source) {
    const billing = source || {};
    const month = String(billing.month || "");
    const members = new Map();
    const courtCentsByDate = new Map();
    const billableAttendance = getBillableAttendance(billing.attendance);
    const billableDates = new Set(billableAttendance.map((day) => day.date));

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
      .filter(
        (block) => block.status === "active" && billableDates.has(block.date),
      )
      .forEach((block) => {
        const amountCents = toMoneyCents(block.amount);
        courtCentsByDate.set(
          block.date,
          (courtCentsByDate.get(block.date) || 0) + amountCents,
        );
        const payer = ensureMember(block.paidBy);
        if (payer) {
          payer.credits += amountCents / 100;
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
    billableAttendance.forEach((day) => {
      const players = day.players || [];
      const spots = players.reduce(
        (sum, player) => sum + Number(player.spots || 0),
        0,
      );
      const weight = getDateWeight(day.date);
      totalWeightedSpots += spots * weight;
      const courtAllocations = allocateCentsByWeight(
        courtCentsByDate.get(day.date) || 0,
        players.map((entry) => ({
          name: entry.name,
          weight: Number(entry.spots || 0),
        })),
      );
      players.forEach((entry, index) => {
        const member = ensureMember(entry.name);
        if (!member) {
          return;
        }
        const playerSpots = Number(entry.spots || 0);
        member.spots += playerSpots;
        member.weightedSpots += playerSpots * weight;
        member.courtFee += courtAllocations[index] / 100;
      });
    });

    const birdieTotalCents = billedBirdiePurchases.reduce(
      (sum, purchase) => sum + toMoneyCents(purchase.amount),
      0,
    );
    const birdieMembers = Array.from(members.values()).filter(
      (member) => member.weightedSpots > 0,
    );
    const birdieAllocations = allocateCentsByWeight(
      birdieTotalCents,
      birdieMembers.map((member) => ({
        name: member.name,
        weight: member.weightedSpots * 2,
      })),
    );
    birdieMembers.forEach((member, index) => {
      member.birdieFee = birdieAllocations[index] / 100;
    });

    (billing.payments || []).forEach((payment) => {
      const member = ensureMember(payment.playerName);
      if (member && payment.status) {
        member.paymentStatus = payment.status;
      }
    });

    members.forEach((member) => {
      member.courtFee = roundMoney(member.courtFee);
      member.birdieFee = roundMoney(member.birdieFee);
      member.credits = roundMoney(member.credits);
      member.netBalance = roundMoney(
        member.courtFee + member.birdieFee - member.credits,
      );
    });

    return {
      month,
      members: Array.from(members.values()).sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    };
  }

  function createBillingViewFromSnapshot(source) {
    const snapshot = source || {};
    const members = (snapshot.members || [])
      .map((member) => ({
        ...member,
        spots: Number(member.spots || 0),
        weightedSpots: Number(member.weightedSpots || 0),
        courtFee: roundMoney(member.courtFee),
        birdieFee: roundMoney(member.birdieFee),
        credits: roundMoney(member.credits),
        netBalance: roundMoney(member.netBalance),
        attendance: Array.isArray(member.attendance) ? member.attendance : [],
        creditDetails: member.creditDetails || null,
      }))
      .sort((first, second) => first.name.localeCompare(second.name));
    const calculatedSummary = members.reduce(
      (totals, member) => {
        totals.totalSpots += member.spots;
        totals.totalWeightedSpots += member.weightedSpots;
        totals.courtTotalCents += toMoneyCents(member.courtFee);
        totals.birdieTotalCents += toMoneyCents(member.birdieFee);
        return totals;
      },
      {
        totalSpots: 0,
        totalWeightedSpots: 0,
        courtTotalCents: 0,
        birdieTotalCents: 0,
      },
    );
    const summary = snapshot.summary || {};

    return {
      source: "balance_snapshot",
      courtBlocks: [],
      activeCourtBlocks: [],
      ineligibleCourtBlocks: [],
      birdieState: { purchases: [] },
      birdiePerWeightedSpot: 0,
      totalWeightedSpots: Number.isFinite(Number(summary.totalWeightedSpots))
        ? Number(summary.totalWeightedSpots)
        : calculatedSummary.totalWeightedSpots,
      totalSpots: Number.isFinite(Number(summary.totalSpots))
        ? Number(summary.totalSpots)
        : calculatedSummary.totalSpots,
      billableDateCount: null,
      excludedDateCount: 0,
      members,
      daily: [],
      summary: {
        courtTotal: Number.isFinite(Number(summary.courtTotal))
          ? roundMoney(summary.courtTotal)
          : calculatedSummary.courtTotalCents / 100,
        birdieTotal: Number.isFinite(Number(summary.birdieTotal))
          ? roundMoney(summary.birdieTotal)
          : calculatedSummary.birdieTotalCents / 100,
      },
    };
  }

  function getAmountDue(member) {
    if (!member || String(member.paymentStatus || "").toLowerCase() === "paid") {
      return 0;
    }
    return roundMoney(Math.max(0, Number(member.netBalance || 0)));
  }

  function isMemberSettled(member) {
    const balance = roundMoney(member?.netBalance);
    if (Math.abs(balance) < 0.005) {
      return true;
    }
    const status = String(member?.paymentStatus || "").trim().toLowerCase();
    return status === "paid" || (balance < 0 && status === "credit carryover");
  }

  function areMembersSettled(members) {
    const billingMembers = members || [];
    const hasActivity = billingMembers.some(
      (member) =>
        Number(member.spots || 0) > 0 ||
        Math.abs(roundMoney(member.netBalance)) >= 0.005,
    );
    return hasActivity && billingMembers.every(isMemberSettled);
  }

  global.BalanceCalculator = {
    MIN_BILLABLE_PARTICIPANTS,
    allocateCentsByWeight,
    areMembersSettled,
    calculateMonthBalances,
    createBillingViewFromSnapshot,
    getAmountDue,
    isMemberSettled,
  };
})(window);
