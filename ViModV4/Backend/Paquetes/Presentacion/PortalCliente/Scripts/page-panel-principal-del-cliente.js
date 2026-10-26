(function () {
  const proposalsMode =
    new URLSearchParams(window.location.search).get("vista") === "propuestas";
  const activeNavClasses = [
    "bg-primary",
    "text-on-primary",
    "font-semibold",
    "rounded-lg",
    "shadow-sm",
  ];
  const inactiveNavClasses = [
    "text-on-surface-variant",
    "hover:bg-surface-container",
    "hover:text-on-surface",
  ];

  const navItems = document.querySelectorAll("aside nav a[data-path]");
  const clientTargets = ["mis-terrenos", "mis-proyectos", "constructoras"];
let advisorProjects = [];

  navItems.forEach((item) => {
    const path = item.getAttribute("data-path");
    if ((path === "propuestas") === proposalsMode
      && (path === "propuestas" || path === "mis-proyectos")) {
      item.classList.remove(...inactiveNavClasses);
      item.classList.add(...activeNavClasses);
    } else if (clientTargets.includes(path)) {
      item.classList.add("font-medium", "text-on-surface");
    }
  });
})();

// Cargar datos del usuario y actualizar UI
async function loadUserData() {
  const proposalsMode =
    new URLSearchParams(window.location.search).get("vista") === "propuestas";
  const projectsHeading = document.getElementById("projects-heading");
  if (projectsHeading && proposalsMode) {
    projectsHeading.textContent = "Elige un proyecto para ver sus propuestas";
  }
  renderTerrainSummary(null);
  updateDashboardMetrics([], []);
  const initialProjectsGrid = document.getElementById("projects-grid");
  if (initialProjectsGrid) {
    initialProjectsGrid.classList.remove("vimod-hidden");
    initialProjectsGrid.innerHTML =
      '<p class="md:col-span-2 xl:col-span-4 text-sm text-on-surface-variant">Cargando proyectos...</p>';
  }
  await Storage.whenReady();
  const user = Storage.getCurrentUser();
  if (user) {
    let terrenos;
    let proyectos;
    try {
      [terrenos, proyectos] = await Promise.all([
        Storage.fetchTerrenos(),
        Storage.fetchProjects(),
      ]);
    } catch (error) {
      const projectsGrid = document.getElementById("projects-grid");
      if (projectsGrid) {
        ViMod.showRetryError(
          projectsGrid,
          error.message || "No se pudieron cargar los proyectos.",
          loadUserData,
        );
      }
      const terrainGrid = terrainSummaryGrid();
      if (terrainGrid) {
        ViMod.showRetryError(
          terrainGrid,
          error.message || "No se pudieron cargar los terrenos.",
          loadUserData,
        );
      }
      return;
    }

    // Actualizar saludo
    const greeting = document.getElementById("user-greeting");
    if (greeting) {
      greeting.textContent = `¡Hola, ${user.nombre}!`;
    }

    // Cargar terrenos del usuario
    const terrenosCount = terrenos.length;

    const proyectosCount = proyectos.length;
    advisorProjects = proyectos;
    populateAdvisorProjects();
    loadAdvisorRequests();
    renderTerrainSummary(terrenos);
    updateDashboardMetrics(terrenos, proyectos);

    const projectsGrid = document.getElementById("projects-grid");
    if (projectsGrid) {
      projectsGrid.classList.remove("vimod-hidden");
      projectsGrid.innerHTML = proyectos.length
        ? proyectos.map(function (proyecto) {
            const terreno = Storage.getTerrenoById(proyecto.terrenoId);
            const estado = proyecto.estado || "Borrador";
            const location = terreno ? terreno.ubicacion : "Terreno registrado";
            const isClosed = estado === "Cerrado" || estado === "Archivado";
            const projectUrl = ViModRoutes.page("projectDetail", { proyecto: proyecto.id });
            const proposalUrl = ViModRoutes.page("proposals", { proyecto: proyecto.id });
            const projectActions = proposalsMode
              ? `<a class="client-primary-action w-full text-center bg-primary text-on-primary px-space-16 py-space-12 rounded-lg font-label text-sm font-bold" href="${proposalUrl}">Ver propuestas</a>`
              : `<a class="client-secondary-action w-full text-center bg-surface-container text-on-surface px-space-16 py-space-10 rounded-lg font-label text-sm font-semibold" href="${projectUrl}">Ver detalles</a>
                <a class="client-primary-action w-full text-center bg-primary text-on-primary px-space-16 py-space-12 rounded-lg font-label text-sm font-bold" href="${projectUrl}&vista=trabajo">Trabajar el proyecto</a>`;
            return `<article class="bg-surface-container-lowest rounded-xl p-space-20 shadow-sm border border-outline-variant/30 flex flex-col justify-between gap-space-16">
              <div class="flex flex-col gap-space-12">
                <div class="relative h-32 rounded-lg overflow-hidden bg-surface-container flex items-center justify-center">
                  <span class="material-symbols-outlined text-5xl text-primary">${isClosed ? "task_alt" : "home_work"}</span>
                  <span class="absolute top-3 left-3 inline-flex items-center gap-space-4 px-space-12 py-space-4 rounded-full bg-surface-container text-on-surface-variant font-label text-xs font-semibold shadow-sm">${estado}</span>
                </div>
                <div>
                  <h3 class="font-headline text-lg text-on-surface font-bold truncate">${escapeProjectText(proyecto.nombre)}</h3>
                  <p class="font-body text-xs text-on-surface-variant flex items-center gap-space-4 mt-space-2"><span class="material-symbols-outlined text-sm text-outline">pin_drop</span>${escapeProjectText(location)}</p>
                </div>
                <div class="grid grid-cols-2 gap-space-8 bg-surface-container-low p-space-12 rounded-xl">
                  <div><span class="font-label text-xs text-outline uppercase font-semibold">Presupuesto</span><p class="font-body text-sm font-bold text-on-surface">${ViMod.formatMoney(proyecto.presupuesto || 0)}</p></div>
                  <div><span class="font-label text-xs text-outline uppercase font-semibold">Distribución</span><p class="font-body text-sm font-bold text-on-surface">${proyecto.habitaciones == null ? "Sin especificar" : proyecto.habitaciones + " hab."} · ${proyecto.banos == null ? "Sin especificar" : proyecto.banos + " baños"}</p></div>
                </div>
              </div>
              <div class="flex flex-col gap-space-8">${projectActions}</div>
            </article>`;
          }).join("")
        : '<p class="md:col-span-2 xl:col-span-4 text-sm text-on-surface-variant">Aún no tienes proyectos registrados.</p>';
    }

    console.log("Terrenos:", terrenosCount, "Proyectos:", proyectosCount);
  }
}

