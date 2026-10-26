let pendingConstructora = null;
let availableServices = [];
let approvedContractors = [];
let selectedContractorIds = new Set();
let selectedProposal = null;
let currentProjectName = "";
let serviceSearch = "";
let quoteRequestInProgress = false;
const params = new URLSearchParams(window.location.search);
const proyectoId = params.get("proyecto");

function escapeCatalog(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function formatMoney(n) {
  return ViMod.formatMoney(n);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function selectedFilters() {
  return {
    type: document.getElementById("filter-type").value,
    category: document.getElementById("filter-category").value,
    minPrice: document.getElementById("filter-min-price").value.trim(),
    maxPrice: document.getElementById("filter-max-price").value.trim(),
    contractorId: document.getElementById("filter-contractor").value,
    availability: document.getElementById("filter-availability").value,
  };
}

function filterUrl() {
  const query = new URLSearchParams();
  Object.entries(selectedFilters()).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const queryString = query.toString();
  return "/services" + (queryString ? "?" + queryString : "");
}

function renderFilterOptions() {
  const categorySelect = document.getElementById("filter-category");
  const contractorSelect = document.getElementById("filter-contractor");
  const previousCategory = categorySelect.value;
  const previousContractor = contractorSelect.value;
  const categories = [...new Set(availableServices.map((service) => service.category))].sort();
  categorySelect.innerHTML = '<option value="">Todas</option>' + categories.map((category) =>
    '<option value="' + escapeCatalog(category) + '">' + escapeCatalog(category) + '</option>').join("");
  contractorSelect.innerHTML = '<option value="">Todas</option>' + approvedContractors.map((contractor) =>
    '<option value="' + escapeCatalog(contractor.id) + '">' +
      escapeCatalog(contractor.profile.commercialName) + '</option>').join("");
  if (categories.includes(previousCategory)) categorySelect.value = previousCategory;
  if (approvedContractors.some((contractor) => contractor.id === previousContractor)) {
    contractorSelect.value = previousContractor;
  }
}

function renderServices(services) {
  const list = document.getElementById("available-services");
  if (!list) return;
  if (!services.length) {
    list.innerHTML = '<div class="col-span-full rounded-xl border border-dashed border-outline-variant p-8 text-center text-on-surface-variant">Aún no hay servicios comerciales publicados por constructoras aprobadas.</div>';
    return;
  }
  const query = serviceSearch.trim().toLocaleLowerCase("es-CO");
  const matchingServices = services.filter((service) => !query || [
    service.name,
    service.category,
    service.description,
    service.contractorName,
    service.estimatedTime,
  ].some((value) => String(value || "").toLocaleLowerCase("es-CO").includes(query)));
  if (!matchingServices.length) {
    list.innerHTML = '<div class="col-span-full rounded-xl border border-dashed border-outline-variant p-8 text-center text-on-surface-variant">No hay servicios que coincidan con la búsqueda.</div>';
    return;
  }
  list.innerHTML = matchingServices.map((service) => {
    const price = service.price == null
      ? "Precio no especificado"
      : "Precio indicativo: " + formatMoney(service.price) + " por " + service.unit;
    return '<article class="flex flex-col justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm"><div><span class="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-on-primary-fixed-variant">' + escapeCatalog(service.type) + ' publicado</span><p class="mt-4 text-xs font-bold uppercase tracking-wide text-outline">' +
      escapeCatalog(service.category) + '</p><h2 class="mt-2 font-headline text-xl font-bold text-on-surface">' +
      escapeCatalog(service.name) + '</h2><p class="mt-2 text-sm text-on-surface-variant">' +
      escapeCatalog(service.description) + '</p><p class="mt-4 text-sm font-semibold text-on-surface">' +
      escapeCatalog(service.contractorName) + ' · ' + escapeCatalog(service.availability) +
      (service.contractorProfile && service.contractorProfile.demo ? ' · Datos de demostración' : '') + '</p><p class="mt-1 text-xs text-on-surface-variant">' +
      escapeCatalog(service.estimatedTime || "Plazo no especificado") + '</p><p class="mt-3 text-xs text-on-surface-variant">' +
      escapeCatalog(price) + '</p><button type="button" class="mt-3 text-left text-sm font-semibold text-primary underline" data-open-profile="' + escapeCatalog(service.ownerId) + '">Ver perfil de la constructora</button></div><button type="button" class="rounded-lg bg-primary px-4 py-3 font-bold text-on-primary" data-vimod-action="open-quote" data-constructora-id="' +
      escapeCatalog(service.ownerId) + '" data-constructora-nombre="' + escapeCatalog(service.contractorName) +
      '" data-service-id="' + escapeCatalog(service.id) + '" data-service-name="' + escapeCatalog(service.name) +
      '">Solicitar cotización</button></article>';
  }).join("");
  list.querySelectorAll('[data-vimod-action="open-quote"]').forEach((button) => {
    button.disabled = !proyectoId || !selectedProposal;
    button.addEventListener("click", () => openQuoteModal(button));
  });
  list.querySelectorAll("[data-open-profile]").forEach((button) => {
    button.addEventListener("click", () => openContractorProfile(button.dataset.openProfile));
  });
}

function renderContractors(contractors) {
  const list = document.getElementById("approved-contractors");
  if (!list) return;
  if (!contractors.length) {
    list.innerHTML = '<p class="text-sm text-on-surface-variant">No hay constructoras aprobadas para mostrar.</p>';
    return;
  }
  list.innerHTML = contractors.map((contractor) =>
    '<article class="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5">' +
      '<label class="flex items-center gap-2 text-sm"><input type="checkbox" data-select-contractor="' + escapeCatalog(contractor.id) + '" ' +
      (selectedContractorIds.has(contractor.id) ? "checked " : "") + (!proyectoId || !selectedProposal ? "disabled " : "") +
      '>Solicitar cotización</label>' +
      '<h3 class="font-headline text-lg font-bold">' + escapeCatalog(contractor.profile.commercialName) +
      (contractor.profile.demo ? ' <span class="text-xs font-semibold text-outline">· Datos de demostración</span>' : '') + '</h3>' +
      '<p class="mt-2 text-sm text-on-surface-variant">' + escapeCatalog(contractor.profile.coverageZone) + '</p>' +
      '<button type="button" data-open-profile="' + escapeCatalog(contractor.id) + '" class="mt-3 text-sm font-semibold text-primary underline">Abrir perfil</button></article>'
  ).join("");
  list.querySelectorAll("[data-open-profile]").forEach((button) => {
    button.addEventListener("click", () => openContractorProfile(button.dataset.openProfile));
  });
  list.querySelectorAll("[data-select-contractor]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedContractorIds.add(checkbox.dataset.selectContractor);
      else selectedContractorIds.delete(checkbox.dataset.selectContractor);
      updateSelectedContractorButton();
    });
  });
  updateSelectedContractorButton();
}

