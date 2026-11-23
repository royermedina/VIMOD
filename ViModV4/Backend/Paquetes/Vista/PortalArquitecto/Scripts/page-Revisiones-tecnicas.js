(function () {
  const reviewList = document.getElementById("review-list");
  const searchInput = document.getElementById("review-search");
  const params = new URLSearchParams(window.location.search);
  const statusLabels = {
    directed: "Pendiente de aceptación",
    open: "Abierta",
    with_applications: "Con postulaciones",
    assigned: "Asignada",
    in_review: "En revisión",
    delivered: "Entregada",
    rejected: "Rechazada",
    closed: "Cerrada",
    canceled: "Cancelada",
  };
  const opinionLabels = {
    approved: "Aprobada",
    approved_with_observations: "Aprobada con observaciones",
    rejected: "Rechazada",
    requires_adjustments: "Requiere ajustes",
    not_recommended: "No recomendada",
  };
  const criteria = [
    { id: "structure", label: "Cimentación y estructura" },
    { id: "functionality", label: "Distribución y funcionalidad" },
    { id: "regulations", label: "Cumplimiento normativo (NSR-10)" },
    { id: "budget", label: "Presupuesto coherente" },
    { id: "terrain", label: "Adecuación al terreno" },
  ];
  const criterionStatusLabels = {
    complies: "Cumple",
    complies_with_observations: "Cumple con observaciones",
    not_compliant: "No cumple",
  };
  let allReviews = [];
  let currentArchitectId = null;
  let activeTab = "open";
  let search = "";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function formatDate(value) {
    if (!value) return "No indicada";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "No indicada"
      : date.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  }

  function formatValue(value, suffix) {
    return value === null || value === undefined || value === ""
      ? "No indicado"
      : String(value) + (suffix || "");
  }

  function formatMoney(value) {
    return value === null || value === undefined || value === ""
      ? "No indicado"
      : ViMod.formatMoney(value);
  }

  function reviewsForTab(tab) {
    if (tab === "open") {
      return allReviews.filter((review) => review.mode === "open"
        && !review.architectId && ["open", "with_applications"].includes(review.status));
    }
    if (tab === "delivered") {
      return allReviews.filter((review) => review.architectId === currentArchitectId
        && review.status === "delivered");
    }
    return allReviews.filter((review) => review.architectId === currentArchitectId
      && ["directed", "assigned", "in_review"].includes(review.status));
  }

  function projectFacts(review) {
    const project = review.project || {};
    const terrain = project.terreno || {};
    const proposal = review.proposal || {};
    const estimate = proposal.estimate || {};
    const layout = proposal.layout;
    const moduleLabels = { common: "Módulos comunes", bedroom: "Módulos dormitorio", wetCore: "Módulos de baño" };
    const modules = Array.isArray(proposal.modules)
      ? proposal.modules.map((module) => {
        if (!module || typeof module !== "object") return "";
        const label = moduleLabels[module.type];
        return label ? label + ": " + module.count : "";
      }).filter(Boolean).join(" · ")
      : "";
    const layoutParts = layout && typeof layout === "object"
      ? [
        layout.columns != null ? "Columnas: " + layout.columns : "",
        layout.rows != null ? "Filas: " + layout.rows : "",
      ].filter(Boolean)
      : [];
    const distribution = layoutParts.concat(modules).filter(Boolean).join(" · ");
    return [
      ["Cliente", review.clientName || "No indicado"],
      ["Ubicación del terreno", terrain.ubicacion],
      ["Medidas del terreno", terrain.ancho && terrain.largo
        ? terrain.ancho + " m × " + terrain.largo + " m"
        : null],
      ["Superficie del terreno", terrain.area ? terrain.area + " m²" : null],
      ["Habitaciones", project.habitaciones ?? proposal.habitaciones],
      ["Baños", project.banos ?? proposal.banos],
      ["Presupuesto", project.presupuesto == null ? null : formatMoney(project.presupuesto) + " COP"],
      ["Propuesta seleccionada", proposal.nombre],
      ["Superficie propuesta", proposal.areaM2 == null ? estimate.areaM2 : proposal.areaM2],
      ["Costo estimado", estimate.costCop == null ? null : formatMoney(estimate.costCop) + " COP"],
      ["Distribución", distribution],
    ].map(([label, value]) =>
      '<div class="rounded-lg bg-surface-container-low p-3"><dt class="text-xs font-bold uppercase text-on-surface-variant">' +
      escapeHtml(label) + '</dt><dd class="mt-1 text-sm font-semibold">' +
      escapeHtml(formatValue(value, label === "Superficie propuesta" && value != null ? " m²" : "")) +
      '</dd></div>').join("");
  }

  function renderCriteria(criteriaHistory) {
    return '<ul class="mt-3 space-y-2">' + criteriaHistory.map((criterion) =>
      '<li class="rounded-lg bg-surface-container-low p-3"><p class="font-semibold">' +
      escapeHtml(criterion.label || criterion.id) + ' · ' +
      escapeHtml(criterionStatusLabels[criterion.status] || criterion.status) + '</p>' +
      (criterion.comment ? '<p class="mt-1 text-sm">' + escapeHtml(criterion.comment) + '</p>' : '') +
      '</li>').join("") + '</ul>';
  }

  function renderHistory(review) {
    const opinion = review.dictamen
      ? '<p class="mt-3 font-semibold">Dictamen: ' +
        escapeHtml(opinionLabels[review.dictamen] || review.dictamen) + '</p>'
      : "";
    const observation = review.dictamenObservation
      ? '<p class="mt-1 text-sm"><strong>Observaciones generales:</strong> ' +
        escapeHtml(review.dictamenObservation) + '</p>'
      : "";
    const criteriaHistory = Array.isArray(review.dictamenCriterios)
      ? renderCriteria(review.dictamenCriterios)
      : "";
    const deliveredAt = review.deliveredAt
      ? '<p class="mt-1 text-sm text-on-surface-variant">Entregada: ' +
        escapeHtml(formatDate(review.deliveredAt)) + '</p>'
      : "";
    return opinion + observation + deliveredAt + criteriaHistory;
  }

  function renderObservations(review) {
    const previous = Array.isArray(review.observations) ? review.observations : [];
    const delivered = review.dictamenObservation
      ? '<li>' + escapeHtml(review.dictamenObservation) + '</li>'
      : "";
    if (!previous.length && !delivered && !review.rejectionReason) {
      return '<p class="mt-2 text-sm text-on-surface-variant">No hay observaciones previas.</p>';
    }
    const items = previous.map((item) =>
      '<li><span class="font-semibold">' + escapeHtml(formatDate(item.createdAt)) +
      ':</span> ' + escapeHtml(item.observation) + '</li>').join("");
    return '<ul class="mt-2 list-inside list-disc space-y-2 text-sm">' + items + delivered +
      (review.rejectionReason ? '<li><span class="font-semibold">Motivo de rechazo:</span> ' +
        escapeHtml(review.rejectionReason) + '</li>' : '') + '</ul>';
  }

  function renderChecklist(review) {
    return '<form data-deliver-review="' + escapeHtml(review.id) +
      '" class="mt-4 flex flex-col gap-3"><h4 class="font-headline text-lg font-bold">Dictamen técnico</h4>' +
      criteria.map((criterion) =>
        '<fieldset class="rounded-lg border border-outline-variant/30 p-3"><legend class="px-1 text-sm font-bold">' +
        escapeHtml(criterion.label) + '</legend><label class="flex flex-col gap-1 text-sm">Estado' +
        '<select name="' + criterion.id + '-status" required class="rounded-lg border-outline-variant">' +
        '<option value="">Selecciona un estado</option>' +
        '<option value="complies">Cumple</option>' +
        '<option value="complies_with_observations">Cumple con observaciones</option>' +
        '<option value="not_compliant">No cumple</option></select></label>' +
        '<label class="mt-2 flex flex-col gap-1 text-sm">Comentario (opcional)' +
        '<textarea name="' + criterion.id + '-comment" maxlength="1000" rows="2" class="rounded-lg border-outline-variant"></textarea>' +
        '</label></fieldset>').join("") +
      '<label class="flex flex-col gap-1 text-sm font-semibold">Dictamen general' +
      '<select name="dictamen" required class="rounded-lg border-outline-variant">' +
      '<option value="">Selecciona un dictamen</option>' +
      '<option value="approved">Aprobada</option>' +
      '<option value="approved_with_observations">Aprobada con observaciones</option>' +
      '<option value="rejected">Rechazada</option></select></label>' +
      '<label class="flex flex-col gap-1 text-sm font-semibold">Observaciones generales' +
      '<textarea name="observation" required maxlength="5000" rows="4" class="rounded-lg border-outline-variant"></textarea>' +
      '</label><p data-review-form-feedback class="hidden text-sm text-error" role="alert"></p>' +
      '<button type="submit" class="client-primary-action self-start px-4 py-2 text-sm">Entregar dictamen</button></form>';
  }

  function renderReviewCard(review) {
    const project = review.project || {};
    const isOpen = review.mode === "open" && !review.architectId
      && ["open", "with_applications"].includes(review.status);
    const isDelivered = review.status === "delivered";
    const controls = isOpen
      ? '<div class="mt-3 flex flex-wrap gap-2"><button type="button" data-take-review="' +
        escapeHtml(review.id) + '" class="client-primary-action px-4 py-2 text-sm">Tomar revisión</button>' +
        '<button type="button" data-show-reject="' + escapeHtml(review.id) +
        '" class="client-secondary-action px-4 py-2 text-sm">Rechazar</button></div>' +
        '<form data-reject-open="' + escapeHtml(review.id) + '" class="mt-3 hidden">' +
        '<label class="flex flex-col gap-1 text-sm font-semibold">Motivo obligatorio' +
        '<textarea name="reason" required maxlength="2000" rows="3" class="rounded-lg border-outline-variant"></textarea>' +
        '</label><p data-review-form-feedback class="hidden text-sm text-error" role="alert"></p>' +
        '<button type="submit" class="client-secondary-action mt-2 px-4 py-2 text-sm">Confirmar rechazo</button></form>'
      : review.status === "directed"
        ? '<div class="mt-3 flex flex-wrap gap-2"><button type="button" data-accept-directed="' +
          escapeHtml(review.id) + '" class="client-primary-action px-4 py-2 text-sm">Aceptar solicitud</button>' +
          '<button type="button" data-reject-directed="' + escapeHtml(review.id) +
          '" class="client-secondary-action px-4 py-2 text-sm">Rechazar solicitud</button></div>'
        : review.status === "assigned"
          ? '<button type="button" data-start-review="' + escapeHtml(review.id) +
            '" class="client-primary-action mt-3 px-4 py-2 text-sm">Iniciar revisión</button>'
          : "";
    const history = isDelivered ? renderHistory(review) : "";
    const checklist = review.status === "in_review" ? renderChecklist(review) : "";
    const detailLabel = isDelivered ? "Ficha del proyecto e historial del dictamen" : "Ficha del proyecto y revisión";
    return '<article data-review-card="' + escapeHtml(review.id) +
      '" class="architect-review-card"><h3>' + escapeHtml(project.nombre || "Proyecto") + '</h3>' +
      '<p class="mt-1">Cliente: ' + escapeHtml(review.clientName || "No indicado") +
      ' · Estado: ' + escapeHtml(statusLabels[review.status] || review.status) + '</p>' +
      '<p class="mt-1 text-sm text-on-surface-variant">Propuesta: ' +
      escapeHtml(review.proposal && review.proposal.nombre || "No indicada") + '</p>' +
      (review.mode === "open" && review.applications && review.applications.length
        ? '<p class="mt-1 text-sm text-on-surface-variant">' + review.applications.length + ' postulaciones recibidas</p>'
        : '') +
      controls + '<details data-review-details="' + escapeHtml(review.id) + '">' +
      '<summary>' + detailLabel + '</summary>' +
      '<dl class="mt-3 grid gap-2 sm:grid-cols-2">' + projectFacts(review) + '</dl>' +
      '<section class="mt-4"><h4 class="font-semibold">Observaciones previas</h4>' +
      renderObservations(review) + '</section>' +
      (history ? '<section class="mt-4"><h4 class="font-semibold">Dictamen entregado</h4>' + history + '</section>' : '') +
      checklist + '</details></article>';
  }

  function updateTabs() {
    const counts = {
      open: reviewsForTab("open").length,
      in_review: reviewsForTab("in_review").length,
      delivered: reviewsForTab("delivered").length,
    };
    document.querySelectorAll("[data-review-count]").forEach((element) => {
      element.textContent = String(counts[element.getAttribute("data-review-count")] || 0);
    });
    document.querySelectorAll("[data-review-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.reviewTab === activeTab));
    });
  }

  function renderReviews() {
    updateTabs();
    const matches = reviewsForTab(activeTab).filter((review) => {
      const text = [review.project && review.project.nombre, review.clientName]
        .join(" ").toLocaleLowerCase("es-CO");
      return text.includes(search);
    });
    reviewList.innerHTML = matches.length
      ? matches.map(renderReviewCard).join("")
      : '<p class="text-sm text-on-surface-variant">' +
        (search ? "No hay revisiones que coincidan con la búsqueda." : "No hay revisiones en esta pestaña.") +
        '</p>';
  }

  function showFormError(form, message) {
    const feedback = form.querySelector("[data-review-form-feedback]");
    if (!feedback) {
      showPageError(message);
      return;
    }
    feedback.textContent = message;
    feedback.classList.remove("hidden");
  }

  function showPageError(message) {
    const error = document.getElementById("review-load-error");
    if (!error) return;
    error.textContent = message;
    error.classList.remove("hidden");
  }

  function userFacingError(error, fallback) {
    return error && error.status >= 400 && error.status < 500 && error.message
      ? error.message
      : fallback;
  }

  async function sendReviewAction(path, body, button) {
    const error = document.getElementById("review-load-error");
    try {
      if (error) {
        error.textContent = "";
        error.classList.add("hidden");
      }
      await ViModApi.post(path, body || {});
      await loadReviews();
    } catch (actionError) {
      if (button) button.disabled = false;
      showPageError(userFacingError(actionError, "No se pudo actualizar la revisión."));
    }
  }

  async function loadReviews() {
    const result = await ViModApi.get("/architect/reviews");
    allReviews = result.reviews || [];
    renderReviews();
  }

  reviewList.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-show-reject")) {
      const form = reviewList.querySelector(
        '[data-reject-open="' + button.dataset.showReject + '"]',
      );
      if (form) {
        form.classList.toggle("hidden");
        if (!form.classList.contains("hidden")) form.querySelector("textarea").focus();
      }
      return;
    }
    if (button.hasAttribute("data-take-review")) {
      button.disabled = true;
      sendReviewAction(
        "/reviews/" + encodeURIComponent(button.dataset.takeReview) + "/take",
        {},
        button,
      );
    } else if (button.hasAttribute("data-accept-directed")) {
      sendReviewAction("/reviews/" + encodeURIComponent(button.dataset.acceptDirected) + "/accept");
    } else if (button.hasAttribute("data-reject-directed")) {
      sendReviewAction("/reviews/" + encodeURIComponent(button.dataset.rejectDirected) + "/reject");
    } else if (button.hasAttribute("data-start-review")) {
      sendReviewAction("/reviews/" + encodeURIComponent(button.dataset.startReview) + "/start");
    }
  });

  reviewList.addEventListener("submit", async (event) => {
    const form = event.target.closest("form");
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (form.hasAttribute("data-reject-open")) {
        await ViModApi.post(
          "/reviews/" + encodeURIComponent(form.dataset.rejectOpen) + "/decline",
          { reason: String(data.get("reason") || "").trim() },
        );
      } else {
        const verdictCriteria = criteria.map((criterion) => ({
          id: criterion.id,
          status: data.get(criterion.id + "-status"),
          comment: String(data.get(criterion.id + "-comment") || "").trim(),
        }));
        await ViModApi.post(
          "/reviews/" + encodeURIComponent(form.dataset.deliverReview) + "/deliver",
          {
            dictamen: data.get("dictamen"),
            observation: String(data.get("observation") || "").trim(),
            criteria: verdictCriteria,
          },
        );
      }
      await loadReviews();
    } catch (error) {
      showFormError(form, userFacingError(error, "No se pudo guardar la respuesta."));
      submit.disabled = false;
    }
  });

  document.querySelectorAll("[data-review-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.reviewTab;
      renderReviews();
    });
  });
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      search = searchInput.value.trim().toLocaleLowerCase("es-CO");
      renderReviews();
    });
  }

  async function initialize() {
    try {
      const sessionReady = await Storage.whenReady();
      if (!sessionReady) return;
      const user = Storage.getCurrentUser();
      if (!user || !user.id) {
        window.location.href = ViModRoutes.page("login");
        return;
      }
      currentArchitectId = user.id;
      const [profileResult] = await Promise.all([
        ViModArchitectProfile.initialize(),
        loadReviews(),
      ]);
      if (profileResult && profileResult.ratingAverage != null) {
        const summary = document.getElementById("architect-rating-summary");
        if (summary) summary.setAttribute("aria-label", "Insignia de calificaciones del arquitecto");
      }
      const requestedReview = params.get("revision");
      if (requestedReview) {
        const review = allReviews.find((item) => item.id === requestedReview);
        if (review) {
          activeTab = review.status === "delivered" ? "delivered"
            : review.mode === "open" && !review.architectId ? "open" : "in_review";
          renderReviews();
          const details = Array.from(reviewList.querySelectorAll("[data-review-details]"))
            .find((element) => element.dataset.reviewDetails === requestedReview);
          if (details) details.open = true;
        }
      }
      renderReviews();
    } catch (error) {
      showPageError(userFacingError(error, "No se pudieron cargar las revisiones."));
    }
  }

  initialize();
})();
