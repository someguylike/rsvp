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

  const form = document.querySelector("#admin-form");
  const dateInput = document.querySelector("#play-date");
  const playerInput = document.querySelector("#player-name");
  const participantInput = document.querySelector("#participant-count");
  const submitButton = document.querySelector("#submit-button");
  const status = document.querySelector("#status");
  const tallyCount = document.querySelector("#tally-count");
  const tallyList = document.querySelector("#tally-list");
  let latestTallyRequest = 0;

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatParticipantCount(count) {
    return count === 1 ? "1 participant" : `${count} participants`;
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

  function renderPlayerOptions() {
    playerInput.replaceChildren(
      ...PLAYERS.map((player) => {
        const option = document.createElement("option");
        option.value = player;
        option.textContent = player;
        return option;
      }),
    );
  }

  function renderTally(tally) {
    const players = Array.isArray(tally?.players) ? tally.players : [];
    const totalCount = Number(tally?.totalCount || 0);

    tallyCount.textContent =
      totalCount > 0
        ? formatParticipantCount(totalCount)
        : "No reservations";

    tallyList.replaceChildren(
      ...players.map((player) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        const details = document.createElement("span");
        const removeButton = document.createElement("button");
        const participantCount = Math.max(1, Number(player.participantCount || 1));

        name.className = "tally-name";
        details.className = "tally-participants";
        removeButton.className = "secondary-button inline-button";
        removeButton.type = "button";
        name.textContent = player.name;
        details.textContent = formatParticipantCount(participantCount);
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => {
          removeReservation(player.name);
        });

        item.append(name, details, removeButton);
        return item;
      }),
    );
  }

  async function loadTally(playDate) {
    if (!playDate) {
      tallyCount.textContent = "Choose a date";
      tallyList.replaceChildren();
      return;
    }

    const requestId = latestTallyRequest + 1;
    latestTallyRequest = requestId;
    tallyCount.textContent = "Loading reservations...";

    try {
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
      tallyCount.textContent = "Could not load reservations.";
      tallyList.replaceChildren();
      setStatus(error.message, "error");
    }
  }

  async function submitReservation(payload) {
    submitButton.disabled = true;
    setStatus("Adding player...", "");

    try {
      let result = await requestAppsScript(payload);

      if (result.action === "needs_confirmation") {
        const shouldUpdate = window.confirm(
          "This player already has a reservation for this date. Update it?",
        );
        if (!shouldUpdate) {
          setStatus("Kept the existing reservation.", "");
          return;
        }

        result = await requestAppsScript({
          ...payload,
          confirmOverride: "true",
        });
      }

      renderTally(result.tally);
      setStatus(
        result.action === "updated"
          ? "Updated the reservation."
          : "Added the player.",
        "success",
      );
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function removeReservation(playerName) {
    const playDate = dateInput.value;
    if (!playDate || !playerName) {
      return;
    }

    setStatus("Removing reservation...", "");

    try {
      const result = await requestAppsScript({
        action: "delete",
        playerName,
        playDate,
      });

      renderTally(result.tally);
      setStatus("Removed the reservation.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function initialize() {
    renderPlayerOptions();
    dateInput.value = formatDate(new Date());
    participantInput.value = "1";
    loadTally(dateInput.value);
  }

  dateInput.addEventListener("change", () => {
    loadTally(dateInput.value);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const participantCount = Math.min(
      5,
      Math.max(1, Number.parseInt(participantInput.value, 10)),
    );

    submitReservation({
      playerName: playerInput.value,
      playDate: dateInput.value,
      participantCount,
      vote: "Yes",
      submittedAt: new Date().toISOString(),
    });
  });

  initialize();
})();
