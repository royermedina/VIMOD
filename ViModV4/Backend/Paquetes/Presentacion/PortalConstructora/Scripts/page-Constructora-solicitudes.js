let currentFilter = "todas";
let currentSolicitudId = null;
let currentSearch = "";
let solicitudes = [];
let contractorId = null;

function formatMoney(amount) {
  return ViMod.formatMoney(amount);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

function dateAfterDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createLineItem() {
  const row = document.createElement("div");
  row.className = "grid grid-cols-1 gap-2 rounded-lg border border-outline-variant/30 p-3 sm:grid-cols-4";
  row.dataset.quoteItem = "";
  row.innerHTML = '<input class="rounded border border-outline-variant/50 p-2 text-sm" data-concept placeholder="Concepto" maxlength="120" required />' +
    '<input class="rounded border border-outline-variant/50 p-2 text-sm" data-quantity type="number" min="0.01" step="0.01" placeholder="Cantidad" required />' +
    '<input class="rounded border border-outline-variant/50 p-2 text-sm" data-unit-price type="number" min="0.01" step="0.01" placeholder="Precio unitario COP" required />' +
    '<button class="rounded border px-2 py-1 text-sm" data-remove-item type="button">Quitar</button>';
  row.querySelector("[data-remove-item]").addEventListener("click", () => {
    row.remove();
    updateLineItemButtons();
  });
  return row;
}

function updateLineItemButtons() {
  const rows = document.querySelectorAll("#quote-items [data-quote-item]");
  rows.forEach((row) => {
    row.querySelector("[data-remove-item]").disabled = rows.length === 1;
  });
}

function filtered() {
  const search = currentSearch.trim().toLocaleLowerCase("es-CO");
  return solicitudes.filter((quote) => {
    const statusMatches = currentFilter === "todas"
      || (currentFilter === "nuevas"
        ? quote.status === "requested"
        : quote.status !== "requested");
    const searchMatches = !search || [
      quote.project && quote.project.nombre,
      quote.clientName,
      quote.serviceName,
      quote.proposal && quote.proposal.nombre,
    ].some((value) => String(value || "").toLocaleLowerCase("es-CO").includes(search));
    return statusMatches && searchMatches;
  });
}

function updateFilterCounts() {
  const counts = {
    todas: solicitudes.length,
    nuevas: solicitudes.filter((quote) => quote.status === "requested").length,
    respondidas: solicitudes.filter((quote) => quote.status !== "requested").length,
  };
  Object.entries(counts).forEach(([status, count]) => {
    const element = document.getElementById("filter-count-" + status);
    if (element) element.textContent = String(count);
  });
}

function renderList() {
  const list = document.getElementById("requests-list");
  const items = filtered();
  updateFilterCounts();
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<p class="font-body text-sm text-on-surface-variant">' +
      (currentSearch.trim()
        ? "No hay solicitudes que coincidan con la búsqueda."
        : "No hay solicitudes para mostrar.") + '</p>';
    if (!currentSolicitudId || !solicitudes.some((item) => item.id === currentSolicitudId)) {
      clearRequestDetails();
    }
    return;
  }
  list.innerHTML = items.map((quote) => {
    const project = quote.project || {};
    const selected = currentSolicitudId === quote.id;
    const responded = quote.status !== "requested";
    const statusLabels = {
      requested: "Nueva",
      responded: "Respondida",
      accepted: "Aceptada",
      rejected: "Rechazada",
      expired: "Vencida",
    };
    const amount = quote.response ? formatMoney(quote.response.amount) : "Importe pendiente";
    return '<button type="button" data-sol="' + ViMod.escapeHtml(quote.id) +
      '" class="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5 text-left shadow-sm ' +
      (selected ? "ring-2 ring-primary" : "") + '"><span class="text-xs font-bold uppercase">' +
      (statusLabels[quote.status] || quote.status) + '</span><h2 class="mt-2 font-headline text-lg font-bold">' +
      ViMod.escapeHtml(project.nombre || "Proyecto") + '</h2><p class="mt-1 text-sm text-on-surface-variant">Cliente: ' +
      ViMod.escapeHtml(quote.clientName || "Cliente") + ' · ' + formatDate(quote.createdAt) +
      '</p><p class="mt-3 font-bold text-primary">' + amount + '</p></button>';
  }).join("");
  list.querySelectorAll("[data-sol]").forEach((button) => button.addEventListener("click", () => selectRequest(button.dataset.sol)));
}

function assignDetail(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) element.textContent = value;
}

