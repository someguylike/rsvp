(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";
  const DEFAULT_PLAYERS = [];
  const PLAYER_STORAGE_KEY = "play-rsvp.playerNames";
  const LAST_RSVP_KEY = "play-rsvp.lastRsvp";
  const PLAY_DAYS = [2, 4, 5, 0];

  const form = document.querySelector("#rsvp-form");
  const playerInput = document.querySelector("#player-name");
  const playerList = document.querySelector("#player-list");
  const dateInput = document.querySelector("#play-date");
  const dateOptions = document.querySelector("#date-options");
  const guestInput = document.querySelector("#guest-count");
  const status = document.querySelector("#status");
  const submitButton = document.querySelector("#submit-button");
  const tallyCount = document.querySelector("#tally-count");
  const tallyList = document.querySelector("#tally-list");

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
      day: date.getTime() === today.getTime() ? "Today" : day,
      full,
    };
  }

  function selectPlayDate(value) {
    dateInput.value = value;
    dateOptions.querySelectorAll(".date-option").forEach((button) => {
      const isActive = button.dataset.date === value;
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

    selectPlayDate(formatDate(getNextPlayDate()));
  }

  function renderPlayerOptions() {
    const rememberedNames = readJson(PLAYER_STORAGE_KEY, []);
    const names = [...DEFAULT_PLAYERS, ...rememberedNames].filter(
      (name, index, list) =>
        list.findIndex(
          (item) => item.toLocaleLowerCase() === name.toLocaleLowerCase(),
        ) === index,
    );
    playerList.replaceChildren(
      ...names.map((name) => {
        const option = document.createElement("option");
        option.value = name;
        return option;
      }),
    );
  }

  function rememberPlayerName(name) {
    const cleanName = name.trim();
    if (!cleanName) {
      return;
    }

    const existing = readJson(PLAYER_STORAGE_KEY, []);
    const withoutDuplicate = existing.filter(
      (item) => item.toLocaleLowerCase() !== cleanName.toLocaleLowerCase(),
    );
    writeJson(PLAYER_STORAGE_KEY, [cleanName, ...withoutDuplicate].slice(0, 20));
    renderPlayerOptions();
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
      }, 12000);

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

  async function loadTally(playDate) {
    if (!playDate || !APPS_SCRIPT_URL) {
      return;
    }

    try {
      const result = await requestViaJsonp({
        action: "list",
        playDate,
      });
      renderTally(result.tally);
    } catch {
      tallyCount.textContent = "Tally unavailable";
      tallyList.replaceChildren();
    }
  }

  function initialize() {
    renderPlayerOptions();
    renderDateOptions();

    const lastRsvp = readJson(LAST_RSVP_KEY, null);
    if (lastRsvp?.playerName) {
      playerInput.value = lastRsvp.playerName;
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

    submitButton.disabled = true;
    setStatus("Submitting...", "");

    try {
      const result = await requestViaJsonp(payload);
      rememberPlayerName(payload.playerName);
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
  });

  initialize();
})();
