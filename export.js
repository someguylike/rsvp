(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";

  const form = document.querySelector("#export-form");
  const monthInput = document.querySelector("#export-month");
  const exportButton = document.querySelector("#export-button");
  const status = document.querySelector("#status");
  const previewSection = document.querySelector("#preview-section");
  const previewNote = document.querySelector("#preview-note");
  const previewTable = document.querySelector("#preview-table");

  function formatMonth(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type || ""}`.trim();
  }

  function setStatusWithLink(message, href) {
    const link = document.createElement("a");
    status.textContent = `${message} `;
    status.className = "status success";
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open spreadsheet";
    status.append(link);
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
    previewNote.textContent = `Rendered from the ${sheetName} spreadsheet tab, including formula results such as Member Pay.`;
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!monthInput.value) {
      setStatus("Choose a month to export.", "error");
      return;
    }

    exportButton.disabled = true;
    setStatus("Exporting...", "");

    try {
      const result = await requestAppsScript({
        action: "exportMonth",
        month: monthInput.value,
      });
      setStatusWithLink(
        `Exported ${result.exportedDates} dates to ${result.sheetName}.`,
        result.url,
      );
      renderPreview(result.previewRows, result.sheetName);
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      exportButton.disabled = false;
    }
  });

  monthInput.value = formatMonth(new Date());
})();