function clearRequestDetails() {
  currentSolicitudId = null;
  assignDetail("detail-project-name", "Selecciona una solicitud");
  assignDetail("detail-client", "—");
  assignDetail("detail-terreno", "—");
  assignDetail("detail-presupuesto", "—");
  assignDetail("detail-modulos", "—");
  assignDetail("detail-propuesta", "—");
  assignDetail("detail-request-reference", "Sin solicitud seleccionada");
  ["lead-time", "valid-until", "notes"].forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });
  const notice = document.getElementById("submit-alert");
  if (notice) notice.classList.add("hidden");
  const items = document.getElementById("quote-items");
  if (items) {
    items.innerHTML = "";
    items.appendChild(createLineItem());
  }
  const error = document.getElementById("quote-form-error");
  if (error) error.textContent = "";
  const replacementNote = document.getElementById("replacement-note");
  if (replacementNote) replacementNote.classList.add("hidden");
  const submit = document.getElementById("submit-btn");
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Selecciona una solicitud";
  }
}

function selectRequest(id) {
  currentSolicitudId = id;
  const quote = solicitudes.find((item) => item.id === id);
  renderList();
  if (!quote) {
    clearRequestDetails();
    return;
  }
  const notice = document.getElementById("submit-alert");
  if (notice) notice.classList.add("hidden");
  const project = quote.project || {};
  const selectedProposal = quote.proposal || {};
  const terrain = project.terrain;
  assignDetail("detail-project-name", project.nombre || "Proyecto");
  assignDetail("detail-client", quote.clientName || "—");
  assignDetail("detail-request-reference", "Solicitud · " + quote.id);
  assignDetail("detail-terreno", terrain
    ? `${terrain.ancho} × ${terrain.largo} m · ${terrain.ubicacion}`
    : "Datos del terreno no disponibles");
  assignDetail("detail-presupuesto", project.presupuesto == null
    ? "No especificado"
    : formatMoney(project.presupuesto));
  assignDetail("detail-modulos", selectedProposal.estimate
    ? `${selectedProposal.estimate.areaM2} m² · ${project.habitaciones ?? "—"} hab. · ${project.banos ?? "—"} baños`
    : "Sin propuesta seleccionada");
  assignDetail("detail-propuesta", selectedProposal.nombre
    ? `${selectedProposal.nombre}${selectedProposal.descripcion ? " · " + selectedProposal.descripcion : ""}`
    : "Sin propuesta seleccionada");
  const days = document.getElementById("lead-time");
  const notes = document.getElementById("notes");
  if (days) days.value = "";
  if (notes) notes.value = "";
  const validity = document.getElementById("valid-until");
  if (validity) validity.value = dateAfterDays(30);
  const items = document.getElementById("quote-items");
  if (items) {
    items.innerHTML = "";
    items.appendChild(createLineItem());
  }
  const error = document.getElementById("quote-form-error");
  if (error) error.textContent = "";
  const submit = document.getElementById("submit-btn");
  if (submit) {
    submit.disabled = !["requested", "responded"].includes(quote.status);
    submit.textContent = quote.status === "responded"
      ? "Enviar nueva y reemplazar la anterior"
      : quote.status === "requested" ? "Enviar cotización" : "Cotización cerrada";
  }
  const replacementNote = document.getElementById("replacement-note");
  if (replacementNote) replacementNote.classList.toggle("hidden", quote.status !== "responded");
}

function filterRequests(status, element) {
  currentFilter = status;
  document.querySelectorAll(".filter-btn").forEach((button) => {
    button.classList.remove("bg-primary", "text-on-primary", "font-semibold", "shadow-sm");
    button.classList.add("text-on-surface-variant", "font-medium");
  });
  if (element) {
    element.classList.add("bg-primary", "text-on-primary", "font-semibold", "shadow-sm");
    element.classList.remove("text-on-surface-variant", "font-medium");
  }
  renderList();
  syncSelectedRequestWithFilter();
}

function syncSelectedRequestWithFilter() {
  const visible = filtered();
  if (!visible.some((quote) => quote.id === currentSolicitudId)) {
    if (visible.length) selectRequest(visible[0].id);
    else clearRequestDetails();
  }
}

function getSelectedRequest() {
  return solicitudes.find((item) => item.id === currentSolicitudId) || null;
}

