(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzcjWqKlqoILjYBAZLZ1Ka1xZ5QDXL_Mq65kOZXsTAxpNhp39pIkbIDPXiNjGOah0EF/exec";
  const RSVP_PUBLIC_APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwkQT5n28qD0wVpRCA3qgJs5fZy_YG_TmNIXAyqQ-AZFTYJVyMOCjGKfsE-D9_R4x64VQ/exec";

  const form = document.querySelector("#roster-form");
  const adminAuth = window.RsvpAdminAuth;
  const adminEyebrow = document.querySelector("#admin-eyebrow");
  const nameInput = document.querySelector("#member-name");
  const memberNameList = document.querySelector("#member-name-list");
  const venmoInput = document.querySelector("#venmo");
  const zelleField = document.querySelector("#zelle-field");
  const zelleInput = document.querySelector("#zelle");
  const bbcMembershipInput = document.querySelector("#bbc-membership");
  const bbcMembershipPlaceholder = bbcMembershipInput.placeholder;
  const messengerInput = document.querySelector("#messenger");
  const noteInput = document.querySelector("#member-note");
  const memberSearch = document.querySelector("#member-search");
  const saveButton = document.querySelector("#save-button");
  const status = document.querySelector("#status");
  const memberCount = document.querySelector("#member-count");
  const memberTable = document.querySelector("#member-table");
  let roster = [];
  let adminToken = "";
  let editingOriginalName = "";
  let rosterRequestId = 0;
  let adminLoginExpired = false;
  // True only while `roster` came from an admin response (it has Zelle values).
  let rosterHasAdminDetails = false;

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type || ""}`.trim();
  }

  function renderAdminState() {
    adminEyebrow.hidden = !adminToken;
    noteInput.disabled = false;
    updateZelleInputState();
    updateSaveButtonLabel();
    renderRoster();
  }

  // Zelle is admin-only: the column and the form field exist only once an
  // admin roster (with the stored values) has loaded, so an empty input never
  // clears a Zelle the page couldn't see.
  function canShowZelle() {
    return Boolean(adminToken) && rosterHasAdminDetails;
  }

  function updateZelleInputState() {
    const showZelle = canShowZelle();
    zelleField.hidden = !showZelle;
    zelleInput.disabled = !showZelle;
    if (!showZelle) {
      zelleInput.value = "";
    }
  }

  // Backends older than 2026-11-09.3 don't return bbcMembership and would
  // silently drop a new value, so keep the field locked until a loaded roster
  // shows the backend has it (unknown, e.g. not loaded yet, counts as no).
  function updateBbcMembershipInputState() {
    const isSupported = roster.some((member) =>
      Object.prototype.hasOwnProperty.call(member, "bbcMembership"),
    );
    bbcMembershipInput.disabled = !isSupported;
    bbcMembershipInput.placeholder = isSupported
      ? bbcMembershipPlaceholder
      : roster.length > 0
        ? "Available after the backend update"
        : "Available once the roster loads";
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

  function refreshPublicRsvpRosterCache() {
    return new Promise((resolve) => {
      if (!RSVP_PUBLIC_APPS_SCRIPT_URL) {
        resolve();
        return;
      }

      const callbackName = `publicRosterRefresh_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      const url = new URL(RSVP_PUBLIC_APPS_SCRIPT_URL);
      const timeout = window.setTimeout(cleanup, 15000);

      function cleanup() {
        window.clearTimeout(timeout);
        script.remove();
        delete window[callbackName];
        resolve();
      }

      window[callbackName] = cleanup;
      script.onerror = cleanup;
      script.referrerPolicy = "no-referrer";
      url.searchParams.set("callback", callbackName);
      url.searchParams.set("action", "refreshRosterCache");
      script.src = url.toString();
      document.body.append(script);
    });
  }

  function clearForm() {
    form.reset();
    editingOriginalName = "";
    updateZelleInputState();
    updateSaveButtonLabel();
    renderRoster();
    nameInput.focus();
  }

  function focusRelevantMemberField(member) {
    if (!member.venmo) {
      venmoInput.focus();
      return;
    }
    if (!member.bbcMembership && !bbcMembershipInput.disabled) {
      bbcMembershipInput.focus();
      return;
    }
    if (!member.messenger) {
      messengerInput.focus();
      return;
    }
    noteInput.focus();
  }

  function fillForm(member, options) {
    editingOriginalName = member.name || "";
    nameInput.value = member.name || "";
    venmoInput.value = member.venmo || "";
    zelleInput.value = canShowZelle() ? member.zelle || "" : "";
    bbcMembershipInput.value = member.bbcMembership || "";
    messengerInput.value = member.messenger || "";
    noteInput.value = member.note || "";
    updateSaveButtonLabel();
    if (options?.focusRelevantField) {
      focusRelevantMemberField(member);
    } else {
      nameInput.focus();
    }
  }

  function fillMissingInfoForm(member) {
    fillForm(member, { focusRelevantField: true });
    setStatus("", "");
    renderRoster();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function isRenamingMember() {
    return (
      editingOriginalName &&
      normalizeSearchText(editingOriginalName) !== normalizeSearchText(nameInput.value)
    );
  }

  function updateSaveButtonLabel() {
    if (!adminToken) {
      const selectedMember = findRosterMemberByName(nameInput.value);
      const canUpdateInfo = selectedMember && !isRenamingMember();
      saveButton.disabled = !canUpdateInfo;
      saveButton.textContent = "Update Info";
      return;
    }
    saveButton.disabled = false;
    if (isRenamingMember()) {
      saveButton.textContent = "Rename Member";
      return;
    }
    saveButton.textContent = editingOriginalName ? "Update Member" : "Save Member";
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

  function getInitials(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase();
  }

  function appendMemberNameCell(row, member) {
    const cell = document.createElement("td");
    const wrap = document.createElement("div");
    const initials = document.createElement("span");
    const name = document.createElement("span");

    cell.dataset.label = "Name";
    wrap.className = "member-name-cell";
    initials.className = "member-initials";
    initials.textContent = getInitials(member.name) || "?";
    name.className = "member-name-text";
    name.textContent = member.name || "";

    wrap.append(initials, name);
    cell.append(wrap);
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

  function appendZelleCell(row, member) {
    const zelle = String(member.zelle || "").trim();
    if (!zelle) {
      return appendLinkCell(row, "", "", "", "zelle");
    }

    const normalized = normalizeZelle(zelle);
    const isLink = /^https:\/\//.test(normalized);
    return appendLinkCell(
      row,
      isLink ? "Zelle link" : zelle,
      isLink ? normalized : "",
      normalized ? "" : "Invalid Zelle. Use a Zelle QR link, email, or US phone number.",
      "zelle",
    );
  }

  function appendBbcMembershipCell(row, member) {
    const bbcMembership = String(member.bbcMembership || "").trim();
    return appendLinkCell(
      row,
      bbcMembership,
      "",
      bbcMembership && !normalizeBbcMembership(bbcMembership)
        ? "Invalid BBC membership number. Use letters, numbers, spaces or dashes."
        : "",
      "bbc",
    );
  }

  function getMessengerUrl(value) {
    const contact = normalizeMessengerContact(value);
    if (!contact) {
      return "";
    }
    return contact.url;
  }

  function getMessengerDisplayValue(value) {
    const contact = normalizeMessengerContact(value);
    return contact ? contact.url : String(value || "").trim();
  }

  function createMissingContact(fieldName) {
    const missing = document.createElement("span");
    missing.className = `missing-contact missing-${fieldName}`;
    missing.textContent = "Missing";
    return missing;
  }

  function appendLinkCell(row, text, href, warningMessage, fieldName) {
    const cell = document.createElement("td");
    if (text && href) {
      const link = document.createElement("a");
      link.className = "contact-chip";
      link.href = href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = text;
      cell.append(link);
    } else {
      const fallback = document.createElement("span");
      if (text) {
        fallback.className = "contact-chip muted-contact";
        fallback.textContent = text;
        cell.append(fallback);
      } else {
        cell.append(createMissingContact(fieldName));
      }
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

  function appendNoteCell(row, member) {
    const cell = document.createElement("td");
    const note = String(member.note || "").trim();

    cell.className = "member-note-cell";
    cell.dataset.label = "Note";

    if (note) {
      const noteText = document.createElement("span");
      noteText.textContent = note;
      cell.append(noteText);
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

  // Mirrors normalizeZelle_ in google-apps-script/Code.gs.
  function normalizeZelle(value) {
    const text = String(value || "").trim();
    const urlMatch = text.match(
      /^(?:https?:\/\/)?((?:[a-z0-9-]+\.)*(?:zellepay|zelle)\.com)(\/\S*)?$/i,
    );
    if (urlMatch && text.length <= 2000) {
      return `https://${urlMatch[1].toLowerCase()}${urlMatch[2] || ""}`;
    }

    if (
      text.length <= 254 &&
      /^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(text)
    ) {
      return text.toLowerCase();
    }

    if (/^[0-9\s().+-]+$/.test(text)) {
      const digits = text.replace(/\D/g, "");
      const national =
        digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
      if (national.length === 10) {
        return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
      }
    }

    return "";
  }

  // Mirrors normalizeBbcMembership_ in google-apps-script/Code.gs.
  function normalizeBbcMembership(value) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    if (!text) {
      return "";
    }
    if (text.length <= 20 && /^[A-Za-z0-9](?:[A-Za-z0-9 -]*[A-Za-z0-9])?$/.test(text)) {
      return text.toUpperCase();
    }
    return "";
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
      const handle = messengerMatch[1];
      const url = `https://www.facebook.com/${handle}`;
      return {
        value: url,
        url,
      };
    }

    const profileIdMatch = text.match(
      /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/profile\.php\?id=([0-9]+)(?:[&#].*)?$/i,
    );
    if (profileIdMatch) {
      const profileId = profileIdMatch[1];
      const url = `https://www.facebook.com/profile.php?id=${profileId}`;
      return { value: url, url };
    }

    const facebookMatch = text.match(
      /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/([A-Za-z0-9._-]{3,80})\/?(?:[?#].*)?$/i,
    );
    const handle = facebookMatch ? facebookMatch[1] : text.replace(/^@/, "");
    return /^[A-Za-z0-9._-]{3,80}$/.test(handle) &&
      handle.toLowerCase() !== "profile.php"
      ? {
          value: `https://www.facebook.com/${handle}`,
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
      [
        member.name,
        member.venmo,
        canShowZelle() ? member.zelle : "",
        member.bbcMembership,
        member.messenger,
        member.note,
      ].some((value) => normalizeSearchText(value).includes(query)),
    );
  }

  function getMissingMemberInfo(member) {
    return [
      ["Venmo", member.venmo],
      ["Facebook", member.messenger],
      ["Note", member.note],
    ]
      .filter((entry) => !String(entry[1] || "").trim())
      .map((entry) => entry[0]);
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
    const showZelle = canShowZelle();
    const columns = [
      ["name", "Name"],
      ["venmo", "Venmo"],
      ...(showZelle ? [["zelle", "Zelle"]] : []),
      ["bbc", "BBC Membership #"],
      ["facebook", "Facebook"],
      ["note", "Note"],
      ...(adminToken ? [["actions", "Actions"]] : []),
    ];
    columns.forEach(([key, header]) => {
      appendCell(headerRow, "th", header, `roster-col-${key}`);
    });
    thead.append(headerRow);

    const tbody = document.createElement("tbody");
    visibleRoster.forEach((member) => {
      const row = document.createElement("tr");
      const isSelected =
        !adminToken &&
        editingOriginalName &&
        normalizeSearchText(editingOriginalName) === normalizeSearchText(member.name);
      const venmoUrl = getVenmoUrl(member.venmo);
      if (isSelected) {
        row.className = "selected-member-row";
      }
      row.classList.add("member-row");
      row.tabIndex = 0;
      row.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }
        if (adminToken) {
          fillForm(member, { focusRelevantField: true });
        } else {
          fillMissingInfoForm(member);
        }
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (adminToken) {
            fillForm(member, { focusRelevantField: true });
          } else {
            fillMissingInfoForm(member);
          }
        }
      });
      appendMemberNameCell(row, member).classList.add("roster-col-name");
      const venmoCell = appendLinkCell(
        row,
        member.venmo || "",
        venmoUrl,
        member.venmo && !venmoUrl
          ? "Invalid Venmo handle or profile URL. Use a normal hyphen, not a long dash."
          : "",
        "venmo",
      );
      venmoCell.dataset.label = "Venmo";
      venmoCell.classList.add("roster-col-venmo");
      if (showZelle) {
        const zelleCell = appendZelleCell(row, member);
        zelleCell.dataset.label = "Zelle";
        zelleCell.classList.add("roster-col-zelle");
      }
      const bbcCell = appendBbcMembershipCell(row, member);
      bbcCell.dataset.label = "BBC #";
      bbcCell.classList.add("roster-col-bbc");
      const messengerUrl = getMessengerUrl(member.messenger);
      const messengerCell = appendLinkCell(
        row,
        getMessengerDisplayValue(member.messenger),
        messengerUrl,
        member.messenger && !messengerUrl
          ? "Invalid Facebook profile URL. Use a profile URL or plain profile handle."
          : "",
        "facebook",
      );
      messengerCell.dataset.label = "Facebook";
      messengerCell.classList.add("roster-col-facebook");
      appendNoteCell(row, member).classList.add("roster-col-note");
      if (adminToken) {
        const actions = document.createElement("td");
        const removeButton = document.createElement("button");

        actions.className = "roster-actions-cell roster-col-actions";
        actions.dataset.label = "Actions";
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "roster-actions";

        removeButton.className = "secondary-button inline-button danger-button";
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => {
          removeMember(member.name);
        });

        actionsWrap.append(removeButton);
        actions.append(actionsWrap);
        row.append(actions);
      }
      tbody.append(row);
    });

    memberTable.replaceChildren(thead, tbody);
  }

  async function loadRoster() {
    const requestId = ++rosterRequestId;
    setStatus("Loading roster...", "");
    try {
      const result = await requestAppsScript({
        action: "listRoster",
        ...(adminToken ? { adminToken } : {}),
      });
      if (requestId !== rosterRequestId) {
        return;
      }
      // Older backends omit isAdmin; only an explicit false means expired.
      adminLoginExpired = Boolean(adminToken) && result.isAdmin === false;
      const wasShowingZelle = canShowZelle();
      roster = Array.isArray(result.roster) ? result.roster : [];
      rosterHasAdminDetails = Boolean(adminToken) && result.isAdmin === true;
      updateZelleInputState();
      const editingMember = findRosterMemberByName(editingOriginalName);
      if (editingMember && canShowZelle() && !wasShowingZelle) {
        zelleInput.value = editingMember.zelle || "";
      }
      updateBbcMembershipInputState();
      renderMemberNameOptions();
      renderRoster();
      if (adminLoginExpired) {
        setStatus("Admin login expired. Log in again on the Admin page.", "error");
      } else {
        setStatus("Roster loaded.", "success");
      }
    } catch (error) {
      if (requestId !== rosterRequestId) {
        return;
      }
      memberCount.textContent = "Could not load roster";
      setStatus(error.message, "error");
    }
  }

  // Write responses carry the roster for the role that sent them. If the admin
  // state changed meanwhile, refetch instead of showing the wrong view.
  function applyRosterResult(result, requestToken) {
    if (requestToken !== adminToken) {
      loadRoster();
      return;
    }
    rosterRequestId += 1;
    roster = Array.isArray(result.roster) ? result.roster : [];
    // saveRosterMember and removeRosterMember (admin) return the admin roster;
    // completeRosterMemberInfo returns the public one.
    rosterHasAdminDetails = Boolean(requestToken);
    updateZelleInputState();
    updateBbcMembershipInputState();
  }

  async function saveMember(payload) {
    const requestToken = adminToken;
    saveButton.disabled = true;
    setStatus(adminToken ? "Saving member..." : "Adding missing info...", "");

    try {
      if (payload.oldPlayerName && !adminToken) {
        throw new Error("Admin login is required to create or rename members.");
      }
      const result = await requestAppsScript({
        action: adminToken ? "saveRosterMember" : "completeRosterMemberInfo",
        adminToken,
        ...payload,
      });
      applyRosterResult(result, requestToken);
      refreshPublicRsvpRosterCache();
      renderMemberNameOptions();
      renderRoster();
      clearForm();
      const renameCounts = result.renameCounts || {};
      const rsvpRows = Number(renameCounts.rsvpRows || 0);
      const auditRows = Number(renameCounts.auditRows || 0);
      const auditExistingRows = Number(renameCounts.auditExistingRows || 0);
      const exportRows = Number(renameCounts.exportRows || 0);
      const renamedMessage = [
        "Renamed member.",
        `${rsvpRows} RSVP row${rsvpRows === 1 ? "" : "s"}`,
        `${auditRows} audit row${auditRows === 1 ? "" : "s"}`,
        `${auditExistingRows} audit detail row${
          auditExistingRows === 1 ? "" : "s"
        }`,
        `${exportRows} exported report row${exportRows === 1 ? "" : "s"}`,
      ].join(" ");
      const updatedFields = Array.isArray(result.updatedFields)
        ? result.updatedFields.filter(Boolean)
        : [];
      const messages = {
        completed:
          updatedFields.length > 0
            ? `Added missing ${updatedFields.join(", ")}.`
            : "Added missing member info.",
        created: "Added member.",
        updated: "Updated member.",
        renamed: renamedMessage,
      };
      setStatus(messages[result.action] || "Saved member.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      updateSaveButtonLabel();
    }
  }

  async function removeMember(playerName) {
    if (!adminToken) {
      setStatus("Log in as admin before removing members.", "error");
      return;
    }

    if (!window.confirm(`Remove ${playerName} from the roster?`)) {
      return;
    }

    setStatus("Removing member...", "");
    const requestToken = adminToken;
    try {
      const result = await requestAppsScript({
        action: "removeRosterMember",
        adminToken,
        playerName,
      });
      applyRosterResult(result, requestToken);
      refreshPublicRsvpRosterCache();
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
      note: noteInput.value.trim(),
    };

    if (!payload.playerName) {
      setStatus("Enter a member name.", "error");
      return;
    }

    const existingMember = findRosterMemberByName(payload.playerName);
    if (!adminToken && (!existingMember || isRenamingMember())) {
      setStatus("Admin login is required to create or rename members.", "error");
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

    if (payload.messenger) {
      const messengerContact = normalizeMessengerContact(payload.messenger);
      if (!messengerContact) {
        setStatus("Enter a valid Facebook profile URL or profile handle.", "error");
        return;
      }
      payload.messenger = messengerContact.url;
    }

    // Without the admin roster the Zelle field is hidden: send nothing so the
    // backend keeps whatever is stored.
    const zelle = zelleInput.value.trim();
    if (!canShowZelle() || zelleInput.disabled) {
      // Leave the stored Zelle unchanged.
    } else if (zelle) {
      const normalizedZelle = normalizeZelle(zelle);
      if (!normalizedZelle) {
        setStatus("Enter a valid Zelle QR link, email, or US phone number.", "error");
        return;
      }
      payload.zelle = normalizedZelle;
    } else if (findRosterMemberByName(editingOriginalName)?.zelle) {
      // The admin emptied a Zelle they could see: clear it.
      payload.zelle = "";
    }

    // Send BBC Membership only when it changed, and validate only then, so a
    // hand-edited stored value never blocks unrelated updates.
    const bbcMembership = bbcMembershipInput.value.trim();
    const storedBbcMembership = String(
      findRosterMemberByName(editingOriginalName || payload.playerName)?.bbcMembership || "",
    ).trim();
    if (bbcMembershipInput.disabled || bbcMembership === storedBbcMembership) {
      // Older backend or unchanged: leave the stored value as it is.
    } else if (bbcMembership) {
      const normalizedBbcMembership = normalizeBbcMembership(bbcMembership);
      if (!normalizedBbcMembership) {
        setStatus(
          "Enter a valid BBC membership number: letters, numbers, spaces or dashes, up to 20 characters.",
          "error",
        );
        return;
      }
      payload.bbcMembership = normalizedBbcMembership;
    } else if (adminToken) {
      // The admin emptied a stored number: clear it. Non-admins can't clear.
      payload.bbcMembership = "";
    }
    if (isRenamingMember()) {
      payload.oldPlayerName = editingOriginalName;
    }

    saveMember(payload);
  });

  nameInput.addEventListener("input", () => {
    updateSaveButtonLabel();
    if (!adminToken) {
      renderRoster();
    }
  });

  nameInput.addEventListener("change", () => {
    const member = findRosterMemberByName(nameInput.value);
    if (member) {
      fillForm(member);
      renderRoster();
    }
  });

  memberSearch.addEventListener("input", () => {
    renderRoster();
  });

  function handleAdminStateChange(state) {
    const previousToken = adminToken;
    adminToken = state.token || "";
    if (adminToken !== previousToken) {
      // Drop Zelle details right away; the refetch below gets the right view.
      rosterHasAdminDetails = false;
      roster = roster.map(({ zelle, ...member }) => member);
    }
    renderAdminState();
    // Admin and public roster responses differ (Zelle details), so refetch.
    if (adminToken !== previousToken) {
      loadRoster();
    }
  }

  updateBbcMembershipInputState();
  adminAuth.onChange(handleAdminStateChange);
  window.addEventListener("storage", (event) => {
    if (event.key === "play-rsvp.adminAuth") {
      window.location.reload();
    }
  });
  loadRoster();
})();
