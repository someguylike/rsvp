(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";
  const PLAYERS = [
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
  const LAST_RSVP_KEY = "play-rsvp.lastRsvp";
  const PLAY_DAYS = [2, 4, 5, 0];

  const form = document.querySelector("#rsvp-form");
  const playerInput = document.querySelector("#player-name");
  const playerList = document.querySelector("#player-list");
  const dateInput = document.querySelector("#play-date");
  const dateOptions = document.querySelector("#date-options");
  const customDateField = document.querySelector("#custom-date-field");
  const customDateInput = document.querySelector("#custom-play-date");
  const guestInput = document.querySelector("#guest-count");
  const status = document.querySelector("#status");
  const submitButton = document.querySelector("#submit-button");
  const tallyCount = document.querySelector("#tally-count");
  const tallyList = document.querySelector("#tally-list");
  const overrideDialog = document.querySelector("#override-dialog");
  const previousRsvp = document.querySelector("#previous-rsvp");
  const newRsvp = document.querySelector("#new-rsvp");
  const cancelOverride = document.querySelector("#cancel-override");
  const confirmOverride = document.querySelector("#confirm-override");
  let pendingOverridePayload = null;
  let latestTallyRequest = 0;

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

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getNextPlayDate() {
    return getUpcomingPlayDates(1)[0] || new Date();
  }

  function getUpcomingPlayDates(count) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = [];

    for (let offset = 0; offset <= 21 && dates.length < count; offset += 1) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + offset);
      if (PLAY_DAYS.includes(candidate.getDay())) {
        dates.push(candidate);
      }
    }

    return dates;
  }

  function formatDateOption(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - today.getDay());
    const endOfThisWeek = new Date(startOfThisWeek);
    endOfThisWeek.setDate(startOfThisWeek.getDate() + 6);

    const day = date.toLocaleDateString(undefined, { weekday: "long" });
    const full = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const prefix = date <= endOfThisWeek ? "This" : "Next";

    return {
      day: date.getTime() === today.getTime() ? "Today" : `${prefix} ${day}`,
      full,
    };
  }

  function selectPlayDate(value, options) {
    const isCustom = Boolean(options?.isCustom);
    dateInput.value = value;
    if (customDateInput && customDateInput.value !== value) {
      customDateInput.value = value;
    }
    customDateField?.classList.toggle("active", isCustom);
    dateOptions.querySelectorAll(".date-option").forEach((button) => {
      const isActive =
        button.dataset.date === value ||
        (isCustom && button.dataset.date === "custom");
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-checked", String(isActive));
    });
    loadTally(value);
  }

  function selectCustomDateOption() {
    customDateField?.classList.add("active");
    dateInput.value = customDateInput?.value || "";
    latestTallyRequest += 1;
    tallyCount.textContent = "Choose a date";
    tallyList.replaceChildren();
    dateOptions.querySelectorAll(".date-option").forEach((button) => {
      const isActive = button.dataset.date === "custom";
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-checked", String(isActive));
    });
    customDateInput?.focus();
    customDateInput?.showPicker?.();
  }

  function renderDateOptions() {
    const dates = getUpcomingPlayDates(4);
    dateOptions.replaceChildren(
      ...dates.map((date) => {
        const value = formatDate(date);
        const label = formatDateOption(date);
        const button = document.createElement("button");
        const day = document.createElement("span");
        const full = document.createElement("span");

        button.type = "button";
        button.className = "date-option";
        button.dataset.date = value;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", "false");
        day.className = "date-day";
        full.className = "date-full";
        day.textContent = label.day;
        full.textContent = label.full;

        button.append(day, full);
        button.addEventListener("click", () => {
          selectPlayDate(value);
        });
        return button;
      }),
    );

    const otherButton = document.createElement("button");
    const otherTitle = document.createElement("span");

    otherButton.type = "button";
    otherButton.className = "date-option";
    otherButton.dataset.date = "custom";
    otherButton.setAttribute("role", "radio");
    otherButton.setAttribute("aria-checked", "false");
    otherTitle.className = "date-day";
    otherTitle.textContent = "Other date";
    otherButton.append(otherTitle);
    otherButton.addEventListener("click", () => {
      if (customDateInput?.value) {
        selectPlayDate(customDateInput.value, { isCustom: true });
        return;
      }

      selectCustomDateOption();
    });
    dateOptions.append(otherButton);

    customDateInput?.addEventListener("change", () => {
      if (customDateInput.value) {
        selectPlayDate(customDateInput.value, { isCustom: true });
      }
    });

    selectPlayDate(formatDate(getNextPlayDate()));
  }

  function renderPlayerOptions() {
    renderPlayerMatches("");
  }

  function getPlayerMatches(query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return PLAYERS;
    }

    return PLAYERS.filter((name) =>
      normalizeSearchText(name).includes(normalizedQuery),
    ).slice(0, 8);
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase();
  }

  function hidePlayerList() {
    playerList.hidden = true;
    playerList.style.display = "none";
  }

  function selectPlayerName(name) {
    playerInput.value = name;
    hidePlayerList();
    playerInput.blur();
  }

  function renderPlayerMatches(query) {
    const matches = getPlayerMatches(query);
    playerList.replaceChildren(
      ...matches.map((name) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "player-option";
        option.textContent = name;
        option.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectPlayerName(name);
        });
        option.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectPlayerName(name);
        });
        return option;
      }),
    );
    playerList.hidden = matches.length === 0;
    playerList.style.display = matches.length === 0 ? "none" : "grid";
  }

  function isValidPlayerName(name) {
    return PLAYERS.some((player) => player === name);
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type || ""}`.trim();
  }

  function setStatusWithLink(message, linkText, href, type) {
    const link = document.createElement("a");
    status.textContent = `${message} `;
    status.className = `status ${type || ""}`.trim();
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = linkText;
    status.append(link);
  }

  function collectPayload() {
    const formData = new FormData(form);
    return {
      playerName: String(formData.get("playerName") || "").trim(),
      playDate: String(formData.get("playDate") || ""),
      vote: String(formData.get("vote") || "Yes"),
      guestCount: Number.parseInt(String(formData.get("guestCount") || "0"), 10),
      submittedAt: new Date().toISOString(),
    };
  }

  function formatGuestLabel(guestCount) {
    const count = Number(guestCount || 0);
    return count === 1 ? "1 guest" : `${count} guests`;
  }

  function renderRsvpDetails(container, rsvp) {
    const detailsSource = rsvp || {};
    const details = [
      ["Player", detailsSource.playerName],
      ["Date", detailsSource.playDate],
      ["Vote", detailsSource.vote],
      [
        "Guests",
        detailsSource.guestCount == null
          ? formatGuestLabel(0)
          : formatGuestLabel(detailsSource.guestCount),
      ],
    ];

    container.replaceChildren(
      ...details.map(([label, value]) => {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");

        term.textContent = label;
        description.textContent = String(value || "-");
        row.append(term, description);
        return row;
      }),
    );
  }

  function askOverrideConfirmation(existing, payload) {
    const previous = existing || {
      playerName: payload.playerName,
      playDate: payload.playDate,
      vote: "No",
      guestCount: 0,
    };

    if (
      !overrideDialog ||
      typeof overrideDialog.showModal !== "function" ||
      !previousRsvp ||
      !newRsvp
    ) {
      if (window.confirm("This player already has an RSVP. Update it?")) {
        submitRsvp({
          ...payload,
          confirmOverride: "true",
        });
      } else {
        setStatus("Kept the previous RSVP.", "");
      }
      return;
    }

    pendingOverridePayload = payload;
    renderRsvpDetails(previousRsvp, previous);
    renderRsvpDetails(newRsvp, payload);
    overrideDialog.showModal();
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
    if (!APPS_SCRIPT_URL) {
      throw new Error("Missing Apps Script URL in app.js");
    }

    const callbackName = `playRsvpFetch_${Date.now()}_${Math.random()
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

    throw new Error(parsed?.error || "Submission failed");
  }

  function requestViaJsonp(payload) {
    return new Promise((resolve, reject) => {
      if (!APPS_SCRIPT_URL) {
        reject(new Error("Missing Apps Script URL in app.js"));
        return;
      }

      const callbackName = `playRsvpCallback_${Date.now()}_${Math.random()
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
        } else {
          reject(new Error(response?.error || "Submission failed"));
        }
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Could not reach Apps Script"));
      };
      script.src = buildAppsScriptUrl(payload, callbackName);
      document.body.append(script);
    });
  }

  function requestAppsScript(payload, attempt) {
    return requestViaFetch(payload).catch(() => requestViaJsonp(payload)).catch((error) => {
      if (!attempt) {
        return new Promise((resolve) => {
          window.setTimeout(resolve, 1200);
        }).then(() => requestAppsScript(payload, 1));
      }

      throw error;
    });
  }

  async function submitRsvp(payload) {
    submitButton.disabled = true;
    setStatus("Submitting...", "");

    try {
      const result = await requestAppsScript(payload);

      if (result.action === "needs_confirmation") {
        askOverrideConfirmation(result.existing, payload);
        setStatus("Confirm whether to update the existing RSVP.", "");
        return;
      }

      writeJson(LAST_RSVP_KEY, payload);
      renderTally(result.tally);
      if (result.action === "deleted") {
        setStatus("Removed your RSVP.", "success");
      } else if (result.action === "not_found") {
        setStatus("No RSVP was on file for that date.", "");
      } else {
        setStatus(
          result.action === "updated"
            ? "Updated your existing RSVP."
            : "RSVP submitted.",
          "success",
        );
      }
    } catch (error) {
      if (error.message === "Could not reach Apps Script") {
        setStatusWithLink(
          "Your browser blocked the embedded submit.",
          "Open fallback submit.",
          buildAppsScriptUrl(payload),
          "error",
        );
        return;
      }

      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function removeExistingRsvp(payload) {
    submitButton.disabled = true;
    setStatus("Removing RSVP...", "");

    try {
      const result = await requestAppsScript({
        action: "delete",
        playerName: payload.playerName,
        playDate: payload.playDate,
      });

      renderTally(result.tally);
      setStatus("Removed the existing RSVP.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  function renderTally(tally) {
    const players = Array.isArray(tally?.players) ? tally.players : [];
    const playerCount = Number(tally?.playerCount || 0);
    const guestCount = Number(tally?.guestCount || 0);
    const totalCount = Number(tally?.totalCount || 0);

    tallyCount.textContent =
      totalCount > 0
        ? `${totalCount} total (${playerCount} players, ${guestCount} guests)`
        : "No Yes RSVPs yet";

    tallyList.replaceChildren(
      ...players.map((player) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        const guests = document.createElement("span");

        name.className = "tally-name";
        guests.className = "tally-guests";
        name.textContent = player.name;
        guests.textContent =
          Number(player.guestCount || 0) > 0
            ? `+${player.guestCount} guests`
            : "No guests";

        item.append(name, guests);
        return item;
      }),
    );
  }

  async function loadTally(playDate, attempt) {
    if (!playDate || !APPS_SCRIPT_URL) {
      return;
    }

    const requestId = latestTallyRequest + 1;
    latestTallyRequest = requestId;

    try {
      tallyCount.textContent = "Loading tally...";
      const result = await requestAppsScript({
        action: "list",
        playDate,
      });
      if (requestId !== latestTallyRequest || dateInput.value !== playDate) {
        return;
      }
      renderTally(result.tally);
    } catch (error) {
      if (requestId !== latestTallyRequest || dateInput.value !== playDate) {
        return;
      }
      if (!attempt) {
        window.setTimeout(() => {
          loadTally(playDate, 1);
        }, 1200);
        return;
      }

      tallyCount.textContent = "Could not load tally. Try refreshing.";
      tallyList.replaceChildren();
    }
  }

  function initialize() {
    renderPlayerOptions();
    renderDateOptions();

    const lastRsvp = readJson(LAST_RSVP_KEY, null);
    if (lastRsvp?.playerName && isValidPlayerName(lastRsvp.playerName)) {
      playerInput.value = lastRsvp.playerName;
    }

    guestInput.value = "0";
    playerInput.focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = collectPayload();
    if (!payload.playerName || !payload.playDate || Number.isNaN(payload.guestCount)) {
      setStatus("Please fill out the required fields.", "error");
      return;
    }

    if (!isValidPlayerName(payload.playerName)) {
      setStatus("Please choose a player from the list.", "error");
      return;
    }

    payload.guestCount = Math.max(0, payload.guestCount);

    submitRsvp(payload);
  });

  playerInput.addEventListener("focus", () => {
    renderPlayerMatches(playerInput.value);
  });

  playerInput.addEventListener("input", () => {
    renderPlayerMatches(playerInput.value);
  });

  playerInput.addEventListener("blur", () => {
    window.setTimeout(hidePlayerList, 120);
  });

  initialize();

  cancelOverride?.addEventListener("click", () => {
    pendingOverridePayload = null;
    setStatus("Kept the previous RSVP.", "");
  });

  confirmOverride?.addEventListener("click", () => {
    if (!pendingOverridePayload) {
      return;
    }

    const payload = {
      ...pendingOverridePayload,
      confirmOverride: "true",
    };
    pendingOverridePayload = null;
    submitRsvp(payload);
  });
})();
