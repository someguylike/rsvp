(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzcjWqKlqoILjYBAZLZ1Ka1xZ5QDXL_Mq65kOZXsTAxpNhp39pIkbIDPXiNjGOah0EF/exec";
  const PLAYERS = [
    "Alex Yeung",
    "Anh Khoa Tran (Truc Phuong)",
    "Bao Ta",
    "Cuong (MC) Nguyen",
    "Cuong Tipu",
    "Danny Phan",
    "Danh Nguyen",
    "Derek Blaiotta",
    "Duy Nguyen",
    "Harvey Le",
    "Hoan Nguyen",
    "Hoang Huynh",
    "Hung Cao (Truong Do)",
    "Huong Le",
    "Huy Nguyen (Harvey's fr)",
    "Huy Viet Nguyen",
    "Jordan Scherr",
    "Khang Nguyen",
    "Khang Vinh",
    "KhiemHoang Tran",
    "Luan Nguyen",
    "Nam Pham",
    "Nhan Chau",
    "Nick Nguyen",
    "Nguyen Nhat",
    "Phuc Anh",
    "Phuoc Truong",
    "Son Nguyen",
    "Thanh Nguyen",
    "Thanh Thanh Tran",
    "Thanh Thu Tieu",
    "Thien Nguyen",
    "Lily Do",
    "Thinh Pham",
    "Thuy Duong",
    "Todd Nguyen",
    "Tr Nguyen (Trung)",
    "Tri Ho",
    "Truc Phuong",
    "Van Trung Nguyen",
    "Truong Do",
    "Tu Anh Do",
    "Tuan Pham",
    "Tuan Phan/Hien",
    "Tuan Ta",
    "Uyen",
    "Viet Do",
    "Vu Nguyen",
  ];
  const PLAY_DAYS = [2, 4, 5, 0];
  const LAST_PLAYER_KEY = "play-rsvp.lastPlayerName";
  const DEFAULT_COURT_PAYER = "Hoan Nguyen";
  const MIN_BILLABLE_PARTICIPANTS = 4;
  const STATUS_OPTIONS = ["Not requested", "Requested", "Paid", "Credit carryover"];
  const BILLING_CACHE_PREFIX = "billing:backend:";
  const BILLING_MONTHS_CACHE_PREFIX = "billing:months:";
  const MEMBER_BILLING_CACHE_TTL_MS = 15 * 60 * 1000;
  const ADMIN_BILLING_CACHE_TTL_MS = 60 * 1000;
  const MEMBER_BILLING_MONTHS_CACHE_TTL_MS = 5 * 60 * 1000;
  const ADMIN_BILLING_MONTHS_CACHE_TTL_MS = 60 * 1000;
  const FETCH_TIMEOUT_MS = 12000;
  const JSONP_TIMEOUT_MS = 30000;
  const VENMO_RECIPIENT_NAME = "Nam Pham";
  const VENMO_RECIPIENT_USERNAME = "nampham2022";
  const IS_META_IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Messenger/i.test(
    navigator.userAgent || "",
  );
  const IS_ANDROID_DEVICE = /Android/i.test(navigator.userAgent || "");
  const BILLING_QUERY = new URLSearchParams(window.location.search);
  const LOCAL_BILLING_FIXTURE = BILLING_QUERY.get("localBillingFixture");
  const REQUESTED_BILLING_MONTH = BILLING_QUERY.get("month") || "";
  let isAdmin = false;
  let adminToken = "";
  let backendBilling = null;
  let backendAvailable = false;
  let latestBillingRequest = 0;
  let requestedBillingMonthApplied = false;

  const monthInput = document.querySelector("#billing-month");
  const reloadBillingButton = document.querySelector("#reload-billing-button");
  const statusEl = document.querySelector("#billing-status");
  const progressEl = document.querySelector("#billing-progress");
  const progressBar = document.querySelector("#billing-progress-bar");
  const progressText = document.querySelector("#billing-progress-text");
  const billingContent = document.querySelector("#billing-content");
  const finalizationBadge = document.querySelector("#billing-finalization-badge");
  const finalizationPanel = document.querySelector("#billing-finalization-panel");
  const finalizationTitle = document.querySelector("#billing-finalization-title");
  const finalizationNote = document.querySelector("#billing-finalization-note");
  const finalizationForm = document.querySelector("#billing-finalization-form");
  const finalizationSelect = document.querySelector("#billing-finalization-select");
  const summaryEl = document.querySelector("#overview-section");
  const courtForm = document.querySelector("#court-form");
  const courtDateInput = document.querySelector("#court-date");
  const courtStartTimeInput = document.querySelector("#court-start-time");
  const courtDurationInput = document.querySelector("#court-duration");
  const courtCountInput = document.querySelector("#court-count");
  const courtRatePresetInput = document.querySelector("#court-rate-preset");
  const courtHourlyRateInput = document.querySelector("#court-hourly-rate");
  const courtAmountInput = document.querySelector("#court-amount");
  const courtPaidByInput = document.querySelector("#court-paid-by");
  const courtFeedback = document.querySelector("#court-feedback");
  const courtBlockTable = document.querySelector("#court-block-table");
  const showCanceledCourtsControl = document.querySelector(
    "#show-canceled-courts-control",
  );
  const showCanceledCourtsInput = document.querySelector("#show-canceled-courts");
  const showCanceledCourtsLabel = document.querySelector(
    "#show-canceled-courts-label",
  );
  const courtReserveExportBookmarklet = document.querySelector(
    "#courtreserve-export-bookmarklet",
  );
  const courtImportForm = document.querySelector("#court-import-form");
  const courtImportFileInput = document.querySelector("#court-import-file");
  const courtReservationAuditFileInput = document.querySelector(
    "#court-reservation-audit-file",
  );
  const courtReservationAuditImage = document.querySelector(
    "#court-reservation-audit-image",
  );
  const courtImportTextInput = document.querySelector("#court-import-text");
  const courtImportFeedback = document.querySelector("#court-import-feedback");
  const courtImportPreview = document.querySelector("#court-import-preview");
  const courtImportTable = document.querySelector("#court-import-table");
  const courtImportSaveButton = document.querySelector("#court-import-save-button");
  const birdiePurchaseForm = document.querySelector("#birdie-purchase-form");
  const birdieDateInput = document.querySelector("#birdie-date");
  const birdieBatchInput = document.querySelector("#birdie-batch");
  const birdieTubesInput = document.querySelector("#birdie-tubes");
  const birdieUnitPriceInput = document.querySelector("#birdie-unit-price");
  const birdieAmountInput = document.querySelector("#birdie-amount");
  const birdiePaidByInput = document.querySelector("#birdie-paid-by");
  const birdieUsageForm = document.querySelector("#birdie-usage-form");
  const birdieUsageDateInput = document.querySelector("#birdie-usage-date");
  const birdieUsageBatchInput = document.querySelector("#birdie-usage-batch");
  const birdieUsageTubesInput = document.querySelector("#birdie-usage-tubes");
  const birdieFeedback = document.querySelector("#birdie-feedback");
  const birdiePurchaseTable = document.querySelector("#birdie-purchase-table");
  const memberNote = document.querySelector("#member-billing-note");
  const memberFeedback = document.querySelector("#member-feedback");
  const memberTable = document.querySelector("#member-billing-table");
  const markMonthPaidButton = document.querySelector("#mark-month-paid-button");
  const memberSelect = document.querySelector("#member-detail-select");
  const memberDetail = document.querySelector("#member-detail");

  let attendanceRows = [];
  let billing = null;
  let billingMonths = [];
  let progressTimer = 0;
  let progressPercent = 0;
  let courtImportBookings = [];
  let courtReservationAuditImageUrl = "";

  function buildAppsScriptUrl(payload, callbackName) {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("callback", callbackName);
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  function parseJsonp(text, callbackName) {
    const trimmed = text.trim();
    const prefix = `${callbackName}(`;

    if (!trimmed.startsWith(prefix) || !trimmed.endsWith(");")) {
      throw new Error("Unexpected Apps Script response");
    }

    return JSON.parse(trimmed.slice(prefix.length, -2));
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    if (typeof AbortController === "undefined") {
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Request timed out")),
          timeoutMs,
        );
        fetch(url, options)
          .then(resolve)
          .catch(reject)
          .finally(() => window.clearTimeout(timeout));
      });
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, {
      ...options,
      signal: controller.signal,
    })
      .catch((error) => {
        if (error.name === "AbortError") {
          throw new Error("Request timed out");
        }
        throw error;
      })
      .finally(() => window.clearTimeout(timeout));
  }

  async function requestViaFetch(payload) {
    const callbackName = `billingCallback_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const response = await fetchWithTimeout(
      buildAppsScriptUrl(payload, callbackName),
      {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
      FETCH_TIMEOUT_MS,
    );
    const parsed = parseJsonp(await response.text(), callbackName);

    if (response.ok && parsed.ok) {
      return parsed;
    }

    throw new Error(parsed?.error || "Billing request failed");
  }

  function requestViaJsonp(payload) {
    return new Promise((resolve, reject) => {
      const callbackName = `billingJsonpCallback_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      script.referrerPolicy = "no-referrer";
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Apps Script took too long to respond"));
      }, JSONP_TIMEOUT_MS);

      function cleanup() {
        window.clearTimeout(timeout);
        script.remove();
        delete window[callbackName];
      }

      window[callbackName] = (response) => {
        cleanup();
        if (response && response.ok) {
          resolve(response);
          return;
        }

        reject(new Error(response?.error || "Billing request failed"));
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Could not reach Apps Script"));
      };
      script.src = buildAppsScriptUrl(payload, callbackName);
      document.body.append(script);
    });
  }

  function requestAppsScript(payload) {
    return requestViaFetch(payload).catch(() => requestViaJsonp(payload));
  }

  function buildBackendAttendance(attendanceRsvps) {
    const byDate = new Map();
    attendanceRsvps.forEach((entry) => {
      if (!byDate.has(entry.playDate)) {
        byDate.set(entry.playDate, new Map());
      }
      const byPlayer = byDate.get(entry.playDate);
      const current = byPlayer.get(entry.playerName) || {
        name: entry.playerName,
        spots: 0,
      };
      current.spots += Number(entry.participantCount || 0);
      byPlayer.set(entry.playerName, current);
    });

    return Array.from(byDate.entries())
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([date, players]) => ({
        date,
        players: Array.from(players.values()).sort((first, second) =>
          first.name.localeCompare(second.name),
        ),
      }));
  }

  function getBirdieBatchKey(purchase) {
    return [
      String(purchase?.batch || "").trim(),
      Number(purchase?.unitPrice || 0).toFixed(2),
    ].join("|");
  }

  async function loadLocalBillingFixture() {
    if (!window.BillingParser) {
      throw new Error("Billing parser is not loaded for local fixture mode");
    }

    const response = await fetch(`./data/${LOCAL_BILLING_FIXTURE}.csv`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Could not load data/${LOCAL_BILLING_FIXTURE}.csv`);
    }

    const csv = await response.text();
    const match = LOCAL_BILLING_FIXTURE.match(/^(\d{2})_(\d{4})$/);
    const year = match ? Number(match[2]) : Number(monthInput.value.slice(0, 4));
    const month = match ? Number(match[1]) : Number(monthInput.value.slice(5, 7));
    const model = window.BillingParser.parseFinalizedBillingCsv(csv, {
      year,
      month,
    });
    const backfill = window.BillingParser.buildFinalizedBillingBackfill(model);

    monthInput.value = backfill.month;
    return {
      month: backfill.month,
      attendance: buildBackendAttendance(backfill.attendanceRsvps),
      courtBlocks: backfill.courtBlocks,
      birdieInventory: null,
      birdiePurchases: backfill.birdieInventoryPurchases
        .map((purchase, index) => ({
          ...purchase,
          id: `finalized-${backfill.month}-birdie-inventory-${index + 1}`,
        }))
        .concat(
          backfill.birdiePurchases.map((purchase) => ({
            ...purchase,
            id: `finalized-${backfill.month}-birdie-total`,
          })),
        ),
      payments: [],
      adjustments: backfill.creditAdjustments.map((adjustment, index) => ({
        id: `local-credit-${index + 1}`,
        playerName: adjustment.playerName,
        amount: adjustment.amount,
        note: adjustment.note,
        status: "active",
      })),
      monthStatus: {
        status: "draft",
        note: "Local fixture",
        updatedAt: "",
        updatedBy: "Local fixture",
      },
    };
  }

  function storageKey(name) {
    return `billing:${monthInput.value}:${name}`;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getBillingCacheKey(month, role) {
    return `${BILLING_CACHE_PREFIX}${role || (isAdmin ? "admin" : "member")}:${month}`;
  }

  function getBillingCacheTtl() {
    return isAdmin ? ADMIN_BILLING_CACHE_TTL_MS : MEMBER_BILLING_CACHE_TTL_MS;
  }

  function getBillingMonthsCacheKey() {
    return `${BILLING_MONTHS_CACHE_PREFIX}${isAdmin ? "admin" : "member"}`;
  }

  function getBillingMonthsCacheTtl() {
    return isAdmin
      ? ADMIN_BILLING_MONTHS_CACHE_TTL_MS
      : MEMBER_BILLING_MONTHS_CACHE_TTL_MS;
  }

  function readBillingCache(month) {
    try {
      const cached = JSON.parse(localStorage.getItem(getBillingCacheKey(month)));
      if (!cached?.billing || !Number.isFinite(Number(cached.savedAt))) {
        return null;
      }
      return {
        billing: cached.billing,
        savedAt: Number(cached.savedAt),
      };
    } catch {
      return null;
    }
  }

  function writeBillingCache(month, nextBilling) {
    if (!month || !nextBilling) {
      return;
    }
    writeJson(getBillingCacheKey(month), {
      savedAt: Date.now(),
      billing: nextBilling,
    });
  }

  function readBillingMonthsCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(getBillingMonthsCacheKey()));
      if (!Array.isArray(cached?.months) || !Number.isFinite(Number(cached.savedAt))) {
        return null;
      }
      return {
        months: cached.months,
        savedAt: Number(cached.savedAt),
      };
    } catch {
      return null;
    }
  }

  function writeBillingMonthsCache(months) {
    if (!Array.isArray(months)) {
      return;
    }
    writeJson(getBillingMonthsCacheKey(), {
      savedAt: Date.now(),
      months,
    });
  }

  function clearBillingCache(month) {
    if (month) {
      localStorage.removeItem(getBillingCacheKey(month, "admin"));
      localStorage.removeItem(getBillingCacheKey(month, "member"));
    }
  }

  function isBillingCacheFresh(cached) {
    return Boolean(cached && Date.now() - cached.savedAt < getBillingCacheTtl());
  }

  function isBillingMonthsCacheFresh(cached) {
    return Boolean(
      cached && Date.now() - cached.savedAt < getBillingMonthsCacheTtl(),
    );
  }

  function formatCacheAge(savedAt) {
    const ageSeconds = Math.max(0, Math.round((Date.now() - Number(savedAt || 0)) / 1000));
    if (ageSeconds < 60) {
      return `${ageSeconds}s ago`;
    }
    const ageMinutes = Math.round(ageSeconds / 60);
    if (ageMinutes < 60) {
      return `${ageMinutes}m ago`;
    }
    const ageHours = Math.round(ageMinutes / 60);
    if (ageHours < 24) {
      return `${ageHours}h ago`;
    }
    const ageDays = Math.round(ageHours / 24);
    if (ageDays < 14) {
      return `${ageDays}d ago`;
    }
    const ageWeeks = Math.round(ageDays / 7);
    if (ageWeeks < 8) {
      return `${ageWeeks}w ago`;
    }
    return "a while ago";
  }

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type || ""}`.trim();
  }

  function setSectionStatus(element, message, type) {
    if (!element) {
      setStatus(message, type);
      return;
    }
    element.textContent = message || "";
    element.className = `section-status ${type || ""}`.trim();
  }

  function clearSectionStatuses() {
    setSectionStatus(courtFeedback, "");
    setSectionStatus(courtImportFeedback, "");
    setSectionStatus(birdieFeedback, "");
    setSectionStatus(memberFeedback, "");
  }

  function setProgress(percent, message) {
    if (!progressEl || !progressBar || !progressText) {
      return;
    }
    progressPercent = Math.max(progressPercent, Math.min(percent, 100));
    progressEl.hidden = false;
    progressBar.style.width = `${progressPercent}%`;
    progressText.textContent = message;
  }

  function clearProgress() {
    window.clearInterval(progressTimer);
    progressTimer = 0;
    progressPercent = 0;
    if (progressEl && progressBar) {
      progressEl.hidden = true;
      progressBar.style.width = "0%";
    }
  }

  function startProgress() {
    const steps = [
      [18, "Opening billing month..."],
      [42, "Loading RSVP attendance..."],
      [66, "Reading court and birdie rows..."],
      [86, "Calculating member balances..."],
    ];
    let index = 0;

    clearProgress();
    setProgress(6, "Starting billing load...");
    progressTimer = window.setInterval(() => {
      const step = steps[Math.min(index, steps.length - 1)];
      setProgress(step[0], step[1]);
      index += 1;
    }, 900);
  }

  function finishProgress(message) {
    window.clearInterval(progressTimer);
    progressTimer = 0;
    setProgress(100, message);
    window.setTimeout(clearProgress, 700);
  }

  function setBillingContentVisible(isVisible) {
    if (billingContent) {
      billingContent.hidden = !isVisible;
    }
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));
  }

  function formatNumber(value, digits) {
    return Number(value || 0).toLocaleString("en-US", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getMonthParts() {
    const match = String(monthInput.value || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return { year: 2026, monthIndex: 5 };
    }
    return {
      year: Number(match[1]),
      monthIndex: Number(match[2]) - 1,
    };
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getMonthEndDateValue() {
    return getMonthEndDateForMonth(monthInput.value);
  }

  function getMonthEndDateForMonth(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return "";
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    return formatDate(new Date(year, monthIndex + 1, 0));
  }

  function formatMonthLabel(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return value || "";
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric" },
    );
  }

  function getCurrentMonthValue() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function getFallbackBillingMonths(includeCurrent) {
    return Array.from(monthInput.options)
      .map((option) => option.value)
      .filter((month) => {
        if (!window.BalanceCalculator.isBillingMonthInHistory(month)) {
          return false;
        }
        return includeCurrent ? month <= getCurrentMonthValue() : month < getCurrentMonthValue();
      })
      .map((month) => ({
        month,
        label: formatMonthLabel(month),
        allPaid: false,
        billable: false,
      }));
  }

  function mergeBillingMonths(primaryMonths, fallbackMonths) {
    const byMonth = new Map();
    fallbackMonths.forEach((month) => byMonth.set(month.month, month));
    primaryMonths.forEach((month) => {
      byMonth.set(month.month, {
        ...byMonth.get(month.month),
        ...month,
      });
    });
    return Array.from(byMonth.values());
  }

  function populateBillingMonthOptions(months) {
    const currentSelection = monthInput.value;
    const openMonths = window.BalanceCalculator
      .filterBillingHistory(months)
      .filter(
        (month) =>
          isAdmin ||
          !month.allPaid ||
          month.month === REQUESTED_BILLING_MONTH,
      )
      .sort((first, second) => first.month.localeCompare(second.month));

    billingMonths = openMonths;
    clearElement(monthInput);
    openMonths.forEach((month) => {
      const option = document.createElement("option");
      option.value = month.month;
      option.textContent =
        isAdmin || month.billable
          ? month.label || formatMonthLabel(month.month)
          : `${month.label || formatMonthLabel(month.month)} (setup)`;
      monthInput.append(option);
    });

    if (
      !requestedBillingMonthApplied &&
      openMonths.some((month) => month.month === REQUESTED_BILLING_MONTH)
    ) {
      monthInput.value = REQUESTED_BILLING_MONTH;
      requestedBillingMonthApplied = true;
    } else if (openMonths.some((month) => month.month === currentSelection)) {
      monthInput.value = currentSelection;
    } else if (openMonths.length) {
      monthInput.value = openMonths[openMonths.length - 1].month;
    }

    return openMonths.length > 0;
  }

  function normalizeBillingMonthOptions(months) {
    return isAdmin
      ? mergeBillingMonths(months || [], getFallbackBillingMonths(true))
      : months || [];
  }

  function createMemberBillingSnapshot(entry, result) {
    const members = Array.isArray(entry?.members) ? entry.members : [];
    const summary = members.reduce(
      (totals, member) => {
        totals.totalSpots += Number(member.spots || 0);
        totals.totalWeightedSpots += Number(member.weightedSpots || 0);
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

    return {
      month: entry.month,
      source: "balance_snapshot",
      snapshotReady: true,
      calculatedAt: entry.calculatedAt || "",
      calculationVersion: Number(result.calculationVersion || 0),
      members,
      summary: {
        totalSpots: summary.totalSpots,
        totalWeightedSpots: summary.totalWeightedSpots,
        courtTotal: summary.courtTotalCents / 100,
        birdieTotal: summary.birdieTotalCents / 100,
      },
      attendance: [],
      courtBlocks: [],
      birdieInventory: { startTubes: 0, endTubes: 0 },
      birdiePurchases: [],
      payments: members.map((member) => ({
        playerName: member.name,
        status: member.paymentStatus,
      })),
      adjustments: [],
      monthStatus: {
        status: "finalized",
        note: "",
        updatedAt: "",
        updatedBy: "",
      },
    };
  }

  function getBillingMonthsFromResponse(result) {
    if (isAdmin) {
      return normalizeBillingMonthOptions(result.months || []);
    }
    if (!result.snapshotReady) {
      const missingMonths = (result.missingMonths || []).join(", ");
      throw new Error(
        missingMonths
          ? `Billing snapshots are still updating for ${missingMonths}`
          : "Billing snapshots are still updating",
      );
    }

    const balancesByMonth = new Map(
      window.BalanceCalculator
        .filterBillingHistory(result.balances)
        .map((entry) => [entry.month, entry]),
    );
    balancesByMonth.forEach((entry, month) => {
      writeBillingCache(month, createMemberBillingSnapshot(entry, result));
    });
    return (result.finalizedMonths || [])
      .filter(window.BalanceCalculator.isBillingMonthInHistory)
      .map((month) => {
        const balance = balancesByMonth.get(month);
        return {
          month,
          label: formatMonthLabel(month),
          playerCount: (balance?.members || []).filter(
            (member) => Number(member.spots || 0) > 0,
          ).length,
          allPaid: !balance,
          billable: true,
          calculatedAt: balance?.calculatedAt || "",
        };
      });
  }

  function requestBillingMonthOptions() {
    return requestAppsScript({
      action: isAdmin ? "listBillingMonths" : "listBillingBalances",
      adminToken,
    });
  }

  async function loadBillingMonthOptions(options) {
    if (LOCAL_BILLING_FIXTURE) {
      return true;
    }

    const forceRefresh = Boolean(options?.forceRefresh);
    const cached = readBillingMonthsCache();
    let hasCachedMonths = false;
    if (cached?.months?.length) {
      hasCachedMonths = populateBillingMonthOptions(cached.months);
      if (hasCachedMonths) {
        setStatus(
          isBillingMonthsCacheFresh(cached)
            ? `Showing saved billing months from ${formatCacheAge(cached.savedAt)}. Refreshing...`
            : `Showing older saved billing months from ${formatCacheAge(cached.savedAt)} while refreshing...`,
          "loading",
        );
        const cachedBilling = readBillingCache(monthInput.value);
        if (
          !forceRefresh &&
          isBillingMonthsCacheFresh(cached) &&
          (isAdmin || isBillingCacheFresh(cachedBilling))
        ) {
          setStatus("Billing months loaded from saved data.", "success");
          return true;
        }
        if (isAdmin && !forceRefresh) {
          requestBillingMonthOptions()
            .then((result) => {
              const months = getBillingMonthsFromResponse(result);
              writeBillingMonthsCache(months);
              if (months.some((month) => month.month === monthInput.value)) {
                populateBillingMonthOptions(months);
              }
            })
            .catch(() => {
              // Keep using cached month options; billing load has its own error path.
            });
          return true;
        }
      }
    }

    setStatus(
      hasCachedMonths
        ? "Refreshing saved billing snapshots..."
        : "Loading billing snapshots...",
      "loading",
    );

    try {
      const result = await requestBillingMonthOptions();
      const months = getBillingMonthsFromResponse(result);
      writeBillingMonthsCache(months);
      const hasMonths = populateBillingMonthOptions(months);
      if (!hasMonths) {
        setBillingContentVisible(false);
        setStatus(
          isAdmin
            ? "No billing months are available yet."
            : "No open finalized billing months are ready for payment.",
          "",
        );
      }
      return hasMonths;
    } catch (error) {
      if (hasCachedMonths) {
        return true;
      }
      const hasMonths = populateBillingMonthOptions(getFallbackBillingMonths(isAdmin));
      if (!hasMonths) {
        setBillingContentVisible(false);
        setStatus(
          isAdmin
            ? "No billing months are available yet."
            : "No previous billing months are available yet.",
          "",
        );
      }
      return hasMonths;
    }
  }

  function formatDisplayDate(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
  }

  function formatAuditDate(value) {
    const dateText = String(value || "").slice(0, 10);
    const date = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
    });
  }

  function getDateWeight(value) {
    const date = new Date(`${value}T00:00:00`);
    return date.getDay() === 0 ? 1.5 : 1;
  }

  function getAttendanceSpotCount(day) {
    return (day?.players || []).reduce(
      (sum, player) => sum + Number(player.spots || 0),
      0,
    );
  }

  function getAttendanceSpotCountForDate(date) {
    const day = attendanceRows.find((entry) => entry.date === date);
    return day ? getAttendanceSpotCount(day) : 0;
  }

  function parseAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

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

  function parseDurationHours(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{1,2})(?::([0-5]\d))?$/);
    if (!match) {
      return 1;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    return Math.max(0.25, hours + minutes / 60);
  }

  function formatDuration(hours) {
    const totalMinutes = Math.round(Number(hours || 0) * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${wholeHours}:${minutes}`;
  }

  function isWeekendDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return false;
    }
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    return date.getDay() === 0 || date.getDay() === 6;
  }

  function updateCourtRateFromDate() {
    courtRatePresetInput.value = isWeekendDate(courtDateInput.value) ? "27.63" : "14.89";
    updateCourtAmount();
  }

  function updateCourtAmount() {
    const presetRate = courtRatePresetInput.value;
    const hourlyRate =
      presetRate === "other"
        ? parseAmount(courtHourlyRateInput.value)
        : parseAmount(presetRate);
    const hours = parseDurationHours(courtDurationInput.value);
    const courts = Math.max(1, Number(courtCountInput.value || 1));

    if (presetRate !== "other") {
      courtHourlyRateInput.value = String(hourlyRate);
    }
    courtAmountInput.value = String(roundMoney(hourlyRate * hours * courts));
  }

  function getCourtRateSource() {
    if (courtRatePresetInput.value === "14.89") {
      return "Bellevue weekday";
    }
    if (courtRatePresetInput.value === "27.63") {
      return "Renton weekend";
    }
    return "Other rate";
  }

  function normalizeClockValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, "0")}:${String(
        value.getMinutes(),
      ).padStart(2, "0")}`;
    }

    const text = String(value || "").trim();
    const clockMatch = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (clockMatch) {
      return `${String(clockMatch[1]).padStart(2, "0")}:${clockMatch[2]}`;
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime()) && /\d{1,2}:\d{2}:\d{2}/.test(text)) {
      return `${String(parsed.getHours()).padStart(2, "0")}:${String(
        parsed.getMinutes(),
      ).padStart(2, "0")}`;
    }

    return text;
  }

  function getEndTime(startTime, durationHours) {
    const match = normalizeClockValue(startTime).match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return "";
    }
    const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]), 0, 0);
    date.setMinutes(date.getMinutes() + Math.round(Number(durationHours || 0) * 60));
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function formatClock(value) {
    const normalized = normalizeClockValue(value);
    const match = normalized.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return normalized || "";
    }
    const hour = Number(match[1]);
    const minute = match[2];
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return minute === "00" ? `${displayHour}${suffix}` : `${displayHour}:${minute}${suffix}`;
  }

  function getClockParts(value) {
    const label = formatClock(value);
    const match = label.match(/^(.*?)(AM|PM)$/);
    return match
      ? {
          time: match[1],
          suffix: match[2],
        }
      : {
          time: label,
          suffix: "",
        };
  }

  function formatTimeRange(startTime, durationHours) {
    const start = getClockParts(startTime);
    const end = getClockParts(getEndTime(startTime, durationHours));

    if (start.suffix && start.suffix === end.suffix) {
      return `${start.time}-${end.time}${end.suffix}`;
    }

    return `${start.time}${start.suffix}-${end.time}${end.suffix}`;
  }

  function formatCourtBlock(block) {
    if (block.startTime) {
      return formatTimeRange(block.startTime, block.durationHours);
    }
    return block.block || "";
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createCell(tagName, value, className) {
    const cell = document.createElement(tagName);
    cell.textContent = value;
    if (className) {
      cell.className = className;
    }
    return cell;
  }

  function clearElement(element) {
    element.replaceChildren();
  }

  function fillPlayerSelect(select) {
    clearElement(select);
    PLAYERS.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  function getPlayDatesForMonth() {
    const { year, monthIndex } = getMonthParts();
    const date = new Date(year, monthIndex, 1);
    const dates = [];

    while (date.getMonth() === monthIndex) {
      if (PLAY_DAYS.includes(date.getDay())) {
        dates.push(formatDate(date));
      }
      date.setDate(date.getDate() + 1);
    }

    return dates;
  }

  function getSamplePlayersForDate(dateValue, index) {
    const base = [
      "Thanh Nguyen",
      "Harvey Le",
      "Hoan Nguyen",
      "Son Nguyen",
      "Bao Ta",
      "Duy Nguyen",
      "Tuan Pham",
      "Truong Do",
      "Nick Nguyen",
      "Vu Nguyen",
      "Luan Nguyen",
      "Todd Nguyen",
      "Thien Nguyen",
      "Phuoc Truong",
      "Hung Cao (Truong Do)",
      "Alex Yeung",
      "Tri Ho",
      "Khang Nguyen",
    ];
    const weight = getDateWeight(dateValue);
    const count = weight > 1 ? 14 + (index % 5) : 7 + (index % 4);
    return base.slice(index % 3, index % 3 + count);
  }

  function createSampleAttendance() {
    return getPlayDatesForMonth().map((date, index) => ({
      date,
      players: getSamplePlayersForDate(date, index).map((name, playerIndex) => ({
        name,
        spots: playerIndex % 9 === 0 ? 2 : 1,
      })),
    }));
  }

  function getDefaultCourtBlocks() {
    return getPlayDatesForMonth().map((date, index) => {
      const isWeekend = getDateWeight(date) > 1;
      return {
        id: makeId("court"),
        date,
        startTime: isWeekend ? "06:00" : index % 2 === 0 ? "06:00" : "07:00",
        durationHours: isWeekend ? 3 : index % 2 === 0 ? 2 : 1,
        courts: isWeekend ? 2 : 1,
        amount: isWeekend ? 145.05 : 48.35,
        paidBy: index % 3 === 0 ? "Hoan Nguyen" : "Thanh Nguyen",
        status: "active",
        source: "Manual",
      };
    });
  }

  function getDefaultBirdieState() {
    return {
      purchases: [
        {
          id: makeId("birdie"),
          date: monthInput.value ? `${monthInput.value}-03` : "2026-06-03",
          tubes: 10,
          amount: 295,
          paidBy: "Thanh Nguyen",
          status: "active",
          recordType: "inventory_purchase",
          unitPrice: 29.5,
          batch: "Demo batch",
        },
        {
          id: makeId("birdie"),
          date: monthInput.value ? `${monthInput.value}-17` : "2026-06-17",
          tubes: 4,
          amount: 295,
          paidBy: "",
          status: "active",
          recordType: "usage",
          unitPrice: 29.5,
          batch: "Demo batch",
        },
      ],
    };
  }

  function getCourtBlocks() {
    if (backendBilling) {
      return backendBilling.courtBlocks || [];
    }

    const key = storageKey("courtBlocks");
    const stored = localStorage.getItem(key);
    if (stored) {
      return readJson(key, []);
    }

    const defaults = getDefaultCourtBlocks();
    writeJson(key, defaults);
    return defaults;
  }

  function setCourtBlocks(blocks) {
    writeJson(storageKey("courtBlocks"), blocks);
  }

  function getBirdieState() {
    if (backendBilling) {
      return {
        purchases: backendBilling.birdiePurchases || [],
      };
    }

    const key = storageKey("birdies");
    const stored = localStorage.getItem(key);
    if (stored) {
      return readJson(key, getDefaultBirdieState());
    }

    const defaults = getDefaultBirdieState();
    writeJson(key, defaults);
    return defaults;
  }

  function setBirdieState(state) {
    writeJson(storageKey("birdies"), state);
  }

  function getBirdieRecordType(purchase) {
    return String(purchase?.recordType || "purchase").replace(/-/g, "_");
  }

  function isActiveBirdiePurchase(purchase) {
    return purchase.status !== "canceled";
  }

  function isBilledBirdiePurchase(purchase) {
    return (
      isActiveBirdiePurchase(purchase) &&
      isCurrentMonthBirdieRow(purchase) &&
      getBirdieRecordType(purchase) !== "inventory_purchase"
    );
  }

  function isInventoryBirdiePurchase(purchase) {
    return (
      isActiveBirdiePurchase(purchase) &&
      getBirdieRecordType(purchase) === "inventory_purchase"
    );
  }

  function isCreditableBirdiePurchase(purchase) {
    const recordType = getBirdieRecordType(purchase);
    return (
      isActiveBirdiePurchase(purchase) &&
      getBirdieCreditDate(purchase).startsWith(`${monthInput.value}-`) &&
      recordType !== "usage" &&
      !(
        recordType === "inventory_purchase" &&
        /^finalized-/i.test(String(purchase.id || "")) &&
        !Boolean(purchase.reimbursedDate || purchase.reimbursedAt)
      )
    );
  }

  function getBirdieCreditDate(purchase) {
    if (getBirdieRecordType(purchase) === "inventory_purchase") {
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

  function getLegacyAdjustmentOffsets(purchases, adjustments, month) {
    const offsets = new Map();
    adjustments.forEach((adjustment) => {
      if (!/^Imported finalized .*credit$/i.test(String(adjustment.note || ""))) {
        return;
      }
      const candidates = purchases.filter(
        (purchase) =>
          getBirdieRecordType(purchase) === "inventory_purchase" &&
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

  function isCurrentMonthBirdieRow(purchase) {
    return String(purchase?.date || "").startsWith(`${monthInput.value}-`);
  }

  function getBirdieUnitPrice(purchase) {
    const unitPrice = Number(purchase.unitPrice || 0);
    if (unitPrice > 0) {
      return unitPrice;
    }

    const tubes = Number(purchase.tubes || 0);
    return tubes > 0 ? Number(purchase.amount || 0) / tubes : 0;
  }

  function getBirdieInventoryBatches(purchases) {
    const batches = new Map();

    purchases
      .filter(isActiveBirdiePurchase)
      .slice()
      .sort((first, second) =>
        `${first.date || ""}-${getBirdieRecordType(first)}`.localeCompare(
          `${second.date || ""}-${getBirdieRecordType(second)}`,
        ),
      )
      .forEach((purchase) => {
        const recordType = getBirdieRecordType(purchase);
        const batch = purchase.batch || "Unlabeled batch";
        const unitPrice = getBirdieUnitPrice(purchase);
        const key = getBirdieBatchKey({ batch, unitPrice });
        const current = batches.get(key) || {
          key,
          batch,
          unitPrice,
          purchaseDates: [],
          activityDates: [],
          inventoryPurchases: [],
          purchased: 0,
          used: 0,
          remaining: 0,
          amount: 0,
        };

        if (purchase.date && !current.activityDates.includes(purchase.date)) {
          current.activityDates.push(purchase.date);
        }

        if (recordType === "inventory_purchase") {
          current.inventoryPurchases.push(purchase);
          if (purchase.date && !current.purchaseDates.includes(purchase.date)) {
            current.purchaseDates.push(purchase.date);
          }
          current.purchased += Number(purchase.tubes || 0);
          current.remaining += Number(purchase.tubes || 0);
          current.amount += Number(purchase.amount || 0);
        } else if (recordType === "usage") {
          current.used += Number(purchase.tubes || 0);
          current.remaining -= Number(purchase.tubes || 0);
        }

        batches.set(key, current);
      });

    return Array.from(batches.values())
      .filter((batch) => batch.purchased > 0 || batch.used > 0)
      .sort((first, second) => first.batch.localeCompare(second.batch));
  }

  function updateBirdieUsageMax() {
    const batch = getBirdieInventoryBatches(getBirdieState().purchases).find(
      (candidate) => candidate.key === birdieUsageBatchInput.value,
    );
    birdieUsageTubesInput.max = batch?.remaining || "";
  }

  function getPaymentRecord(memberName) {
    return backendBilling?.payments?.find(
      (payment) => payment.playerName === memberName,
    );
  }

  function getPaymentStatus(memberName) {
    const backendPayment = getPaymentRecord(memberName);
    if (backendPayment?.status) {
      return backendPayment.status;
    }

    return localStorage.getItem(storageKey(`payment:${memberName}`)) || "Not requested";
  }

  function setPaymentStatus(memberName, value) {
    localStorage.setItem(storageKey(`payment:${memberName}`), value);
  }

  function getMonthStatus() {
    if (backendBilling?.monthStatus) {
      return backendBilling.monthStatus;
    }

    return readJson(storageKey("monthStatus"), {
      status: "draft",
      note: "",
      updatedAt: "",
      updatedBy: "",
    });
  }

  function isBillingSourceEditable() {
    return getMonthStatus().status !== "finalized";
  }

  function renderBillingSourceEditability() {
    const editable = isBillingSourceEditable();
    [courtForm, courtImportForm, birdiePurchaseForm, birdieUsageForm].forEach(
      (form) => {
        form.querySelectorAll("input, select, button").forEach((control) => {
          if (!editable && !control.disabled) {
            control.dataset.disabledByFinalization = "true";
            control.disabled = true;
          } else if (editable && control.dataset.disabledByFinalization === "true") {
            control.disabled = false;
            delete control.dataset.disabledByFinalization;
          }
        });
      },
    );
    if (!editable && !courtImportSaveButton.disabled) {
      courtImportSaveButton.dataset.disabledByFinalization = "true";
      courtImportSaveButton.disabled = true;
    } else if (
      editable &&
      courtImportSaveButton.dataset.disabledByFinalization === "true"
    ) {
      courtImportSaveButton.disabled = false;
      delete courtImportSaveButton.dataset.disabledByFinalization;
    }
    [courtBlockTable, birdiePurchaseTable].forEach((table) => {
      table.querySelectorAll("button").forEach((button) => {
        button.disabled = !editable;
        if (!editable) {
          button.title = "Reopen this billing month to Draft before editing source data.";
        }
      });
    });
  }

  function setMonthStatus(status) {
    writeJson(storageKey("monthStatus"), {
      status,
      note: "",
      updatedAt: new Date().toISOString(),
      updatedBy: getRememberedPlayer(),
    });
  }

  function getBillingAdjustments() {
    if (backendBilling) {
      return backendBilling.adjustments || [];
    }

    return readJson(storageKey("adjustments"), []);
  }

  function getRememberedPlayer() {
    const remembered = localStorage.getItem(LAST_PLAYER_KEY) || "";
    return PLAYERS.includes(remembered) ? remembered : "Thanh Nguyen";
  }

  function calculateBilling() {
    if (backendBilling?.source === "balance_snapshot") {
      return window.BalanceCalculator.createBillingViewFromSnapshot(backendBilling);
    }

    const courtBlocks = getCourtBlocks();
    const birdieState = getBirdieState();
    const billableAttendanceRows = attendanceRows.filter(
      (day) => getAttendanceSpotCount(day) >= MIN_BILLABLE_PARTICIPANTS,
    );
    const billableDates = new Set(billableAttendanceRows.map((day) => day.date));
    const allActiveCourtBlocks = courtBlocks.filter(
      (block) => block.status === "active",
    );
    const activeCourtBlocks = allActiveCourtBlocks.filter((block) =>
      billableDates.has(block.date),
    );
    const ineligibleCourtBlocks = allActiveCourtBlocks.filter(
      (block) => !billableDates.has(block.date),
    );
    const courtCentsByDate = new Map();
    const members = new Map();
    let totalWeightedSpots = 0;
    let totalSpots = 0;

    function ensureMember(name) {
      if (!members.has(name)) {
        members.set(name, {
          name,
          spots: 0,
          weightedSpots: 0,
          courtFee: 0,
          birdieFee: 0,
          credits: 0,
          creditDetails: {
            court: 0,
            birdiePurchases: [],
            adjustments: [],
          },
          netBalance: 0,
          attendance: [],
        });
      }
      return members.get(name);
    }

    activeCourtBlocks.forEach((block) => {
      const amountCents = toMoneyCents(block.amount);
      courtCentsByDate.set(
        block.date,
        (courtCentsByDate.get(block.date) || 0) + amountCents,
      );
      if (block.paidBy) {
        const payer = ensureMember(block.paidBy);
        const amount = amountCents / 100;
        payer.credits += amount;
        payer.creditDetails.court += amount;
      }
    });

    birdieState.purchases
      .filter(isCreditableBirdiePurchase)
      .forEach((purchase) => {
        if (purchase.paidBy) {
          const payer = ensureMember(purchase.paidBy);
          const amount = Number(purchase.amount || 0);
          payer.credits += amount;
          payer.creditDetails.birdiePurchases.push({
            batch: purchase.batch || "Birdie purchase",
            date: getBirdieCreditDate(purchase),
            purchaseDate: purchase.date,
            tubes: Number(purchase.tubes || 0),
            unitPrice: getBirdieUnitPrice(purchase),
            amount,
          });
        }
      });

    const billingAdjustments = getBillingAdjustments();
    const legacyAdjustmentOffsets = getLegacyAdjustmentOffsets(
      birdieState.purchases,
      billingAdjustments,
      monthInput.value,
    );
    billingAdjustments
      .filter((adjustment) => adjustment.status !== "canceled")
      .forEach((adjustment) => {
        const member = ensureMember(adjustment.playerName);
        const amount =
          Number(adjustment.amount || 0) -
          Number(legacyAdjustmentOffsets.get(adjustment) || 0);
        member.credits += amount;
        if (Math.abs(amount) > 0.005) {
          member.creditDetails.adjustments.push({
            note: adjustment.note || "Credit adjustment",
            amount,
          });
        }
      });

    billableAttendanceRows.forEach((day) => {
      const weight = getDateWeight(day.date);
      const players = day.players || [];
      const daySpots = players.reduce(
        (sum, player) => sum + Number(player.spots || 0),
        0,
      );
      const dayWeightedSpots = daySpots * weight;
      totalSpots += daySpots;
      totalWeightedSpots += dayWeightedSpots;

      const courtAllocations = allocateCentsByWeight(
        courtCentsByDate.get(day.date) || 0,
        players.map((entry) => ({
          name: entry.name,
          weight: Number(entry.spots || 0),
        })),
      );
      players.forEach((entry, index) => {
        const member = ensureMember(entry.name);
        const playerSpots = Number(entry.spots || 0);
        const weightedSpots = playerSpots * weight;
        const courtFee = courtAllocations[index] / 100;
        member.spots += playerSpots;
        member.weightedSpots += weightedSpots;
        member.courtFee += courtFee;
        member.attendance.push({
          date: day.date,
          spots: playerSpots,
          weight,
          courtFee,
        });
      });
    });

    const birdieTotalCents = birdieState.purchases
      .filter(isBilledBirdiePurchase)
      .reduce(
      (sum, purchase) => sum + toMoneyCents(purchase.amount),
      0,
    );
    const birdieTotal = birdieTotalCents / 100;
    const birdiePerWeightedSpot =
      totalWeightedSpots > 0 ? birdieTotal / totalWeightedSpots : 0;

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

    members.forEach((member) => {
      member.courtFee = roundMoney(member.courtFee);
      member.birdieFee = roundMoney(member.birdieFee);
      member.credits = roundMoney(member.credits);
      member.netBalance = roundMoney(
        member.courtFee + member.birdieFee - member.credits,
      );
    });

    return {
      courtBlocks,
      activeCourtBlocks,
      ineligibleCourtBlocks,
      birdieState,
      birdiePerWeightedSpot,
      totalWeightedSpots,
      totalSpots,
      billableDateCount: billableAttendanceRows.length,
      excludedDateCount: attendanceRows.length - billableAttendanceRows.length,
      members: Array.from(members.values()).sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
      daily: attendanceRows.map((day) => {
        const spots = getAttendanceSpotCount(day);
        const eligible = spots >= MIN_BILLABLE_PARTICIPANTS;
        const weight = getDateWeight(day.date);
        const courtFee = eligible ? (courtCentsByDate.get(day.date) || 0) / 100 : 0;
        const courtPerSpot = spots > 0 ? courtFee / spots : 0;
        const birdiePerSpot = eligible ? birdiePerWeightedSpot * weight : 0;
        return {
          date: day.date,
          eligible,
          weight,
          spots,
          courtFee,
          courtPerSpot,
          birdiePerSpot,
          totalPerSpot: courtPerSpot + birdiePerSpot,
          activeBlocks: activeCourtBlocks.filter((block) => block.date === day.date).length,
        };
      }),
    };
  }

  function renderSummary() {
    const courtTotal = billing.summary
      ? Number(billing.summary.courtTotal || 0)
      : billing.activeCourtBlocks.reduce(
          (sum, block) => sum + Number(block.amount || 0),
          0,
        );
    const birdieTotal = billing.summary
      ? Number(billing.summary.birdieTotal || 0)
      : billing.birdieState.purchases
          .filter(isBilledBirdiePurchase)
          .reduce(
            (sum, purchase) => sum + Number(purchase.amount || 0),
            0,
          );
    const openBalance = billing.members
      .filter((member) => getPaymentStatus(member.name) !== "Paid")
      .reduce((sum, member) => sum + Math.max(0, member.netBalance), 0);
    const creditTotal = billing.members.reduce(
      (sum, member) => sum + Math.max(0, -member.netBalance),
      0,
    );
    const metrics = [
      ["Expected Expense", formatMoney(courtTotal + birdieTotal), "success"],
      ["Court Total", formatMoney(courtTotal), ""],
      ["Birdie Total", formatMoney(birdieTotal), ""],
      ["Weighted Spots", formatNumber(billing.totalWeightedSpots, 1), ""],
      ["Open Balance", formatMoney(openBalance), openBalance > 0 ? "warning" : "success"],
      ["Credits", formatMoney(creditTotal), creditTotal > 0 ? "credit" : ""],
    ];

    clearElement(summaryEl);
    metrics.forEach(([label, value, tone]) => {
      const metric = document.createElement("div");
      metric.className = `billing-metric ${tone || ""}`.trim();
      metric.append(createCell("span", label), createCell("strong", value));
      summaryEl.append(metric);
    });
  }

  function renderFinalizationStatus() {
    const monthStatus = getMonthStatus();
    const isFinalized = monthStatus.status === "finalized";
    finalizationBadge.textContent = isFinalized ? "Finalized" : "Draft";
    finalizationBadge.className = `billing-finalization-badge ${
      isFinalized ? "finalized" : "draft"
    }`;
    finalizationPanel.className = `billing-finalization-panel ${
      isFinalized ? "finalized" : "draft"
    }`;
    finalizationTitle.textContent = isFinalized ? "Bills are finalized" : "Bills are not finalized";
    finalizationNote.textContent = isFinalized
      ? monthStatus.updatedBy
        ? `Finalized by ${monthStatus.updatedBy}. Reopen to Draft before editing source data.`
        : "Ready for payments. Reopen to Draft before editing source data."
      : "Amounts may still change.";
    finalizationSelect.value = isFinalized ? "finalized" : "draft";
  }

  function renderTable(table, headers, rows, footerCells) {
    clearElement(table);
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach((header) => headerRow.append(createCell("th", header)));
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((cells) => {
      const row = document.createElement("tr");
      cells.forEach((cell) => {
        if (cell instanceof Node) {
          row.append(cell);
        } else {
          row.append(createCell("td", cell.text, cell.className));
        }
      });
      tbody.append(row);
    });
    table.append(tbody);

    if (footerCells) {
      const tfoot = document.createElement("tfoot");
      const row = document.createElement("tr");
      footerCells.forEach((cell) => row.append(createCell("td", cell)));
      tfoot.append(row);
      table.append(tfoot);
    }
  }

  function makeBadge(text, className) {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `billing-badge ${className}`;
    badge.textContent = text;
    cell.append(badge);
    return cell;
  }

  function renderDailyCosts() {
    const courtTotal = billing.daily.reduce((sum, day) => sum + day.courtFee, 0);
    const birdieTotal = billing.birdieState.purchases
      .filter(isBilledBirdiePurchase)
      .reduce(
      (sum, purchase) => sum + Number(purchase.amount || 0),
      0,
    );

    renderTable(
      dailyTable,
      ["Date", "Weight", "Spots", "Court Fee", "Court / Player", "Birdie / Spot", "Total / Spot", "Status"],
      billing.daily.map((day) => [
        { text: formatDisplayDate(day.date), className: "name-cell" },
        { text: `${formatNumber(day.weight, 1)}x` },
        { text: String(day.spots), className: "numeric-cell" },
        { text: formatMoney(day.courtFee), className: "numeric-cell" },
        { text: formatMoney(day.courtPerSpot), className: "numeric-cell" },
        { text: formatMoney(day.birdiePerSpot), className: "numeric-cell" },
        { text: formatMoney(day.totalPerSpot), className: "numeric-cell" },
        day.eligible
          ? makeBadge(day.activeBlocks ? "Clean" : "No court", day.activeBlocks ? "paid" : "review")
          : makeBadge(`Excluded (<${MIN_BILLABLE_PARTICIPANTS})`, "review"),
      ]),
      ["Total", "", String(billing.totalSpots), formatMoney(courtTotal), "", formatMoney(birdieTotal), formatMoney(courtTotal + birdieTotal), ""],
    );
    dailyNote.textContent = backendBilling
      ? `${billing.billableDateCount} billable play dates from Apps Script RSVP data${
          billing.excludedDateCount
            ? `; ${billing.excludedDateCount} date${billing.excludedDateCount === 1 ? "" : "s"} excluded below ${MIN_BILLABLE_PARTICIPANTS} spots.`
            : "."
        }`
      : `${billing.daily.length} play dates from demo attendance. Replace this with Apps Script RSVP data next.`;
  }

  function renderCourtBlocks() {
    const canceledCourtBlocks = billing.courtBlocks.filter(
      (block) => block.status === "canceled",
    );
    showCanceledCourtsControl.hidden = canceledCourtBlocks.length === 0;
    showCanceledCourtsLabel.textContent = `Show canceled (${canceledCourtBlocks.length})`;
    if (!canceledCourtBlocks.length) {
      showCanceledCourtsInput.checked = false;
    }
    const visibleCourtBlocks = billing.courtBlocks.filter(
      (block) => block.status === "active" || showCanceledCourtsInput.checked,
    );
    const sortedCourtBlocks = visibleCourtBlocks.slice().sort((first, second) => {
      const dateOrder = String(first.date || "").localeCompare(String(second.date || ""));
      if (dateOrder) {
        return dateOrder;
      }
      const timeOrder = normalizeClockValue(first.startTime).localeCompare(
        normalizeClockValue(second.startTime),
      );
      if (timeOrder) {
        return timeOrder;
      }
      return String(first.id || "").localeCompare(String(second.id || ""));
    });
    const activeCourtBlocks = billing.activeCourtBlocks;
    const activeBookingCount = activeCourtBlocks.reduce(
      (sum, block) => sum + Number(block.courts || 0),
      0,
    );
    const totalCourtHours = activeCourtBlocks.reduce(
      (sum, block) =>
        sum + Number(block.durationHours || 0) * Number(block.courts || 0),
      0,
    );
    const totalCost = activeCourtBlocks.reduce(
      (sum, block) => sum + Number(block.amount || 0),
      0,
    );

    renderTable(
      courtBlockTable,
      ["Date", "Block", "Courts", "Paid By", "Amount", "Source", "Status", "Actions"],
      sortedCourtBlocks.map((block) => {
        const isIneligibleActiveBlock =
          block.status === "active" &&
          getAttendanceSpotCountForDate(block.date) < MIN_BILLABLE_PARTICIPANTS;
        const statusCell = makeBadge(
          isIneligibleActiveBlock
            ? `Cancel (<${MIN_BILLABLE_PARTICIPANTS})`
            : block.status === "active"
              ? "Active"
              : "Canceled",
          block.status === "active" && !isIneligibleActiveBlock ? "paid" : "review",
        );
        const actions = document.createElement("td");
        const toggle = document.createElement("button");
        toggle.className = `inline-action ${block.status === "active" ? "remove" : ""}`;
        toggle.type = "button";
        toggle.textContent = block.status === "active" ? "x" : "+";
        toggle.setAttribute(
          "aria-label",
          block.status === "active" ? "Cancel block" : "Restore block",
        );
        toggle.addEventListener("click", () => {
          saveBillingAction(
            {
              action: "toggleCourtBlock",
              id: block.id,
              status: block.status === "active" ? "canceled" : "active",
            },
            () => {
              const blocks = getCourtBlocks().map((candidate) =>
                candidate.id === block.id
                  ? { ...candidate, status: candidate.status === "active" ? "canceled" : "active" }
                  : candidate,
              );
              setCourtBlocks(blocks);
            },
            "Court block updated.",
            courtFeedback,
          );
        });
        actions.append(toggle);
        if (block.status === "canceled") {
          const remove = document.createElement("button");
          remove.className = "inline-action remove";
          remove.type = "button";
          remove.textContent = "Delete";
          remove.setAttribute("aria-label", "Permanently delete canceled block");
          remove.addEventListener("click", () => {
            if (!window.confirm("Permanently delete this canceled court block from the spreadsheet?")) {
              return;
            }
            saveBillingAction(
              {
                action: "removeCourtBlock",
                id: block.id,
              },
              () => {
                setCourtBlocks(
                  getCourtBlocks().filter((candidate) => candidate.id !== block.id),
                );
              },
              "Canceled court block deleted.",
              courtFeedback,
            );
          });
          actions.append(remove);
        }

        return [
          { text: formatDisplayDate(block.date), className: "name-cell" },
          { text: formatCourtBlock(block) },
          { text: String(block.courts), className: "numeric-cell" },
          { text: block.paidBy },
          { text: formatMoney(block.amount), className: "numeric-cell" },
          { text: formatCourtSource(block.source) },
          statusCell,
          actions,
        ];
      }),
      [
        "Billable total",
        `${formatNumber(totalCourtHours, 1)} court-hours`,
        `${activeBookingCount} active booking${activeBookingCount === 1 ? "" : "s"}`,
        "",
        formatMoney(totalCost),
        "",
        "",
        "",
      ],
    );
  }

  function removeBirdieEntry(purchase) {
    const isInventory = getBirdieRecordType(purchase) === "inventory_purchase";
    saveBillingAction(
      {
        action: "removeBirdiePurchase",
        id: purchase.id,
        month: getFinalizedPurchaseMonth(purchase) || monthInput.value,
      },
      () => {
        setBirdieState({
          ...getBirdieState(),
          purchases: getBirdieState().purchases.filter(
            (candidate) => candidate.id !== purchase.id,
          ),
        });
      },
      isInventory ? "Birdie inventory entry removed." : "Birdie entry removed.",
      birdieFeedback,
    );
  }

  function makeBirdieRemoveButton(purchase, label) {
    const recordType = getBirdieRecordType(purchase);
    const entryLabel = recordType === "inventory_purchase"
      ? "birdie inventory"
      : recordType === "usage"
        ? "birdie usage"
        : "birdie";
    const remove = document.createElement("button");
    remove.className = "inline-action remove";
    remove.type = "button";
    remove.textContent = label || "x";
    remove.title = `Remove ${purchase.tubes} tube${Number(purchase.tubes) === 1 ? "" : "s"} from ${purchase.date}`;
    remove.setAttribute(
      "aria-label",
      `Remove ${entryLabel} entry from ${purchase.date}`,
    );
    remove.addEventListener("click", () => removeBirdieEntry(purchase));
    return remove;
  }

  function makeBirdieReimbursementButton(purchase) {
    const reimbursementDate = getBirdieReimbursementDate(purchase);
    const reimbursed = Boolean(reimbursementDate);
    const dateLabel = String(purchase.date || "").slice(5).replace("-", "/");
    const defaultDate = reimbursementDate || getMonthEndDateForMonth(
      String(purchase.date || monthInput.value).slice(0, 7),
    );
    const button = document.createElement("button");
    button.className = "inline-action";
    button.type = "button";
    button.textContent = reimbursed
      ? `Date ${formatAuditDate(reimbursementDate)}`
      : `Reimburse ${String(defaultDate).slice(5).replace("-", "/") || dateLabel}`;
    button.title = reimbursed
      ? "Change the recorded reimbursement date"
      : `Record reimbursement of ${formatMoney(purchase.amount)} to ${purchase.paidBy}`;
    button.addEventListener("click", () => {
      const enteredDate = window.prompt(
        "Reimbursement date (YYYY-MM-DD)",
        defaultDate,
      );
      if (enteredDate === null) {
        return;
      }
      if (!isValidIsoDate(enteredDate)) {
        setSectionStatus(
          birdieFeedback,
          "Enter a valid reimbursement date using YYYY-MM-DD.",
          "error",
        );
        return;
      }
      saveBirdieReimbursement(purchase, true, enteredDate);
    });
    return button;
  }

  function getBirdieReimbursementDate(purchase) {
    return String(purchase.reimbursedDate || purchase.reimbursedAt || "").slice(0, 10);
  }

  function isValidIsoDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return false;
    }
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return formatDate(date) === value;
  }

  function saveBirdieReimbursement(purchase, reimbursed, reimbursedDate) {
    saveBillingAction(
      {
        action: "saveBirdiePurchaseReimbursement",
        id: purchase.id,
        month: getFinalizedPurchaseMonth(purchase) || monthInput.value,
        reimbursed: String(reimbursed),
        reimbursedDate: reimbursed ? reimbursedDate : "",
      },
      () => {
        setBirdieState({
          ...getBirdieState(),
          purchases: getBirdieState().purchases.map((candidate) =>
            candidate.id === purchase.id
              ? {
                  ...candidate,
                  reimbursedDate: reimbursed ? reimbursedDate : "",
                  reimbursedAt: "",
                  reimbursedAmount: reimbursed ? Number(candidate.amount || 0) : 0,
                  reimbursedBy: reimbursed ? getRememberedPlayer() : "",
                }
              : candidate,
          ),
        });
      },
      reimbursed ? "Birdie reimbursement recorded." : "Birdie reimbursement cleared.",
      birdieFeedback,
    );
  }

  function makeBirdieReimbursementUndoButton(purchase) {
    const button = document.createElement("button");
    button.className = "inline-action remove";
    button.type = "button";
    button.textContent = "Undo";
    button.title = "Clear the reimbursement record";
    button.addEventListener("click", () => saveBirdieReimbursement(purchase, false, ""));
    return button;
  }

  function renderBirdies() {
    const state = billing.birdieState;
    const inventoryBatches = getBirdieInventoryBatches(state.purchases);
    const visibleInventoryBatches = inventoryBatches.filter(
      (batch) =>
        batch.remaining > 0 ||
        batch.activityDates.some((date) => String(date).startsWith(`${monthInput.value}-`)),
    );
    const currentMonthRows = state.purchases.filter(
      (purchase) =>
        isActiveBirdiePurchase(purchase) &&
        isCurrentMonthBirdieRow(purchase) &&
        getBirdieRecordType(purchase) !== "inventory_purchase",
    );
    const currentMonthUsedTubes = state.purchases
      .filter(isBilledBirdiePurchase)
      .reduce((sum, purchase) => sum + Number(purchase.tubes || 0), 0);
    const currentMonthUsageCost = state.purchases
      .filter(isBilledBirdiePurchase)
      .reduce((sum, purchase) => sum + Number(purchase.amount || 0), 0);
    const remainingTubes = inventoryBatches.reduce(
      (sum, batch) => sum + Number(batch.remaining || 0),
      0,
    );
    const selectedUsageBatch = birdieUsageBatchInput.value;

    clearElement(birdieUsageBatchInput);
    inventoryBatches
      .filter((batch) => batch.remaining > 0)
      .forEach((batch) => {
        const option = document.createElement("option");
        option.value = batch.key;
        option.textContent = `${batch.batch} - ${formatNumber(
          batch.remaining,
          1,
        )} left @ ${formatMoney(batch.unitPrice)}`;
        birdieUsageBatchInput.append(option);
      });
    if (
      selectedUsageBatch &&
      Array.from(birdieUsageBatchInput.options).some(
        (option) => option.value === selectedUsageBatch,
      )
    ) {
      birdieUsageBatchInput.value = selectedUsageBatch;
    }
    updateBirdieUsageMax();

    renderTable(
      birdiePurchaseTable,
      ["Batch", "Purchase Date", "Tubes", "Unit", "Paid/Source", "Amount", "Reimbursed", "Status", "Actions"],
      visibleInventoryBatches.map((batch) => {
        const actions = document.createElement("td");
        batch.inventoryPurchases
          .slice()
          .sort((first, second) => String(first.date).localeCompare(String(second.date)))
          .forEach((purchase) => {
            const dateLabel = String(purchase.date || "").slice(5).replace("-", "/");
            actions.append(makeBirdieReimbursementButton(purchase));
            if (getBirdieReimbursementDate(purchase)) {
              actions.append(makeBirdieReimbursementUndoButton(purchase));
            }
            actions.append(
              makeBirdieRemoveButton(purchase, `x ${dateLabel || "entry"}`),
            );
          });
        const reimbursedPurchases = batch.inventoryPurchases.filter(
          (purchase) => getBirdieReimbursementDate(purchase),
        );
        const reimbursementText = reimbursedPurchases.length === 0
          ? "Pending"
          : reimbursedPurchases.length === batch.inventoryPurchases.length
            ? reimbursedPurchases
                .map((purchase) => formatAuditDate(getBirdieReimbursementDate(purchase)))
                .filter(Boolean)
                .join(", ")
            : `${reimbursedPurchases.length}/${batch.inventoryPurchases.length} reimbursed`;
        return [
          { text: batch.batch, className: "name-cell" },
          {
            text: batch.purchaseDates
              .slice()
              .sort()
              .map(formatDisplayDate)
              .join(", "),
          },
          {
            text: `${formatNumber(batch.remaining, 1)} left / ${formatNumber(
              batch.purchased,
              1,
            )} bought`,
            className: "numeric-cell",
          },
          { text: formatMoney(batch.unitPrice), className: "numeric-cell" },
          {
            text:
              Array.from(
                new Set(
                  batch.inventoryPurchases
                    .map((purchase) => purchase.paidBy)
                    .filter(Boolean),
                ),
              ).join(" / ") || "Inventory",
          },
          { text: formatMoney(batch.amount), className: "numeric-cell" },
          { text: reimbursementText },
          makeBadge("Inventory", "review"),
          actions,
        ];
      }).concat(currentMonthRows.map((purchase) => {
        const recordType = getBirdieRecordType(purchase);
        const batch =
          purchase.batch ||
          (recordType === "usage" ? "Monthly usage" : "Inventory purchase");
        const actions = document.createElement("td");
        actions.append(makeBirdieRemoveButton(purchase));
        return [
          { text: batch, className: "name-cell" },
          { text: formatDisplayDate(purchase.date) },
          { text: String(purchase.tubes), className: "numeric-cell" },
          { text: getBirdieUnitPrice(purchase) ? formatMoney(getBirdieUnitPrice(purchase)) : "", className: "numeric-cell" },
          { text: purchase.paidBy },
          { text: formatMoney(purchase.amount), className: "numeric-cell" },
          { text: "—" },
          makeBadge(
            purchase.status === "canceled"
              ? "Canceled"
              : recordType === "inventory_purchase"
                ? "Inventory"
                : "Active",
            purchase.status === "canceled" || recordType === "inventory_purchase"
              ? "review"
              : "paid",
          ),
          actions,
        ];
      })),
      [
        "Total",
        "",
        `${formatNumber(remainingTubes, 1)} left`,
        `Used: ${formatNumber(currentMonthUsedTubes, 1)}`,
        "",
        formatMoney(currentMonthUsageCost),
        "",
        "",
        "",
      ],
    );
  }

  function getMoneyClass(value) {
    if (value < -0.005) return "money-credit";
    if (value > 0.005) return "money-owed";
    return "";
  }

  function renderMembers() {
    renderTable(
      memberTable,
      ["Player", "Spots", "Birdie Fee", "Court Fee", "Paid Credits", "Net Balance", "Payment Status", "Action"],
      billing.members.map((member) => {
        const statusCell = document.createElement("td");
        const select = document.createElement("select");
        select.className = "billing-status-select";
        STATUS_OPTIONS.forEach((option) => {
          const optionEl = document.createElement("option");
          optionEl.value = option;
          optionEl.textContent = option;
          select.append(optionEl);
        });
        select.value = getPaymentStatus(member.name);
        select.addEventListener("change", () => {
          saveBillingAction(
            {
              action: "saveBillingPaymentStatus",
              playerName: member.name,
              status: select.value,
            },
            () => setPaymentStatus(member.name, select.value),
            "Payment status saved.",
          );
        });
        statusCell.append(select);

        const actionCell = document.createElement("td");
        const detailButton = document.createElement("button");
        detailButton.className = "secondary-button inline-button";
        detailButton.type = "button";
        detailButton.textContent = "Detail";
        detailButton.addEventListener("click", () => {
          memberSelect.value = member.name;
          renderMemberDetail(member.name);
        });
        actionCell.append(detailButton);

        return [
          { text: member.name, className: "name-cell" },
          { text: String(member.spots), className: "numeric-cell optional-member-column" },
          { text: formatMoney(member.birdieFee), className: "numeric-cell optional-member-column" },
          { text: formatMoney(member.courtFee), className: "numeric-cell optional-member-column" },
          { text: formatMoney(member.credits), className: `numeric-cell optional-member-column ${member.credits > 0 ? "money-credit" : ""}` },
          { text: formatMoney(member.netBalance), className: `numeric-cell member-balance-column ${getMoneyClass(member.netBalance)}` },
          statusCell,
          actionCell,
        ];
      }),
    );
    memberTable
      .querySelectorAll("thead th:nth-child(2), thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5)")
      .forEach((cell) => cell.classList.add("optional-member-column"));
    memberTable
      .querySelectorAll("thead th:nth-child(6)")
      .forEach((cell) => cell.classList.add("member-balance-column"));
    memberTable
      .querySelectorAll("thead th:nth-child(7), tbody td:nth-child(7)")
      .forEach((cell) => cell.classList.add("admin-payment-column"));
    memberNote.textContent =
      "Payment status saves for admins when Apps Script billing is connected.";
  }

  function renderMemberSelect() {
    const current = memberSelect.value || getRememberedPlayer();
    clearElement(memberSelect);
    billing.members.forEach((member) => {
      const option = document.createElement("option");
      option.value = member.name;
      option.textContent = member.name;
      memberSelect.append(option);
    });
    memberSelect.value = billing.members.some((member) => member.name === current)
      ? current
      : billing.members[0]?.name || "";
  }

  function appendDetailRow(label, value, className) {
    const row = document.createElement("div");
    row.className = "billing-detail-row";
    row.append(createCell("span", label), createCell("strong", value, className));
    memberDetail.append(row);
  }

  function appendCreditBreakdownItem(container, label, meta, amount) {
    const row = document.createElement("div");
    row.className = "billing-credit-item";
    const description = document.createElement("span");
    description.append(createCell("strong", label));
    if (meta) {
      description.append(createCell("small", meta));
    }
    row.append(
      description,
      createCell(
        "strong",
        formatMoney(amount),
        amount >= 0 ? "money-credit" : "money-owed",
      ),
    );
    container.append(row);
  }

  function renderCreditBreakdown(member) {
    if (member.credits <= 0.005 || !member.creditDetails) {
      return;
    }

    const courtTotal = roundMoney(member.creditDetails.court);
    const birdieTotal = roundMoney(
      member.creditDetails.birdiePurchases.reduce(
        (sum, purchase) => sum + Number(purchase.amount || 0),
        0,
      ),
    );
    const adjustmentTotal = roundMoney(
      member.creditDetails.adjustments.reduce(
        (sum, adjustment) => sum + Number(adjustment.amount || 0),
        0,
      ),
    );
    const summaryParts = [
      courtTotal ? `Court ${formatMoney(courtTotal)}` : "",
      birdieTotal ? `Birdies ${formatMoney(birdieTotal)}` : "",
      adjustmentTotal ? `Adjustments ${formatMoney(adjustmentTotal)}` : "",
    ].filter(Boolean);
    if (!summaryParts.length) {
      return;
    }

    const details = document.createElement("details");
    details.className = "billing-credit-breakdown";
    const summary = document.createElement("summary");
    summary.append(
      createCell("strong", "Credit breakdown"),
      createCell("small", summaryParts.join(" · ")),
    );
    const items = document.createElement("div");
    items.className = "billing-credit-items";

    if (courtTotal) {
      appendCreditBreakdownItem(items, "Court fees", "Bookings paid", courtTotal);
    }
    member.creditDetails.birdiePurchases
      .slice()
      .sort((first, second) =>
        String(first.date || "").localeCompare(String(second.date || "")),
      )
      .forEach((purchase) => {
        const tubeLabel = `${formatNumber(purchase.tubes, 1)} tube${
          Number(purchase.tubes) === 1 ? "" : "s"
        }`;
        const unitLabel = purchase.unitPrice
          ? ` @ ${formatMoney(purchase.unitPrice)}`
          : "";
        appendCreditBreakdownItem(
          items,
          purchase.batch,
          `${
            purchase.purchaseDate && purchase.purchaseDate !== purchase.date
              ? `Purchased ${formatDisplayDate(purchase.purchaseDate)} · reimbursed ${formatDisplayDate(purchase.date)}`
              : formatDisplayDate(purchase.date)
          } · ${tubeLabel}${unitLabel}`,
          purchase.amount,
        );
      });
    member.creditDetails.adjustments.forEach((adjustment) => {
      appendCreditBreakdownItem(
        items,
        "Adjustment",
        adjustment.note,
        adjustment.amount,
      );
    });

    details.append(summary, items);
    memberDetail.append(details);
  }

  function getVenmoPaymentNote(member) {
    return `${member.name} - Badminton ${formatMonthLabel(monthInput.value)}`;
  }

  function buildVenmoPaymentUrls(member, tipAmount) {
    const billAmount = roundMoney(member.netBalance);
    const tip = Math.max(0, roundMoney(tipAmount));
    const amount = window.BalanceCalculator
      .getPaymentTotal(billAmount, tip)
      .toFixed(2);
    const paymentNote = tip
      ? `${getVenmoPaymentNote(member)} + ${formatMoney(tip)} admin tip`
      : getVenmoPaymentNote(member);
    const encodedNote = encodeURIComponent(paymentNote);
    const encodedRecipient = encodeURIComponent(VENMO_RECIPIENT_USERNAME);
    const appUrl = `venmo://paycharge?txn=pay&recipients=${encodedRecipient}&amount=${amount}&note=${encodedNote}`;
    const webUrl = `https://venmo.com/${encodedRecipient}?txn=pay&amount=${amount}&note=${encodedNote}`;

    return {
      amount,
      paymentNote,
      appUrl,
      webUrl,
      androidIntentUrl: `intent://paycharge?txn=pay&recipients=${encodedRecipient}&amount=${amount}&note=${encodedNote}#Intent;scheme=venmo;package=com.venmo;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`,
    };
  }

  async function selfReportPayment(member, tipAmount, comment, button) {
    if (
      !window.confirm(
        `Mark ${member.name}'s ${formatMonthLabel(monthInput.value)} bill as paid?`,
      )
    ) {
      return;
    }

    button.disabled = true;
    setStatus("Saving your payment report...", "loading");
    try {
      const result = await requestAppsScript({
        action: "selfReportBillingPayment",
        month: monthInput.value,
        playerName: member.name,
        billedAmount: roundMoney(member.netBalance).toFixed(2),
        tipAmount: roundMoney(tipAmount).toFixed(2),
        comment: String(comment || "").trim(),
      });
      if (!result.payment?.playerName) {
        throw new Error("Apps Script did not save the payment report");
      }
      backendBilling = {
        ...backendBilling,
        payments: upsertByPlayerName(
          backendBilling?.payments || [],
          result.payment,
        ),
      };
      writeBillingCache(monthInput.value, backendBilling);
      render();
      setStatus(
        `${member.name}'s payment was marked Paid.`,
        "success",
      );
    } catch (error) {
      button.disabled = false;
      setStatus(error.message, "error");
    }
  }

  function renderVenmoPaymentAction(member) {
    if (
      member.netBalance <= 0.005 ||
      normalizeText(getPaymentStatus(member.name)) === "paid"
    ) {
      return;
    }

    const section = document.createElement("section");
    section.className = "billing-payment-action";
    const tipLabel = document.createElement("label");
    tipLabel.className = "field compact-field billing-tip-field";
    tipLabel.append(createCell("span", "Optional tip / donation for admin work"));
    const tipSelect = document.createElement("select");
    [
      ["0", "No tip"],
      ["1", "Add $1"],
      ["2", "Add $2"],
      ["5", "Add $5"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      tipSelect.append(option);
    });
    tipLabel.append(tipSelect);

    const link = document.createElement("a");
    link.className = "billing-payment-button venmo-payment-link";
    const note = document.createElement("p");
    let fallback = null;
    const updatePaymentLink = () => {
      const urls = buildVenmoPaymentUrls(member, tipSelect.value);
      link.href = IS_META_IN_APP_BROWSER
        ? IS_ANDROID_DEVICE
          ? urls.androidIntentUrl
          : urls.appUrl
        : urls.webUrl;
      link.textContent = `Pay ${formatMoney(urls.amount)} with Venmo`;
      note.textContent = `To ${VENMO_RECIPIENT_NAME}: ${urls.paymentNote}`;
      return urls;
    };
    let urls = updatePaymentLink();
    tipSelect.addEventListener("change", () => {
      urls = updatePaymentLink();
      if (fallback) fallback.href = urls.webUrl;
    });
    const help = document.createElement("p");
    help.className = "billing-payment-help";
    help.textContent = IS_META_IN_APP_BROWSER
      ? "If Messenger blocks the app, use the website link."
      : "Opens the Venmo app or payment website.";

    section.append(tipLabel, link, note);
    if (IS_META_IN_APP_BROWSER) {
      fallback = document.createElement("a");
      fallback.className = "venmo-web-fallback";
      fallback.href = urls.webUrl;
      fallback.textContent = "Use Venmo website";
      section.append(fallback);
    }
    section.append(help);

    if (!isAdmin && backendAvailable && !LOCAL_BILLING_FIXTURE) {
      const reportForm = document.createElement("div");
      reportForm.className = "billing-payment-report";
      const commentLabel = document.createElement("label");
      commentLabel.className = "field";
      commentLabel.append(createCell("span", "Payment comment (optional)"));
      const commentInput = document.createElement("textarea");
      commentInput.maxLength = 500;
      commentInput.rows = 2;
      commentInput.placeholder = "Example: Paid via Venmo today";
      commentLabel.append(commentInput);
      const markPaidButton = document.createElement("button");
      markPaidButton.type = "button";
      markPaidButton.className = "secondary-button billing-mark-paid-button";
      markPaidButton.textContent = `Mark ${member.name} as paid`;
      markPaidButton.addEventListener("click", () =>
        selfReportPayment(
          member,
          Number(tipSelect.value || 0),
          commentInput.value,
          markPaidButton,
        ),
      );
      const identityNote = document.createElement("p");
      identityNote.className = "billing-payment-help";
      identityNote.textContent = `Only use this for your own payment as ${member.name}. An admin can correct mistakes.`;
      reportForm.append(commentLabel, markPaidButton, identityNote);
      section.append(reportForm);
    }
    memberDetail.append(section);
  }

  function renderMemberDetail(name) {
    const member = billing.members.find((candidate) => candidate.name === name);
    clearElement(memberDetail);
    if (!member) {
      memberDetail.textContent = "No member selected.";
      return;
    }

    localStorage.setItem(LAST_PLAYER_KEY, member.name);
    appendDetailRow("Attendance", `${member.spots} spots`);
    appendDetailRow("Weighted spots", formatNumber(member.weightedSpots, 1));
    appendDetailRow("Birdie fee", formatMoney(member.birdieFee));
    appendDetailRow("Court fee", formatMoney(member.courtFee));
    appendDetailRow("Paid credits", formatMoney(member.credits), member.credits ? "money-credit" : "");
    appendDetailRow("Net balance", formatMoney(member.netBalance), getMoneyClass(member.netBalance));
    appendDetailRow("Payment", getPaymentStatus(member.name));
    const payment = getPaymentRecord(member.name);
    if (payment?.comment) {
      appendDetailRow("Payment comment", payment.comment);
    }
    if (Number(payment?.tipAmount || 0) > 0) {
      appendDetailRow("Admin tip", formatMoney(payment.tipAmount));
    }
    renderVenmoPaymentAction(member);
    renderCreditBreakdown(member);

    if (member.attendance?.length) {
      const attendance = document.createElement("section");
      attendance.className = "billing-detail-section";
      attendance.append(createCell("h3", "Attendance"));
      member.attendance.forEach((entry) => {
        const row = document.createElement("div");
        row.className = "billing-detail-row";
        row.append(
          createCell("span", formatDisplayDate(entry.date)),
          createCell("strong", `${entry.spots} spot${entry.spots === 1 ? "" : "s"}`),
        );
        attendance.append(row);
      });
      memberDetail.append(attendance);
    }
  }

  function render() {
    billing = calculateBilling();
    document.querySelectorAll(".admin-only").forEach((element) => {
      element.hidden = !isAdmin;
    });
    renderSummary();
    renderFinalizationStatus();
    renderCourtBlocks();
    renderBirdies();
    renderMembers();
    renderMemberSelect();
    renderMemberDetail(memberSelect.value);
    renderBillingSourceEditability();
  }

  function getBillingLoadSummary() {
    const billableDates = new Set(
      attendanceRows
        .filter(
          (day) => getAttendanceSpotCount(day) >= MIN_BILLABLE_PARTICIPANTS,
        )
        .map((day) => day.date),
    );
    const activeCourtBlocks = (backendBilling?.courtBlocks || []).filter(
      (block) => block.status === "active" && billableDates.has(block.date),
    );
    const activeBookingCount = activeCourtBlocks.reduce(
      (sum, block) => sum + Number(block.courts || 0),
      0,
    );
    const courtTotal = activeCourtBlocks.reduce(
      (sum, block) => sum + Number(block.amount || 0),
      0,
    );
    const billedBirdies = (backendBilling?.birdiePurchases || []).filter(
      isBilledBirdiePurchase,
    );
    const birdieTotal = billedBirdies.reduce(
      (sum, purchase) => sum + Number(purchase.amount || 0),
      0,
    );

    return [
      `${attendanceRows.length} play dates`,
      `${billing.totalSpots} spots`,
      `${activeBookingCount} active court booking${activeBookingCount === 1 ? "" : "s"} (${formatMoney(courtTotal)})`,
      `${billedBirdies.length} billed birdie rows (${formatMoney(birdieTotal)})`,
    ].join(" / ");
  }

  function getBillingLoadingMessage() {
    const fixtureNote = LOCAL_BILLING_FIXTURE
      ? ` using local fixture data/${LOCAL_BILLING_FIXTURE}.csv`
      : "";
    return `Loading ${formatMonthLabel(monthInput.value)} billing${fixtureNote}.`;
  }

  function updatePageTitle() {
    document.querySelector("#page-title").textContent = `Billing - ${formatMonthLabel(
      monthInput.value,
    )}`;
  }

  function applyBackendBilling(nextBilling, message, sourceLabel, options) {
    backendBilling = nextBilling;
    backendAvailable = true;
    attendanceRows =
      Array.isArray(backendBilling.attendance)
        ? backendBilling.attendance
        : createSampleAttendance();
    render();
    const summary = getBillingLoadSummary();
    if (!options?.skipProgress) {
      finishProgress("Billing loaded.");
    }
    setBillingContentVisible(true);
    if (!options?.silentStatus) {
      const defaultMessage =
        backendBilling.attendance?.length && isAdmin
          ? `Billing loaded from ${sourceLabel || "Apps Script"}: ${summary}.`
          : "Billing data loaded.";
      setStatus(
        message || defaultMessage,
        "success",
      );
    }
    updatePageTitle();
  }

  function upsertById(items, item) {
    const existingIndex = items.findIndex((candidate) => candidate.id === item.id);
    if (existingIndex === -1) {
      return [...items, item];
    }

    return items.map((candidate, index) => (
      index === existingIndex ? { ...candidate, ...item } : candidate
    ));
  }

  function upsertByPlayerName(items, item) {
    const existingIndex = items.findIndex(
      (candidate) => candidate.playerName === item.playerName,
    );
    if (existingIndex === -1) {
      return [...items, item];
    }

    return items.map((candidate, index) => (
      index === existingIndex ? { ...candidate, ...item } : candidate
    ));
  }

  function applyBillingSaveResult(action, result) {
    if (!backendBilling) {
      return false;
    }

    if (action === "saveCourtBlock" || action === "toggleCourtBlock") {
      if (!result.courtBlock?.id) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        courtBlocks: upsertById(backendBilling.courtBlocks || [], result.courtBlock),
      };
      return true;
    }

    if (action === "removeCourtBlock") {
      if (!result.removedCourtBlockId) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        courtBlocks: (backendBilling.courtBlocks || []).filter(
          (block) => block.id !== result.removedCourtBlockId,
        ),
      };
      return true;
    }

    if (
      action === "saveBirdiePurchase" ||
      action === "removeBirdiePurchase" ||
      action === "saveBirdiePurchaseReimbursement"
    ) {
      if (!result.birdiePurchase?.id) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        birdiePurchases: upsertById(
          backendBilling.birdiePurchases || [],
          result.birdiePurchase,
        ),
      };
      return true;
    }

    if (action === "saveBillingPaymentStatus") {
      if (!result.payment?.playerName) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        payments: upsertByPlayerName(backendBilling.payments || [], result.payment),
      };
      return true;
    }

    if (action === "saveBillingAdjustment" || action === "removeBillingAdjustment") {
      if (!result.adjustment?.id) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        adjustments: upsertById(backendBilling.adjustments || [], result.adjustment),
      };
      return true;
    }

    if (action === "saveBillingMonthStatus") {
      if (!result.monthStatus) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        monthStatus: result.monthStatus,
      };
      return true;
    }

    return false;
  }

  async function loadBillingMonth(message, options) {
    const requestId = latestBillingRequest + 1;
    latestBillingRequest = requestId;
    const month = monthInput.value;
    const forceRefresh = Boolean(options?.forceRefresh);
    updatePageTitle();
    clearSectionStatuses();
    const cached = LOCAL_BILLING_FIXTURE ? null : readBillingCache(month);

    if (cached?.billing) {
      applyBackendBilling(cached.billing, null, "cached billing", {
        skipProgress: true,
        silentStatus: true,
      });
      if (isBillingCacheFresh(cached) && !forceRefresh) {
        setBillingContentVisible(true);
        setStatus(message || "Billing loaded from saved data.", "success");
        updatePageTitle();
        return;
      }
      setStatus(
        forceRefresh
          ? `Refreshing billing. Showing saved billing from ${formatCacheAge(cached.savedAt)} while loading...`
          : `Showing saved billing from ${formatCacheAge(cached.savedAt)} while refreshing...`,
        "loading",
      );
      startProgress();
    } else {
      setBillingContentVisible(false);
      setStatus(getBillingLoadingMessage(), "loading");
      startProgress();
    }

    try {
      if (LOCAL_BILLING_FIXTURE) {
        const billingFixture = await loadLocalBillingFixture();
        if (requestId !== latestBillingRequest) {
          return;
        }
        applyBackendBilling(
          billingFixture,
          null,
          `local fixture data/${LOCAL_BILLING_FIXTURE}.csv`,
        );
        return;
      }

      const action = isAdmin && forceRefresh
        ? "refreshBillingMonth"
        : "listBillingMonth";
      const result = await requestAppsScript({
        action,
        month,
        adminToken,
      });
      if (requestId !== latestBillingRequest) {
        return;
      }
      writeBillingCache(month, result.billing);
      applyBackendBilling(
        result.billing,
        action === "refreshBillingMonth"
          ? result.snapshot
            ? "Billing recalculated and the member snapshot was updated."
            : "Draft billing recalculated. Members only see finalized snapshots."
          : message,
      );
    } catch (error) {
      if (requestId !== latestBillingRequest) {
        return;
      }
      if (cached?.billing) {
        clearProgress();
        setBillingContentVisible(true);
        setStatus(
          `Could not refresh Apps Script. Showing cached billing from ${formatCacheAge(
            cached.savedAt,
          )}.`,
          "error",
        );
        return;
      }
      const isUnsupportedAction = /Unsupported action: listBillingMonth/i.test(
        error.message,
      );
      const isFetchFailure = /Failed to fetch|Load failed|NetworkError|took too long/i.test(
        error.message,
      );
      backendBilling = null;
      backendAvailable = false;
      attendanceRows = createSampleAttendance();
      render();
      clearProgress();
      setBillingContentVisible(true);
      setStatus(
        isUnsupportedAction
          ? "Apps Script is still serving an older deployment. In Apps Script, deploy a New version of the Web App, then reload Billing. Local demo billing is shown for now."
          : isFetchFailure
            ? "Could not reach Apps Script. If this happens in a fresh browser, check the Web App deployment access: Execute as Me and Who has access = Anyone. Local demo billing is shown for now."
          : `${error.message}. Local demo billing is shown for now; reload Billing after the backend is ready.`,
        "error",
      );
    }
  }

  async function saveBillingAction(payload, fallback, successMessage, feedbackEl) {
    if (!backendAvailable || !adminToken) {
      fallback();
      recalculate(successMessage);
      if (feedbackEl) {
        setSectionStatus(feedbackEl, successMessage, "success");
      }
      return;
    }

    if (feedbackEl) {
      setSectionStatus(feedbackEl, "Saving change...", "loading");
    } else {
      setStatus("Saving billing change...", "loading");
    }
    try {
      const result = await requestAppsScript({
        ...payload,
        month: payload.month || monthInput.value,
        adminToken,
        actor: getRememberedPlayer(),
      });

      if (result.billing) {
        writeBillingCache(monthInput.value, result.billing);
        applyBackendBilling(result.billing, successMessage, null, {
          skipProgress: true,
          silentStatus: Boolean(feedbackEl),
        });
      } else if (applyBillingSaveResult(payload.action, result)) {
        writeBillingCache(monthInput.value, backendBilling);
        attendanceRows =
          Array.isArray(backendBilling?.attendance)
            ? backendBilling.attendance
            : createSampleAttendance();
        render();
        updatePageTitle();
        if (!feedbackEl) {
          setStatus(successMessage, "success");
        }
      } else {
        await loadBillingMonth(successMessage);
      }

      if (feedbackEl) {
        setSectionStatus(feedbackEl, successMessage, "success");
      }
    } catch (error) {
      if (feedbackEl) {
        setSectionStatus(feedbackEl, error.message, "error");
      } else {
        setStatus(error.message, "error");
      }
    }
  }

  function recalculate(message) {
    attendanceRows =
      Array.isArray(backendBilling?.attendance)
        ? backendBilling.attendance
        : createSampleAttendance();
    render();
    setStatus(message || "Billing recalculated from demo RSVP attendance and local monthly costs.", "success");
    updatePageTitle();
  }

  function slugImportValue(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function hashImportValue(value) {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function initializeCourtReserveBookmarklet() {
    function saveCourtReserveHtml() {
      const page = document.documentElement.cloneNode(true);
      page
        .querySelectorAll("script, style, link, iframe, object, embed")
        .forEach((element) => element.remove());
      const html = `<!doctype html>\n${page.outerHTML}`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `courtreserve-bookings-${new Date()
        .toISOString()
        .slice(0, 10)}.html`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    courtReserveExportBookmarklet.href = `javascript:(${saveCourtReserveHtml.toString()})()`;
    courtReserveExportBookmarklet.addEventListener("click", (event) => {
      event.preventDefault();
      setSectionStatus(
        courtImportFeedback,
        "Drag the Save CourtReserve HTML link to your bookmarks bar, then use that bookmark while viewing CourtReserve.",
        "",
      );
    });
  }

  function getImportedCourtBlockId(booking) {
    const key = booking.externalKey || (booking.reference
      ? `${booking.date}-${booking.reference}`
      : [
          booking.date,
          booking.startTime,
          booking.endTime,
          booking.court,
          booking.rawPaidBy,
        ].join("-"));
    const slug = slugImportValue(key);
    const prefix = booking.amountSource === "transaction"
      ? "court-transaction"
      : "court-booking";
    return `${prefix}-${slug || hashImportValue(key)}`;
  }

  function formatSourceRows(rowNumbers) {
    const ranges = [];
    rowNumbers
      .map(Number)
      .filter(Number.isFinite)
      .sort((first, second) => first - second)
      .forEach((rowNumber) => {
        const last = ranges[ranges.length - 1];
        if (last && rowNumber === last.end + 1) {
          last.end = rowNumber;
        } else {
          ranges.push({ start: rowNumber, end: rowNumber });
        }
      });
    return ranges
      .map((range) =>
        range.start === range.end ? range.start : `${range.start}–${range.end}`,
      )
      .join(", ");
  }

  function formatCourtSource(source) {
    const text = String(source || "");
    if (!text.startsWith("CourtReserve transaction import")) {
      return text;
    }
    const parts = text.split(/\s*·\s*/);
    const location = parts.find((part) => /^(?:Renton|Bellevue)(?:\s|$)/i.test(part));
    const refund = parts.find((part) => /^refund\s/i.test(part));
    const rows = parts.find((part) => /^XLSX rows\s/i.test(part));
    const compact = ["CR XLSX", location, refund].filter(Boolean);
    if (rows) {
      const rowNumbers = Array.from(rows.matchAll(/\d+/g), (match) => Number(match[0]));
      compact.push(`rows ${formatSourceRows(rowNumbers)}`);
    }
    return compact.join(" · ");
  }

  function getImportedCourtSource(booking) {
    const isTransaction = booking.amountSource === "transaction";
    const parts = [isTransaction ? "CR XLSX" : "CR page"];
    if (booking.reference) {
      parts.push(`#${booking.reference}`);
    }
    if (booking.court) {
      parts.push(booking.court);
    }
    if (isTransaction) {
      if (Number(booking.refundAmount || 0) > 0) {
        parts.push(`refund ${formatMoney(booking.refundAmount)}`);
      }
      if (booking.sourceRows?.length) {
        parts.push(`rows ${formatSourceRows(booking.sourceRows)}`);
      }
    } else if (booking.amountSource !== "export") {
      parts.push(`$${Number(booking.hourlyRate || 0).toFixed(2)}/hr`);
    }
    return parts.join(" · ");
  }

  function getImportedCourtMatch(booking) {
    const id = getImportedCourtBlockId(booking);
    const blocks = getCourtBlocks();
    const exact = blocks.some(
      (block) =>
        block.id === id ||
        (booking.reference &&
          String(block.source || "").includes(`#${booking.reference}`)),
    );
    if (exact) {
      return "exact";
    }
    const overlap = blocks.some(
      (block) =>
        block.status === "active" &&
        block.date === booking.date &&
        normalizeClockValue(block.startTime) === booking.startTime &&
        Math.abs(Number(block.durationHours || 0) - Number(booking.durationHours || 0)) < 0.01 &&
        (!booking.paidBy || block.paidBy === booking.paidBy),
    );
    return overlap ? "overlap" : "";
  }

  function makeImportCheckboxCell(booking) {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = booking.selected;
    input.setAttribute(
      "aria-label",
      `Import ${booking.date} ${booking.startTime}`,
    );
    input.addEventListener("change", () => {
      booking.selected = input.checked;
      updateCourtImportSaveButton();
    });
    cell.append(input);
    return cell;
  }

  function makeImportPayerCell(booking) {
    const cell = document.createElement("td");
    const select = document.createElement("select");
    const unresolved = document.createElement("option");
    unresolved.value = "";
    unresolved.textContent = booking.rawPaidBy
      ? `Choose payer (${booking.rawPaidBy})`
      : "Choose payer";
    select.append(unresolved);
    PLAYERS.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.append(option);
    });
    select.value = PLAYERS.includes(booking.paidBy) ? booking.paidBy : "";
    select.setAttribute("aria-label", `Payer for ${booking.date}`);
    select.addEventListener("change", () => {
      booking.paidBy = select.value;
      updateCourtImportSaveButton();
    });
    cell.append(select);
    return cell;
  }

  function makeImportAmountCell(booking) {
    const cell = document.createElement("td");
    cell.className = "numeric-cell";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "0.01";
    input.value = Number(booking.amount || 0).toFixed(2);
    input.setAttribute("aria-label", `Amount for ${booking.date}`);
    input.addEventListener("input", () => {
      booking.amount = parseAmount(input.value);
      updateCourtImportSaveButton();
    });
    cell.append(input);
    return cell;
  }

  function makeImportStatusCell(booking) {
    const cell = document.createElement("td");
    const reasons = booking.reviewReasons || [];
    let text = "New";
    let className = "paid";
    if (booking.duplicateMatch === "exact") {
      text = "Already imported";
      className = "review";
    } else if (booking.duplicateMatch === "overlap") {
      text = "Existing overlap";
      className = "review";
    } else if (reasons.length) {
      text = "Review";
      className = "review";
    } else if (booking.auditStatus === "verified") {
      text = "Verified";
    } else if (booking.amountSource === "transaction") {
      text = "XLSX ready";
    }
    const badge = document.createElement("span");
    badge.className = `billing-badge ${className}`;
    badge.textContent = text;
    if (reasons.length) {
      badge.title = reasons.join("; ");
    }
    cell.append(badge);
    if (reasons.length) {
      const note = document.createElement("small");
      note.className = "court-import-row-note";
      note.textContent = reasons.join("; ");
      cell.append(note);
    }
    return cell;
  }

  function updateCourtImportSaveButton() {
    const selected = courtImportBookings.filter((booking) => booking.selected);
    const ready = selected.filter(
      (booking) => booking.paidBy && Number(booking.amount) >= 0,
    );
    courtImportSaveButton.disabled =
      !isBillingSourceEditable() ||
      selected.length === 0 ||
      ready.length !== selected.length;
    courtImportSaveButton.textContent = selected.length
      ? `Import ${selected.length} Selected`
      : "Import Selected";
  }

  function renderCourtImportPreview() {
    courtImportPreview.hidden = courtImportBookings.length === 0;
    if (courtImportBookings.length === 0) {
      courtImportTable.replaceChildren();
      updateCourtImportSaveButton();
      return;
    }

    const sortedBookings = courtImportBookings.slice().sort((first, second) => {
      const dateOrder = String(first.date || "").localeCompare(String(second.date || ""));
      if (dateOrder) {
        return dateOrder;
      }
      return String(first.startTime || "").localeCompare(String(second.startTime || ""));
    });
    const bookingCount = courtImportBookings.reduce(
      (sum, booking) => sum + Number(booking.courts || 1),
      0,
    );
    const totalAmount = courtImportBookings.reduce(
      (sum, booking) => sum + Number(booking.amount || 0),
      0,
    );
    renderTable(
      courtImportTable,
      ["Use", "Date", "Time", "Location / Audit", "Courts", "Exported Member", "Paid By", "Net Amount", "Source", "Rows / Booking", "Status"],
      sortedBookings.map((booking) => [
        makeImportCheckboxCell(booking),
        { text: formatDisplayDate(booking.date), className: "name-cell" },
        { text: formatTimeRange(booking.startTime, booking.durationHours) },
        { text: booking.court || "Unknown" },
        { text: String(booking.courts || 1), className: "numeric-cell" },
        { text: booking.rawPaidBy || "Unknown" },
        makeImportPayerCell(booking),
        makeImportAmountCell(booking),
        makeBadge(
          booking.amountSource === "transaction"
            ? "XLSX fee"
            : booking.amountSource === "export"
              ? "Page total"
              : "Calculated",
          booking.amountSource === "transaction" || booking.amountSource === "export"
            ? "paid"
            : "review",
        ),
        {
          text: booking.sourceRows?.length
            ? booking.sourceRows.join(", ")
            : booking.reference
              ? `#${booking.reference}`
              : "—",
        },
        makeImportStatusCell(booking),
      ]),
      [
        "Total",
        "",
        "",
        "",
        `${bookingCount} active booking${bookingCount === 1 ? "" : "s"}`,
        "",
        "",
        formatMoney(totalAmount),
        "",
        "",
        "",
      ],
    );
    updateCourtImportSaveButton();
  }

  function clearCourtImportPreview() {
    courtImportBookings = [];
    courtImportPreview.hidden = true;
    courtImportTable.replaceChildren();
    setSectionStatus(courtImportFeedback, "");
    updateCourtImportSaveButton();
  }

  async function getReservationAuditSource() {
    const pasted = courtImportTextInput.value.trim();
    if (pasted) {
      return pasted;
    }
    const file = courtReservationAuditFileInput.files?.[0];
    return file && !file.type.startsWith("image/") ? file.text() : "";
  }

  function getReservationAuditKey(booking, includePayer) {
    const parts = [
      booking.date,
      booking.startTime,
      booking.endTime || getEndTime(booking.startTime, booking.durationHours),
      String(booking.location || booking.eventName || "").toLowerCase(),
    ];
    if (includePayer) {
      parts.push(String(booking.paidBy || booking.rawPaidBy || "").toLowerCase());
    }
    return parts.join("|");
  }

  function applyReservationAudit(transactionBookings, canceledBookings, auditBookings) {
    const byExactKey = new Map();
    const byScheduleKey = new Map();
    auditBookings.forEach((booking) => {
      const exactKey = getReservationAuditKey(booking, true);
      const scheduleKey = getReservationAuditKey(booking, false);
      [
        [byExactKey, exactKey],
        [byScheduleKey, scheduleKey],
      ].forEach(([map, key]) => {
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(booking);
      });
    });

    const warnings = [];
    transactionBookings.forEach((booking) => {
      const matches =
        byExactKey.get(getReservationAuditKey(booking, true)) ||
        byScheduleKey.get(getReservationAuditKey(booking, false)) ||
        [];
      const courtLabels = Array.from(
        new Set(matches.map((match) => match.court).filter(Boolean)),
      );
      if (courtLabels.length) {
        booking.court = courtLabels.join(", ");
      }
      if (matches.length === Number(booking.courts || 1)) {
        booking.auditStatus = "verified";
      } else {
        booking.auditStatus = "mismatch";
        booking.reviewReasons.push(
          matches.length
            ? `reservation audit shows ${matches.length} court${matches.length === 1 ? "" : "s"}; XLSX shows ${booking.courts}`
            : "not found in the Active reservation audit",
        );
      }
    });

    canceledBookings.forEach((booking) => {
      const matches =
        byExactKey.get(getReservationAuditKey(booking, true)) ||
        byScheduleKey.get(getReservationAuditKey(booking, false)) ||
        [];
      if (matches.length) {
        warnings.push(
          `${formatDisplayDate(booking.date)} ${formatTimeRange(
            booking.startTime,
            booking.durationHours,
          )} was fully refunded but still appears in the Active reservation audit.`,
        );
      }
    });
    return warnings;
  }

  async function handleCourtImportReview(event) {
    event.preventDefault();
    if (
      !window.BillingParser?.parseCourtReserveTransactionWorkbook ||
      !window.BillingParser?.parseCourtBookingExport
    ) {
      setSectionStatus(courtImportFeedback, "The CourtReserve parser is not available.", "error");
      return;
    }

    const transactionFile = courtImportFileInput.files?.[0];
    if (!transactionFile) {
      setSectionStatus(
        courtImportFeedback,
        "Choose the CourtReserve All Transactions XLSX file.",
        "error",
      );
      return;
    }

    const [year] = monthInput.value.split("-").map(Number);
    setSectionStatus(courtImportFeedback, "Reading and reconciling transactions...", "loading");
    try {
      const result = await window.BillingParser.parseCourtReserveTransactionWorkbook(
        await transactionFile.arrayBuffer(),
        { year, players: PLAYERS },
      );
      const selectedMonthBookings = result.bookings.filter(
        (booking) => booking.date.slice(0, 7) === monthInput.value,
      );
      const selectedMonthCanceled = result.canceled.filter(
        (booking) => booking.date.slice(0, 7) === monthInput.value,
      );
      const otherMonthCount = result.bookings
        .concat(result.canceled)
        .filter((booking) => booking.date.slice(0, 7) !== monthInput.value)
        .reduce((sum, booking) => sum + Number(booking.feeCount || 0), 0);

      courtImportBookings = selectedMonthBookings.map((booking) => {
        const reviewReasons = [...(booking.reviewReasons || [])];
        const duplicateMatch = getImportedCourtMatch(booking);
        const hasKnownPayer = PLAYERS.includes(booking.paidBy);
        if (duplicateMatch === "overlap") {
          reviewReasons.push("an existing active court block has the same date and time");
        }
        return {
          ...booking,
          paidBy: hasKnownPayer ? booking.paidBy : "",
          duplicateMatch,
          reviewReasons,
          selected: !duplicateMatch && hasKnownPayer && reviewReasons.length === 0,
        };
      });

      const auditSource = await getReservationAuditSource();
      let auditWarnings = [];
      if (auditSource.trim()) {
        const auditResult = window.BillingParser.parseCourtBookingExport(auditSource, {
          year,
          players: PLAYERS,
          weekdayHourlyRate: 14.89,
          weekendHourlyRate: 27.63,
        });
        const auditBookings = auditResult.bookings.filter(
          (booking) => booking.date.slice(0, 7) === monthInput.value,
        );
        auditWarnings = applyReservationAudit(
          courtImportBookings,
          selectedMonthCanceled,
          auditBookings,
        ).concat(auditResult.warnings);
        courtImportBookings.forEach((booking) => {
          booking.selected =
            !booking.duplicateMatch &&
            Boolean(booking.paidBy) &&
            booking.reviewReasons.length === 0;
        });
      }
      renderCourtImportPreview();

      const courtCount = courtImportBookings.reduce(
        (sum, booking) => sum + Number(booking.courts || 0),
        0,
      );
      const activeAmount = courtImportBookings.reduce(
        (sum, booking) => sum + Number(booking.amount || 0),
        0,
      );
      const feeRowCount = courtImportBookings
        .concat(selectedMonthCanceled)
        .reduce((sum, booking) => sum + Number(booking.feeCount || 0), 0);
      const duplicateCount = courtImportBookings.filter(
        (booking) => booking.duplicateMatch,
      ).length;
      const reviewCount = courtImportBookings.filter(
        (booking) => booking.reviewReasons.length > 0,
      ).length;
      const notes = [
        `${courtCount} active booking${courtCount === 1 ? "" : "s"}`,
        `${formatMoney(activeAmount)} net for ${formatMonthLabel(monthInput.value)}`,
        `${feeRowCount} fee row${feeRowCount === 1 ? "" : "s"} reconciled`,
      ];
      if (selectedMonthCanceled.length) {
        notes.push(
          `${selectedMonthCanceled.length} fully refunded block${selectedMonthCanceled.length === 1 ? "" : "s"} excluded`,
        );
      }
      if (reviewCount) {
        notes.push(`${reviewCount} need review`);
      }
      if (duplicateCount) {
        notes.push(`${duplicateCount} already imported or overlapping`);
      }
      if (otherMonthCount) {
        notes.push(`${otherMonthCount} fee row${otherMonthCount === 1 ? "" : "s"} outside this play month skipped`);
      }
      if (courtReservationAuditFileInput.files?.[0]?.type.startsWith("image/")) {
        notes.push("reservation screenshot shown for manual audit");
      } else if (auditSource.trim()) {
        notes.push("reservation export compared automatically");
      }
      if (result.unmatchedRefunds.length) {
        notes.push(`${result.unmatchedRefunds.length} refund${result.unmatchedRefunds.length === 1 ? "" : "s"} could not be matched`);
      }
      const warning = result.warnings[0] || auditWarnings[0];
      if (warning) {
        notes.push(warning);
      }
      setSectionStatus(
        courtImportFeedback,
        `${notes.join("; ")}.`,
        courtImportBookings.length && !warning ? "success" : "error",
      );
    } catch (error) {
      clearCourtImportPreview();
      setSectionStatus(courtImportFeedback, error.message, "error");
    }
  }

  function bookingToCourtBlock(booking) {
    return {
      id: getImportedCourtBlockId(booking),
      date: booking.date,
      startTime: booking.startTime,
      durationHours: booking.durationHours,
      courts: Math.max(1, Number(booking.courts || 1)),
      amount: roundMoney(booking.amount),
      paidBy: booking.paidBy,
      source: getImportedCourtSource(booking),
      status: "active",
    };
  }

  async function saveImportedCourtBlock(block) {
    const result = await requestAppsScript({
      action: "saveCourtBlock",
      month: monthInput.value,
      adminToken,
      actor: getRememberedPlayer(),
      ...block,
    });
    if (!result.courtBlock?.id) {
      throw new Error("The server did not return the saved court block.");
    }
    return result.courtBlock;
  }

  async function handleCourtImportSave() {
    const selectedBookings = courtImportBookings.filter((booking) => booking.selected);
    if (!selectedBookings.length) {
      return;
    }
    if (selectedBookings.some((booking) => !booking.paidBy)) {
      setSectionStatus(courtImportFeedback, "Choose a payer for every selected booking.", "error");
      return;
    }

    const blocks = selectedBookings.map(bookingToCourtBlock);
    courtImportSaveButton.disabled = true;
    setSectionStatus(
      courtImportFeedback,
      `Importing 0 of ${blocks.length} bookings...`,
      "loading",
    );

    if (!backendAvailable || !adminToken) {
      const byId = new Map(getCourtBlocks().map((block) => [block.id, block]));
      blocks.forEach((block) => byId.set(block.id, block));
      setCourtBlocks(Array.from(byId.values()));
      selectedBookings.forEach((booking) => {
        booking.selected = false;
        booking.duplicateMatch = "exact";
      });
      recalculate(`${blocks.length} court fee block${blocks.length === 1 ? "" : "s"} imported locally.`);
      renderCourtImportPreview();
      setSectionStatus(
        courtImportFeedback,
        `${blocks.length} court fee block${blocks.length === 1 ? "" : "s"} imported locally.`,
        "success",
      );
      return;
    }

    const saved = [];
    const errors = [];
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < blocks.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          saved.push(await saveImportedCourtBlock(blocks[index]));
        } catch (error) {
          errors.push({ block: blocks[index], error });
        }
        setSectionStatus(
          courtImportFeedback,
          `Importing ${saved.length + errors.length} of ${blocks.length} bookings...`,
          "loading",
        );
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(3, blocks.length) }, () => worker()),
    );
    saved.forEach((courtBlock) => {
      backendBilling = {
        ...backendBilling,
        courtBlocks: upsertById(backendBilling.courtBlocks || [], courtBlock),
      };
    });
    if (saved.length) {
      writeBillingCache(monthInput.value, backendBilling);
      render();
      selectedBookings.forEach((booking) => {
        if (saved.some((block) => block.id === getImportedCourtBlockId(booking))) {
          booking.selected = false;
          booking.duplicateMatch = "exact";
        }
      });
    }
    renderCourtImportPreview();
    setSectionStatus(
      courtImportFeedback,
      errors.length
        ? `${saved.length} imported; ${errors.length} failed. You can retry the remaining selected rows.`
        : `${saved.length} court fee block${saved.length === 1 ? "" : "s"} imported.`,
      errors.length ? "error" : "success",
    );
  }

  function handleCourtSubmit(event) {
    event.preventDefault();
    const attendanceSpots = getAttendanceSpotCountForDate(courtDateInput.value);
    if (attendanceSpots < MIN_BILLABLE_PARTICIPANTS) {
      setSectionStatus(
        courtFeedback,
        `Court blocks require at least ${MIN_BILLABLE_PARTICIPANTS} RSVP spots; ${courtDateInput.value} currently has ${attendanceSpots}.`,
        "error",
      );
      return;
    }
    const block = {
      id: makeId("court"),
      date: courtDateInput.value,
      startTime: courtStartTimeInput.value,
      durationHours: parseDurationHours(courtDurationInput.value),
      courts: Math.max(1, Number(courtCountInput.value || 1)),
      amount: parseAmount(courtAmountInput.value),
      paidBy: courtPaidByInput.value,
      source: getCourtRateSource(),
      status: "active",
    };
    saveBillingAction(
      {
        action: "saveCourtBlock",
        id: block.id,
        date: block.date,
        startTime: block.startTime,
        durationHours: block.durationHours,
        courts: block.courts,
        amount: block.amount,
        paidBy: block.paidBy,
        source: block.source,
        status: block.status,
      },
      () => setCourtBlocks([...getCourtBlocks(), block]),
      "Court block added.",
      courtFeedback,
    );
  }

  function handleBirdiePurchaseSubmit(event) {
    event.preventDefault();
    const tubes = Math.max(0.5, Number(birdieTubesInput.value || 0.5));
    const unitPrice = parseAmount(birdieUnitPriceInput.value);
    const amount = parseAmount(birdieAmountInput.value);
    const purchase = {
      id: makeId("birdie"),
      date: birdieDateInput.value,
      tubes,
      amount,
      paidBy: birdiePaidByInput.value,
      status: "active",
      recordType: "inventory_purchase",
      unitPrice,
      batch: birdieBatchInput.value.trim(),
    };
    saveBillingAction(
      {
        action: "saveBirdiePurchase",
        ...purchase,
      },
      () => {
        setBirdieState({
          ...getBirdieState(),
          purchases: [...getBirdieState().purchases, purchase],
        });
      },
      "Birdie purchase added.",
      birdieFeedback,
    );
  }

  function handleBirdieUsageSubmit(event) {
    event.preventDefault();
    const batches = getBirdieInventoryBatches(getBirdieState().purchases);
    const batch = batches.find(
      (candidate) => candidate.key === birdieUsageBatchInput.value,
    );
    if (!batch) {
      setSectionStatus(birdieFeedback, "Choose an available birdie batch first.", "error");
      return;
    }

    const tubes = Math.max(0.5, Number(birdieUsageTubesInput.value || 0.5));
    if (tubes > batch.remaining + 0.001) {
      setSectionStatus(
        birdieFeedback,
        `Only ${formatNumber(batch.remaining, 1)} tubes remain in ${batch.batch}.`,
        "error",
      );
      return;
    }

    const usage = {
      id: makeId("birdie-usage"),
      date: birdieUsageDateInput.value,
      tubes,
      amount: Math.round(tubes * Number(batch.unitPrice || 0) * 100) / 100,
      paidBy: "",
      status: "active",
      recordType: "usage",
      unitPrice: batch.unitPrice,
      batch: batch.batch,
    };
    saveBillingAction(
      {
        action: "saveBirdiePurchase",
        ...usage,
      },
      () => {
        setBirdieState({
          ...getBirdieState(),
          purchases: [...getBirdieState().purchases, usage],
        });
      },
      "Birdie usage added.",
      birdieFeedback,
    );
  }

  function handleFinalizationSubmit(event) {
    event.preventDefault();
    const status = finalizationSelect.value === "finalized" ? "finalized" : "draft";
    saveBillingAction(
      {
        action: "saveBillingMonthStatus",
        status,
      },
      () => setMonthStatus(status),
      status === "finalized"
        ? "Billing marked finalized and ready for payments."
        : "Billing moved back to draft.",
    );
  }

  async function handleMarkMonthPaid() {
    if (!billing?.members?.length) {
      setSectionStatus(memberFeedback, "No member balances are loaded for this month.", "error");
      return;
    }

    const memberCount = billing.members.length;
    markMonthPaidButton.disabled = true;
    if (!backendAvailable || !adminToken) {
      billing.members.forEach((member) => setPaymentStatus(member.name, "Paid"));
      render();
      markMonthPaidButton.disabled = false;
      setSectionStatus(
        memberFeedback,
        `Marked ${memberCount} members paid locally.`,
        "success",
      );
      return;
    }

    setSectionStatus(memberFeedback, "Marking all members paid...", "loading");
    try {
      const result = await requestAppsScript({
        action: "markBillingMonthPaid",
        month: monthInput.value,
        adminToken,
        actor: getRememberedPlayer(),
      });
      writeBillingCache(monthInput.value, result.billing);
      applyBackendBilling(result.billing, "Month marked paid.", null, {
        skipProgress: true,
      });
      setSectionStatus(
        memberFeedback,
        `Marked ${memberCount} members paid.`,
        "success",
      );
      const hasMonths = await loadBillingMonthOptions();
      if (hasMonths && monthInput.value !== result.billing.month) {
        initializeInputs();
        loadBillingMonth();
      } else if (!hasMonths) {
        setBillingContentVisible(false);
        setStatus("All finalized billing months are paid.", "success");
      }
    } catch (error) {
      setSectionStatus(memberFeedback, error.message, "error");
    } finally {
      markMonthPaidButton.disabled = false;
    }
  }

  function updateBirdiePurchaseAmount() {
    const tubes = Math.max(0, Number(birdieTubesInput.value || 0));
    const unitPrice = Math.max(0, Number(birdieUnitPriceInput.value || 0));
    birdieAmountInput.value = String(Math.round(tubes * unitPrice * 100) / 100);
  }

  function initializeInputs() {
    fillPlayerSelect(courtPaidByInput);
    fillPlayerSelect(birdiePaidByInput);
    courtPaidByInput.value = PLAYERS.includes(DEFAULT_COURT_PAYER)
      ? DEFAULT_COURT_PAYER
      : getRememberedPlayer();
    birdiePaidByInput.value = getRememberedPlayer();
    courtDateInput.value = `${monthInput.value}-01`;
    courtStartTimeInput.value = "06:00";
    courtDurationInput.value = "2:00";
    birdieDateInput.value = getMonthEndDateValue();
    birdieUsageDateInput.value = getMonthEndDateValue();
    updateCourtRateFromDate();
    updateBirdiePurchaseAmount();
  }

  function initializeAdminVisibility() {
    const adminAuth = window.RsvpAdminAuth;
    if (!adminAuth) {
      isAdmin = false;
      return;
    }

    adminAuth.onChange((state) => {
      const wasAdmin = isAdmin;
      isAdmin = Boolean(state.isLoggedIn);
      adminToken = state.token || "";
      reloadBillingButton.textContent = isAdmin ? "Recalculate" : "Reload saved bill";
      document.body.classList.toggle("billing-admin", isAdmin);
      document.querySelectorAll(".admin-only").forEach((element) => {
        element.hidden = !isAdmin;
      });
      if (billing) {
        setStatus(
          isAdmin
            ? "Admin billing tools enabled on this browser."
            : "Member view. Court and birdie editing is hidden.",
          isAdmin ? "success" : "",
        );
        if (wasAdmin !== isAdmin) {
          loadBillingMonthOptions().then((hasMonths) => {
            if (!hasMonths) {
              return;
            }
            initializeInputs();
            loadBillingMonth("Billing data loaded.");
          });
        }
      }
    });

    adminAuth.ready.then(() => {
      initializeBillingPage();
    });
  }

  async function initializeBillingPage() {
    const hasMonths = await loadBillingMonthOptions();
    if (!hasMonths) {
      return;
    }
    initializeInputs();
    loadBillingMonth();
  }

  monthInput.addEventListener("change", () => {
    clearCourtImportPreview();
    showCanceledCourtsInput.checked = false;
    initializeInputs();
    loadBillingMonth("Month changed. Billing data loaded.");
  });
  reloadBillingButton.addEventListener("click", async () => {
    if (isAdmin) {
      loadBillingMonth(null, { forceRefresh: true });
      return;
    }
    const hasMonths = await loadBillingMonthOptions({ forceRefresh: true });
    if (hasMonths) {
      initializeInputs();
      loadBillingMonth("Saved billing reloaded.");
    }
  });
  courtForm.addEventListener("submit", handleCourtSubmit);
  courtDateInput.addEventListener("change", updateCourtRateFromDate);
  courtDurationInput.addEventListener("input", updateCourtAmount);
  courtCountInput.addEventListener("input", updateCourtAmount);
  courtRatePresetInput.addEventListener("change", updateCourtAmount);
  courtHourlyRateInput.addEventListener("input", updateCourtAmount);
  courtImportForm.addEventListener("submit", handleCourtImportReview);
  courtImportSaveButton.addEventListener("click", handleCourtImportSave);
  showCanceledCourtsInput.addEventListener("change", renderCourtBlocks);
  courtImportFileInput.addEventListener("change", () => {
    if (courtImportFileInput.files?.[0]) {
      setSectionStatus(
        courtImportFeedback,
        `${courtImportFileInput.files[0].name} ready to review.`,
        "",
      );
    }
  });
  courtReservationAuditFileInput.addEventListener("change", () => {
    const file = courtReservationAuditFileInput.files?.[0];
    if (courtReservationAuditImageUrl) {
      URL.revokeObjectURL(courtReservationAuditImageUrl);
      courtReservationAuditImageUrl = "";
    }
    courtReservationAuditImage.hidden = true;
    courtReservationAuditImage.removeAttribute("src");
    if (file) {
      courtImportTextInput.value = "";
      if (file.type.startsWith("image/")) {
        courtReservationAuditImageUrl = URL.createObjectURL(file);
        courtReservationAuditImage.src = courtReservationAuditImageUrl;
        courtReservationAuditImage.hidden = false;
      }
      setSectionStatus(
        courtImportFeedback,
        `${file.name} will be used as the reservation audit.`,
        "",
      );
    }
  });
  birdiePurchaseForm.addEventListener("submit", handleBirdiePurchaseSubmit);
  birdieUsageForm.addEventListener("submit", handleBirdieUsageSubmit);
  birdieTubesInput.addEventListener("input", updateBirdiePurchaseAmount);
  birdieUnitPriceInput.addEventListener("input", updateBirdiePurchaseAmount);
  birdieUsageBatchInput.addEventListener("change", updateBirdieUsageMax);
  finalizationForm.addEventListener("submit", handleFinalizationSubmit);
  markMonthPaidButton.addEventListener("click", handleMarkMonthPaid);
  memberSelect.addEventListener("change", () => renderMemberDetail(memberSelect.value));

  initializeCourtReserveBookmarklet();
  initializeAdminVisibility();
  if (!window.RsvpAdminAuth) {
    initializeBillingPage();
  }
})();
