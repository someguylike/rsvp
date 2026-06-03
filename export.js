(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";

  const form = document.querySelector("#export-form");
  const monthField = document.querySelector("#month-field");
  const monthInput = document.querySelector("#export-month");
  const exportButton = document.querySelector("#export-button");
  const status = document.querySelector("#status");
  const shareStatus = document.querySelector("#share-status");
  const previewSection = document.querySelector("#preview-section");
  const previewNote = document.querySelector("#preview-note");
  const previewTable = document.querySelector("#preview-table");

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
    previewTable.textContent = "";
    previewNote.textContent = "";
    previewSection.hidden = true;
    shareStatus.hidden = true;
    shareStatus.textContent = "";
  }

  function renderPreview(rows, sheetName) {
    previewTable.textContent = "";

    if (!Array.isArray(rows) || rows.length === 0) {
      previewSection.hidden = true;
      return;
    }

    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      const firstCell = String(row[0] || "").trim().toLowerCase();

      if (firstCell.includes("pay") || firstCell.includes("fee")) {
        tr.className = "summary-row";
      }

      row.forEach((cell) => {
        const element = document.createElement(rowIndex === 0 ? "th" : "td");
        element.textContent = cell == null ? "" : String(cell);
        tr.append(element);
      });

      if (rowIndex === 0) {
        thead.append(tr);
      } else {
        tbody.append(tr);
      }
    });

    previewTable.append(thead, tbody);
    previewNote.textContent = `Rendered from the ${sheetName} spreadsheet tab.`;
    previewSection.hidden = false;
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

    throw new Error(parsed?.error || "Export failed");
  }

  async function loadMonth(month, mode) {
    exportButton.disabled = true;
    clearPreview();
    setStatus(mode === "export" ? "Exporting..." : "Loading export...", "");

    try {
      const result = await requestAppsScript({
        action: mode === "export" ? "exportMonth" : "viewMonth",
        month,
      });
      setStatusWithLink(
        `${mode === "export" ? "Exported" : "Loaded"} ${result.exportedDates} dates from ${result.sheetName}.`,
        result.url,
      );
      renderPreview(result.previewRows, result.sheetName);
      setShareLink(month);

      const url = new URL(window.location.href);
      url.searchParams.set("month", month);
      window.history.replaceState({}, "", url);
    } catch (error) {
      clearPreview();
      setStatus(error.message, "error");
    } finally {
      exportButton.disabled = false;
    }
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!monthInput.value) {
      setStatus("Choose a month to export.", "error");
      return;
    }

    loadMonth(monthInput.value, "export");
  });

  const monthFromUrl = new URLSearchParams(window.location.search).get("month");
  const hasValidMonthFromUrl = isMonthValue(monthFromUrl);
  monthInput.value = hasValidMonthFromUrl ? monthFromUrl : formatMonth(new Date());

  if (hasValidMonthFromUrl) {
    loadMonth(monthInput.value, "view");
  }
})();