function updateSelectedContractorButton() {
  const button = document.getElementById("request-selected-contractors");
  if (button) button.disabled = !proyectoId || !selectedProposal || selectedContractorIds.size === 0;
}

async function openContractorProfile(contractorId) {
  const dialog = document.getElementById("contractor-profile-dialog");
  const error = document.getElementById("contractor-profile-error");
  if (error) {
    error.replaceChildren();
    error.classList.add("hidden");
  }
  try {
    const result = await ViModApi.get("/contractors/" + encodeURIComponent(contractorId));
    const profile = result.profile;
    document.getElementById("contractor-profile-name").textContent = profile.commercialName;
    document.getElementById("contractor-profile-description").textContent = profile.description;
    document.getElementById("contractor-profile-zone").textContent = profile.coverageZone;
    document.getElementById("contractor-profile-contact").textContent = profile.contact;
    dialog.showModal();
  } catch (error) {
    ViMod.showRetryError(
      document.getElementById("contractor-profile-error"),
      error.message || "No se pudo cargar el perfil de la constructora.",
      () => openContractorProfile(contractorId),
    );
    if (dialog && !dialog.open) dialog.showModal();
  }
}

async function loadServices() {
  const target = document.getElementById("available-services");
  const error = document.getElementById("catalog-error");
  if (error) {
    error.replaceChildren();
    error.classList.add("hidden");
  }
  if (target) target.innerHTML = '<p class="col-span-full text-sm text-on-surface-variant">Cargando servicios publicados…</p>';
  const result = await ViModApi.get(filterUrl());
  availableServices = result.services || [];
  renderFilterOptions();
  renderServices(availableServices);
}

async function loadContractors() {
  const list = document.getElementById("approved-contractors");
  if (list) list.innerHTML = '<p class="col-span-full text-sm text-on-surface-variant">Cargando constructoras...</p>';
  const result = await ViModApi.get("/contractors");
  approvedContractors = result.contractors || [];
  const count = document.getElementById("approved-contractor-count");
  if (count) count.textContent = approvedContractors.length + " constructoras aprobadas";
  renderFilterOptions();
  renderContractors(approvedContractors);
}