function terrainSummaryGrid() {
  const heading = Array.from(document.querySelectorAll("h2")).find(
    (item) => item.textContent.trim() === "Resumen de mis terrenos",
  );
  return heading && heading.closest("section")
    ? heading.closest("section").querySelector(".grid.grid-cols-1.lg\\:grid-cols-2")
    : null;
}

function renderTerrainSummary(terrenos) {
  const grid = terrainSummaryGrid();
  if (!grid) return;
  grid.classList.remove("vimod-hidden");
  grid.classList.add("vimod-scroll-list");

  if (terrenos === null) {
    grid.innerHTML =
      '<p class="text-sm text-on-surface-variant">Cargando terrenos...</p>';
    return;
  }

  grid.innerHTML = terrenos.length
    ? terrenos.map((terrain) => `<article class="bg-surface-container-lowest rounded-xl p-space-24 shadow-sm border border-outline-variant/30 hover:shadow-md transition-shadow flex flex-col justify-between gap-space-20">
        <div class="flex flex-col sm:flex-row gap-space-20">
          <div class="relative w-full sm:w-44 h-36 rounded-lg overflow-hidden bg-surface-container shrink-0 flex items-center justify-center">
            <span class="material-symbols-outlined text-5xl text-primary">terrain</span>
            <span class="absolute top-2 left-2 px-space-8 py-space-2 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm">Registrado</span>
          </div>
          <div class="flex flex-col justify-between flex-1 gap-space-12 min-w-0">
            <div>
              <h3 class="font-headline text-lg text-on-surface font-bold truncate">${escapeProjectText(terrain.ubicacion || "Sin ubicación")}</h3>
              <p class="font-body text-xs text-on-surface-variant flex items-center gap-space-4 mt-space-2"><span class="material-symbols-outlined text-base text-outline">location_on</span>${escapeProjectText(terrain.ubicacion || "")}</p>
            </div>
            <div class="flex items-center gap-space-16 p-space-12 rounded-xl bg-surface-container-low">
              <div class="flex flex-col"><span class="font-label text-xs text-outline uppercase font-semibold">Superficie</span><span class="font-headline text-lg text-on-surface font-bold">${Number(terrain.area || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })} m²</span></div>
              <div class="w-1 h-8 bg-outline-variant/40 rounded-full"></div>
              <div class="flex flex-col"><span class="font-label text-xs text-outline uppercase font-semibold">Medidas</span><span class="font-label text-sm text-primary font-bold">${Number(terrain.ancho).toLocaleString("es-CO")} m × ${Number(terrain.largo).toLocaleString("es-CO")} m</span></div>
            </div>
          </div>
        </div>
        <button type="button" data-delete-terrain="${escapeProjectText(terrain.id)}" class="client-secondary-action self-start px-space-12 py-space-8 text-sm text-error">Eliminar terreno</button>
      </article>`).join("")
    : '<p class="text-sm text-on-surface-variant">Todavía no tienes terrenos registrados.</p>';
  grid.querySelectorAll("[data-delete-terrain]").forEach((button) => {
    button.addEventListener("click", async function () {
      if (!confirm("¿Eliminar este terreno?")) return;
      button.disabled = true;
      try {
        await Storage.deleteRemoteTerrain(button.dataset.deleteTerrain);
        await loadUserData();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });
}

function updateDashboardMetrics(terrenos, proyectos) {
  const totalArea = terrenos.reduce((total, terrain) => total + Number(terrain.area || 0), 0);
  const areaLabel = Array.from(document.querySelectorAll("span")).find(
    (item) => item.textContent.trim() === "Superficie total",
  );
  const metrics = areaLabel && areaLabel.closest("section")
    ? areaLabel.closest("section").querySelectorAll(":scope > div")
    : [];
  if (metrics.length >= 3) {
    const areaValue = metrics[0].querySelector(".font-headline.text-3xl");
    const terrainCount = metrics[0].querySelector(".font-body");
    const projectValue = metrics[1].querySelector(".font-headline.text-3xl");
    const projectStatus = metrics[1].querySelector(".font-body");
    const proposalValue = metrics[2].querySelector(".font-headline.text-3xl");
    const proposalStatus = metrics[2].querySelector(".font-body");
    if (areaValue) areaValue.textContent = totalArea.toLocaleString("es-CO", { maximumFractionDigits: 2 });
    if (terrainCount) terrainCount.lastChild.textContent = terrenos.length + (terrenos.length === 1 ? " terreno registrado" : " terrenos registrados");
    if (projectValue) projectValue.textContent = String(proyectos.length);
    if (projectStatus) projectStatus.lastChild.textContent = proyectos.length === 1 ? "proyecto registrado" : "proyectos registrados";
    const proposals = Storage.getPropuestas();
    if (proposalValue) proposalValue.textContent = String(proposals.length);
    if (proposalStatus) proposalStatus.lastChild.textContent = proposals.length ? "propuestas locales" : "sin propuestas locales";
  }

  const filter = document.querySelector("main select");
  if (filter) {
    const states = ["Borrador", "En análisis", "Con propuestas", "En revisión", "Cerrado", "Archivado"];
    filter.replaceChildren(new Option(`Todos los estados (${proyectos.length})`, ""));
    states.forEach((state) => {
      const count = proyectos.filter((project) => (project.estado || "Borrador") === state).length;
      if (count) filter.add(new Option(`${state} (${count})`, state));
    });
  }
}

function escapeProjectText(value) {
  return String(value || "").replace(/[&<>'"]/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
  });
}

const advisorStatusLabels = {
  pending: "Pendiente de revisión",
  in_progress: "En atención",
  attended: "Atendida",
  cancelled: "Cancelada",
};

function renderAdvisorHistory(requests) {
  const section = document.getElementById("advisor-request-history");
  const list = document.getElementById("advisor-request-history-list");
  if (!section || !list) return;
  if (!requests.length) {
    section.classList.add("hidden");
    list.replaceChildren();
    return;
  }
  section.classList.remove("hidden");
  list.innerHTML = requests.map((request) =>
    '<article class="rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-space-12">' +
      '<div class="flex flex-wrap items-center justify-between gap-2"><strong>' +
      escapeProjectText(request.topic) + '</strong><span class="rounded-full bg-primary-fixed px-2 py-1 text-xs font-bold text-on-primary-fixed-variant">' +
      escapeProjectText(advisorStatusLabels[request.status] || request.status) + '</span></div>' +
      '<p class="mt-1 text-sm text-on-surface-variant">' +
      escapeProjectText(request.projectName || "Orientación general") + ' · ' +
      escapeProjectText(request.message) + '</p>' +
      (request.adminNote ? '<p class="mt-1 text-xs text-on-surface-variant">Nota administrativa: ' + escapeProjectText(request.adminNote) + '</p>' : '') +
    '</article>'
  ).join("");
}

function populateAdvisorProjects() {
  const select = document.getElementById("advisor-project-id");
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Orientación general</option>' + advisorProjects.map((project) =>
    '<option value="' + escapeProjectText(project.id) + '">' + escapeProjectText(project.nombre) + '</option>'
  ).join("");
  if (advisorProjects.some((project) => project.id === current)) select.value = current;
}

async function loadAdvisorRequests() {
  try {
    const result = await ViModApi.get("/advisor-requests");
    renderAdvisorHistory(result.requests || []);
  } catch (error) {
    renderAdvisorHistory([]);
  }
}

function showAdvisorFeedback(message, isError) {
  const feedback = document.getElementById("advisor-request-feedback");
  if (!feedback) return;
  feedback.textContent = message || "";
  feedback.classList.toggle("hidden", !message);
  feedback.classList.toggle("text-error", Boolean(isError));
  feedback.classList.toggle("text-primary", !isError);
}

function bindAdvisorRequest() {
  const dialog = document.getElementById("advisor-request-dialog");
  const openButton = document.getElementById("open-advisor-request");
  const closeButtons = [
    document.getElementById("close-advisor-request"),
    document.getElementById("cancel-advisor-request"),
  ];
  const form = document.getElementById("advisor-request-form");
  if (!dialog || !openButton || !form) return;
  openButton.addEventListener("click", () => {
    populateAdvisorProjects();
    showAdvisorFeedback("");
    dialog.showModal();
  });
  closeButtons.forEach((button) => {
    if (button) button.addEventListener("click", () => dialog.close());
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.getElementById("submit-advisor-request");
    const body = {
      projectId: document.getElementById("advisor-project-id").value || undefined,
      topic: document.getElementById("advisor-topic").value.trim(),
      message: document.getElementById("advisor-message").value.trim(),
      contactMethod: document.getElementById("advisor-contact-method").value,
      contact: document.getElementById("advisor-contact").value.trim(),
    };
    if (body.message.length < 10) {
      showAdvisorFeedback("Describe tu necesidad con al menos 10 caracteres.", true);
      return;
    }
    if (submit) submit.disabled = true;
    try {
      await ViModApi.post("/advisor-requests", body);
      form.reset();
      dialog.close();
      await loadAdvisorRequests();
    } catch (error) {
      showAdvisorFeedback(error.message || "No se pudo registrar la solicitud.", true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

// Llamar a la función de carga
bindAdvisorRequest();
loadUserData();
