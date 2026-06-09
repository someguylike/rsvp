(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";

  const form = document.querySelector("#export-form");
  const adminAuth = window.RsvpAdminAuth;
  const monthField = document.querySelector("#month-field");
  const monthInput = document.querySelector("#export-month");
  const exportButton = document.querySelector("#export-button");
  const status = document.querySelector("#status");
  const reportProgress = document.querySelector("#report-progress");
  const reportProgressBar = document.querySelector("#report-progress-bar");
  const reportProgressText = document.querySelector("#report-progress-text");
  const shareStatus = document.querySelector("#share-status");
  const heatmapSection = document.querySelector("#heatmap-section");
  const heatmapNote = document.querySelector("#heatmap-note");
  const groupHeatmap = document.querySelector("#group-heatmap");
  const filterSection = document.querySelector("#filter-section");
  const playerFilter = document.querySelector("#player-filter");
  const individualSection = document.querySelector("#individual-section");
  const individualNote = document.querySelector("#individual-note");
  const individualTable = document.querySelector("#individual-table");
  const auditSection = document.querySelector("#audit-section");
  const auditNote = document.querySelector("#audit-note");
  const auditTable = document.querySelector("#audit-table");
  let currentRosterRows = [];
  let selectedDate = "";
  let adminToken = "";
  let latestReportStatus = null;
  let progressTimer = 0;
  let progressPercent = 0;
  let autoLoadTimer = 0;
  let latestLoadRequest = 0;

  function formatMonth(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function isMonthValue(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type || ""}`.trim();
  }

  function setProgress(percent, message) {
    if (!reportProgress || !reportProgressBar || !reportProgressText) {
      return;
    }
    progressPercent = Math.max(progressPercent, Math.min(percent, 100));
    reportProgress.hidden = false;
    reportProgressBar.style.width = `${progressPercent}%`;
    reportProgressText.textContent = message;
  }

  function clearProgress() {
    window.clearInterval(progressTimer);
    progressTimer = 0;
    progressPercent = 0;
    if (reportProgress && reportProgressBar) {
      reportProgress.hidden = true;
      reportProgressBar.style.width = "0%";
    }
  }

  function startProgress(mode) {
    const isExport = mode === "export";
    const steps = isExport
      ? [
          [12, "Reading RSVP records..."],
          [32, "Calculating monthly totals..."],
          [55, "Writing spreadsheet tab..."],
          [76, "Preparing report preview..."],
          [90, "Finishing report..."],
        ]
      : [
          [18, "Opening saved monthly report..."],
          [44, "Loading report rows..."],
          [68, "Preparing preview tables..."],
          [88, "Finishing report..."],
        ];
    let index = 0;

    clearProgress();
    setProgress(6, isExport ? "Starting report generation..." : "Starting report load...");
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
    window.setTimeout(clearProgress, 900);
  }

  function setStatusWithLink(message, href, linkText) {
    const link = document.createElement("a");
    status.textContent = `${message} `;
    status.className = "status success";
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = linkText || "Open spreadsheet";
    status.append(link);
  }

  function setReportStatus(message, href) {
    latestReportStatus = { message, href };
    if (adminToken && href) {
      setStatusWithLink(message, href);
      return;
    }

    status.textContent = `${message} Log in as admin to open the spreadsheet.`;
    status.className = "status success";
  }

  function setShareLink(month) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("month", month);

    const link = document.createElement("a");
    link.href = url.toString();
    link.textContent = url.toString();
    shareStatus.textContent = "Share this month: ";
    shareStatus.className = "status success";
    shareStatus.hidden = false;
    shareStatus.append(link);
  }

  function clearPreview() {
    latestReportStatus = null;
    groupHeatmap.textContent = "";
    individualTable.textContent = "";
    auditTable.textContent = "";
    heatmapNote.textContent = "";
    individualNote.textContent = "";
    auditNote.textContent = "";
    heatmapSection.hidden = true;
    filterSection.hidden = true;
    individualSection.hidden = true;
    auditSection.hidden = true;
    shareStatus.hidden = true;
    shareStatus.textContent = "";
  }

  function parsePositiveInt(value) {
    const parsed = Number.parseInt(String(value || "").trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function parseRosterRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { dates: [], players: [] };
    }

    const dates = rows[0].slice(1).map((date) => String(date || "").trim());
    const players = rows.slice(1).map((row) => ({
      name: String(row[0] || "").trim(),
      values: dates.map((_, index) => parsePositiveInt(row[index + 1])),
    }));

    return {
      dates,
      players: players.filter((player) => player.name),
    };
  }

  function getHeatClass(value, maxValue) {
    if (!value || !maxValue) {
      return "heat-0";
    }

    const bucket = Math.max(1, Math.ceil((value / maxValue) * 5));
    return `heat-${Math.min(bucket, 5)}`;
  }

  function appendCell(row, tagName, text, className) {
    const cell = document.createElement(tagName);
    cell.textContent = text;
    if (className) {
      cell.className = className;
    }
    row.append(cell);
    return cell;
  }

  function getDateTotals(model) {
    return model.dates.map((date, dateIndex) => ({
      date,
      total: model.players.reduce(
        (sum, player) => sum + Number(player.values[dateIndex] || 0),
        0,
      ),
    }));
  }

  function getActivePlayers(model) {
    return model.players.filter((player) =>
      player.values.some((value) => value > 0),
    );
  }

  function getFilteredModel(model) {
    const selectedPlayer = playerFilter.value;
    const dateIndexes = selectedDate
      ? model.dates
          .map((date, index) => (date === selectedDate ? index : -1))
          .filter((index) => index !== -1)
      : model.dates.map((_, index) => index);
    const dates = dateIndexes.map((index) => model.dates[index]);
    const players = selectedPlayer
      ? model.players.filter((player) => player.name === selectedPlayer)
      : model.players;
    return {
      dates,
      players: players.map((player) => ({
        name: player.name,
        values: dateIndexes.map((index) => player.values[index]),
      })),
    };
  }

  function renderPlayerFilter(model) {
    const activePlayers = getActivePlayers(model);
    const previousValue = playerFilter.value;

    playerFilter.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All players";
    playerFilter.append(allOption);

    activePlayers.forEach((player) => {
      const option = document.createElement("option");
      option.value = player.name;
      option.textContent = player.name;
      playerFilter.append(option);
    });

    if (activePlayers.some((player) => player.name === previousValue)) {
      playerFilter.value = previousValue;
    }

    filterSection.hidden = activePlayers.length === 0;
  }

  function getAuditGroups(model) {
    return model.dates
      .map((date, dateIndex) => {
        const players = model.players
          .map((player) => ({
            name: player.name,
            participants: Number(player.values[dateIndex] || 0),
          }))
          .filter((player) => player.participants > 0);

        return {
          date,
          total: players.reduce(
            (sum, player) => sum + player.participants,
            0,
          ),
          players,
        };
      })
      .filter((group) => group.players.length > 0);
  }

  function renderGroupHeatmap(model) {
    const totals = getDateTotals(model).filter((item) => item.total > 0);
    const maxTotal = totals.reduce(
      (maxValue, item) => Math.max(maxValue, item.total),
      0,
    );

    groupHeatmap.textContent = "";

    if (totals.length === 0) {
      heatmapSection.hidden = true;
      return;
    }

    totals.forEach((item) => {
      const tile = document.createElement("button");
      const date = document.createElement("span");
      const total = document.createElement("strong");
      const isSelected = selectedDate === item.date;
      tile.type = "button";
      tile.className = `heatmap-tile ${getHeatClass(item.total, maxTotal)}`;
      tile.setAttribute("aria-pressed", String(isSelected));
      date.textContent = item.date;
      total.textContent = `${item.total}`;
      tile.append(date, total);
      tile.addEventListener("click", () => {
        selectedDate = isSelected ? "" : item.date;
        renderAnalytics(currentRosterRows);
      });
      groupHeatmap.append(tile);
    });

    heatmapNote.textContent = selectedDate
      ? `${selectedDate} selected. Click again to clear.`
      : `${totals.length} dates, peak turnout ${maxTotal}.`;
    heatmapSection.hidden = false;
  }

  function renderIndividualHeatmap(model) {
    const activePlayers = getActivePlayers(model);
    const maxValue = activePlayers.reduce(
      (maxPlayer, player) =>
        Math.max(maxPlayer, ...player.values.map((value) => Number(value || 0))),
      0,
    );

    individualTable.textContent = "";

    if (activePlayers.length === 0 || model.dates.length === 0) {
      individualSection.hidden = true;
      return;
    }

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    appendCell(headerRow, "th", "Name");
    model.dates.forEach((date) => appendCell(headerRow, "th", date));
    thead.append(headerRow);

    const tbody = document.createElement("tbody");
    activePlayers.forEach((player) => {
      const row = document.createElement("tr");
      appendCell(row, "td", player.name).dataset.label = "Name";
      player.values.forEach((value, index) => {
        const cell = appendCell(
          row,
          "td",
          value ? String(value) : "",
          getHeatClass(value, maxValue),
        );
        cell.dataset.label = model.dates[index];
      });
      tbody.append(row);
    });

    individualTable.append(thead, tbody);
    individualNote.textContent = selectedDate
      ? `${activePlayers.length} players on ${selectedDate}.`
      : `${activePlayers.length} players with at least one RSVP.`;
    individualSection.hidden = false;
  }

  function renderAuditTable(model) {
    const groups = getAuditGroups(model);
    const maxTotal = groups.reduce(
      (maxValue, group) => Math.max(maxValue, group.total),
      0,
    );
    const maxParticipantCount = groups.reduce(
      (maxValue, group) =>
        Math.max(
          maxValue,
          ...group.players.map((player) => player.participants),
        ),
      0,
    );
    auditTable.textContent = "";

    if (groups.length === 0) {
      auditSection.hidden = true;
      return;
    }

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Date", "Players", "Total"].forEach((header) => {
      appendCell(headerRow, "th", header);
    });
    thead.append(headerRow);

    const tbody = document.createElement("tbody");
    groups.forEach((group) => {
      const row = document.createElement("tr");
      const playersCell = document.createElement("td");
      const playerList = document.createElement("ul");

      appendCell(row, "td", group.date, getHeatClass(group.total, maxTotal))
        .dataset.label = "Date";
      playerList.className = "date-audit-list";
      group.players.forEach((player) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        const participants = document.createElement("strong");
        name.textContent = player.name;
        participants.className = getHeatClass(
          player.participants,
          maxParticipantCount,
        );
        participants.textContent = String(player.participants);
        item.append(name, participants);
        playerList.append(item);
      });
      playersCell.dataset.label = "Players";
      playersCell.append(playerList);
      row.append(playersCell);
      appendCell(row, "td", String(group.total), getHeatClass(group.total, maxTotal))
        .dataset.label = "Total";
      tbody.append(row);
    });

    auditTable.append(thead, tbody);
    auditNote.textContent = [
      playerFilter.value ? playerFilter.value : "All players",
      selectedDate || "all dates",
      `${groups.length} date${groups.length === 1 ? "" : "s"}`,
    ].join(" · ");
    auditSection.hidden = false;
  }

  function renderAnalytics(rows) {
    currentRosterRows = rows;
    const model = parseRosterRows(rows);
    renderPlayerFilter(model);
    const filteredModel = getFilteredModel(model);

    renderGroupHeatmap(model);
    renderIndividualHeatmap(filteredModel);
    renderAuditTable(filteredModel);
  }

  function renderPreview(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      renderAnalytics([]);
      return;
    }

    renderAnalytics(rows);
  }

  function buildUrl(payload, callbackName) {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("callback", callbackName);
    Object.entries(payload).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
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

  async function requestAppsScript(payload) {
    const callbackName = `adminCallback_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const response = await fetch(buildUrl(payload, callbackName), {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const parsed = parseJsonp(await response.text(), callbackName);

    if (response.ok && parsed.ok) {
      return parsed;
    }

    throw new Error(parsed?.error || "Report failed");
  }

  async function loadMonth(month, mode) {
    const requestId = latestLoadRequest + 1;
    latestLoadRequest = requestId;
    exportButton.disabled = true;
    clearPreview();
    selectedDate = "";
    startProgress(mode);
    setStatus(
      mode === "export" ? "Generating report..." : "Loading report...",
      "loading",
    );

    try {
      const result = await requestAppsScript({
        action: mode === "export" ? "exportMonth" : "viewMonth",
        month,
        adminToken,
      });
      if (requestId !== latestLoadRequest) {
        return;
      }
      setReportStatus(
        `${mode === "export" ? "Generated" : "Loaded"} ${result.exportedDates} dates from ${result.sheetName}.`,
        result.url,
      );
      finishProgress(
        `${mode === "export" ? "Generated" : "Loaded"} ${result.exportedDates} dates.`,
      );
      renderPreview(result.previewRows);
      setShareLink(month);

      const url = new URL(window.location.href);
      url.searchParams.set("month", month);
      window.history.replaceState({}, "", url);
    } catch (error) {
      if (requestId !== latestLoadRequest) {
        return;
      }
      clearPreview();
      clearProgress();
      setStatus(error.message, "error");
    } finally {
      exportButton.disabled = false;
    }
  }

  function scheduleReportLoad(mode) {
    window.clearTimeout(autoLoadTimer);
    autoLoadTimer = window.setTimeout(() => {
      if (!monthInput.value) {
        setStatus("Choose a month for the report.", "error");
        return;
      }
      loadMonth(monthInput.value, mode || "export");
    }, 180);
  }

  function openMonthPicker() {
    monthInput.focus();
    try {
      monthInput.showPicker?.();
    } catch {
      // Focusing the input is the best fallback when a browser blocks showPicker.
    }
  }

  monthField.addEventListener("click", (event) => {
    if (event.target === monthInput) {
      return;
    }

    event.preventDefault();
    openMonthPicker();
  });

  monthInput.addEventListener("click", () => {
    openMonthPicker();
  });

  monthInput.addEventListener("change", () => {
    scheduleReportLoad("export");
  });

  playerFilter.addEventListener("change", () => {
    renderAnalytics(currentRosterRows);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!monthInput.value) {
      setStatus("Choose a month for the report.", "error");
      return;
    }

    scheduleReportLoad("export");
  });

  const monthFromUrl = new URLSearchParams(window.location.search).get("month");
  const hasValidMonthFromUrl = isMonthValue(monthFromUrl);
  monthInput.value = hasValidMonthFromUrl ? monthFromUrl : formatMonth(new Date());

  adminAuth.onChange((state) => {
    const wasLoggedOut = !adminToken;
    adminToken = state.token || "";
    if (
      wasLoggedOut &&
      adminToken &&
      latestReportStatus &&
      !latestReportStatus.href &&
      isMonthValue(monthInput.value)
    ) {
      scheduleReportLoad("export");
      return;
    }
    if (latestReportStatus) {
      setReportStatus(latestReportStatus.message, latestReportStatus.href);
    }
  });

  adminAuth.ready.then(() => {
    scheduleReportLoad("export");
  });
})();
