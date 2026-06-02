(function () {
  const APPS_SCRIPT_URL = "";
  const DEFAULT_PLAYERS = [];
  const PLAYER_STORAGE_KEY = "play-rsvp.playerNames";
  const LAST_RSVP_KEY = "play-rsvp.lastRsvp";
  const PLAY_DAYS = [2, 4, 5, 0];

  const form = document.querySelector("#rsvp-form");
  const playerInput = document.querySelector("#player-name");
  const playerList = document.querySelector("#player-list");
  const dateInput = document.querySelector("#play-date");
  const guestInput = document.querySelector("#guest-count");
  const status = document.querySelector("#status");
  const submitButton = document.querySelector("#submit-button");

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let offset = 0; offset <= 7; offset += 1) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + offset);
      if (PLAY_DAYS.includes(candidate.getDay())) {
        return candidate;
      }
    }

    return today;
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

  function submitViaJsonp(payload) {
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

  function initialize() {
    renderPlayerOptions();

    const lastRsvp = readJson(LAST_RSVP_KEY, null);
    if (lastRsvp?.playerName) {
      playerInput.value = lastRsvp.playerName;
    }

    dateInput.value = formatDate(getNextPlayDate());
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
      const result = await submitViaJsonp(payload);
      rememberPlayerName(payload.playerName);
      writeJson(LAST_RSVP_KEY, payload);
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