async function handleQuoteSubmit(event) {
  event.preventDefault();
  const quote = getSelectedRequest();
  if (!quote || !["requested", "responded"].includes(quote.status)) {
    showQuoteFormError("Selecciona una solicitud abierta para responder.");
    return;
  }
  const rows = [...document.querySelectorAll("#quote-items [data-quote-item]")];
  const items = rows.map((row) => ({
    concept: row.querySelector("[data-concept]").value.trim(),
    quantity: Number(row.querySelector("[data-quantity]").value),
    unitPrice: Number(row.querySelector("[data-unit-price]").value),
  }));
  const estimatedDays = Number(document.getElementById("lead-time").value);
  const validUntil = document.getElementById("valid-until").value;
  if (!items.length || items.some((item) => !item.concept || !Number.isFinite(item.quantity)
    || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
    showQuoteFormError("Completa cada partida con concepto, cantidad y precio unitario positivos.");
    return;
  }
  if (!Number.isInteger(estimatedDays) || estimatedDays < 1 || estimatedDays > 3650) {
    showQuoteFormError("El plazo debe ser un número entero de días entre 1 y 3650.");
    return;
  }
  const validityDate = new Date(validUntil + "T23:59:59");
  if (!validUntil || !Number.isFinite(validityDate.getTime()) || validityDate <= new Date()) {
    showQuoteFormError("La vigencia debe ser una fecha futura.");
    return;
  }
  const button = document.getElementById("submit-btn");
  if (button) button.disabled = true;
  showQuoteFormError("");
  try {
    await ViModApi.patch("/contractor/quotes/" + encodeURIComponent(quote.id), {
      items,
      currency: "COP",
      estimatedDays,
      validUntil: validityDate.toISOString(),
      message: document.getElementById("notes").value.trim(),
    });
    await loadQuotes();
    const notice = document.getElementById("submit-alert");
    if (notice) {
      notice.textContent = quote.status === "responded"
        ? "La nueva cotización reemplazó la anterior."
        : `Cotización enviada a ${quote.clientName || "el cliente"}.`;
      notice.classList.remove("hidden");
    }
  } catch (error) {
    showQuoteFormError(error.message);
    if (button) button.disabled = false;
  }
}

function showQuoteFormError(message) {
  const error = document.getElementById("quote-form-error");
  if (!error) return;
  error.textContent = message;
  error.classList.toggle("hidden", !message);
}

async function loadQuotes() {
  if (!contractorId) {
    showQuoteLoadError("Inicia sesión con una cuenta de constructora aprobada.");
    return false;
  }
  const list = document.getElementById("requests-list");
  if (list) {
    list.setAttribute("aria-busy", "true");
    list.innerHTML = '<p class="text-sm text-on-surface-variant" role="status">Cargando solicitudes…</p>';
  }
  let result;
  try {
    result = await ViModApi.get("/contractor/quotes");
  } catch (error) {
    if (list) list.setAttribute("aria-busy", "false");
    showQuoteLoadError(error.message);
    return false;
  }
  if (list) list.setAttribute("aria-busy", "false");
  solicitudes = result.quotes || [];
  renderList();
  const visibleRequests = filtered();
  const selectedStillVisible = visibleRequests.some((item) => item.id === currentSolicitudId);
  if (selectedStillVisible) selectRequest(currentSolicitudId);
  else if (visibleRequests.length) selectRequest(visibleRequests[0].id);
  else clearRequestDetails();
  return true;
}

function showQuoteLoadError(message, retry) {
  clearRequestDetails();
  const list = document.getElementById("requests-list");
  if (!list) return;
  list.innerHTML = '<div class="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert"><p>' +
    ViMod.escapeHtml(message) +
    '</p><button id="retry-quotes" type="button" class="rounded border border-red-300 px-3 py-2 font-semibold">Reintentar</button></div>';
  document.getElementById("retry-quotes").addEventListener("click", retry || loadQuotes);
}

async function loadOfferOpportunities() {
  const list = document.getElementById("offer-projects-list");
  const ownList = document.getElementById("own-offers-list");
  if (!list || !ownList) return;
  try {
    const [projectsResult, offersResult] = await Promise.all([
      ViModApi.get("/contractor/offer-projects"),
      ViModApi.get("/contractor/offers"),
    ]);
    const projects = projectsResult.projects || [];
    list.innerHTML = projects.length ? projects.map((project) => '<article class="rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3"><h4 class="font-semibold">' + ViMod.escapeHtml(project.nombre) + '</h4><p class="mt-1 text-xs text-on-surface-variant">' + formatMoney(project.presupuesto) + ' · ' + project.habitaciones + ' hab. · ' + project.banos + ' baños · ' + (project.terrain ? project.terrain.area + ' m²' : 'terreno no disponible') + '</p><form data-offer-project="' + ViMod.escapeHtml(project.id) + '" class="mt-3 grid gap-2"><input name="precio" type="number" min="1" step="1" required placeholder="Precio COP" class="rounded border p-2 text-sm" /><input name="plazoDias" type="number" min="1" max="3650" required placeholder="Plazo en días" class="rounded border p-2 text-sm" /><input name="inclusiones" required maxlength="500" placeholder="Inclusiones separadas por coma" class="rounded border p-2 text-sm" /><button type="submit" class="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-on-primary">Enviar oferta</button></form></article>').join('') : '<p class="text-sm text-on-surface-variant">No hay proyectos abiertos a ofertas.</p>';
    const offers = (offersResult.offers || []).map((offer) =>
      '<article class="rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3"><p class="font-semibold">' +
      ViMod.escapeHtml(offer.project && offer.project.nombre || 'Proyecto') + '</p><p class="text-sm text-on-surface-variant">' +
      formatMoney(offer.precio) + ' · ' + offer.plazoDias + ' días · ' + ViMod.escapeHtml(offer.estado) +
      '</p>' + (offer.estado === 'enviada'
        ? '<button type="button" data-withdraw-offer="' + ViMod.escapeHtml(offer.id) + '" class="mt-2 rounded border px-3 py-1 text-xs font-semibold">Retirar</button>'
        : '') + '</article>');
    const contractedProjects = (offersResult.contractedProjects || []).map((project) =>
      '<article class="rounded-lg border border-primary/30 bg-primary/10 p-3"><p class="font-semibold">' +
      ViMod.escapeHtml(project.nombre) + '</p><p class="text-sm text-on-surface-variant">Proyecto contratado · ' +
      formatMoney(project.amount) + ' COP · ' + (project.proposalName
        ? ViMod.escapeHtml(project.proposalName) : 'Oferta de constructora') +
      '</p></article>');
    ownList.innerHTML = offers.length || contractedProjects.length
      ? contractedProjects.concat(offers).join('')
      : '<p class="text-sm text-on-surface-variant">Aún no tienes ofertas ni proyectos contratados.</p>';
    list.querySelectorAll('[data-offer-project]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try { await ViModApi.post('/contractor/offers/' + encodeURIComponent(form.dataset.offerProject), { precio: Number(data.get('precio')), plazoDias: Number(data.get('plazoDias')), inclusiones: String(data.get('inclusiones')).split(',') }); await loadOfferOpportunities(); } catch (error) { alert(error.message); button.disabled = false; }
    }));
    ownList.querySelectorAll('[data-withdraw-offer]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await ViModApi.patch('/contractor/offers/' + encodeURIComponent(button.dataset.withdrawOffer) + '/withdraw', {}); await loadOfferOpportunities(); } catch (error) { alert(error.message); button.disabled = false; }
    }));
  } catch (error) {
    list.innerHTML = '<p class="text-sm text-error">' + ViMod.escapeHtml(error.message) + '</p>';
  }
}

