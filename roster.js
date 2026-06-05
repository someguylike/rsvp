(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";

  const form = document.querySelector("#roster-form");
  const nameInput = document.querySelector("#member-name");
  const venmoInput = document.querySelector("#venmo");
  const saveButton = document.querySelector("#save-button");
  const status = document.querySelector("#status");
  const memberCount = document.querySelector("#member-count");
  const memberTable = document.querySelector("#member-table");
  let roster = [];

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
    const callbackName = `rosterFetch_${Date.now()}_${Math.random()
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
      const callbackName = `rosterCallback_${Date.now()}_${Math.random()
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

  function clearForm() {
    form.reset();
    nameInput.focus();
  }

  function fillForm(member) {
    nameInput.value = member.name || "";
    venmoInput.value = member.venmo || "";
    nameInput.focus();
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

  function renderRoster() {
    memberCount.textContent =
      roster.length === 1 ? "1 member" : `${roster.length} members`;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Name", "Venmo", ""].forEach((header) => {
      appendCell(headerRow, "th", header);
    });
    thead.append(headerRow);

    const tbody = document.createElement("tbody");
    roster.forEach((member) => {
      const row = document.createElement("tr");
      const actions = document.createElement("td");
      const editButton = document.createElement("button");
      const removeButton = document.createElement("button");

      appendCell(row, "td", member.name || "");
      appendCell(row, "td", member.venmo || "");

      actions.className = "roster-actions-cell";
      editButton.className = "secondary-button inline-button";
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        fillForm(member);
      });

      removeButton.className = "secondary-button inline-button danger-button";
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        removeMember(member.name);
      });

      actions.append(editButton, removeButton);
      row.append(actions);
      tbody.append(row);
    });

    memberTable.replaceChildren(thead, tbody);
  }

  async function loadRoster() {
    setStatus("Loading roster...", "");
    try {
      const result = await requestAppsScript({
        action: "listRoster",
      });
      roster = Array.isArray(result.roster) ? result.roster : [];
      renderRoster();
      setStatus("Roster loaded.", "success");
    } catch (error) {
      memberCount.textContent = "Could not load roster";
      setStatus(error.message, "error");
    }
  }

  async function saveMember(payload) {
    saveButton.disabled = true;
    setStatus("Saving member...", "");

    try {
      const result = await requestAppsScript({
        action: "saveRosterMember",
        ...payload,
      });
      roster = Array.isArray(result.roster) ? result.roster : [];
      renderRoster();
      clearForm();
      setStatus(
        result.action === "updated" ? "Updated member." : "Added member.",
        "success",
      );
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
  }

  async function removeMember(playerName) {
    if (!window.confirm(`Remove ${playerName} from the roster?`)) {
      return;
    }

    setStatus("Removing member...", "");
    try {
      const result = await requestAppsScript({
        action: "removeRosterMember",
        playerName,
      });
      roster = Array.isArray(result.roster) ? result.roster : [];
      renderRoster();
      clearForm();
      setStatus(
        result.removed ? "Removed member." : "Member was not on the roster.",
        "success",
      );
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      playerName: nameInput.value.trim(),
      venmo: venmoInput.value.trim(),
    };

    if (!payload.playerName) {
      setStatus("Enter a member name.", "error");
      return;
    }

    if (!payload.venmo) {
      setStatus("Enter a Venmo handle.", "error");
      return;
    }

    saveMember(payload);
  });

  loadRoster();
})();
