(function (global) {
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          value += '"';
          index += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          value += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(value);
        value = "";
      } else if (char === "\n") {
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      } else if (char !== "\r") {
        value += char;
      }
    }

    if (value || row.length > 0) {
      row.push(value);
      rows.push(row);
    }

    return rows;
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function parseMoney(value) {
    const text = normalizeText(value);
    if (!text) {
      return null;
    }

    const isParenthesized = /^\(.*\)$/.test(text);
    const cleaned = text
      .replace(/^\(/, "")
      .replace(/\)$/, "")
      .replace(/[$,\s]/g, "");
    const amount = Number(cleaned);

    if (!Number.isFinite(amount)) {
      return null;
    }

    return isParenthesized ? -amount : amount;
  }

  function parseCount(value) {
    const text = normalizeText(value);
    if (!text) {
      return 0;
    }

    const count = Number(text);
    return Number.isFinite(count) ? count : 0;
  }

  function parseInventoryDate(value, year, month) {
    const match = normalizeText(value).match(/(\d{2})\/(\d{2})/);
    if (!match) {
      return "";
    }

    const entryMonth = Number(match[1]);
    const entryYear = entryMonth > month ? year - 1 : year;
    return `${entryYear}-${match[1]}-${match[2]}`;
  }

  function parseInventoryPaidBy(parts) {
    const text = parts.join(" ").toLowerCase();
    if (/\bhoan\b/.test(text)) {
      return "Hoan Nguyen";
    }
    return "Nam Pham";
  }

  function parseInventoryEntry(text, year, month) {
    const match = normalizeText(text).match(/^(\d+(?:\.\d+)?)\s+(.+?)\s*\((.+)\)$/);
    if (!match) {
      return null;
    }

    const details = match[3].split(",").map((part) => normalizeText(part));
    const unitCost = parseMoney(details[0].replace(/^x/i, ""));
    const dateText = details.find((part) => /\d{2}\/\d{2}/.test(part));
    const tubes = Number(match[1]);

    if (!Number.isFinite(tubes) || !dateText) {
      return null;
    }

    return {
      tubes,
      label: normalizeText(match[2]),
      unitCost,
      date: parseInventoryDate(dateText, year, month),
      paidBy: parseInventoryPaidBy(details.slice(1)),
      raw: normalizeText(text),
    };
  }

  function parseBirdieInventory(note, options) {
    const year = Number(options?.year || new Date().getFullYear());
    const month = Number(options?.month || 0);
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const entries = normalizeText(note)
      .split(/\s+\+\s+/)
      .map((entry) => parseInventoryEntry(entry, year, month))
      .filter(Boolean);
    const startingEntries = entries.filter((entry) => entry.date < monthStart);
    const inventoryPurchases = entries.map((entry) => ({
      date: entry.date,
      tubes: entry.tubes,
      amount: roundMoney(Number(entry.tubes || 0) * Number(entry.unitCost || 0)),
      paidBy: entry.paidBy,
      status: "active",
      recordType: "inventory_purchase",
      unitPrice: entry.unitCost,
      batch: entry.label,
      source: entry.raw,
    }));
    const purchaseEntries = inventoryPurchases.filter(
      (entry) => entry.date >= monthStart,
    );
    const startTubes = startingEntries.reduce(
      (sum, entry) => sum + Number(entry.tubes || 0),
      0,
    );
    const purchasedTubes = purchaseEntries.reduce(
      (sum, entry) => sum + Number(entry.tubes || 0),
      0,
    );

    return {
      note: normalizeText(note),
      startTubes,
      purchasedTubes,
      entries,
      purchases: inventoryPurchases,
    };
  }

  function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function findRowIndex(rows, label) {
    return rows.findIndex((row) => normalizeText(row[0]) === label);
  }

  function findRowIndexByPrefix(rows, labelPrefix) {
    return rows.findIndex((row) =>
      normalizeText(row[0]).startsWith(labelPrefix),
    );
  }

  function getCell(rows, rowIndex, columnIndex) {
    return rows[rowIndex]?.[columnIndex] || "";
  }

  function parseMonthDate(value, year) {
    const match = normalizeText(value).match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!match) {
      return "";
    }

    return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }

  function getDateColumns(headerRow) {
    return headerRow
      .map((value, index) => ({ index, label: normalizeText(value) }))
      .filter((column) => /^\d{1,2}\/\d{1,2}$/.test(column.label));
  }

  function findFirstNonemptyUnlabeledColumn(rows, headerRowIndex, startColumn) {
    const header = rows[headerRowIndex] || [];
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);

    for (let column = startColumn; column < width; column += 1) {
      if (normalizeText(header[column])) {
        continue;
      }

      const hasData = rows
        .slice(headerRowIndex + 1)
        .some((row) => normalizeText(row[column]));
      if (hasData) {
        return column;
      }
    }

    return -1;
  }

  function parseMemberRows(rows, options) {
    const {
      headerRowIndex,
      dateColumns,
      memberPayColumn,
      birdieFeeColumn,
      courtFeeColumn,
      paidCreditsColumn,
      year,
    } = options;
    const members = [];

    for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
      const row = rows[index];
      const name = normalizeText(row[0]);
      if (!name) {
        continue;
      }

      const attendance = dateColumns
        .map((column) => ({
          date: parseMonthDate(column.label, year),
          label: column.label,
          spots: parseCount(row[column.index]),
        }))
        .filter((entry) => entry.spots > 0);

      members.push({
        sourceRow: index + 1,
        name,
        attendance,
        totalSpots: attendance.reduce((sum, entry) => sum + entry.spots, 0),
        netBalance: parseMoney(row[memberPayColumn]),
        birdieFee: parseMoney(row[birdieFeeColumn]),
        courtFee: parseMoney(row[courtFeeColumn]),
        paidCredits:
          paidCreditsColumn >= 0 ? parseMoney(row[paidCreditsColumn]) : null,
        raw: row,
      });
    }

    return members;
  }

  function parseFinalizedBillingCsv(text, options) {
    const rows = parseCsv(text);
    const year = Number(options?.year || new Date().getFullYear());
    const month = Number(options?.month || 0);
    const headerRowIndex = findRowIndex(rows, "Members");

    if (headerRowIndex < 0) {
      throw new Error("Could not find Members header row");
    }

    const headerRow = rows[headerRowIndex];
    const dateColumns = getDateColumns(headerRow);
    const memberPayColumn = headerRow.findIndex(
      (value) => normalizeText(value) === "MEMBER PAY",
    );
    const birdieFeeColumn = headerRow.findIndex(
      (value) => normalizeText(value) === "Birdie Fee",
    );
    const courtFeeColumn = headerRow.findIndex(
      (value) => normalizeText(value) === "Court Fee",
    );
    const paidCreditsColumn = findFirstNonemptyUnlabeledColumn(
      rows,
      headerRowIndex,
      courtFeeColumn + 1,
    );
    const expectedExpenseRow = findRowIndex(rows, "Expected Expense");
    const memberPaidRow = findRowIndex(rows, "Member Paid");
    const auditRow = findRowIndex(rows, "Audit");
    const totalBirdieFeeRow = findRowIndex(rows, "Total birdie fee");
    const birdieCostRow = findRowIndex(rows, "Birdie cost per participation");
    const birdieInventoryRow = findRowIndexByPrefix(rows, "Remaining tubes as of");
    const courtFeeRow = findRowIndex(rows, "Court Fee");
    const courtFeePerPlayerRow = findRowIndex(rows, "Court Fee Per Player");
    const shuttleCostPerPlayerRow = findRowIndex(rows, "Shuttle Cost per Player");
    const dailyParticipationRow = courtFeeRow > 0 ? courtFeeRow - 1 : -1;

    const dailyCosts = dateColumns.map((column) => ({
      date: parseMonthDate(column.label, year),
      label: column.label,
      sourceColumnIndex: column.index,
      participation: parseCount(getCell(rows, dailyParticipationRow, column.index)),
      courtFee: parseMoney(getCell(rows, courtFeeRow, column.index)),
      courtFeePerPlayer: parseMoney(
        getCell(rows, courtFeePerPlayerRow, column.index),
      ),
      shuttleCostPerPlayer: parseMoney(
        getCell(rows, shuttleCostPerPlayerRow, column.index),
      ),
    }));
    const members = parseMemberRows(rows, {
      headerRowIndex,
      dateColumns,
      memberPayColumn,
      birdieFeeColumn,
      courtFeeColumn,
      paidCreditsColumn,
      year,
    });

    return {
      source: {
        rowCount: rows.length,
        columnCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
      },
      period: {
        year,
        month,
      },
      rows: {
        memberHeader: headerRowIndex + 1,
      },
      columns: {
        dateColumns,
        memberPay: memberPayColumn,
        birdieFee: birdieFeeColumn,
        courtFee: courtFeeColumn,
        paidCredits: paidCreditsColumn,
      },
      notes: {
        payment: normalizeText(rows[0]?.[0]),
        birdieFormula: normalizeText(rows[1]?.[0]),
        inventory: normalizeText(getCell(rows, birdieInventoryRow, 2)),
      },
      birdieInventory: parseBirdieInventory(
        getCell(rows, birdieInventoryRow, 2),
        { year, month },
      ),
      auditStatus: normalizeText(getCell(rows, auditRow, 1)),
      totals: {
        expectedExpense: parseMoney(getCell(rows, expectedExpenseRow, 1)),
        memberPaid: parseMoney(getCell(rows, memberPaidRow, 1)),
        birdieFee: parseMoney(getCell(rows, totalBirdieFeeRow, 2)),
        birdieCostPerParticipation: parseMoney(getCell(rows, birdieCostRow, 2)),
        courtFee: parseMoney(getCell(rows, courtFeeRow, 19)),
      },
      dailyCosts,
      members,
    };
  }

  function getCreditAmountByPlayer(model) {
    return model.members.reduce((credits, member) => {
      const amount = roundMoney(-Number(member.paidCredits || 0));
      if (amount > 0) {
        credits[member.name] = amount;
      }
      return credits;
    }, {});
  }

  function getFinalizedPaymentRules(model, month) {
    if (month !== "2026-04") {
      return null;
    }

    const credits = getCreditAmountByPlayer(model);
    const totalCredit = Object.keys(credits).reduce(
      (sum, player) => sum + credits[player],
      0,
    );
    const shuttleCredit = roundMoney(totalCredit - Number(model.totals.courtFee || 0));

    return {
      courtCredits: [
        {
          playerName: "Thanh Nguyen",
          amount: credits["Thanh Nguyen"] || 0,
          formulaShares: [
            { column: "I", numerator: 1, denominator: 3 },
            { column: "O", numerator: 1.5, denominator: 3.5 },
          ],
          fallbackDates: ["2026-04-26"],
        },
        {
          playerName: "Hoan Nguyen",
          amount: "remainder",
          formulaShares: [
            { startColumn: "B", endColumn: "H", numerator: 1, denominator: 1 },
            { column: "I", numerator: 2, denominator: 3 },
            { startColumn: "K", endColumn: "N", numerator: 1, denominator: 1 },
            { column: "O", numerator: 2, denominator: 3.5 },
          ],
        },
      ],
      creditAdjustments: shuttleCredit
        ? [
            {
              playerName: "Hoan Nguyen",
              amount: shuttleCredit,
              note: "Imported finalized shuttle purchase credit",
            },
          ]
        : [],
    };
  }

  function createCourtBlock(day, amount, paidBy, sourceKey) {
    return {
      date: day.date,
      startTime: "06:00",
      durationHours: new Date(`${day.date}T00:00:00`).getDay() === 0 ? 3 : 2,
      courts: 1,
      amount: roundMoney(amount),
      paidBy,
      source: "Finalized Import",
      sourceKey,
      status: "active",
    };
  }

  function columnIndexToLetter(index) {
    let columnNumber = Number(index || 0) + 1;
    let label = "";

    while (columnNumber > 0) {
      const remainder = (columnNumber - 1) % 26;
      label = `${String.fromCharCode(65 + remainder)}${label}`;
      columnNumber = Math.floor((columnNumber - 1) / 26);
    }

    return label;
  }

  function columnLetterToNumber(label) {
    return String(label || "")
      .toUpperCase()
      .split("")
      .reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0);
  }

  function isColumnInShare(day, share) {
    const column = columnIndexToLetter(day.sourceColumnIndex);
    if (share.column) {
      return column === share.column;
    }
    return (
      columnLetterToNumber(column) >= columnLetterToNumber(share.startColumn) &&
      columnLetterToNumber(column) <= columnLetterToNumber(share.endColumn)
    );
  }

  function allocateFormulaShares(amountsByDate, credit) {
    const blocks = [];
    let allocated = 0;

    (credit.formulaShares || []).forEach((share) => {
      amountsByDate.forEach((entry) => {
        if (!isColumnInShare(entry.day, share) || entry.remaining <= 0) {
          return;
        }
        const amount = roundMoney(
          Math.min(
            entry.remaining,
            Number(entry.day.courtFee || 0) * share.numerator / share.denominator,
          ),
        );
        if (amount <= 0) {
          return;
        }
        blocks.push(
          createCourtBlock(
            entry.day,
            amount,
            credit.playerName,
            `${entry.day.date}-${slugText(credit.playerName)}-${blocks.length + 1}`,
          ),
        );
        entry.remaining = roundMoney(entry.remaining - amount);
        allocated = roundMoney(allocated + amount);
      });
    });

    return { blocks, allocated };
  }

  function allocateCourtBlocks(model, paymentRules) {
    const amountsByDate = model.dailyCosts
      .filter((day) => Number(day.courtFee || 0) > 0)
      .map((day) => ({
        day,
        remaining: roundMoney(day.courtFee),
      }));
    const blocks = [];

    if (!paymentRules) {
      return amountsByDate.map(({ day }, index) =>
        createCourtBlock(day, day.courtFee, "", `${day.date}-${index}`),
      );
    }

    paymentRules.courtCredits.forEach((credit) => {
      const formulaAllocation = allocateFormulaShares(amountsByDate, credit);
      blocks.push(...formulaAllocation.blocks);

      if (Number(credit.amount || 0) > 0) {
        let remainingCredit = roundMoney(
          Number(credit.amount || 0) - formulaAllocation.allocated,
        );
        const fallbackDates = credit.fallbackDates || [];
        const candidates = amountsByDate
          .filter((entry) => fallbackDates.indexOf(entry.day.date) !== -1)
          .concat(
            amountsByDate.filter(
              (entry) => fallbackDates.indexOf(entry.day.date) === -1,
            ),
          );
        candidates.forEach((entry) => {
          if (remainingCredit <= 0 || entry.remaining <= 0) {
            return;
          }
          const amount = roundMoney(Math.min(entry.remaining, remainingCredit));
          blocks.push(
            createCourtBlock(
              entry.day,
              amount,
              credit.playerName,
              `${entry.day.date}-${slugText(credit.playerName)}`,
            ),
          );
          entry.remaining = roundMoney(entry.remaining - amount);
          remainingCredit = roundMoney(remainingCredit - amount);
        });
      }
    });

    const remainderPayer = paymentRules.courtCredits.find(
      (credit) => credit.amount === "remainder",
    )?.playerName;
    amountsByDate.forEach((entry) => {
      if (entry.remaining > 0) {
        blocks.push(
          createCourtBlock(
            entry.day,
            entry.remaining,
            remainderPayer || "",
            `${entry.day.date}-${slugText(remainderPayer || "unpaid")}`,
          ),
        );
      }
    });

    return blocks.sort((first, second) =>
      `${first.date}-${first.sourceKey}`.localeCompare(
        `${second.date}-${second.sourceKey}`,
      ),
    );
  }

  function slugText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function buildFinalizedBillingBackfill(model) {
    const month = `${model.period.year}-${String(model.period.month).padStart(2, "0")}`;
    const paymentRules = getFinalizedPaymentRules(model, month);
    const monthStart = `${month}-01`;
    const usageBatch = (model.birdieInventory?.entries || []).find(
      (entry) => entry.date === monthStart && Number(entry.unitCost || 0) > 0,
    );
    const usedBirdieTubes =
      Number(model.totals.birdieFee || 0) > 0 &&
      Number(usageBatch?.unitCost || 0) > 0
        ? roundMoney(
            Number(model.totals.birdieFee || 0) /
              Number(usageBatch.unitCost || 1),
          )
        : 0;
    const inventoryPurchases = model.birdieInventory?.purchases || [];
    const endTubes = roundMoney(
      Number(model.birdieInventory?.startTubes || 0) +
        inventoryPurchases.reduce(
          (sum, purchase) => sum + Number(purchase.tubes || 0),
          0,
        ) -
        usedBirdieTubes,
    );
    return {
      month,
      birdieInventory: {
        startTubes: roundMoney(model.birdieInventory?.startTubes || 0),
        endTubes: Math.max(0, endTubes),
        usedTubes: usedBirdieTubes,
        note: model.birdieInventory?.note || "",
      },
      attendanceRsvps: model.members.flatMap((member) =>
        member.attendance.map((entry) => ({
          playDate: entry.date,
          playerName: member.name,
          participantCount: entry.spots,
        })),
      ),
      courtBlocks: allocateCourtBlocks(model, paymentRules),
      birdiePurchases: Number(model.totals.birdieFee || 0)
        ? [
            {
              date: `${month}-01`,
              tubes: usedBirdieTubes,
              amount: roundMoney(model.totals.birdieFee),
              paidBy: "",
              status: "active",
              recordType: "usage",
              unitPrice: usageBatch ? usageBatch.unitCost : 0,
              batch: usageBatch ? usageBatch.label : "Monthly usage",
            },
          ]
        : [],
      birdieInventoryPurchases: inventoryPurchases,
      creditAdjustments: paymentRules
        ? paymentRules.creditAdjustments
        : model.members
            .filter((member) => Number(member.paidCredits || 0) !== 0)
            .map((member) => ({
              playerName: member.name,
              amount: -Number(member.paidCredits || 0),
              note: "Imported finalized monthly paid credit",
            })),
    };
  }

  global.BillingParser = {
    parseCsv,
    parseMoney,
    parseBirdieInventory,
    parseFinalizedBillingCsv,
    buildFinalizedBillingBackfill,
  };
})(window);
