(function (global) {
  "use strict";

  const EXPECTED_DEPLOYMENTS = [
    {
      id: "admin-billing",
      label: "Admin / Billing",
      url: "https://script.google.com/macros/s/AKfycbzcjWqKlqoILjYBAZLZ1Ka1xZ5QDXL_Mq65kOZXsTAxpNhp39pIkbIDPXiNjGOah0EF/exec",
      deploymentVersion: "2026-09-20.3",
      billingCalculationVersion: 3,
    },
    {
      id: "rsvp",
      label: "RSVP",
      url: "https://script.google.com/macros/s/AKfycbwkQT5n28qD0wVpRCA3qgJs5fZy_YG_TmNIXAyqQ-AZFTYJVyMOCjGKfsE-D9_R4x64VQ/exec",
      deploymentVersion: "2026-09-20.1",
    },
  ];
  const REQUEST_TIMEOUT_MS = 15000;

  function buildDeploymentUrl(service, callbackName) {
    const url = new URL(service.url);
    url.searchParams.set("action", "deploymentInfo");
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("cacheBust", String(Date.now()));
    return url.toString();
  }

  function requestDeploymentInfo(service) {
    return new Promise((resolve, reject) => {
      const callbackName = `deploymentHealth_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      const timeout = global.setTimeout(() => {
        cleanup();
        reject(new Error("Version check timed out"));
      }, REQUEST_TIMEOUT_MS);

      function cleanup() {
        global.clearTimeout(timeout);
        script.remove();
        delete global[callbackName];
      }

      global[callbackName] = (response) => {
        cleanup();
        if (response?.ok) {
          resolve(response);
          return;
        }
        reject(new Error(response?.error || "Version check failed"));
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Could not reach the live deployment"));
      };
      script.referrerPolicy = "no-referrer";
      script.src = buildDeploymentUrl(service, callbackName);
      document.head.append(script);
    });
  }

  function evaluateDeployment(service, response, error) {
    if (error) {
      const oldDeployment = /Unsupported action:\s*deploymentInfo/i.test(
        error.message || "",
      );
      return {
        ok: false,
        label: service.label,
        message: oldDeployment
          ? `Live code is older than expected ${service.deploymentVersion}.`
          : `${error.message || "Version check failed"}. Expected ${service.deploymentVersion}.`,
      };
    }

    if (response?.service !== service.id) {
      return {
        ok: false,
        label: service.label,
        message: `Wrong backend responded (${response?.service || "unknown"}).`,
      };
    }

    if (String(response.deploymentVersion || "") !== service.deploymentVersion) {
      return {
        ok: false,
        label: service.label,
        message: `Expected ${service.deploymentVersion}; live is ${
          response.deploymentVersion || "unversioned"
        }.`,
      };
    }

    if (
      service.billingCalculationVersion !== undefined &&
      Number(response.billingCalculationVersion) !==
        service.billingCalculationVersion
    ) {
      return {
        ok: false,
        label: service.label,
        message: `Expected billing calculation ${service.billingCalculationVersion}; live is ${
          response.billingCalculationVersion ?? "unversioned"
        }.`,
      };
    }

    const calculation =
      service.billingCalculationVersion === undefined
        ? ""
        : ` · billing calculation ${service.billingCalculationVersion}`;
    return {
      ok: true,
      label: service.label,
      message: `Current (${service.deploymentVersion}${calculation}).`,
    };
  }

  async function checkDeployments(services, request) {
    return Promise.all(
      services.map(async (service) => {
        try {
          return evaluateDeployment(service, await request(service), null);
        } catch (error) {
          return evaluateDeployment(service, null, error);
        }
      }),
    );
  }

  function initialize() {
    const panel = document.querySelector("#deployment-health");
    const title = document.querySelector("#deployment-health-title");
    const summary = document.querySelector("#deployment-health-summary");
    const list = document.querySelector("#deployment-health-list");
    const refreshButton = document.querySelector("#deployment-health-refresh");

    if (!panel || !title || !summary || !list || !refreshButton) {
      return;
    }

    async function refresh() {
      panel.hidden = false;
      panel.className = "deployment-health loading";
      title.textContent = "Apps Script deployments";
      summary.textContent = "Checking live backend versions...";
      list.replaceChildren();
      refreshButton.disabled = true;

      const results = await checkDeployments(
        EXPECTED_DEPLOYMENTS,
        requestDeploymentInfo,
      );
      const failures = results.filter((result) => !result.ok);
      panel.className = `deployment-health ${failures.length ? "warning" : "success"}`;
      title.textContent = failures.length
        ? "Deployment warning"
        : "Apps Script deployments are current";
      summary.textContent = failures.length
        ? `${failures.length} backend deployment${failures.length === 1 ? "" : "s"} must be updated before relying on Admin, Billing, or RSVP data.`
        : "The Admin / Billing and RSVP backends match this website version.";
      list.replaceChildren(
        ...results.map((result) => {
          const item = document.createElement("li");
          item.className = result.ok ? "success" : "warning";
          const label = document.createElement("strong");
          label.textContent = `${result.label}: `;
          item.append(label, result.message);
          return item;
        }),
      );
      refreshButton.disabled = false;
    }

    refreshButton.addEventListener("click", refresh);
    refresh();
  }

  global.RsvpDeploymentHealth = {
    EXPECTED_DEPLOYMENTS,
    evaluateDeployment,
    checkDeployments,
  };

  initialize();
})(window);
