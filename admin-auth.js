(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxsqdqZM0MVT8c6Phcf9ERSOJxnYgkXZ_opGB-diXUwsOHq-PG95Y42TlpbDXoZey0b/exec";
  const ADMIN_AUTH_KEY = "play-rsvp.adminAuth";

  let adminToken = "";
  let expiresAt = 0;
  const listeners = new Set();

  function readAdminAuth() {
    try {
      const auth = JSON.parse(localStorage.getItem(ADMIN_AUTH_KEY));
      return auth && auth.token ? auth : null;
    } catch {
      return null;
    }
  }

  function writeAdminAuth(auth) {
    localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(auth));
  }

  function clearAdminAuth() {
    adminToken = "";
    expiresAt = 0;
    localStorage.removeItem(ADMIN_AUTH_KEY);
  }

  function getState() {
    return {
      token: adminToken,
      expiresAt,
      isLoggedIn: Boolean(adminToken),
    };
  }

  function notify() {
    const state = getState();
    listeners.forEach((listener) => listener(state));
    renderWidget(state);
  }

  function buildAppsScriptUrl(payload, callbackName) {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("callback", callbackName);
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

  async function requestAppsScript(payload) {
    const callbackName = `adminAuthCallback_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const response = await fetch(buildAppsScriptUrl(payload, callbackName), {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const parsed = parseJsonpResponse(await response.text(), callbackName);

    if (response.ok && parsed.ok) {
      return parsed;
    }

    throw new Error(parsed?.error || "Request failed");
  }

  function getWidgetElements() {
    return {
      widget: document.querySelector("#admin-auth-widget"),
      button: document.querySelector("#admin-auth-button"),
      panel: document.querySelector("#admin-auth-panel"),
      form: document.querySelector("#admin-auth-form"),
      password: document.querySelector("#admin-auth-password"),
      status: document.querySelector("#admin-auth-status"),
      logout: document.querySelector("#admin-auth-logout"),
    };
  }

  function setWidgetStatus(message, type) {
    const { status } = getWidgetElements();
    if (!status) {
      return;
    }
    status.textContent = message;
    status.className = `admin-auth-status ${type || ""}`.trim();
  }

  function renderWidget(state) {
    const { button, panel, password, logout } = getWidgetElements();
    if (!button || !panel || !logout) {
      return;
    }

    button.textContent = state.isLoggedIn ? "Admin" : "Log In";
    button.classList.toggle("is-admin", state.isLoggedIn);
    panel.dataset.state = state.isLoggedIn ? "signed-in" : "signed-out";
    logout.hidden = !state.isLoggedIn;
    if (password) {
      password.disabled = state.isLoggedIn;
      if (state.isLoggedIn) {
        password.value = "";
      }
    }
    setWidgetStatus(
      state.isLoggedIn
        ? "Admin access is active on this browser."
        : "Log in once to unlock admin actions on all pages.",
      state.isLoggedIn ? "success" : "",
    );
  }

  async function login(password) {
    const result = await requestAppsScript({
      action: "adminLogin",
      password,
    });
    adminToken = result.token;
    expiresAt = Number(result.expiresAt || 0);
    writeAdminAuth({
      token: adminToken,
      expiresAt,
    });
    notify();
    return getState();
  }

  function logout() {
    clearAdminAuth();
    notify();
  }

  async function validateStoredAuth() {
    const auth = readAdminAuth();
    if (!auth?.token) {
      clearAdminAuth();
      notify();
      return getState();
    }

    try {
      await requestAppsScript({
        action: "validateAdmin",
        adminToken: auth.token,
      });
      adminToken = auth.token;
      expiresAt = Number(auth.expiresAt || 0);
    } catch {
      clearAdminAuth();
    }

    notify();
    return getState();
  }

  function installWidget() {
    if (document.querySelector("#admin-auth-widget")) {
      return;
    }

    const widget = document.createElement("div");
    widget.id = "admin-auth-widget";
    widget.className = "admin-auth-widget";
    widget.innerHTML = [
      '<button id="admin-auth-button" class="admin-auth-button" type="button" aria-expanded="false" aria-controls="admin-auth-panel">Log In</button>',
      '<div id="admin-auth-panel" class="admin-auth-panel" hidden>',
      '<form id="admin-auth-form" class="admin-auth-form">',
      '<label class="field">',
      "<span>Admin password</span>",
      '<input id="admin-auth-password" autocomplete="current-password" type="password" required />',
      "</label>",
      '<button type="submit">Log In</button>',
      "</form>",
      '<p id="admin-auth-status" class="admin-auth-status" role="status" aria-live="polite"></p>',
      '<button id="admin-auth-logout" class="secondary-button" type="button" hidden>Log Out</button>',
      "</div>",
    ].join("");

    const panel = document.querySelector(".panel") || document.body;
    panel.prepend(widget);

    const { button, form, password, logout: logoutButton } = getWidgetElements();
    button.addEventListener("click", () => {
      const { panel: authPanel } = getWidgetElements();
      const willOpen = authPanel.hidden;
      authPanel.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
      if (willOpen && !adminToken) {
        window.setTimeout(() => password?.focus(), 0);
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setWidgetStatus("Logging in...", "loading");
      try {
        await login(password.value);
        password.value = "";
      } catch (error) {
        clearAdminAuth();
        notify();
        setWidgetStatus(error.message, "error");
      }
    });

    logoutButton.addEventListener("click", () => {
      logout();
    });
  }

  function onChange(listener) {
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  installWidget();
  const ready = validateStoredAuth();

  window.RsvpAdminAuth = {
    getState,
    login,
    logout,
    onChange,
    ready,
  };
})();
