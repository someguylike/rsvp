(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";
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
  const LAST_RSVP_KEY = "play-rsvp.lastRsvp";
  const LAST_PLAYER_KEY = "play-rsvp.lastPlayerName";
  const BROWSER_ID_KEY = "play-rsvp.browserId";
  const DISPLAY_LOCALE = "en-US";
  const PLAY_DAYS = [2, 4, 5, 0];

  const form = document.querySelector("#rsvp-form");
  const playerInput = document.querySelector("#player-name");
  const playerList = document.querySelector("#player-list");
  const playerMemory = document.querySelector("#player-memory");
  const dateInput = document.querySelector("#play-date");
  const dateOptions = document.querySelector("#date-options");
  const customDateField = document.querySelector("#custom-date-field");
  const customDateInput = document.querySelector("#custom-play-date");
  const participantInput = document.querySelector("#participant-count");
  const status = document.querySelector("#status");
  const submitButton = document.querySelector("#submit-button");
  const removeRsvpButton = document.querySelector("#remove-rsvp-button");
  const tallyCount = document.querySelector("#tally-count");
  const tallyList = document.querySelector("#tally-list");
  const overrideDialog = document.querySelector("#override-dialog");
  const previousRsvp = document.querySelector("#previous-rsvp");
  const newRsvp = document.querySelector("#new-rsvp");
  const cancelOverride = document.querySelector("#cancel-override");
  const confirmOverride = document.querySelector("#confirm-override");
  let pendingOverridePayload = null;
  let latestTallyRequest = 0;
  let rememberedPlayerName = "";
  let selectedPlayerName = "";
  let lastSubmittedPayload = null;

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

  function readString(key) {
    return localStorage.getItem(key) || "";
  }

  function writeString(key, value) {
    localStorage.setItem(key, value);
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getTodayValue() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return formatDate(today);
  }

  function isPastDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && value < getTodayValue();
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
    const endOfThisWeek = new Date(today);
    const daysUntilSunday = (7 - today.getDay()) % 7;
    endOfThisWeek.setDate(today.getDate() + daysUntilSunday);

    const day = date.toLocaleDateString(DISPLAY_LOCALE, { weekday: "long" });
    const full = date.toLocaleDateString(DISPLAY_LOCALE, {
      month: "short",
      day: "numeric",
    });
    const prefix = date <= endOfThisWeek ? "This" : "Next";

    return {
      day:
        date.getTime() === today.getTime()
          ? "Today @ 6AM"
          : `${prefix} ${day} @ 6AM`,
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
    if (customDateInput) {
      customDateInput.min = getTodayValue();
    }
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
        if (isPastDate(customDateInput.value)) {
          customDateInput.value = "";
          dateInput.value = "";
          setStatus("Choose today or a future date.", "error");
          return;
        }
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
      return prioritizeRememberedPlayer(PLAYERS);
    }

    return prioritizeRememberedPlayer(
      PLAYERS.filter((name) =>
        normalizeSearchText(name).includes(normalizedQuery),
      ),
    ).slice(0, 8);
  }

  function prioritizeRememberedPlayer(names) {
    if (!rememberedPlayerName) return names;
    const remembered = names.find((name) => name === rememberedPlayerName);
    if (!remembered) return names;
    return [remembered, ...names.filter((name) => name !== remembered)];
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function hidePlayerList() {
    playerList.hidden = true;
    playerList.style.display = "none";
  }

  function updatePlayerMemory() {
    if (!playerMemory) return;
    const currentName = playerInput.value.trim();
    const selectedValidName =
      selectedPlayerName && currentName === selectedPlayerName && isValidPlayerName(currentName);
    const changedFromRemembered =
      selectedValidName && rememberedPlayerName && currentName !== rememberedPlayerName;

    playerMemory.classList.toggle("warning", Boolean(changedFromRemembered));

    if (!currentName && rememberedPlayerName) {
      playerMemory.hidden = false;
      playerMemory.innerHTML = `Last used: <strong>${escapeHtml(rememberedPlayerName)}</strong>`;
    } else if (changedFromRemembered) {
      playerMemory.hidden = false;
      playerMemory.innerHTML = `Warning: submitting as <strong>${escapeHtml(currentName)}</strong>, not your last used name ${escapeHtml(rememberedPlayerName)}.`;
    } else if (selectedValidName) {
      playerMemory.hidden = false;
      playerMemory.innerHTML = `Submitting as <strong>${escapeHtml(currentName)}</strong>.`;
    } else if (currentName) {
      playerMemory.hidden = false;
      playerMemory.textContent = "Choose the matching name from the list before submitting.";
    } else {
      playerMemory.hidden = true;
      playerMemory.textContent = "";
    }

    submitButton.replaceChildren();
    if (selectedValidName) {
      submitButton.append(
        document.createTextNode("Submit RSVP for "),
        createSubmitName(currentName),
      );
    } else {
      submitButton.textContent = "Submit RSVP";
    }
  }

  function createSubmitName(name) {
    const nameElement = document.createElement("span");
    nameElement.className = "submit-player-name";
    nameElement.textContent = name;
    return nameElement;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function rememberPlayerName(name) {
    if (!isValidPlayerName(name)) return;
    rememberedPlayerName = name;
    writeString(LAST_PLAYER_KEY, name);
  }

  function selectPlayerName(name, options) {
    playerInput.value = name;
    selectedPlayerName = name;
    updatePlayerMemory();
    hidePlayerList();
    if (!options?.keepFocus) {
      playerInput.blur();
    }
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

  function setRemoveRsvpAction(payload) {
    lastSubmittedPayload = payload;
    if (!removeRsvpButton) return;
    if (!payload || Number(payload.participantCount) <= 0) {
      removeRsvpButton.hidden = true;
      removeRsvpButton.textContent = "Remove this RSVP";
      return;
    }
    removeRsvpButton.hidden = false;
    removeRsvpButton.textContent = `Remove RSVP for ${payload.playerName}`;
  }

  function collectPayload() {
    const formData = new FormData(form);
    return {
      playerName: String(formData.get("playerName") || "").trim(),
      playDate: String(formData.get("playDate") || ""),
      participantCount: Number.parseInt(
        String(formData.get("participantCount") || "1"),
        10,
      ),
      submittedAt: new Date().toISOString(),
      browserId: getBrowserId(),
      browserSignature: getBrowserSignature(),
      clientDeviceClass: getClientDeviceClass(),
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      clientLanguage: navigator.language || "",
      clientScreen: getClientScreen(),
    };
  }

  function getBrowserId() {
    let browserId = readString(BROWSER_ID_KEY);
    if (!browserId) {
      browserId =
        window.crypto?.randomUUID?.() ||
        `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      writeString(BROWSER_ID_KEY, browserId);
    }
    return browserId;
  }

  function getBrowserSignature() {
    return [
      navigator.userAgent || "",
      navigator.platform || "",
      navigator.vendor || "",
      navigator.language || "",
      getClientDeviceClass(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      getClientScreen(),
    ].join(" | ");
  }

  function getClientDeviceClass() {
    const userAgent = navigator.userAgent || "";
    const hasCoarsePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const narrowViewport = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 820;
    if (/Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(userAgent) || (hasCoarsePointer && narrowViewport)) {
      return "mobile";
    }
    return "desktop";
  }

  function getClientScreen() {
    return `${window.screen?.width || 0}x${window.screen?.height || 0}@${window.devicePixelRatio || 1}`;
  }

  function focusPlayerInput() {
    if (document.activeElement === playerInput) return;
    playerInput.focus({ preventScroll: true });
    playerInput.select?.();
  }

  function formatParticipantCount(count) {
    return count === 1 ? "1 participant" : `${count} participants`;
  }

  function renderRsvpDetails(container, rsvp) {
    const detailsSource = rsvp || {};
    const participantCount = Math.max(
      0,
      Number(detailsSource.participantCount || 0),
    );
    const details = [
      ["Player", detailsSource.playerName],
      ["Date", detailsSource.playDate],
      [
        "Reserved spots",
        participantCount > 0 ? formatParticipantCount(participantCount) : "0",
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
      participantCount: 0,
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
      rememberPlayerName(payload.playerName);
      selectedPlayerName = payload.playerName;
      updatePlayerMemory();
      renderTally(result.tally);
      if (result.action === "deleted") {
        setRemoveRsvpAction(null);
        setStatus("Removed your RSVP.", "success");
      } else if (result.action === "not_found") {
        setRemoveRsvpAction(null);
        setStatus("No RSVP was on file for that date.", "");
      } else {
        setRemoveRsvpAction(payload);
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
    if (removeRsvpButton) {
      removeRsvpButton.disabled = true;
    }
    setStatus("Removing RSVP...", "");

    try {
      const result = await requestAppsScript({
        action: "delete",
        playerName: payload.playerName,
        playDate: payload.playDate,
        browserId: getBrowserId(),
        browserSignature: getBrowserSignature(),
        clientDeviceClass: getClientDeviceClass(),
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        clientLanguage: navigator.language || "",
        clientScreen: getClientScreen(),
        submittedAt: new Date().toISOString(),
      });

      renderTally(result.tally);
      setRemoveRsvpAction(null);
      setStatus("Removed the existing RSVP.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
      if (removeRsvpButton) {
        removeRsvpButton.disabled = false;
      }
    }
  }

  function renderTally(tally) {
    const players = Array.isArray(tally?.players) ? tally.players : [];
    const totalCount = Number(tally?.totalCount || 0);

    tallyCount.textContent =
      totalCount > 0
        ? formatParticipantCount(totalCount)
        : "No reservations yet";

    tallyList.replaceChildren(
      ...players.map((player) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        const participants = document.createElement("span");
        const participantCount = Math.max(1, Number(player.participantCount || 1));

        name.className = "tally-name";
        participants.className = "tally-participants";
        name.textContent = player.name;
        participants.textContent = formatParticipantCount(participantCount);

        item.append(name, participants);
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

      tallyCount.textContent = "Could not load reservations. Try refreshing.";
      tallyList.replaceChildren();
    }
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

  async function initialize() {
    focusPlayerInput();
    await loadRoster();
    const lastRsvp = readJson(LAST_RSVP_KEY, null);
    const lastPlayerName = readString(LAST_PLAYER_KEY) || lastRsvp?.playerName || "";
    if (lastPlayerName && isValidPlayerName(lastPlayerName)) {
      rememberedPlayerName = lastPlayerName;
      selectPlayerName(lastPlayerName, { remember: false, keepFocus: true });
    }
    renderPlayerOptions();
    renderDateOptions();

    participantInput.value = "1";
    focusPlayerInput();
    window.setTimeout(focusPlayerInput, 150);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = collectPayload();
    if (
      !payload.playerName ||
      !payload.playDate ||
      Number.isNaN(payload.participantCount)
    ) {
      setStatus("Please fill out the required fields.", "error");
      return;
    }

    if (!isValidPlayerName(payload.playerName)) {
      setStatus("Please choose a player from the list.", "error");
      return;
    }

    if (payload.playerName !== selectedPlayerName) {
      setStatus("Please choose your name from the list before submitting.", "error");
      renderPlayerMatches(payload.playerName);
      return;
    }

    if (isPastDate(payload.playDate)) {
      setStatus("Choose today or a future date.", "error");
      return;
    }

    payload.participantCount = Math.min(5, Math.max(0, payload.participantCount));
    payload.vote = payload.participantCount > 0 ? "Yes" : "No";

    submitRsvp(payload);
  });

  playerInput.addEventListener("focus", () => {
    renderPlayerMatches(playerInput.value);
  });

  playerInput.addEventListener("input", () => {
    if (playerInput.value.trim() !== selectedPlayerName) {
      selectedPlayerName = "";
    }
    updatePlayerMemory();
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

  removeRsvpButton?.addEventListener("click", () => {
    if (!lastSubmittedPayload) {
      return;
    }
    removeExistingRsvp(lastSubmittedPayload);
  });
})();
