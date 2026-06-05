(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";
  const ADMIN_AUTH_KEY = "play-rsvp.adminAuth";
  const PLAY_DAYS = [2, 4, 5, 0];
  let PLAYERS = [
    "Alex Yeung",
    "Anh Khoa Tran (Truc Phuong)",
    "Bao Ta",
    "Cuong (MC) Nguyen",
    "Cuong Tipu",
    "Danny Phan",
    "Derek Blaiotta (Hoa Pham's fr)",
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
    "Nick Nguyen",
    "Phuc Anh",
    "Phuoc Truong",
    "Son Nguyen",
    "Thanh Nguyen",
    "Thanh Thanh Tran (Tu Do's friend)",
    "Thien Nguyen",
    "Thinh Do (Lily Do)",
    "Thinh Pham",
    "Thuy Duong",
    "Todd Nguyen",
    "Tr Nguyen (Trung)",
    "Tri Ho",
    "Truc Phuong",
    "Trung Van Nguyễn",
    "Truong Do",
    "Tu Anh Do",
    "Tuan Pham",
    "Tuan Phan/Hien",
    "Uyen",
    "Viet Do",
    "Vu Nguyen",
  ];

  const form = document.querySelector("#admin-form");
  const loginPanel = document.querySelector("#admin-login-panel");
  const loginForm = document.querySelector("#admin-login-form");
  const passwordInput = document.querySelector("#admin-password");
  const loginStatus = document.querySelector("#admin-login-status");
  const adminContent = document.querySelector("#admin-content");
  const logoutButton = document.querySelector("#admin-logout-button");
  const monthInput = document.querySelector("#roster-month");
  const playerSearch = document.querySelector("#player-search");
  const changeCount = document.querySelector("#change-count");
  const saveButton = document.querySelector("#save-button");
  const status = document.querySelector("#status");
  const monthTotal = document.querySelector("#month-total");
  const rosterTable = document.querySelector("#roster-table");
  let monthDates = [];
  let rosterValues = new Map();
  const changedValues = new Map();
  let latestLoadRequest = 0;
  let adminToken = "";

  function readAdminAuth() {
    try {
      const auth = JSON.parse(localStorage.getItem(ADMIN_AUTH_KEY));
      return auth && auth.token ? auth : null;
    } catch {
      return null;
    }
  }

  function writeAdminAuth(auth) {
    localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(auth));
  }

  function clearAdminAuth() {
    adminToken = "";
    localStorage.removeItem(ADMIN_AUTH_KEY);
  }

  function setLoginStatus(message, type) {
    loginStatus.textContent = message;
    loginStatus.className = `status ${type || ""}`.trim();
  }

  function setAdminLocked(message) {
    adminContent.hidden = true;
    loginPanel.hidden = false;
    if (message) {
      setLoginStatus(message, "error");
    }
  }

  function setAdminUnlocked() {
    loginPanel.hidden = true;
    adminContent.hidden = false;
    setLoginStatus("", "");
  }

  function formatMonth(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDisplayDate(value) {
    const date = new Date(`${value}T00:00:00`);
    const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
    const day = date.toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    });
    return `${weekday} ${day}`;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function getPlayDatesForMonth(month) {
    if (!/^\d{4}-\d{2}$/.test(month || "")) {
      return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = Number(month.slice(0, 4));
    const monthIndex = Number(month.slice(5, 7)) - 1;
    const isCurrentMonth = month === formatMonth(today);
    const daysUntilThisSunday = (7 - today.getDay()) % 7;
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + daysUntilThisSunday + 7);
    const current = new Date(year, monthIndex, 1);
    const dates = [];

    while (
      current.getMonth() === monthIndex &&
      (!isCurrentMonth || current <= endDate)
    ) {
      if (PLAY_DAYS.includes(current.getDay())) {
        dates.push(formatDate(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  function getKey(playerName, playDate) {
    return `${playerName}\u0000${playDate}`;
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type || ""}`.trim();
  }

  function buildAppsScriptUrl(payload, callbackName) {
    const url = new URL(APPS_SCRIPT_URL);
    if (callbackName) {
      url.searchParams.set("callback", callbackName);
    }
    Object.entries(payload).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  function parseJsonpResponse(text, callbackName) {
    const trimmed = text.trim();
    const prefix = `${callbackName}(`;

    if (!trimmed.startsWith(prefix) || !trimmed.endsWith(");")) {
      throw new Error("Unexpected Apps Script response");
    }

    return JSON.parse(trimmed.slice(prefix.length, -2));
  }

  async function requestViaFetch(payload) {
    const callbackName = `adminRsvpFetch_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const response = await fetch(buildAppsScriptUrl(payload, callbackName), {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error("Could not reach Apps Script");
    }

    const parsed = parseJsonpResponse(text, callbackName);
    if (parsed && parsed.ok) {
      return parsed;
    }

    throw new Error(parsed?.error || "Request failed");
  }

  function requestViaJsonp(payload) {
    return new Promise((resolve, reject) => {
      const callbackName = `adminRsvpCallback_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      script.referrerPolicy = "no-referrer";
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Apps Script took too long to respond"));
      }, 30000);

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

        reject(new Error(response?.error || "Request failed"));
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

  function parseParticipantCount(value) {
    const count = Number.parseInt(String(value || "0"), 10);
    return Number.isFinite(count) ? Math.min(5, Math.max(0, count)) : 0;
  }

  function getVisiblePlayers() {
    const query = normalizeSearchText(playerSearch.value);
    if (!query) {
      return PLAYERS;
    }

    return PLAYERS.filter((player) =>
      normalizeSearchText(player).includes(query),
    );
  }

  async function loadRoster() {
    try {
      const result = await requestAppsScript({
        action: "listRoster",
      });
      const roster = Array.isArray(result.roster) ? result.roster : [];
      const names = roster
        .map((member) => String(member.name || "").trim())
        .filter(Boolean);
      if (names.length > 0) {
        PLAYERS = names;
      }
    } catch {
      // Keep the built-in roster as a fallback when Apps Script is unavailable.
    }
  }

  function getParticipantOptions(selectedValue) {
    return [0, 1, 2, 3, 4, 5].map((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      option.selected = value === selectedValue;
      return option;
    });
  }

  function updateChangeCount() {
    const count = changedValues.size;
    changeCount.textContent =
      count === 0 ? "No changes" : `${count} pending changes`;
    saveButton.disabled = count === 0 || !adminToken;
  }

  function updateMonthTotal() {
    const totals = monthDates.map((date) => getDateTotal(date));
    const total = totals.reduce((sum, value) => sum + value, 0);
    monthTotal.textContent =
      total === 0
        ? "No reserved spots this month"
        : `${total} reserved spots this month`;
  }

  function getDateTotal(date) {
    return PLAYERS.reduce((sum, player) => {
      const key = getKey(player, date);
      const value = changedValues.has(key)
        ? changedValues.get(key)
        : rosterValues.get(key) || 0;
      return sum + value;
    }, 0);
  }

  function updateSummaryRow() {
    rosterTable
      .querySelectorAll(".summary-row td[data-date]")
      .forEach((cell) => {
        cell.textContent = String(getDateTotal(cell.dataset.date));
      });
  }

  function renderRosterTable() {
    const visiblePlayers = getVisiblePlayers();
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const nameHeader = document.createElement("th");
    const tbody = document.createElement("tbody");

    nameHeader.textContent = "Name";
    headerRow.append(nameHeader);
    monthDates.forEach((date) => {
      const header = document.createElement("th");
      header.textContent = formatDisplayDate(date);
      headerRow.append(header);
    });
    thead.append(headerRow);

    function getAttendanceClass(value) {
      if (value > 1) {
        return "roster-edit-party";
      }
      if (value === 1) {
        return "roster-edit-solo";
      }
      return "";
    }

    visiblePlayers.forEach((player) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = player;
      name.dataset.label = "Name";
      row.append(name);

      monthDates.forEach((date) => {
        const key = getKey(player, date);
        const originalValue = rosterValues.get(key) || 0;
        const value = changedValues.has(key)
          ? changedValues.get(key)
          : originalValue;
        const cell = document.createElement("td");
        const select = document.createElement("select");

        cell.className = getAttendanceClass(value);
        cell.classList.toggle("roster-edit-dirty", changedValues.has(key));
        cell.dataset.label = formatDisplayDate(date);
        select.className = "roster-edit-select";
        select.dataset.player = player;
        select.dataset.date = date;
        select.replaceChildren(...getParticipantOptions(value));
        select.addEventListener("change", () => {
          const nextValue = parseParticipantCount(select.value);
          if (nextValue === originalValue) {
            changedValues.delete(key);
          } else {
            changedValues.set(key, nextValue);
          }
          cell.className = getAttendanceClass(nextValue);
          cell.classList.toggle("roster-edit-dirty", changedValues.has(key));
          updateChangeCount();
          updateMonthTotal();
          updateSummaryRow();
        });

        cell.append(select);
        row.append(cell);
      });

      tbody.append(row);
    });

    const summaryRow = document.createElement("tr");
    const summaryLabel = document.createElement("td");
    summaryRow.className = "summary-row";
    summaryLabel.textContent = "Total";
    summaryLabel.dataset.label = "Name";
    summaryRow.append(summaryLabel);

    monthDates.forEach((date) => {
      const total = getDateTotal(date);
      const cell = document.createElement("td");
      cell.textContent = String(total);
      cell.dataset.date = date;
      cell.dataset.label = formatDisplayDate(date);
      summaryRow.append(cell);
    });
    tbody.append(summaryRow);

    rosterTable.replaceChildren(thead, tbody);
    updateChangeCount();
    updateMonthTotal();
  }

  async function loadMonth(month) {
    const requestId = latestLoadRequest + 1;
    latestLoadRequest = requestId;
    monthDates = getPlayDatesForMonth(month);
    rosterValues = new Map();
    changedValues.clear();
    rosterTable.textContent = "";
    setStatus("Loading month...", "loading");
    monthTotal.textContent = "Loading...";
    updateChangeCount();

    try {
      for (let index = 0; index < monthDates.length; index += 1) {
        const playDate = monthDates[index];
        setStatus(
          `Loading ${index + 1} of ${monthDates.length} dates...`,
          "loading",
        );
        const result = await requestAppsScript({
          action: "list",
          playDate,
        });
        if (requestId !== latestLoadRequest || monthInput.value !== month) {
          return;
        }

        const players = Array.isArray(result.tally?.players)
          ? result.tally.players
          : [];
        players.forEach((player) => {
          rosterValues.set(
            getKey(player.name, playDate),
            parseParticipantCount(player.participantCount),
          );
        });
      }

      renderRosterTable();
      setStatus("Month loaded.", "success");
    } catch (error) {
      if (requestId !== latestLoadRequest || monthInput.value !== month) {
        return;
      }
      rosterTable.textContent = "";
      monthTotal.textContent = "Could not load month";
      setStatus(error.message, "error");
    }
  }

  async function saveChanges() {
    const changes = Array.from(changedValues.entries());
    if (changes.length === 0) {
      return;
    }

    saveButton.disabled = true;
    setStatus(`Saving 0 of ${changes.length} changes...`, "loading");

    try {
      for (let index = 0; index < changes.length; index += 1) {
        const [key, participantCount] = changes[index];
        const [playerName, playDate] = key.split("\u0000");
        setStatus(
          `Saving ${index + 1} of ${changes.length} changes...`,
          "loading",
        );
        await requestAppsScript({
          action: "adminUpsertRsvp",
          adminToken,
          playerName,
          playDate,
          participantCount,
          vote: participantCount > 0 ? "Yes" : "No",
          confirmOverride: "true",
          submittedAt: new Date().toISOString(),
        });
      }

      await loadMonth(monthInput.value);
      setStatus(`Saved ${changes.length} changes.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
      updateChangeCount();
    }
  }

  async function initialize() {
    const auth = readAdminAuth();
    if (!auth?.token) {
      setAdminLocked("");
      return;
    }

    try {
      await requestAppsScript({
        action: "validateAdmin",
        adminToken: auth.token,
      });
      adminToken = auth.token;
      setAdminUnlocked();
    } catch (error) {
      clearAdminAuth();
      setAdminLocked(error.message);
      return;
    }

    await loadRoster();
    monthInput.value = formatMonth(new Date());
    loadMonth(monthInput.value);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginStatus("Logging in...", "loading");

    try {
      const result = await requestAppsScript({
        action: "adminLogin",
        password: passwordInput.value,
      });
      adminToken = result.token;
      writeAdminAuth({
        token: result.token,
        expiresAt: result.expiresAt,
      });
      passwordInput.value = "";
      setAdminUnlocked();
      await loadRoster();
      monthInput.value = formatMonth(new Date());
      loadMonth(monthInput.value);
    } catch (error) {
      clearAdminAuth();
      setLoginStatus(error.message, "error");
    }
  });

  logoutButton.addEventListener("click", () => {
    clearAdminAuth();
    changedValues.clear();
    rosterTable.textContent = "";
    monthTotal.textContent = "Login required";
    setStatus("", "");
    updateChangeCount();
    setAdminLocked("");
  });

  monthInput.addEventListener("change", () => {
    loadMonth(monthInput.value);
  });

  playerSearch.addEventListener("input", () => {
    renderRosterTable();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveChanges();
  });

  initialize();
})();
