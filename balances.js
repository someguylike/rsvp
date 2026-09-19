(function () {
  "use strict";

  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzcjWqKlqoILjYBAZLZ1Ka1xZ5QDXL_Mq65kOZXsTAxpNhp39pIkbIDPXiNjGOah0EF/exec";
  const LAST_PLAYER_KEY = "play-rsvp.lastPlayerName";
  const BILLING_CACHE_PREFIX = "billing:backend:";
  const BILLING_MONTHS_CACHE_KEY = "billing:months:member";
  const VENMO_RECIPIENT_NAME = "Nam Pham";
  const VENMO_RECIPIENT_USERNAME = "nampham2022";
  const REQUEST_TIMEOUT_MS = 12000;
  const JSONP_TIMEOUT_MS = 30000;
  const IS_META_IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Messenger/i.test(
    navigator.userAgent || "",
  );

  const memberSelect = document.querySelector("#balance-member");
  const refreshButton = document.querySelector("#refresh-balances");
  const statusEl = document.querySelector("#balance-status");
  const contentEl = document.querySelector("#balance-content");
  const monthCountEl = document.querySelector("#balance-month-count");
  const totalEl = document.querySelector("#balance-total");
  const listTotalEl = document.querySelector("#balance-list-total");
  const listEl = document.querySelector("#balance-list");

  let monthlyBalances = [];

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type || ""}`.trim();
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));
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

  function getCurrentMonth() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  }

  function buildAppsScriptUrl(payload, callbackName) {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("callback", callbackName);
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
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
      return fetch(url, options);
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .catch((error) => {
        if (error.name === "AbortError") {
          throw new Error("Request timed out");
        }
        throw error;
      })
      .finally(() => window.clearTimeout(timeout));
  }

  async function requestViaFetch(payload) {
    const callbackName = `balanceCallback_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const response = await fetchWithTimeout(
      buildAppsScriptUrl(payload, callbackName),
      {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
      REQUEST_TIMEOUT_MS,
    );
    const parsed = parseJsonp(await response.text(), callbackName);
    if (response.ok && parsed.ok) {
      return parsed;
    }
    throw new Error(parsed?.error || "Balance request failed");
  }

  function requestViaJsonp(payload) {
    return new Promise((resolve, reject) => {
      const callbackName = `balanceJsonpCallback_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
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
        if (response?.ok) {
          resolve(response);
        } else {
          reject(new Error(response?.error || "Balance request failed"));
        }
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Could not reach Apps Script"));
      };
      script.referrerPolicy = "no-referrer";
      script.src = buildAppsScriptUrl(payload, callbackName);
      document.body.append(script);
    });
  }

  function requestAppsScript(payload) {
    if (IS_META_IN_APP_BROWSER) {
      return requestViaJsonp(payload);
    }
    return requestViaFetch(payload).catch(() => requestViaJsonp(payload));
  }

  function readCache(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function writeCache(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function loadMonth(month) {
    try {
      const result = await requestAppsScript({ action: "listBillingMonth", month });
      writeCache(`${BILLING_CACHE_PREFIX}${month}`, {
        savedAt: Date.now(),
        billing: result.billing,
      });
      return result.billing;
    } catch (error) {
      const cached = readCache(`${BILLING_CACHE_PREFIX}${month}`);
      if (cached?.billing) {
        return cached.billing;
      }
      throw error;
    }
  }

  function getVisibleMonths(months) {
    return (months || [])
      .filter((entry) => entry.month < getCurrentMonth() && !entry.allPaid)
      .sort((first, second) => first.month.localeCompare(second.month));
  }

  function getCachedMonthlyBalances() {
    const monthCache = readCache(BILLING_MONTHS_CACHE_KEY);
    if (!Array.isArray(monthCache?.months)) {
      return null;
    }

    const savedAtValues = [Number(monthCache.savedAt || 0)].filter(Boolean);
    const visibleMonths = getVisibleMonths(monthCache.months);
    const balances = visibleMonths
      .map((entry) => {
        const cached = readCache(`${BILLING_CACHE_PREFIX}${entry.month}`);
        if (!cached?.billing) {
          return null;
        }
        if (cached.savedAt) {
          savedAtValues.push(Number(cached.savedAt));
        }
        return window.BalanceCalculator.calculateMonthBalances(cached.billing);
      })
      .filter(Boolean)
      .sort((first, second) => first.month.localeCompare(second.month));

    return {
      balances,
      visibleMonthCount: visibleMonths.length,
      savedAt: savedAtValues.length ? Math.min(...savedAtValues) : 0,
    };
  }

  function formatCacheAge(savedAt) {
    const elapsedMs = Math.max(0, Date.now() - Number(savedAt || 0));
    const minutes = Math.floor(elapsedMs / 60000);
    if (minutes < 1) {
      return "just now";
    }
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    return `${Math.floor(hours / 24)}d ago`;
  }

  function getSelectedMember() {
    return memberSelect.value || localStorage.getItem(LAST_PLAYER_KEY) || "";
  }

  function buildVenmoUrls(memberName, month, amount) {
    const paymentAmount = Number(amount || 0).toFixed(2);
    const note = `${memberName} - Badminton ${formatMonthLabel(month)}`;
    return {
      note,
      webUrl: `https://venmo.com/${encodeURIComponent(
        VENMO_RECIPIENT_USERNAME,
      )}?txn=pay&amount=${paymentAmount}&note=${encodeURIComponent(note)}`,
    };
  }

  function makeVenmoLink(memberName, entry) {
    const urls = buildVenmoUrls(memberName, entry.month, entry.balance);
    const link = document.createElement("a");
    link.className = "balance-pay-button venmo-payment-link";
    link.href = urls.webUrl;
    link.textContent = `Pay ${formatMoney(entry.balance)} with Venmo`;
    link.setAttribute(
      "aria-label",
      `Pay ${formatMoney(entry.balance)} for ${formatMonthLabel(entry.month)} with Venmo`,
    );
    return link;
  }

  function renderBalances() {
    const memberName = getSelectedMember();
    if (memberName) {
      localStorage.setItem(LAST_PLAYER_KEY, memberName);
    }
    const rows = monthlyBalances
      .map((entry) => ({
        month: entry.month,
        member: entry.members.find((member) => member.name === memberName),
      }))
      .map((entry) => {
        const isPaid =
          String(entry.member?.paymentStatus || "").toLowerCase() === "paid";
        const balance = window.BalanceCalculator.getAmountDue(entry.member);
        return { ...entry, isPaid, balance };
      })
      .sort((first, second) => first.month.localeCompare(second.month));
    const dueCount = rows.filter((entry) => entry.balance > 0.005).length;
    const total = rows.reduce((sum, entry) => sum + entry.balance, 0);

    monthCountEl.textContent = String(dueCount);
    totalEl.textContent = formatMoney(total);
    listTotalEl.textContent = formatMoney(total);
    listEl.replaceChildren();

    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "balance-empty";
      empty.textContent = "No completed billing months are available.";
      listEl.append(empty);
      return;
    }

    rows.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "balance-row";
      const details = document.createElement("div");
      details.className = "balance-row-details";
      const monthLink = document.createElement("a");
      monthLink.className = "balance-month-link";
      monthLink.href = `./billing.html?month=${encodeURIComponent(entry.month)}`;
      monthLink.textContent = formatMonthLabel(entry.month);
      const detailHint = document.createElement("p");
      detailHint.textContent = "View billing details";
      details.append(monthLink, detailHint);

      const amount = document.createElement("strong");
      amount.className = `balance-row-amount ${entry.balance > 0.005 ? "due" : "zero"}`;
      amount.textContent = formatMoney(entry.balance);

      const payment = document.createElement("div");
      payment.className = "balance-row-payment";
      const help = document.createElement("p");
      help.className = "balance-payment-help";
      if (entry.balance > 0.005) {
        help.textContent = `To ${VENMO_RECIPIENT_NAME} · opens Venmo for ${formatMonthLabel(
          entry.month,
        )}`;
        payment.append(makeVenmoLink(memberName, entry), help);
      } else {
        const state = document.createElement("span");
        state.className = "balance-paid-state";
        state.textContent = entry.isPaid ? "Paid" : "No payment due";
        help.textContent = entry.isPaid
          ? "Payment status is marked Paid."
          : entry.member
            ? "Credits cover this month."
            : "No billing activity for this member.";
        payment.append(state, help);
      }
      card.append(details, amount, payment);
      listEl.append(card);
    });
  }

  function populateMembers() {
    const names = Array.from(
      new Set(monthlyBalances.flatMap((entry) => entry.members.map((member) => member.name))),
    ).sort((first, second) => first.localeCompare(second));
    const remembered = localStorage.getItem(LAST_PLAYER_KEY) || "";
    memberSelect.replaceChildren();
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      memberSelect.append(option);
    });
    memberSelect.value = names.includes(remembered) ? remembered : names[0] || "";
  }

  function showBalances(balances) {
    monthlyBalances = balances.slice().sort((first, second) =>
      first.month.localeCompare(second.month),
    );
    populateMembers();
    renderBalances();
    contentEl.hidden = false;
  }

  async function loadBalances() {
    refreshButton.disabled = true;
    const cached = getCachedMonthlyBalances();
    const hasCachedView = Boolean(
      cached && (cached.balances.length > 0 || cached.visibleMonthCount === 0),
    );
    if (hasCachedView) {
      showBalances(cached.balances);
      setStatus(
        `Showing saved balances from ${formatCacheAge(cached.savedAt)}. Refreshing...`,
        "loading",
      );
    } else {
      contentEl.hidden = true;
      setStatus("Loading monthly balances...", "loading");
    }
    try {
      let monthResult;
      try {
        monthResult = await requestAppsScript({ action: "listBillingMonths" });
        writeCache(BILLING_MONTHS_CACHE_KEY, {
          savedAt: Date.now(),
          months: monthResult.months || [],
        });
      } catch (error) {
        const cached = readCache(BILLING_MONTHS_CACHE_KEY);
        if (!cached?.months) {
          throw error;
        }
        monthResult = { months: cached.months };
      }

      const months = getVisibleMonths(monthResult.months);
      const results = await Promise.allSettled(
        months.map((entry) => loadMonth(entry.month)),
      );
      const refreshedBalances = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => window.BalanceCalculator.calculateMonthBalances(result.value))
        .sort((first, second) => first.month.localeCompare(second.month));
      const failedCount = results.length - refreshedBalances.length;

      showBalances(refreshedBalances);
      setStatus(
        failedCount
          ? `${refreshedBalances.length} months loaded; ${failedCount} could not be refreshed.`
          : `${refreshedBalances.length} billing month${refreshedBalances.length === 1 ? "" : "s"} updated.`,
        failedCount ? "error" : "success",
      );
    } catch (error) {
      setStatus(
        hasCachedView
          ? `Showing saved balances. Refresh failed: ${error.message}`
          : error.message,
        "error",
      );
    } finally {
      refreshButton.disabled = false;
    }
  }

  memberSelect.addEventListener("change", renderBalances);
  refreshButton.addEventListener("click", loadBalances);

  if (!window.BalanceCalculator) {
    setStatus("The balance calculator could not be loaded.", "error");
  } else {
    loadBalances();
  }
})();
