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

  const BOOKING_MONTHS = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const BOOKING_DATE_TIME_PATTERN =
    /(?:\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:day)?\s*,?\s*)?\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*(\d{4}))?\s*,?\s*(\d{1,2}):(\d{2})\s*([AP]M)\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})\s*([AP]M)/gi;

  function htmlToBookingText(source) {
    const text = String(source || "");
    if (!/<(?:!doctype|[A-Za-z][\w:-]*)(?:\s|>|\/)/i.test(text)) {
      return text;
    }

    if (typeof DOMParser === "undefined") {
      return text.replace(/<[^>]+>/g, " ");
    }

    const isXml = /^\s*<\?xml\b/i.test(text);
    const documentNode = new DOMParser().parseFromString(
      text,
      isXml ? "application/xml" : "text/html",
    );
    documentNode.querySelectorAll("script, style, noscript, template, svg").forEach((node) =>
      node.remove(),
    );
    const blockTags = new Set([
      "ARTICLE",
      "BR",
      "DD",
      "DIV",
      "DT",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "LI",
      "P",
      "SECTION",
      "TD",
      "TH",
      "TR",
    ]);
    let output = "";

    function visit(node) {
      if (node.nodeType === 3) {
        output += node.nodeValue || "";
        return;
      }
      if (node.nodeType !== 1) {
        return;
      }
      const isBlock = isXml || blockTags.has(node.tagName);
      if (isBlock) {
        output += "\n";
      }
      Array.from(node.childNodes).forEach(visit);
      if (isBlock) {
        output += "\n";
      }
    }

    visit(documentNode.body || documentNode.documentElement);
    return output;
  }

  function normalizeBookingText(source) {
    return htmlToBookingText(source)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function to24Hour(hour, minute, suffix) {
    let normalizedHour = Number(hour) % 12;
    if (String(suffix).toUpperCase() === "PM") {
      normalizedHour += 12;
    }
    return `${String(normalizedHour).padStart(2, "0")}:${minute}`;
  }

  function getDurationHours(startTime, endTime) {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (minutes <= 0) {
      minutes += 24 * 60;
    }
    return minutes / 60;
  }

  function formatIsoDate(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getBookingRate(date, options) {
    const parts = date.split("-").map(Number);
    const day = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    const isWeekend = day === 0 || day === 6;
    return Number(
      isWeekend
        ? options?.weekendHourlyRate ?? 27.63
        : options?.weekdayHourlyRate ?? 14.89,
    );
  }

  function stripMiddleInitials(value) {
    const parts = normalizeText(value)
      .replace(/[^A-Za-z' -]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    return parts.filter((part, index) => index === 0 || index === parts.length - 1 || part.length > 1).join(" ");
  }

  function resolveBookingPayer(value, players) {
    const raw = normalizeText(value);
    if (!raw) {
      return "";
    }
    const roster = Array.isArray(players) ? players : [];
    const exact = roster.find((player) => player.toLowerCase() === raw.toLowerCase());
    if (exact) {
      return exact;
    }

    const simplified = stripMiddleInitials(raw).toLowerCase();
    const matches = roster.filter(
      (player) => stripMiddleInitials(player).toLowerCase() === simplified,
    );
    return matches.length === 1 ? matches[0] : raw;
  }

  function getBookingTitle(prefix) {
    const ignored = /^(?:active|cancelled|details|\d+ bookings? found)$/i;
    const lines = prefix
      .split("\n")
      .map(normalizeText)
      .filter((line) => line && !ignored.test(line));
    return lines[lines.length - 1] || "Court booking";
  }

  function getBookingAmount(segment) {
    const totalPatterns = [
      /\b(?:total|paid|amount|cost|price)\b[^$\d]{0,30}\$\s*([\d,]+(?:\.\d{2})?)/gi,
      /\$\s*([\d,]+(?:\.\d{2})?)[^\n]{0,30}\b(?:total|paid|amount|cost|price)\b/gi,
    ];
    for (const pattern of totalPatterns) {
      const matches = Array.from(segment.matchAll(pattern));
      if (matches.length > 0) {
        return parseMoney(matches[matches.length - 1][1]);
      }
    }

    const moneyMatches = Array.from(segment.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g));
    return moneyMatches.length === 1 ? parseMoney(moneyMatches[0][1]) : null;
  }

  function cleanParticipantText(value) {
    return normalizeText(value)
      .replace(/\b(?:participants?|players?|attendees?)\s*:?/gi, "")
      .replace(/\bDetails\b/gi, "")
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[,;:\s]+|[,;:\s]+$/g, "");
  }

  function parseCourtBookingExport(source, options) {
    const text = normalizeBookingText(source);
    const matches = Array.from(text.matchAll(BOOKING_DATE_TIME_PATTERN));
    const defaultYear = Number(options?.year || new Date().getFullYear());
    const players = options?.players || [];
    const bookings = [];
    const warnings = [];

    matches.forEach((match, index) => {
      const nextIndex = matches[index + 1]?.index ?? text.length;
      const previousEnd = index > 0
        ? matches[index - 1].index + matches[index - 1][0].length
        : 0;
      const prefix = text.slice(previousEnd, match.index);
      const segment = text.slice(match.index + match[0].length, nextIndex);
      const referenceMatch = segment.match(/\b(\d{4,})\s*#/);
      const courtMatch = segment.match(/\b(Renton|Bellevue)\s+(\d+)\b/i);
      const participantEnd = referenceMatch?.index ?? courtMatch?.index ?? segment.length;
      const participantText = cleanParticipantText(segment.slice(0, participantEnd));
      const participants = participantText
        .split(/\s*,\s*/)
        .map(cleanParticipantText)
        .filter(Boolean);
      const month = BOOKING_MONTHS[match[1].toLowerCase()];
      const year = Number(match[3] || defaultYear);
      const date = formatIsoDate(year, month, Number(match[2]));
      const startTime = to24Hour(match[4], match[5], match[6]);
      const endTime = to24Hour(match[7], match[8], match[9]);
      const durationHours = getDurationHours(startTime, endTime);
      const hourlyRate = getBookingRate(date, options);
      const exportedAmount = getBookingAmount(segment);
      const rawPaidBy = participants[0] || "";
      const paidBy = resolveBookingPayer(rawPaidBy, players);
      const location = courtMatch
        ? `${courtMatch[1][0].toUpperCase()}${courtMatch[1].slice(1).toLowerCase()}`
        : "";
      const court = courtMatch ? `${location} ${courtMatch[2]}` : "";
      const eventName = getBookingTitle(prefix);
      const reference = referenceMatch?.[1] || "";
      const amount = exportedAmount === null
        ? roundMoney(hourlyRate * durationHours)
        : roundMoney(exportedAmount);

      if (!rawPaidBy) {
        warnings.push(`Could not find the payer for ${date} at ${startTime}.`);
      }
      if (!reference) {
        warnings.push(`Could not find a booking number for ${date} at ${startTime}.`);
      }

      bookings.push({
        reference,
        date,
        startTime,
        endTime,
        durationHours,
        courts: 1,
        amount,
        amountSource: exportedAmount === null ? "calculated" : "export",
        hourlyRate,
        paidBy,
        rawPaidBy,
        participants,
        eventName,
        location,
        court,
        status: "active",
      });
    });

    if (matches.length === 0 && text) {
      warnings.push(
        "No booking date/time rows were found. Paste the rendered page text or upload HTML copied from the page inspector.",
      );
    }

    return { bookings, warnings };
  }

  function parseCompactClock(value) {
    const match = normalizeText(value).match(/^(\d{1,2})(?::([0-5]\d))?\s*([ap])(?:m)?$/i);
    if (!match) {
      return "";
    }
    return to24Hour(match[1], match[2] || "00", `${match[3]}M`);
  }

  function parseUsDateParts(value) {
    const match = normalizeText(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match
      ? { month: Number(match[1]), day: Number(match[2]), year: Number(match[3]) }
      : null;
  }

  function parseCourtReservePlayDateTime(value, options) {
    const match = normalizeText(value).match(
      /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:day)?\s*,?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*(\d{4}))?\s*,?\s*(\d{1,2}(?::\d{2})?\s*[ap](?:m)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*[ap](?:m)?)$/i,
    );
    if (!match) {
      return null;
    }

    const month = BOOKING_MONTHS[match[1].toLowerCase()];
    const transactionDate = parseUsDateParts(options?.transactionDate);
    let year = Number(match[3] || transactionDate?.year || options?.year || new Date().getFullYear());
    if (!match[3] && transactionDate) {
      if (transactionDate.month === 12 && month === 1) {
        year += 1;
      } else if (transactionDate.month === 1 && month === 12) {
        year -= 1;
      }
    }
    const startTime = parseCompactClock(match[4]);
    const endTime = parseCompactClock(match[5]);
    if (!startTime || !endTime) {
      return null;
    }
    return {
      date: formatIsoDate(year, month, Number(match[2])),
      startTime,
      endTime,
      durationHours: getDurationHours(startTime, endTime),
    };
  }

  function normalizeHeader(value) {
    return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
  }

  function getTransactionLocation(category) {
    const match = normalizeText(category).match(/\b(Renton|Bellevue)\b/i);
    return match
      ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`
      : "";
  }

  function toMoneyCents(value) {
    return Math.round(Math.abs(Number(value || 0)) * 100);
  }

  function findRefundedFeeIndexes(fees, refundAmount) {
    const target = toMoneyCents(refundAmount);
    if (!target) {
      return [];
    }
    const sums = new Map([[0, []]]);
    fees.forEach((fee, index) => {
      const cents = toMoneyCents(fee.amount);
      Array.from(sums.entries())
        .sort(([first], [second]) => second - first)
        .forEach(([sum, indexes]) => {
          const next = sum + cents;
          if (next <= target && !sums.has(next)) {
            sums.set(next, [...indexes, index]);
          }
        });
    });
    return sums.get(target) || [];
  }

  function parseCourtReserveTransactionRows(rows, options) {
    if (!Array.isArray(rows) || rows.length < 2) {
      throw new Error("The CourtReserve workbook does not contain transaction rows.");
    }
    const headers = rows[0].map(normalizeHeader);
    const requiredHeaders = [
      "type",
      "amount",
      "unpaid amount",
      "paid date",
      "payment type",
      "category",
      "date/time",
      "member",
    ];
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length) {
      throw new Error(
        `This is not a CourtReserve transaction export. Missing: ${missingHeaders.join(", ")}.`,
      );
    }

    const column = Object.fromEntries(headers.map((header, index) => [header, index]));
    const parsedRows = [];
    const warnings = [];
    rows.slice(1).forEach((values, index) => {
      if (!values.some((value) => normalizeText(value))) {
        return;
      }
      const get = (name) => values[column[name]];
      const type = normalizeText(get("type"));
      const play = parseCourtReservePlayDateTime(get("date/time"), {
        year: options?.year,
        transactionDate: get("date"),
      });
      const amount = parseMoney(get("amount"));
      const unpaidAmount = parseMoney(get("unpaid amount"));
      const category = normalizeText(get("category"));
      const member = normalizeText(get("member"));
      if (!play && /^(?:fee|payment|refund)/i.test(type)) {
        warnings.push(`Row ${index + 2} has an unrecognized play date/time.`);
      }
      parsedRows.push({
        sourceRow: index + 2,
        transactionDate: normalizeText(get("date")),
        type,
        amount: Math.abs(Number(amount || 0)),
        unpaidAmount: Math.abs(Number(unpaidAmount || 0)),
        paidDate: normalizeText(get("paid date")),
        paymentType: normalizeText(get("payment type")),
        category,
        dateTime: normalizeText(get("date/time")),
        member,
        paidBy: resolveBookingPayer(member, options?.players || []),
        location: getTransactionLocation(category),
        ...play,
      });
    });

    const groups = new Map();
    function getGroup(row) {
      if (!row.date || !row.startTime) {
        return null;
      }
      const key = [
        row.date,
        row.startTime,
        row.endTime,
        row.category.toLowerCase(),
        row.member.toLowerCase(),
      ].join("|");
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          durationHours: row.durationHours,
          category: row.category,
          member: row.member,
          paidBy: row.paidBy,
          location: row.location,
          fees: [],
          payments: [],
          refunds: [],
        });
      }
      return groups.get(key);
    }

    parsedRows.forEach((row) => {
      const group = getGroup(row);
      if (!group) {
        return;
      }
      if (/^fee$/i.test(row.type)) {
        group.fees.push(row);
      } else if (/^payment/i.test(row.type)) {
        group.payments.push(row);
      } else if (/^refund/i.test(row.type)) {
        group.refunds.push(row);
      }
    });

    const bookings = [];
    const canceled = [];
    const unmatchedRefunds = [];
    groups.forEach((group) => {
      if (!group.fees.length) {
        if (group.refunds.length) {
          unmatchedRefunds.push(group);
        }
        return;
      }
      const feeAmount = roundMoney(
        group.fees.reduce((sum, row) => sum + row.amount, 0),
      );
      const refundAmount = roundMoney(
        group.refunds.reduce((sum, row) => sum + row.amount, 0),
      );
      const netAmount = roundMoney(Math.max(0, feeAmount - refundAmount));
      const unpaidAmount = roundMoney(
        group.fees.reduce((sum, row) => sum + row.unpaidAmount, 0),
      );
      const paymentAmount = roundMoney(
        group.payments.reduce((sum, row) => sum + row.amount, 0),
      );
      const refundedFeeIndexes = findRefundedFeeIndexes(group.fees, refundAmount);
      const refundMatchesFees =
        refundAmount === 0 || refundedFeeIndexes.length > 0 || refundAmount === feeAmount;
      const courts = netAmount === 0
        ? 0
        : Math.max(
            1,
            group.fees.length - (refundMatchesFees ? refundedFeeIndexes.length : 0),
          );
      const reviewReasons = [];
      if (unpaidAmount > 0 || group.fees.some((row) => !row.paidDate)) {
        reviewReasons.push(`$${unpaidAmount.toFixed(2)} unpaid`);
      }
      if (refundAmount > 0 && !refundMatchesFees) {
        reviewReasons.push(`partial/unmatched refund $${refundAmount.toFixed(2)}`);
      }
      const expectedPaid = roundMoney(feeAmount - unpaidAmount);
      if (Math.abs(paymentAmount - expectedPaid) > 0.011) {
        reviewReasons.push(
          `payments $${paymentAmount.toFixed(2)} do not match paid fees $${expectedPaid.toFixed(2)}`,
        );
      }
      if (!group.paidBy || !(options?.players || []).includes(group.paidBy)) {
        reviewReasons.push(`payer “${group.member || "unknown"}” is not on the roster`);
      }

      const baseRecord = {
        externalKey: group.key,
        reference: "",
        date: group.date,
        startTime: group.startTime,
        endTime: group.endTime,
        durationHours: group.durationHours,
        amountSource: "transaction",
        paidBy: group.paidBy,
        rawPaidBy: group.member,
        participants: [group.member].filter(Boolean),
        eventName: group.category,
        location: group.location,
        court: group.location || group.category,
      };
      if (netAmount === 0) {
        canceled.push({
          ...baseRecord,
          courts,
          amount: netAmount,
          grossAmount: feeAmount,
          refundAmount,
          unpaidAmount,
          paymentAmount,
          status: "canceled",
          feeCount: group.fees.length,
          paymentTypes: Array.from(
            new Set(group.payments.map((row) => row.paymentType)),
          ).filter(Boolean),
          sourceRows: group.fees
            .concat(group.payments, group.refunds)
            .map((row) => row.sourceRow)
            .sort((first, second) => first - second),
          reviewReasons,
        });
        return;
      }

      if (!refundMatchesFees) {
        bookings.push({
          ...baseRecord,
          courts,
          amount: netAmount,
          grossAmount: feeAmount,
          refundAmount,
          unpaidAmount,
          paymentAmount,
          status: "active",
          feeCount: group.fees.length,
          paymentTypes: Array.from(
            new Set(group.payments.map((row) => row.paymentType)),
          ).filter(Boolean),
          sourceRows: group.fees
            .concat(group.payments, group.refunds)
            .map((row) => row.sourceRow)
            .sort((first, second) => first - second),
          reviewReasons,
        });
        return;
      }

      const assignedPaymentIndexes = new Set();
      const paymentsByFee = group.fees.map(() => []);
      group.fees.forEach((fee, feeIndex) => {
        const available = group.payments
          .map((payment, paymentIndex) => ({ payment, paymentIndex }))
          .filter(
            ({ payment, paymentIndex }) =>
              !assignedPaymentIndexes.has(paymentIndex) &&
              payment.transactionDate === fee.transactionDate,
          );
        const exact = available.find(
          ({ payment }) => Math.abs(payment.amount - fee.amount) < 0.011,
        );
        let matches = exact ? [exact] : [];
        if (
          !matches.length &&
          Math.abs(
            available.reduce((sum, entry) => sum + entry.payment.amount, 0) -
              fee.amount,
          ) < 0.011
        ) {
          matches = available;
        }
        if (!matches.length && group.fees.length === 1) {
          matches = group.payments.map((payment, paymentIndex) => ({
            payment,
            paymentIndex,
          }));
        }
        matches.forEach(({ payment, paymentIndex }) => {
          assignedPaymentIndexes.add(paymentIndex);
          paymentsByFee[feeIndex].push(payment);
        });
      });

      const feeOccurrences = new Map();
      const feeIdentities = group.fees.map((fee) => {
        const signature = `${fee.transactionDate}|${fee.amount.toFixed(2)}`;
        const occurrence = (feeOccurrences.get(signature) || 0) + 1;
        feeOccurrences.set(signature, occurrence);
        return `${signature}|${occurrence}`;
      });
      group.fees.forEach((fee, feeIndex) => {
        if (refundedFeeIndexes.includes(feeIndex)) {
          return;
        }
        const assignedPayments = paymentsByFee[feeIndex];
        const sourceRows = [fee]
          .concat(assignedPayments)
          .map((row) => row.sourceRow)
          .sort((first, second) => first - second);
        bookings.push({
          ...baseRecord,
          externalKey:
            group.fees.length === 1
              ? group.key
              : `${group.key}|fee:${feeIdentities[feeIndex]}`,
          courts: 1,
          amount: roundMoney(fee.amount),
          grossAmount: roundMoney(fee.amount),
          refundAmount: 0,
          unpaidAmount: roundMoney(fee.unpaidAmount),
          paymentAmount: roundMoney(
            assignedPayments.reduce((sum, row) => sum + row.amount, 0),
          ),
          status: "active",
          feeCount: 1,
          paymentTypes: Array.from(
            new Set(assignedPayments.map((row) => row.paymentType)),
          ).filter(Boolean),
          sourceRows,
          reviewReasons: [...reviewReasons],
        });
      });
    });

    bookings.sort((first, second) =>
      `${first.date}-${first.startTime}-${first.eventName}-${first.externalKey}`.localeCompare(
        `${second.date}-${second.startTime}-${second.eventName}-${second.externalKey}`,
      ),
    );
    canceled.sort((first, second) =>
      `${first.date}-${first.startTime}`.localeCompare(`${second.date}-${second.startTime}`),
    );

    const feeRows = parsedRows.filter((row) => /^fee$/i.test(row.type));
    const refundRows = parsedRows.filter((row) => /^refund/i.test(row.type));
    return {
      bookings,
      canceled,
      unmatchedRefunds,
      warnings,
      rows: parsedRows,
      totals: {
        sourceRows: parsedRows.length,
        feeRows: feeRows.length,
        feeAmount: roundMoney(feeRows.reduce((sum, row) => sum + row.amount, 0)),
        refundRows: refundRows.length,
        refundAmount: roundMoney(
          refundRows.reduce((sum, row) => sum + row.amount, 0),
        ),
        activeAmount: roundMoney(
          bookings.reduce((sum, booking) => sum + booking.amount, 0),
        ),
      },
    };
  }

  function decodeXmlText(value) {
    return String(value || "")
      .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code) => {
        const radix = code[0].toLowerCase() === "x" ? 16 : 10;
        const number = Number.parseInt(radix === 16 ? code.slice(1) : code, radix);
        return Number.isFinite(number) ? String.fromCodePoint(number) : match;
      })
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function parseXmlAttributes(source) {
    const attributes = {};
    String(source || "").replace(
      /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
      (match, name, doubleQuoted, singleQuoted) => {
        attributes[name] = decodeXmlText(doubleQuoted ?? singleQuoted ?? "");
        return match;
      },
    );
    return attributes;
  }

  function getXmlTagText(source, localName) {
    const expression = new RegExp(
      `<(?:[\\w.-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${localName}>`,
      "gi",
    );
    return Array.from(String(source || "").matchAll(expression))
      .map((match) => decodeXmlText(match[1].replace(/<[^>]+>/g, "")))
      .join("");
  }

  function getColumnIndex(cellReference) {
    const letters = String(cellReference || "").match(/^[A-Z]+/i)?.[0] || "A";
    return letters
      .toUpperCase()
      .split("")
      .reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  }

  function parseXlsxWorksheetRows(xmlText, sharedStrings) {
    const rowExpression = /<(?:[\w.-]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?row>/gi;
    const cellExpression = /<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/gi;
    const rows = Array.from(String(xmlText || "").matchAll(rowExpression)).map((rowMatch) => {
      const values = [];
      Array.from(rowMatch[1].matchAll(cellExpression)).forEach((cellMatch) => {
        const attributes = parseXmlAttributes(cellMatch[1]);
        const body = cellMatch[2] || "";
        const index = getColumnIndex(attributes.r);
        const type = attributes.t || "";
        const raw = type === "inlineStr"
          ? getXmlTagText(body, "t")
          : getXmlTagText(body, "v");
        if (type === "s") {
          values[index] = sharedStrings[Number(raw)] || "";
        } else if (type === "b") {
          values[index] = raw === "1";
        } else if (type === "str" || type === "inlineStr") {
          values[index] = raw;
        } else if (raw !== "" && Number.isFinite(Number(raw))) {
          values[index] = Number(raw);
        } else {
          values[index] = raw;
        }
      });
      return values;
    });
    if (!rows.length) {
      throw new Error("CourtReserve worksheet XML could not be read.");
    }
    return rows;
  }

  function resolveXlsxPath(basePath, target) {
    if (target.startsWith("/")) {
      return target.slice(1);
    }
    const parts = `${basePath}/${target}`.split("/");
    const resolved = [];
    parts.forEach((part) => {
      if (!part || part === ".") {
        return;
      }
      if (part === "..") {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    });
    return resolved.join("/");
  }

  async function parseCourtReserveTransactionWorkbook(arrayBuffer, options) {
    if (!global.JSZip) {
      throw new Error("The XLSX reader is not loaded.");
    }
    const zip = await global.JSZip.loadAsync(arrayBuffer);
    const workbookFile = zip.file("xl/workbook.xml");
    const relationshipsFile = zip.file("xl/_rels/workbook.xml.rels");
    if (!workbookFile || !relationshipsFile) {
      throw new Error("The selected file is not a valid XLSX workbook.");
    }

    const workbookXml = await workbookFile.async("string");
    const relationshipsXml = await relationshipsFile.async("string");
    const sheets = Array.from(
      workbookXml.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*?)(?:\/>|>)/gi),
    ).map((match) => parseXmlAttributes(match[1]));
    const selectedSheet =
      sheets.find((sheet) => /all transactions/i.test(sheet.name || "")) ||
      sheets[0];
    if (!selectedSheet) {
      throw new Error("The workbook does not contain a worksheet.");
    }
    const relationshipId =
      selectedSheet["r:id"] || selectedSheet.id;
    const relationships = Array.from(
      relationshipsXml.matchAll(
        /<(?:[\w.-]+:)?Relationship\b([^>]*?)(?:\/>|>)/gi,
      ),
    ).map((match) => parseXmlAttributes(match[1]));
    const relationship = relationships.find((entry) => entry.Id === relationshipId);
    const target = relationship?.Target || "worksheets/sheet1.xml";
    const worksheetPath = resolveXlsxPath("xl", target);
    const worksheetFile = zip.file(worksheetPath);
    if (!worksheetFile) {
      throw new Error("The CourtReserve transaction worksheet is missing.");
    }

    let sharedStrings = [];
    const sharedStringsFile = zip.file("xl/sharedStrings.xml");
    if (sharedStringsFile) {
      const sharedXml = await sharedStringsFile.async("string");
      sharedStrings = Array.from(
        sharedXml.matchAll(
          /<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/gi,
        ),
      ).map((match) => getXmlTagText(match[1], "t"));
    }
    const rows = parseXlsxWorksheetRows(
      await worksheetFile.async("string"),
      sharedStrings,
    );
    return {
      ...parseCourtReserveTransactionRows(rows, options),
      sheetName: selectedSheet.name || "All Transactions",
    };
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
    parseCourtBookingExport,
    resolveBookingPayer,
    parseCourtReserveTransactionRows,
    parseCourtReserveTransactionWorkbook,
  };
})(window);