async function loadProjectHeader() {
  const loadError = document.getElementById("project-load-error");
  if (loadError) {
    loadError.replaceChildren();
    loadError.classList.add("hidden");
  }
  await Storage.whenReady();
  const user = Storage.getCurrentUser();
  const userName = document.getElementById("current-user-name");
  if (userName) userName.textContent = user && user.nombre ? user.nombre : "Usuario";
  const nameEl = document.getElementById("active-project-name");
  const paramsEl = document.getElementById("active-project-params");
  if (!proyectoId) {
    if (nameEl) nameEl.textContent = "Sin proyecto";
    updateSelectedContractorButton();
    renderServices(availableServices);
    return;
  }
  try {
    const proyecto = await Storage.fetchProjectById(proyectoId);
    currentProjectName = proyecto.nombre || "Proyecto";
    if (nameEl) nameEl.textContent = currentProjectName;
    const modalProjectName = document.getElementById("modal-project-name");
    if (modalProjectName) modalProjectName.textContent = currentProjectName;
    const result = await ViModApi.get("/projects/" + encodeURIComponent(proyectoId) + "/selected-proposal");
    selectedProposal = result.proposal;
    if (paramsEl) {
      paramsEl.textContent = selectedProposal
        ? `${selectedProposal.estimate.areaM2} m² · ${selectedProposal.name}`
        : "Selecciona una propuesta";
    }
    const modalContext = document.getElementById("quote-modal-context");
    if (modalContext) modalContext.textContent = selectedProposal
      ? `${currentProjectName} · ${selectedProposal.name}`
      : "Selecciona una propuesta vigente desde el proyecto antes de solicitar cotizaciones.";
    updateSelectedContractorButton();
    renderServices(availableServices);
    renderContractors(approvedContractors);
  } catch (error) {
    if (nameEl) nameEl.textContent = "Proyecto no disponible";
    ViMod.showRetryError(
      loadError,
      error.message || "No se pudo cargar el proyecto.",
      loadProjectHeader,
    );
  }
}

async function renderQuotes() {
  const list = document.getElementById("quotes-list");
  if (!list || !proyectoId) return;
  try {
    const result = await ViModApi.get("/projects/" + encodeURIComponent(proyectoId) + "/quotes");
    const quotes = result.quotes || [];
    if (!quotes.length) {
      list.innerHTML = '<p class="font-body-sm text-on-surface-variant">Aún no hay cotizaciones solicitadas para este proyecto.</p>';
      return;
    }
    const statusLabels = {
      requested: "Esperando cotización",
      responded: "Cotización recibida",
      accepted: "Aceptada",
      rejected: "Rechazada",
      expired: "Vencida",
    };
    list.innerHTML = quotes.map((quote) => {
      const response = quote.response ? `<div class="mt-3 space-y-2">
        <div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr><th>Concepto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead>
        <tbody>${(quote.response.items || []).map((item) => `<tr><td>${escapeCatalog(item.concept)}</td><td>${escapeCatalog(item.quantity)}</td><td>${formatMoney(item.unitPrice)}</td><td>${formatMoney(item.subtotal)}</td></tr>`).join("")}</tbody></table></div>
        <p class="font-semibold text-primary">Total: ${formatMoney(quote.response.amount)}</p>
        <p class="text-sm text-on-surface-variant">Plazo: ${escapeCatalog(quote.response.estimatedDays)} días · Vigente hasta: ${formatDate(quote.response.validUntil)}</p>
        <p class="text-sm text-on-surface-variant">${escapeCatalog(quote.response.message || "Sin notas de alcance.")}</p>
        ${quote.status === "responded" ? `<div class="flex gap-2"><button type="button" data-accept-quote="${escapeCatalog(quote.id)}" class="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-on-primary">Aceptar</button><button type="button" data-reject-quote="${escapeCatalog(quote.id)}" class="rounded-lg border px-3 py-2 text-sm font-bold">Rechazar</button></div>` : ""}
      </div>` : "";
      return `<article class="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4"><div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-bold">${escapeCatalog(quote.contractorName || "Constructora")}</h3><span class="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold">${statusLabels[quote.status] || escapeCatalog(quote.status)}</span></div><p class="mt-1 text-xs text-on-surface-variant">Solicitud ${formatDate(quote.createdAt)}${quote.serviceName ? " · " + escapeCatalog(quote.serviceName) : ""}</p><p class="mt-2 text-sm text-on-surface-variant">${escapeCatalog(quote.notes || "")}</p>${response}</article>`;
    }).join("");
    list.querySelectorAll("[data-accept-quote]").forEach((button) => {
      button.addEventListener("click", () => decideQuote(button.dataset.acceptQuote, "accept"));
    });
    list.querySelectorAll("[data-reject-quote]").forEach((button) => {
      button.addEventListener("click", () => decideQuote(button.dataset.rejectQuote, "reject"));
    });
  } catch (error) {
    ViMod.showRetryError(
      list,
      error.message || "No se pudieron cargar las cotizaciones.",
      renderQuotes,
    );
  }
}

async function decideQuote(quoteId, decision) {
  const path = "/projects/" + encodeURIComponent(proyectoId) + "/quotes/" +
    encodeURIComponent(quoteId) + "/" + decision;
  try {
    await ViModApi.post(path, {});
    await renderQuotes();
  } catch (error) {
    window.alert(error.message);
  }
}

