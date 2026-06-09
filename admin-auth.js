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

  function onChange(listener) {
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  const ready = validateStoredAuth();

  window.RsvpAdminAuth = {
    getState,
    login,
    logout,
    onChange,
    ready,
  };
})();
