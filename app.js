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
  const playerSelect = document.querySelector("#player-name");
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
  const removeRsvp = document.querySelector("#remove-rsvp");
  const confirmOverride = document.querySelector("#confirm-override");
  let pendingOverridePayload = null;

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

    const day = date.toLocaleDateString(undefined, { weekday: "short" });
    const full = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

    return {
      day: date.getTime() === today.getTime() ? "Today" : `Next ${day}`,
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
    const otherSubtitle = document.createElement("span");

    otherButton.type = "button";
    otherButton.className = "date-option";
    otherButton.dataset.date = "custom";
    otherButton.setAttribute("role", "radio");
    otherButton.setAttribute("aria-checked", "false");
    otherTitle.className = "date-day";
    otherSubtitle.className = "date-full";
    otherTitle.textContent = "Other date";
    otherSubtitle.textContent = "Open calendar";
    otherButton.append(otherTitle, otherSubtitle);
    otherButton.addEventListener("click", () => {
      const fallbackDate = customDateInput?.value || dateInput.value;
      if (fallbackDate) {
        selectPlayDate(fallbackDate, { isCustom: true });
      }
      customDateInput?.focus();
      customDateInput?.showPicker?.();
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
    const placeholder = playerSelect.querySelector("option[value='']");
    playerSelect.replaceChildren(
      placeholder,
      ...PLAYERS.map((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        return option;
      }),
    );
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type || ""}`.trim();
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
    const details = [
      ["Player", rsvp.playerName],
      ["Date", rsvp.playDate],
      ["Vote", rsvp.vote],
      ["Guests", formatGuestLabel(rsvp.guestCount)],
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
    if (!overrideDialog || !previousRsvp || !newRsvp) {
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
    renderRsvpDetails(previousRsvp, existing);
    renderRsvpDetails(newRsvp, payload);
    overrideDialog.showModal();
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
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Submission timed out"));
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

      const url = new URL(APPS_SCRIPT_URL);
      url.searchParams.set("callback", callbackName);
      Object.entries(payload).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });

      script.onerror = () => {
        cleanup();
        reject(new Error("Could not reach Apps Script"));
      };
      script.src = url.toString();
      document.body.append(script);
    });
  }

  async function submitRsvp(payload) {
    submitButton.disabled = true;
    setStatus("Submitting...", "");

    try {
      const result = await requestViaJsonp(payload);

      if (result.action === "needs_confirmation") {
        askOverrideConfirmation(result.existing, payload);
        setStatus("Confirm whether to update the existing RSVP.", "");
        return;
      }

      writeJson(LAST_RSVP_KEY, payload);
      renderTally(result.tally);
      setStatus(
        result.action === "updated"
          ? "Updated your existing RSVP."
          : "RSVP submitted.",
        "success",
      );
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function removeExistingRsvp(payload) {
    submitButton.disabled = true;
    setStatus("Removing RSVP...", "");

    try {
      const result = await requestViaJsonp({
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

    try {
      tallyCount.textContent = "Loading tally...";
      const result = await requestViaJsonp({
        action: "list",
        playDate,
      });
      renderTally(result.tally);
    } catch (error) {
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
    if (lastRsvp?.playerName && PLAYERS.includes(lastRsvp.playerName)) {
      playerSelect.value = lastRsvp.playerName;
    }

    guestInput.value = "0";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = collectPayload();
    if (!payload.playerName || !payload.playDate || Number.isNaN(payload.guestCount)) {
      setStatus("Please fill out the required fields.", "error");
      return;
    }

    payload.guestCount = Math.max(0, payload.guestCount);

    submitRsvp(payload);
  });

  initialize();

  cancelOverride?.addEventListener("click", () => {
    pendingOverridePayload = null;
    setStatus("Kept the previous RSVP.", "");
  });

  removeRsvp?.addEventListener("click", () => {
    if (!pendingOverridePayload) {
      return;
    }

    const payload = pendingOverridePayload;
    pendingOverridePayload = null;
    removeExistingRsvp(payload);
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