function openQuoteModal(button) {
  if (button) {
    pendingConstructora = {
      id: button.getAttribute("data-constructora-id"),
      nombre: button.getAttribute("data-constructora-nombre"),
      serviceId: button.getAttribute("data-service-id"),
      serviceName: button.getAttribute("data-service-name"),
    };
  }
  const target = document.getElementById("target-contractor");
  if (target) target.textContent = pendingConstructora.nombre || "Constructoras seleccionadas";
  const feedback = document.getElementById("quote-request-feedback");
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.add("hidden");
  }
  document.getElementById("quote-notes").value = "";
  const confirmButton = document.querySelector('[data-vimod-action="confirm-quote"]');
  if (confirmButton) confirmButton.disabled = !proyectoId || !selectedProposal;
  const modal = document.getElementById("modal-backdrop");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeQuoteModal() {
  const modal = document.getElementById("modal-backdrop");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

async function confirmQuote() {
  if (!proyectoId || !selectedProposal) {
    const feedback = document.getElementById("quote-request-feedback");
    feedback.textContent = !proyectoId
      ? "Abre esta pantalla desde un proyecto para solicitar cotizaciones."
      : "Selecciona una propuesta vigente antes de continuar.";
    feedback.classList.remove("hidden");
    return;
  }
  if (!pendingConstructora || quoteRequestInProgress) return;
  quoteRequestInProgress = true;
  const confirmButton = document.querySelector('[data-vimod-action="confirm-quote"]');
  if (confirmButton) confirmButton.disabled = true;
  try {
    const body = {
      notes: document.getElementById("quote-notes").value.trim(),
      proposalId: selectedProposal.id,
    };
    if (pendingConstructora.serviceId) {
      body.constructorId = pendingConstructora.id;
      body.serviceId = pendingConstructora.serviceId;
    } else {
      body.constructorIds = pendingConstructora.ids || [pendingConstructora.id];
    }
    await ViModApi.post("/projects/" + encodeURIComponent(proyectoId) + "/quotes", body);
    selectedContractorIds.clear();
    renderContractors(approvedContractors);
    closeQuoteModal();
    await renderQuotes();
  } catch (error) {
    const feedback = document.getElementById("quote-request-feedback");
    feedback.textContent = error.message;
    feedback.classList.remove("hidden");
  } finally {
    quoteRequestInProgress = false;
    if (confirmButton) confirmButton.disabled = false;
  }
}

const serviceSearchInput = document.getElementById("service-search");
if (serviceSearchInput) serviceSearchInput.addEventListener("input", () => {
  serviceSearch = serviceSearchInput.value;
  renderServices(availableServices);
});

function showCatalogError(error) {
  const message = document.getElementById("catalog-error");
  ViMod.showRetryError(
    message,
    error.message || "No se pudieron cargar los servicios.",
    loadServices,
  );
}

function showContractorsError(error) {
  const list = document.getElementById("approved-contractors");
  ViMod.showRetryError(
    list,
    error.message || "No se pudieron cargar las constructoras.",
    loadContractors,
  );
}

["filter-type", "filter-category", "filter-min-price", "filter-max-price", "filter-contractor", "filter-availability"]
  .forEach((id) => document.getElementById(id).addEventListener("change", () => {
    loadServices().catch(showCatalogError);
  }));
["filter-min-price", "filter-max-price"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => loadServices().catch(showCatalogError));
});
document.getElementById("close-contractor-profile").addEventListener("click", () => {
  document.getElementById("contractor-profile-dialog").close();
});
document.querySelectorAll('[data-vimod-action="close-quote"]').forEach((button) => {
  button.addEventListener("click", closeQuoteModal);
});
document.querySelector('[data-vimod-action="confirm-quote"]').addEventListener("click", confirmQuote);
document.getElementById("request-selected-contractors").addEventListener("click", () => {
  const chosen = approvedContractors.filter((contractor) => selectedContractorIds.has(contractor.id));
  pendingConstructora = {
    ids: chosen.map((contractor) => contractor.id),
    nombre: chosen.map((contractor) => contractor.profile.commercialName).join(", "),
  };
  openQuoteModal();
});

loadProjectHeader().catch((error) => {
  ViMod.showRetryError(
    document.getElementById("project-load-error"),
    error.message || "No se pudo cargar el proyecto.",
    loadProjectHeader,
  );
});
loadServices().catch((error) => {
const target = document.getElementById("available-services");
if (target) target.innerHTML = '<p class="col-span-full text-error">' + escapeCatalog(error.message) + '</p>';
});
loadContractors().catch(showContractorsError);
renderQuotes();
