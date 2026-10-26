(function () {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("proyecto");
  const projectName = document.getElementById("project-name");
  const projectArea = document.getElementById("project-area");
  const statusText = document.getElementById("review-current-status");
  const loadError = document.getElementById("review-load-error");
  const architectOptions = document.getElementById("architect-options");
  const requestForm = document.getElementById("review-request-form");
  const modeSelect = document.getElementById("review-mode");
  const pickerWrap = document.getElementById("architect-picker-wrap");
  const architectPicker = document.getElementById("architect-picker");
  const reviewList = document.getElementById("review-history-items");
  let selectedProposal = null;
  let architects = [];
  let reviews = [];

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function valueOrMissing(value, suffix) {
    return value === null || value === undefined || value === ""
      ? "No indicado"
      : String(value) + (suffix || "");
  }

  function formatMoneyOrMissing(value) {
    return value === null || value === undefined || value === ""
      ? "No indicado"
      : ViMod.formatMoney(value);
  }

  function renderArchitects() {
    if (architectOptions) {
      architectOptions.innerHTML = architects.length
        ? architects.map((architect) =>
          '<article class="rounded-lg border border-outline-variant/30 bg-surface-container-low p-4">' +
          '<h3 class="font-semibold text-on-surface">' + escapeHtml(valueOrMissing(architect.nombre)) +
          (architect.demo ? ' <span class="text-xs font-semibold text-outline">· Datos de demostración</span>' : '') + '</h3>' +
          '<p class="mt-2 text-sm text-on-surface-variant">Especialidad: ' + escapeHtml(valueOrMissing(architect.especialidad)) + '</p>' +
          '<p class="text-sm text-on-surface-variant">Experiencia: ' + escapeHtml(valueOrMissing(architect.anosExperiencia, " años")) + '</p>' +
          '<p class="text-sm text-on-surface-variant">Zona: ' + escapeHtml(valueOrMissing(architect.zona)) + '</p>' +
          '<p class="text-sm text-on-surface-variant">Honorario base: ' + escapeHtml(formatMoneyOrMissing(architect.honorarioBase)) + '</p>' +
          '</article>'
        ).join("")
        : '<p class="text-sm text-on-surface-variant">No hay arquitectos aprobados disponibles.</p>';
    }
    if (architectPicker) {
      architectPicker.innerHTML = '<option value="">Elige un arquitecto</option>' +
        architects.map((architect) => '<option value="' + escapeHtml(architect.id) + '">' +
          escapeHtml(valueOrMissing(architect.nombre)) + " · " +
          escapeHtml(valueOrMissing(architect.especialidad)) + "</option>").join("");
    }
  }

  function updateModeControls() {
    if (!modeSelect || !pickerWrap) return;
    const directed = modeSelect.value === "directed";
    pickerWrap.classList.toggle("hidden", !directed);
    pickerWrap.classList.toggle("flex", directed);
  }

  function renderReviews() {
    const active = reviews.find((review) => review.active);
    const statusLabels = {
      open: "Abierta, esperando postulaciones",
      directed: "Dirigida, esperando respuesta del arquitecto",
      with_applications: "Recibiendo postulaciones",
      assigned: "Arquitecto asignado",
      in_review: "En revisión",
      delivered: "Dictamen entregado",
      canceled: "Cancelada",
      rejected: "Rechazada",
    };
    if (statusText) {
      statusText.textContent = active
        ? "Estado: " + (statusLabels[active.status] || active.status)
          + (active.mode ? " · modalidad " + active.mode : "")
        : reviews.length ? "No hay una solicitud activa." : "Todavía no has solicitado una revisión.";
    }
    const requestButton = document.getElementById("btn-request-review");
    if (requestButton) {
      requestButton.disabled = !!active || !selectedProposal;
      requestButton.textContent = active ? "Solicitud en curso"
        : selectedProposal ? "Crear solicitud" : "Selecciona una propuesta para continuar";
    }
    const nextStep = document.getElementById("review-next-step");
    const delivered = reviews.find((review) => review.status === "delivered");
    if (nextStep) {
      nextStep.href = ViModRoutes.page("projectDetail", {
        proyecto: projectId,
        vista: "trabajo",
      });
      nextStep.textContent = delivered
        ? "Ver dictamen y continuar"
        : active && ["assigned", "in_review"].includes(active.status)
          ? "Consultar estado de revisión"
          : "Continuar trabajando el proyecto";
    }
    if (!reviewList) return;
    reviewList.innerHTML = reviews.length
      ? reviews.map((review) => {
        const architect = review.architect || {};
        const applications = (review.applications || []).map((application) => {
          const applicant = application.architect || {};
          return '<div class="mt-3 rounded-lg border border-outline-variant/30 bg-surface p-4">' +
            '<p class="font-semibold">' + escapeHtml(valueOrMissing(applicant.nombre)) + '</p>' +
            '<p class="text-sm text-on-surface-variant">' + escapeHtml(valueOrMissing(applicant.especialidad)) +
            ' · Honorario postulado: ' + escapeHtml(formatMoneyOrMissing(application.amount)) +
            ' · Calificación: ' + (applicant.ratingCount ? escapeHtml(applicant.ratingAverage) +
              " (" + escapeHtml(applicant.ratingCount) + ")" : "Sin calificaciones") + '</p>' +
            '<p class="mt-1 text-sm">' + escapeHtml(application.message) + '</p>' +
            (review.active && review.mode === "open" && application.status === "pending"
              ? '<button type="button" data-assign-review="' + escapeHtml(review.id) +
                '" data-application="' + escapeHtml(application.id) +
                '" class="client-primary-action mt-3 px-4 py-2 text-sm">Elegir este arquitecto</button>'
              : "") + '</div>';
        }).join("");
        const dictamenLabels = {
          approved_with_observations: "Aprobada con observaciones",
          requires_adjustments: "Requiere ajustes",
          not_recommended: "No recomendada",
        };
        const rating = review.rating
          ? '<p class="mt-2 text-sm font-semibold">Tu calificación: ' +
            escapeHtml(review.rating) + " / 5</p>"
          : review.status === "delivered"
            ? '<label class="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold">Califica la revisión (1 a 5)' +
              '<select data-rating-value="' + escapeHtml(review.id) +
              '" class="rounded-lg border-outline-variant"><option value="">Elige</option>' +
              [1, 2, 3, 4, 5].map((value) => '<option value="' + value + '">' + value + "</option>").join("") +
              '</select><button type="button" data-rate-review="' + escapeHtml(review.id) +
              '" class="client-primary-action px-4 py-2 text-sm">Enviar calificación</button></label>'
            : "";
        const cancel = review.active
          ? '<button type="button" data-cancel-review="' + escapeHtml(review.id) +
            '" class="client-secondary-action mt-3 px-4 py-2 text-sm">Cancelar solicitud</button>'
          : "";
        return '<article class="rounded-xl border border-outline-variant/30 p-5">' +
          '<div class="flex flex-wrap justify-between gap-2"><h3 class="font-semibold">' +
          escapeHtml(review.mode === "directed" ? "Solicitud dirigida" : "Solicitud abierta") +
          '</h3><span class="rounded-full bg-surface-container-high px-3 py-1 text-xs font-bold">' +
          escapeHtml(statusLabels[review.status] || review.status) + '</span></div>' +
          '<p class="mt-2 text-sm text-on-surface-variant">Arquitecto: ' +
          escapeHtml(valueOrMissing(architect.nombre)) + ' · ' +
          escapeHtml(valueOrMissing(architect.especialidad)) + '</p>' +
          '<p class="text-sm text-on-surface-variant">Experiencia: ' +
          escapeHtml(valueOrMissing(architect.anosExperiencia, " años")) + ' · Zona: ' +
          escapeHtml(valueOrMissing(architect.zona)) + ' · Honorario base: ' +
          escapeHtml(formatMoneyOrMissing(architect.honorarioBase)) +
          ' · Calificación: ' + (architect.ratingCount
            ? escapeHtml(architect.ratingAverage) + " / 5 (" + escapeHtml(architect.ratingCount) + ")"
            : "Sin calificaciones") + '</p>' +
          (review.dictamen ? '<p class="mt-3 font-semibold">Dictamen: ' +
            escapeHtml(dictamenLabels[review.dictamen] || review.dictamen) + '</p>' : "") +
          (review.dictamenObservation ? '<p class="mt-1 text-sm">Observaciones del dictamen: ' +
            escapeHtml(review.dictamenObservation) + '</p>' : "") +
          applications + rating + cancel + '</article>';
      }).join("")
      : '<p class="text-sm text-on-surface-variant">No hay solicitudes para este proyecto.</p>';

    reviewList.querySelectorAll("[data-assign-review]").forEach((button) => {
      button.addEventListener("click", async () => {
        await sendReviewAction(
          "/projects/" + encodeURIComponent(projectId) + "/reviews/" +
          encodeURIComponent(button.dataset.assignReview) + "/assign",
          { applicationId: button.dataset.application },
        );
      });
    });
    reviewList.querySelectorAll("[data-cancel-review]").forEach((button) => {
      button.addEventListener("click", async () => {
        await sendReviewAction(
          "/projects/" + encodeURIComponent(projectId) + "/reviews/" +
          encodeURIComponent(button.dataset.cancelReview) + "/cancel",
          {},
        );
      });
    });
    reviewList.querySelectorAll("[data-rate-review]").forEach((button) => {
      button.addEventListener("click", async () => {
        const select = reviewList.querySelector(
          '[data-rating-value="' + button.dataset.rateReview + '"]',
        );
        if (!select || !select.value) {
          window.alert("Elige una calificación del 1 al 5.");
          return;
        }
        try {
          await ViModApi.post(
            "/projects/" + encodeURIComponent(projectId) + "/reviews/" +
            encodeURIComponent(button.dataset.rateReview) + "/rating",
            { rating: Number(select.value) },
          );
          await refreshReviews();
        } catch (error) {
          window.alert(error.message);
        }
      });
    });
  }

  async function sendReviewAction(path, body) {
    try {
      await ViModApi.post(path, body);
      await refreshReviews();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function refreshReviews() {
    const result = await ViModApi.get("/projects/" + encodeURIComponent(projectId) + "/reviews");
    reviews = result.reviews || [];
    renderReviews();
  }

  if (modeSelect) modeSelect.addEventListener("change", updateModeControls);
  if (requestForm) requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedProposal) {
      window.alert("Selecciona una propuesta vigente antes de pedir revisión.");
      return;
    }
    const mode = modeSelect.value;
    if (mode === "directed" && !architectPicker.value) {
      window.alert("Elige un arquitecto aprobado.");
      return;
    }
    const button = document.getElementById("btn-request-review");
    button.disabled = true;
    try {
      await ViModApi.post("/projects/" + encodeURIComponent(projectId) + "/reviews", {
        proposalId: selectedProposal.id,
        mode,
        architectId: mode === "directed" ? architectPicker.value : undefined,
      });
      await refreshReviews();
    } catch (error) {
      window.alert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  async function initialize() {
    if (loadError) {
      loadError.replaceChildren();
      loadError.classList.add("hidden");
    }
    if (statusText) statusText.textContent = "Cargando estado de la revisión...";
    if (!projectId) {
      if (statusText) statusText.textContent = "Abre esta pantalla desde un proyecto.";
      return;
    }
    try {
      const project = await Storage.fetchProjectById(projectId);
      const selected = await ViModApi.get(
        "/projects/" + encodeURIComponent(projectId) + "/selected-proposal",
      );
      selectedProposal = selected.proposal;
      if (projectName) projectName.textContent = project.nombre;
      if (projectArea && selectedProposal && selectedProposal.estimate) {
        projectArea.textContent = "Propuesta seleccionada · " +
          selectedProposal.estimate.areaM2 + " m²";
      }
      const response = await ViModApi.get("/architects");
      architects = response.architects || [];
      renderArchitects();
      updateModeControls();
      await refreshReviews();
    } catch (error) {
      const message = error.message || "No se pudo cargar la revisión.";
      if (statusText) statusText.textContent = "No se pudo cargar la revisión.";
      ViMod.showRetryError(loadError, message, initialize);
    }
  }

  initialize();
})();
