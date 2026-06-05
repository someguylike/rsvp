(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";

  const form = document.querySelector("#roster-form");
  const nameInput = document.querySelector("#member-name");
  const memberNameList = document.querySelector("#member-name-list");
  const venmoInput = document.querySelector("#venmo");
  const messengerInput = document.querySelector("#messenger");
  const cellphoneInput = document.querySelector("#cellphone");
  const memberSearch = document.querySelector("#member-search");
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
    messengerInput.value = member.messenger || "";
    cellphoneInput.value = member.cellphone || "";
    nameInput.focus();
  }

  function findRosterMemberByName(name) {
    const normalizedName = normalizeSearchText(name);
    return roster.find(
      (member) => normalizeSearchText(member.name) === normalizedName,
    );
  }

  function renderMemberNameOptions() {
    memberNameList.replaceChildren(
      ...roster.map((member) => {
        const option = document.createElement("option");
        option.value = member.name || "";
        return option;
      }),
    );
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

  function getVenmoUrl(value) {
    const handle = normalizeVenmoHandle(value);
    if (!handle) {
      return "";
    }
    return `https://account.venmo.com/u/${handle}`;
  }

  function getMessengerUrl(value) {
    const contact = normalizeMessengerContact(value);
    if (!contact) {
      return "";
    }
    return contact.url;
  }

  function appendLinkCell(row, text, href, warningMessage) {
    const cell = document.createElement("td");
    if (text && href) {
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = text;
      cell.append(link);
    } else {
      cell.textContent = text || "";
    }

    if (warningMessage) {
      const warning = document.createElement("span");
      warning.className = "contact-warning";
      warning.textContent = "!";
      warning.title = warningMessage;
      warning.setAttribute("aria-label", warningMessage);
      cell.append(warning);
    }

    row.append(cell);
    return cell;
  }

  function normalizeVenmoHandle(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    const match = text.match(/^(?:https?:\/\/)?(?:(?:www|account)\.)?venmo\.com\/(?:u\/)?([A-Za-z0-9_.-]+)\/?$/i);
    const handle = match ? match[1] : text.replace(/^@/, "");
    return /^[A-Za-z0-9_.-]{2,30}$/.test(handle) ? handle : "";
  }

  function normalizeMessengerContact(value) {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }

    const messengerMatch = text.match(
      /^(?:https?:\/\/)?m\.me\/([A-Za-z0-9._-]{3,80})\/?(?:[?#].*)?$/i,
    );
    if (messengerMatch) {
      return {
        value: `@${messengerMatch[1]}`,
        url: `https://www.facebook.com/${messengerMatch[1]}`,
      };
    }

    const profileIdMatch = text.match(
      /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/profile\.php\?id=([0-9]+)(?:[&#].*)?$/i,
    );
    if (profileIdMatch) {
      const url = `https://www.facebook.com/profile.php?id=${profileIdMatch[1]}`;
      return { value: url, url };
    }

    const facebookMatch = text.match(
      /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/([A-Za-z0-9._-]{3,80})\/?(?:[?#].*)?$/i,
    );
    const handle = facebookMatch ? facebookMatch[1] : text.replace(/^@/, "");
    return /^[A-Za-z0-9._-]{3,80}$/.test(handle) &&
      handle.toLowerCase() !== "profile.php"
      ? {
          value: `@${handle}`,
          url: `https://www.facebook.com/${handle}`,
        }
      : null;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function getVisibleRoster() {
    const query = normalizeSearchText(memberSearch.value);
    if (!query) {
      return roster;
    }

    return roster.filter((member) =>
      [member.name, member.venmo, member.messenger, member.cellphone].some((value) =>
        normalizeSearchText(value).includes(query),
      ),
    );
  }

  function renderRoster() {
    const visibleRoster = getVisibleRoster();
    memberCount.textContent =
      visibleRoster.length === roster.length
        ? roster.length === 1
          ? "1 member"
          : `${roster.length} members`
        : `${visibleRoster.length} of ${roster.length} members`;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Name", "Venmo", "Messenger", "Actions"].forEach((header) => {
      appendCell(headerRow, "th", header);
    });
    thead.append(headerRow);

    const tbody = document.createElement("tbody");
    visibleRoster.forEach((member) => {
      const row = document.createElement("tr");
      const actions = document.createElement("td");
      const editButton = document.createElement("button");
      const removeButton = document.createElement("button");

      const venmoUrl = getVenmoUrl(member.venmo);
      appendCell(row, "td", member.name || "").dataset.label = "Name";
      appendLinkCell(
        row,
        member.venmo || "",
        venmoUrl,
        member.venmo && !venmoUrl
          ? "Invalid Venmo handle or profile URL. Use a normal hyphen, not a long dash."
          : "",
      ).dataset.label = "Venmo";
      const messengerUrl = getMessengerUrl(member.messenger);
      appendLinkCell(
        row,
        member.messenger || "",
        messengerUrl,
        member.messenger && !messengerUrl
          ? "Invalid Messenger or Facebook profile URL. Use a plain handle or profile URL."
          : "",
      ).dataset.label = "Messenger";

      actions.className = "roster-actions-cell";
      actions.dataset.label = "Actions";
      const actionsWrap = document.createElement("div");
      actionsWrap.className = "roster-actions";
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

      actionsWrap.append(editButton, removeButton);
      actions.append(actionsWrap);
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
      renderMemberNameOptions();
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
      renderMemberNameOptions();
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
      renderMemberNameOptions();
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
      messenger: messengerInput.value.trim(),
      cellphone: cellphoneInput.value.trim(),
    };

    if (!payload.playerName) {
      setStatus("Enter a member name.", "error");
      return;
    }

    if (!payload.venmo) {
      setStatus("Enter a Venmo handle.", "error");
      return;
    }

    const venmoHandle = normalizeVenmoHandle(payload.venmo);
    if (!venmoHandle) {
      setStatus("Enter a valid Venmo handle or Venmo profile URL.", "error");
      return;
    }
    payload.venmo = `@${venmoHandle}`;

    if (!payload.messenger) {
      setStatus("Enter a Messenger contact.", "error");
      return;
    }
    const messengerContact = normalizeMessengerContact(payload.messenger);
    if (!messengerContact) {
      setStatus("Enter a valid Messenger or Facebook profile URL.", "error");
      return;
    }
    payload.messenger = messengerContact.value;

    saveMember(payload);
  });

  nameInput.addEventListener("change", () => {
    const member = findRosterMemberByName(nameInput.value);
    if (member) {
      fillForm(member);
    }
  });

  memberSearch.addEventListener("input", () => {
    renderRoster();
  });

  loadRoster();
})();