async function initializeQuotes() {
  await Storage.whenReady();
  const user = Storage.getCurrentUser();
  contractorId = user && user.rol === "constructora" ? user.id : null;
  const identity = document.getElementById("contractor-identity");
  const sidebarIdentity = document.getElementById("contractor-sidebar-name");
  if (!contractorId) {
    showQuoteLoadError("Esta pantalla requiere una cuenta de constructora aprobada.");
    return;
  }
  try {
    const result = await ViModApi.get("/contractor/profile");
    const name = result.profile.commercialName;
    if (identity) identity.textContent = name;
    if (sidebarIdentity) sidebarIdentity.textContent = name;
  } catch (error) {
    showQuoteLoadError(error.message, initializeQuotes);
    return;
  }
  await loadQuotes();
  await loadOfferOpportunities();
}

const quoteSearch = document.getElementById("quote-search");
if (quoteSearch) quoteSearch.addEventListener("input", () => {
  currentSearch = quoteSearch.value;
  renderList();
  syncSelectedRequestWithFilter();
});

const quoteForm = document.getElementById("quote-form");
if (quoteForm) quoteForm.addEventListener("submit", handleQuoteSubmit);
const addQuoteItem = document.getElementById("add-quote-item");
if (addQuoteItem) addQuoteItem.addEventListener("click", () => {
  document.getElementById("quote-items").appendChild(createLineItem());
  updateLineItemButtons();
});

initializeQuotes().catch((error) => showQuoteLoadError(error.message, initializeQuotes));
