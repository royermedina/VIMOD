// Declarative event wiring shared by all ViMod HTML pages.
(function () {
  function callGlobal(name, args) {
    if (typeof window[name] === "function")
      window[name].apply(window, args || []);
  }

  document.addEventListener("click", function (event) {
    const control = event.target.closest(
      "[data-vimod-action], [data-vimod-nav], [data-vimod-filter]",
    );
    if (!control) return;

    const action = control.getAttribute("data-vimod-action");
    if (action === "navigate") {
      window.location.href = control.getAttribute("data-vimod-target");
    } else if (action === "toggle-password") {
      const input = document.getElementById(
        control.getAttribute("data-vimod-target"),
      );
      const icon = control.querySelector(".material-symbols-outlined");
      if (input) {
        input.type = input.type === "password" ? "text" : "password";
        if (icon)
          icon.textContent =
            input.type === "password" ? "visibility" : "visibility_off";
      }
    } else if (action === "toggle") {
      const target = document.getElementById(
        control.getAttribute("data-vimod-target"),
      );
      if (target) target.classList.toggle("hidden");
      const chevron = control.querySelector(".accordion-chevron");
      if (chevron) chevron.classList.toggle("rotate-180");
    } else if (action === "dismiss") {
      const target = document.getElementById(
        control.getAttribute("data-vimod-target"),
      );
      if (target) target.classList.add("hidden");
    } else if (action === "open-quote") {
      callGlobal("openQuoteModal", [control]);
    } else if (action === "close-quote") {
      callGlobal("closeQuoteModal");
    } else if (action === "confirm-quote") {
      callGlobal("confirmQuote");
    } else if (action === "upload") {
      const input = document.getElementById(
        control.getAttribute("data-vimod-target"),
      );
      if (input) input.click();
    } else if (action === "calibrate") {
      callGlobal("calibrateTrigger", [control.getAttribute("data-vimod-type")]);
    } else if (action === "close-calibration") {
      callGlobal("closeCalibrate");
    } else if (action === "apply-calibration") {
      callGlobal("applyCalibration", [event, control]);
    } else if (action === "reset-terrain") {
      callGlobal("resetOrGoBack");
    } else if (control.hasAttribute("data-vimod-nav")) {
      window.location.href = control.getAttribute("data-vimod-nav");
    } else if (control.hasAttribute("data-vimod-filter")) {
      callGlobal("filterRequests", [
        control.getAttribute("data-vimod-filter"),
        control,
      ]);
    }
  });

  document.addEventListener("submit", function (event) {
    const form = event.target.closest("[data-vimod-submit]");
    if (!form) return;
    const handler = form.getAttribute("data-vimod-submit");
    if (handler === "login") callGlobal("handleLogin", [event]);
    if (handler === "terrain") callGlobal("handleFormSubmit", [event]);
    if (handler === "quote") callGlobal("handleQuoteSubmit", [event]);
  });

  document.addEventListener("input", function (event) {
    const input = event.target.closest("[data-vimod-input]");
    if (input && input.getAttribute("data-vimod-input") === "dimensions")
      callGlobal("updateDimensions");
  });

  document.addEventListener("change", function (event) {
    const input = event.target.closest("[data-vimod-change]");
    if (input && input.getAttribute("data-vimod-change") === "file-name")
      callGlobal("updateFileName", [input]);
  });

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("button").forEach(function (button) {
      const icon = button.querySelector(".material-symbols-outlined");
      if (!icon) return;
      const control = icon.textContent.trim();
      if (control !== "notifications" && control !== "help_outline") return;
      button.disabled = true;
      if (control === "notifications") {
        button.setAttribute("aria-label", "Notificaciones no disponibles");
        button.title = "No hay una fuente de notificaciones configurada.";
        button.querySelectorAll("span").forEach(function (element) {
          if (element !== icon && element.classList.contains("absolute"))
            element.remove();
        });
      } else {
        button.setAttribute("aria-label", "Ayuda contextual no disponible");
        button.title = "No hay contenido de ayuda configurado para esta página.";
      }
    });
  });
})();
