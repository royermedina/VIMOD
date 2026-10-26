(function () {
  const textarea = document.getElementById("descriptionText");
  const counter = document.getElementById("charCount");
  const badge = document.getElementById("charCounterBadge");
  const warning = document.getElementById("charWarning");
  const form = document.getElementById("serviceForm");
  const profileForm = document.getElementById("contractorProfileForm");
  const maxChars = 500;
  let editingId = null;
  let services = [];
  let contractorId = null;
  let savingService = false;
  const categories = {
    cimentacion: "Cimentación en seco",
    paneleria: "Panelería térmica",
    "llave-mano": "Fabricación llave en mano",
    "modulos-humedos": "Módulos de servicio y baños",
    cubiertas: "Cubiertas ventiladas modulares",
  };
  const escapeHtml = ViMod.escapeHtml;

  function updateCounter() {
    if (!textarea || !counter) return;
    const length = textarea.value.length;
    counter.textContent = length;
    if (length >= maxChars) {
      badge.classList.remove("bg-surface-container", "text-on-surface-variant", "bg-primary-fixed", "text-on-primary-fixed-variant");
      badge.classList.add("bg-error-container", "text-on-error-container");
      warning.classList.remove("hidden");
    } else if (length >= 450) {
      badge.classList.remove("bg-surface-container", "text-on-surface-variant", "bg-error-container", "text-on-error-container");
      badge.classList.add("bg-primary-fixed", "text-on-primary-fixed-variant");
      warning.classList.add("hidden");
    } else {
      badge.classList.remove("bg-error-container", "text-on-error-container", "bg-primary-fixed", "text-on-primary-fixed-variant");
      badge.classList.add("bg-surface-container", "text-on-surface-variant");
      warning.classList.add("hidden");
    }
  }

  function fromApi(service) {
    return {
      id: service.id,
      name: service.name,
      category: service.category,
      estimatedTime: service.estimatedTime,
      description: service.description,
      price: service.price,
      status: service.status,
      type: service.type || "servicio",
      unit: service.unit || "No indicado",
      availability: service.availability || "disponible",
    };
  }

  function showFeedback(id, message, isError) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("hidden", !message);
    element.classList.toggle("text-error", !!isError);
    element.classList.toggle("text-primary", !isError);
  }

  function renderServices() {
    const list = document.getElementById("services-list");
    const count = document.getElementById("services-count");
    if (count) count.textContent = services.filter((service) => service.status === "active").length + " publicaciones activas";
    if (!list) return;
    if (!services.length) {
      list.innerHTML = '<p class="font-body text-sm text-on-surface-variant">Aún no has publicado servicios.</p>';
      return;
    }
    list.innerHTML = services.map((service) => {
      const price = service.price == null ? "No especificado" : ViMod.formatMoney(service.price);
      const statusLabel = service.status === "paused" ? "Pausado" : "Activo";
      const availabilityLabel = service.availability === "disponible" ? "Disponible" : "No disponible";
      return '<article class="bg-surface-container-lowest p-space-24 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-12"><div class="flex items-center justify-between gap-3"><span class="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-on-primary-fixed-variant">' + statusLabel + '</span><div class="flex flex-wrap gap-2"><button type="button" data-toggle="' + escapeHtml(service.id) + '" class="rounded-lg bg-surface-container-high px-3 py-2 text-xs font-bold">' + (service.status === "paused" ? "Reanudar" : "Pausar") + '</button><button type="button" data-edit="' + escapeHtml(service.id) + '" class="rounded-lg bg-surface-container-high px-3 py-2 text-xs font-bold">Editar</button><button type="button" data-delete="' + escapeHtml(service.id) + '" class="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Eliminar</button></div></div><p class="text-xs font-bold uppercase text-outline">' + escapeHtml(categories[service.category] || service.category) + ' · ' + escapeHtml(service.type) + '</p><h3 class="font-headline text-base font-bold">' + escapeHtml(service.name) + '</h3><p class="text-sm text-on-surface-variant">' + escapeHtml(service.description) + '</p><p class="text-xs text-on-surface-variant">Unidad: ' + escapeHtml(service.unit) + ' · Plazo informado: ' + escapeHtml(service.estimatedTime || "No especificado") + ' · Precio indicativo: ' + escapeHtml(price) + ' · ' + availabilityLabel + '</p></article>';
    }).join("");
    list.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
      const service = services.find((item) => item.id === button.dataset.edit);
      if (!service) return;
      editingId = service.id;
      document.getElementById("serviceName").value = service.name;
      document.getElementById("serviceCategory").value = service.category;
      document.getElementById("serviceType").value = service.type;
      document.getElementById("serviceUnit").value = service.unit === "No indicado" ? "" : service.unit;
      document.getElementById("serviceAvailability").value = service.availability;
      document.getElementById("execTime").value = service.estimatedTime || "";
      document.getElementById("costRange").value = service.price == null ? "" : service.price;
      textarea.value = service.description;
      document.getElementById("btnPublishLabel").textContent = "Guardar cambios";
      updateCounter();
      form.scrollIntoView({ behavior: "smooth" });
    }));
    list.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", async () => {
      const service = services.find((item) => item.id === button.dataset.toggle);
      if (!service) return;
      button.disabled = true;
      try {
        await ViModApi.patch("/contractor/services/" + encodeURIComponent(service.id), {
          name: service.name,
          category: service.category,
          type: service.type,
          unit: service.unit,
          availability: service.availability,
          estimatedTime: service.estimatedTime,
          description: service.description,
          price: service.price,
          status: service.status === "paused" ? "active" : "paused",
        });
        await loadServices();
      } catch (error) {
        showFeedback("service-form-feedback", error.message, true);
        button.disabled = false;
      }
    }));
    list.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
      if (!window.confirm("¿Eliminar este servicio?")) return;
      button.disabled = true;
      try {
        await ViModApi.delete("/contractor/services/" + encodeURIComponent(button.dataset.delete));
        await loadServices();
      } catch (error) {
        showFeedback("service-form-feedback", error.message, true);
        button.disabled = false;
      }
    }));
  }

  async function loadServices() {
    const response = await ViModApi.get("/contractor/services");
    services = (response.services || []).map(fromApi);
    renderServices();
  }

  if (textarea) {
    textarea.addEventListener("input", updateCounter);
    updateCounter();
  }

  if (form) form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (savingService) return;
    if (!contractorId) {
      showFeedback("service-form-feedback", "Inicia sesión con una cuenta de constructora aprobada.", true);
      return;
    }
    const description = textarea.value.trim();
    const priceInput = document.getElementById("costRange").value.trim();
    if (description.length > maxChars) {
      showFeedback("service-form-feedback", "La descripción no puede superar " + maxChars + " caracteres.", true);
      return;
    }
    const payload = {
      name: document.getElementById("serviceName").value.trim(),
      category: document.getElementById("serviceCategory").value,
      type: document.getElementById("serviceType").value,
      unit: document.getElementById("serviceUnit").value.trim(),
      availability: document.getElementById("serviceAvailability").value,
      estimatedTime: document.getElementById("execTime").value.trim(),
      description,
      price: priceInput ? Number(priceInput) : null,
    };
    if (priceInput && (!Number.isFinite(payload.price) || payload.price <= 0)) {
      showFeedback("service-form-feedback", "Ingresa un precio numérico positivo.", true);
      return;
    }
    savingService = true;
    const submitButton = document.getElementById("btnPublish");
    if (submitButton) submitButton.disabled = true;
    showFeedback("service-form-feedback", "", false);
    try {
      if (editingId) await ViModApi.patch("/contractor/services/" + encodeURIComponent(editingId), payload);
      else await ViModApi.post("/contractor/services", payload);
      editingId = null;
      form.reset();
      textarea.value = "";
      document.getElementById("btnPublishLabel").textContent = "Publicar servicio";
      updateCounter();
      showFeedback("service-form-feedback", "Publicación guardada.", false);
      await loadServices();
    } catch (error) {
      showFeedback("service-form-feedback", error.message, true);
    } finally {
      savingService = false;
      if (submitButton) submitButton.disabled = false;
    }
  });

  function collectServiceData() {
    return {
      nombre: document.getElementById("serviceName").value.trim(),
      categoria: document.getElementById("serviceCategory").value,
      tiempo: document.getElementById("execTime").value.trim(),
      costo: document.getElementById("costRange").value.trim(),
      descripcion: textarea.value.trim(),
    };
  }

  const preview = document.getElementById("btnPreviewService");
  if (preview) preview.addEventListener("click", () => {
    const data = collectServiceData();
    window.alert("Vista previa\n\n" + (data.nombre || "Servicio sin nombre") + "\n" +
      (categories[data.categoria] || data.categoria) + "\n\n" +
      (data.descripcion || "Sin descripción") + "\n\nPlazo informado: " +
    (data.tiempo || "No especificado") + "\nTipo y unidad: " +
    document.getElementById("serviceType").value + " · " +
    (document.getElementById("serviceUnit").value.trim() || "No indicada") + "\nPrecio indicativo: " +
      (data.costo ? ViMod.formatMoney(Number(data.costo)) : "No especificado"));
  });

  if (profileForm) profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("save-profile");
    if (button) button.disabled = true;
    showFeedback("profile-form-feedback", "", false);
    try {
      const response = await ViModApi.patch("/contractor/profile", {
        commercialName: document.getElementById("commercialName").value.trim(),
        description: document.getElementById("contractorDescription").value.trim(),
        coverageZone: document.getElementById("coverageZone").value.trim(),
        contact: document.getElementById("contractorContact").value.trim(),
      });
      fillProfile(response.profile);
      showFeedback("profile-form-feedback", "Perfil guardado.", false);
    } catch (error) {
      showFeedback("profile-form-feedback", error.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  });

  function fillProfile(profile) {
    document.getElementById("commercialName").value = profile.commercialName === "No indicado" ? "" : profile.commercialName;
    document.getElementById("contractorDescription").value = profile.description === "No indicado" ? "" : profile.description;
    document.getElementById("coverageZone").value = profile.coverageZone === "No indicado" ? "" : profile.coverageZone;
    document.getElementById("contractorContact").value = profile.contact === "No indicado" ? "" : profile.contact;
  }

  async function initialize() {
    await Storage.whenReady();
    const user = Storage.getCurrentUser();
    contractorId = user && user.rol === "constructora" ? user.id : null;
    showFeedback("profile-form-feedback", "", false);
    try {
      const response = await ViModApi.get("/contractor/profile");
      fillProfile(response.profile);
      const displayName = document.getElementById("contractor-profile-display-name");
      if (displayName) displayName.textContent = response.profile.commercialName;
      await loadServices();
    } catch (error) {
      ViMod.showRetryError(
        document.getElementById("profile-form-feedback"),
        error.message || "No se pudo cargar el perfil de la constructora.",
        initialize,
      );
    }
  }

  initialize().catch((error) => ViMod.showRetryError(
    document.getElementById("profile-form-feedback"),
    error.message || "No se pudo cargar el perfil de la constructora.",
    initialize,
  ));
})();
