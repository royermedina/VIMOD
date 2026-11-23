(function (root, factory) {
  const profileModule = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = profileModule;
  if (root) root.ViModArchitectProfile = profileModule;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  const PROFILE_FIELDS = Object.freeze([
    Object.freeze({ key: "nombre", label: "Nombre", type: "text", maxLength: 120 }),
    Object.freeze({ key: "especialidad", label: "Especialidad", type: "text", maxLength: 120 }),
    Object.freeze({ key: "anosExperiencia", label: "Años de experiencia", type: "number", min: 0, max: 80, step: 1 }),
    Object.freeze({ key: "zona", label: "Zona de trabajo", type: "text", maxLength: 120 }),
    Object.freeze({ key: "honorarioBase", label: "Honorario base (COP)", type: "number", min: 0, step: "0.01" }),
  ]);
  const EDIT_EVENT = "vimod:edit-architect-profile";

  function profileIsComplete(profile) {
    if (!profile) return false;
    return PROFILE_FIELDS.every((field) => {
      const value = profile[field.key];
      if (field.type === "number") {
        if (typeof value === "string" && !value.trim()) return false;
        return value !== null && value !== undefined && value !== ""
          && Number.isFinite(Number(value))
          && Number(value) >= Number(field.min)
          && (field.max === undefined || Number(value) <= field.max)
          && (field.step !== 1 || Number.isInteger(Number(value)));
      }
      return typeof value === "string" && value.trim().length > 0;
    });
  }

  function shouldShowHomeForm(profile) {
    return !profileIsComplete(profile);
  }

  function formMarkup() {
    const fields = PROFILE_FIELDS.map((field) => {
      const attributes = [
        'id="architect-profile-' + field.key + '"',
        'name="' + field.key + '"',
        'type="' + field.type + '"',
        "required",
      ];
      if (field.maxLength) attributes.push('maxlength="' + field.maxLength + '"');
      if (field.min !== undefined) attributes.push('min="' + field.min + '"');
      if (field.max !== undefined) attributes.push('max="' + field.max + '"');
      if (field.step !== undefined) attributes.push('step="' + field.step + '"');
      return '<label class="flex flex-col gap-2 text-sm font-semibold">' +
        field.label + '<input ' + attributes.join(" ") +
        ' class="rounded-lg border-outline-variant" /></label>';
    }).join("");
    return '<form id="architect-profile-form" class="mt-4 grid gap-3 sm:grid-cols-2">' +
      fields +
      '<button id="save-architect-profile" type="submit" class="client-primary-action px-4 py-2 text-sm sm:col-span-2">Guardar perfil</button>' +
      '</form>';
  }

  function initialize() {
    const homeSlot = root.document.getElementById("architect-profile-form-home");
    const modalSlot = root.document.getElementById("architect-profile-form-modal");
    const dialog = root.document.getElementById("architect-profile-dialog");
    const status = root.document.getElementById("architect-profile-status");
    const ratings = root.document.querySelectorAll(
      "#architect-rating-summary, #architect-rating-summary-modal",
    );
    if (!modalSlot || !dialog) return null;

    modalSlot.innerHTML = formMarkup();
    const form = root.document.getElementById("architect-profile-form");
    const saveButton = root.document.getElementById("save-architect-profile");
    let profile = null;
    let modalOpen = false;
    let openRequested = false;

    function setStatus(message, state) {
      if (!status) return;
      status.textContent = message;
      if (state) status.dataset.state = state;
      else delete status.dataset.state;
    }

    function showRating(value) {
      const text = value.ratingCount
        ? "Calificación promedio: " + value.ratingAverage + " / 5 · " +
          value.ratingCount + " calificaciones"
        : "Sin calificaciones";
      ratings.forEach((rating) => { rating.textContent = text; });
    }

    function updateSidebarName(name) {
      root.document.querySelectorAll("[data-profile-name]").forEach((element) => {
        element.textContent = name;
      });
      const user = typeof Storage !== "undefined" && typeof Storage.getCurrentUser === "function"
        ? Storage.getCurrentUser()
        : null;
      if (user) user.nombre = name;
      const initials = String(name).trim().split(/\s+/).slice(0, 2)
        .map((part) => part.charAt(0).toLocaleUpperCase("es-CO")).join("") || "A";
      root.document.querySelectorAll("[data-user-avatar]").forEach((element) => {
        element.textContent = initials;
      });
    }

    function fill(value) {
      PROFILE_FIELDS.forEach((field) => {
        form.elements[field.key].value = value[field.key] == null ? "" : value[field.key];
      });
    }

    function updatePlacement() {
      if (homeSlot) {
        homeSlot.classList.toggle("hidden", !shouldShowHomeForm(profile));
      }
      saveButton.textContent = modalOpen ? "Guardar cambios" : "Guardar perfil";
    }

    function returnFormHome() {
      modalOpen = false;
      if (homeSlot) homeSlot.appendChild(form);
      else modalSlot.appendChild(form);
      updatePlacement();
    }

    function closeDialog() {
      if (dialog.open) dialog.close();
      returnFormHome();
    }

    function openDialog() {
      if (!profile) {
        openRequested = true;
        return;
      }
      openRequested = false;
      modalOpen = true;
      modalSlot.appendChild(form);
      updatePlacement();
      if (!dialog.open) dialog.showModal();
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      saveButton.disabled = true;
      saveButton.textContent = "Guardando...";
      const data = new FormData(form);
      const updatedProfile = {
        nombre: String(data.get("nombre") || "").trim(),
        especialidad: String(data.get("especialidad") || "").trim(),
        anosExperiencia: Number(data.get("anosExperiencia")),
        zona: String(data.get("zona") || "").trim(),
        honorarioBase: Number(data.get("honorarioBase")),
      };
      try {
        const result = await ViModApi.patch("/architect/profile", updatedProfile);
        profile = result.profile;
        fill(profile);
        showRating(profile);
        updateSidebarName(profile.nombre);
        setStatus("Perfil guardado correctamente.", "success");
        closeDialog();
      } catch (error) {
        if (error && error.status === 401) {
          root.location.href = root.ViModRoutes.page("login");
          return;
        }
        const message = error && error.status >= 400 && error.status < 500
          ? error.message || "No se pudo guardar el perfil profesional."
          : "No se pudo guardar el perfil profesional.";
        setStatus(message, "error");
      } finally {
        saveButton.disabled = false;
        updatePlacement();
      }
    });

    const cancelButton = dialog.querySelector("[data-profile-cancel]");
    if (cancelButton) cancelButton.addEventListener("click", closeDialog);
    dialog.addEventListener("cancel", returnFormHome);
    root.document.addEventListener(EDIT_EVENT, openDialog);

    return ViModApi.get("/architect/profile").then((result) => {
      profile = result.profile;
      fill(profile);
      showRating(profile);
      updateSidebarName(profile.nombre);
      updatePlacement();
      if (openRequested) openDialog();
      return profile;
    }).catch((error) => {
      if (error && error.status === 401) {
        root.location.href = root.ViModRoutes.page("login");
        throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
      }
      const message = error && error.status >= 400 && error.status < 500
        ? error.message || "No se pudo cargar el perfil profesional."
        : "No se pudo cargar el perfil profesional.";
      setStatus(message, "error");
      throw new Error(message);
    });
  }

  return Object.freeze({
    PROFILE_FIELDS,
    EDIT_EVENT,
    profileIsComplete,
    shouldShowHomeForm,
    initialize,
  });
});
