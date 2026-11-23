// Shared browser utilities for ViMod pages.
(function (global) {
  const ViMod = global.ViMod || {};

  ViMod.byId = function (id) {
    return document.getElementById(id);
  };

  ViMod.toggleHidden = function (elementOrId, hidden) {
    const element =
      typeof elementOrId === "string" ? ViMod.byId(elementOrId) : elementOrId;
    if (!element) return;
    element.classList.toggle(
      "hidden",
      hidden === undefined ? !element.classList.contains("hidden") : hidden,
    );
  };

  ViMod.navigate = function (path) {
    window.location.href = path;
  };

  ViMod.formatMoney = function (value) {
    if (value === null || value === undefined || value === "") return "—";
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    }).format(Number(value));
  };

  ViMod.formatDate = function (value, options) {
    if (!value) return "";
    return new Date(value).toLocaleDateString(
      "es-CO",
      options || {
        day: "numeric",
        month: "short",
        year: "numeric",
      },
    );
  };

  ViMod.showRetryError = function (container, message, retry) {
    if (!container) return;
    const text = document.createElement("p");
    text.className = "text-sm text-error";
    text.setAttribute("role", "alert");
    text.textContent = message;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "client-secondary-action mt-3 px-space-12 py-space-8 text-sm";
    button.textContent = "Reintentar";
    button.addEventListener("click", async function () {
      button.disabled = true;
      try {
        await retry();
      } catch (error) {
        text.textContent = error.message || "No se pudo completar la operación.";
      } finally {
        button.disabled = false;
      }
    });
    container.replaceChildren(text, button);
    container.classList.remove("hidden", "vimod-hidden");
  };

  ViMod.escapeHtml = function (value) {
    return String(value || "").replace(/[&<>'"]/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      }[character];
    });
  };

  ViMod.on = function (elementOrId, eventName, handler) {
    const element =
      typeof elementOrId === "string" ? ViMod.byId(elementOrId) : elementOrId;
    if (element) element.addEventListener(eventName, handler);
    return element;
  };

  global.ViMod = ViMod;
})(window);
