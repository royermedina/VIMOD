(function () {
  const profileForm = document.getElementById("architect-profile-form");
  const profileStatus = document.getElementById("architect-profile-status");
  const ratingSummary = document.getElementById("architect-rating-summary");
  const openList = document.getElementById("open-review-list");
  const assignedList = document.getElementById("assigned-projects-list");
  let reviews = [];
  let currentArchitectId = null;

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

  const reviewStatusLabels = {
    directed: "Pendiente de aceptación",
    open: "Abierta",
    with_applications: "Con postulaciones",
    assigned: "Asignada",
    in_review: "En revisión",
    delivered: "Entregada",
    rejected: "Rechazada",
    canceled: "Cancelada",
  };

  const opinionLabels = {
    approved_with_observations: "Aprobada con observaciones",
    requires_adjustments: "Requiere ajustes",
    not_recommended: "No recomendada",
  };

  function reviewStatusLabel(status) {
    return reviewStatusLabels[status] || status || "Sin estado";
  }

  function fillProfile(profile) {
    document.getElementById("profile-name").value = profile.nombre || "";
    document.getElementById("profile-specialty").value = profile.especialidad || "";
    document.getElementById("profile-experience").value = profile.anosExperiencia ?? "";
    document.getElementById("profile-zone").value = profile.zona || "";
    document.getElementById("profile-fee").value = profile.honorarioBase ?? "";
    if (ratingSummary) {
      ratingSummary.textContent = profile.ratingCount
        ? "Calificación promedio: " + profile.ratingAverage + " / 5 · " +
          profile.ratingCount + " calificaciones"
        : "Sin calificaciones";
    }
  }

  function renderOpenReviews(openReviews) {
    const count = document.getElementById("open-review-count");
    if (count) count.textContent = openReviews.length + " disponibles";
    if (!openList) return;
    openList.innerHTML = openReviews.length
      ? openReviews.map((review) => {
        const project = review.project || {};
        const alreadyApplied = (review.applications || []).some(
          (application) => application.architectId === currentArchitectId
            && application.status === "pending",
        );
        return '<article class="rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-16">' +
          '<h3 class="font-semibold">' + escapeHtml(project.nombre || "Proyecto") + '</h3>' +
          '<p class="mt-1 text-sm text-on-surface-variant">Cliente: ' + escapeHtml(review.clientName || "No indicado") +
          ' · Estado: ' + escapeHtml(reviewStatusLabel(review.status)) + '</p>' +
          '<p class="text-sm text-on-surface-variant">Propuesta: ' +
          escapeHtml(review.proposal && review.proposal.nombre || "No indicado") +
          (review.proposal && review.proposal.areaM2 ? " · " + escapeHtml(review.proposal.areaM2) + " m²" : "") +
          '</p>' +
          (alreadyApplied
            ? '<p class="mt-2 text-sm font-semibold text-primary">Ya enviaste una postulación.</p>'
            : '<button type="button" data-apply-review="' + escapeHtml(review.id) +
              '" class="client-primary-action mt-3 px-space-16 py-space-8 text-sm">Postularme</button>') +
          '</article>';
      }).join("")
      : '<p class="text-sm text-on-surface-variant">No hay solicitudes abiertas disponibles.</p>';
    openList.querySelectorAll("[data-apply-review]").forEach((button) => {
      button.addEventListener("click", () => applyToReview(button.dataset.applyReview));
    });
  }

  function renderAssignedReviews(assigned) {
    if (!assignedList) return;
    assignedList.innerHTML = assigned.length
      ? assigned.map((review) => {
        const project = review.project || {};
        const accept = review.status === "directed"
          ? '<button type="button" data-accept-review="' + escapeHtml(review.id) +
            '" class="client-primary-action px-space-12 py-space-8 text-sm">Aceptar solicitud</button>' +
            '<button type="button" data-reject-review="' + escapeHtml(review.id) +
            '" class="client-secondary-action px-space-12 py-space-8 text-sm">Rechazar</button>'
          : review.status === "assigned"
            ? '<button type="button" data-start-review="' + escapeHtml(review.id) +
              '" class="client-primary-action px-space-12 py-space-8 text-sm">Iniciar revisión</button>'
            : "";
        const deliverForm = review.status === "in_review"
          ? '<form data-deliver-review="' + escapeHtml(review.id) +
            '" class="mt-3 flex flex-col gap-2"><label class="text-sm font-semibold">Observaciones del dictamen' +
            '<textarea name="observation" required maxlength="5000" class="mt-1 w-full rounded-lg border-outline-variant" rows="4"></textarea></label>' +
            '<label class="text-sm font-semibold">Dictamen<select name="dictamen" required class="mt-1 w-full rounded-lg border-outline-variant">' +
            '<option value="">Selecciona</option><option value="approved_with_observations">Aprobada con observaciones</option>' +
            '<option value="requires_adjustments">Requiere ajustes</option><option value="not_recommended">No recomendada</option>' +
            '</select></label><button class="client-primary-action px-space-12 py-space-8 text-sm" type="submit">Entregar dictamen</button></form>'
          : "";
        return '<article class="rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-16">' +
          '<h3 class="font-semibold">' + escapeHtml(project.nombre || "Proyecto") + '</h3>' +
          '<p class="mt-1 text-sm text-on-surface-variant">Cliente: ' + escapeHtml(review.clientName || "No indicado") +
          ' · Estado: ' + escapeHtml(reviewStatusLabel(review.status)) + '</p>' +
          '<p class="text-sm text-on-surface-variant">Propuesta: ' +
          escapeHtml(review.proposal && review.proposal.nombre || "No indicado") + '</p>' +
          (review.dictamen ? '<p class="mt-2 text-sm font-semibold">Dictamen: ' +
            escapeHtml(opinionLabels[review.dictamen] || review.dictamen) + '</p><p class="text-sm">' +
            escapeHtml(review.dictamenObservation) + '</p>' : "") +
          '<div class="mt-3 flex flex-wrap gap-2">' + accept + '</div>' +
          deliverForm + '</article>';
      }).join("")
      : '<p class="text-sm text-on-surface-variant">No hay solicitudes dirigidas o asignadas a tu cuenta.</p>';
    assignedList.querySelectorAll("[data-accept-review]").forEach((button) => {
      button.addEventListener("click", () => reviewAction(button.dataset.acceptReview, "accept"));
    });
    assignedList.querySelectorAll("[data-reject-review]").forEach((button) => {
      button.addEventListener("click", () => reviewAction(button.dataset.rejectReview, "reject"));
    });
    assignedList.querySelectorAll("[data-start-review]").forEach((button) => {
      button.addEventListener("click", () => reviewAction(button.dataset.startReview, "start"));
    });
    assignedList.querySelectorAll("[data-deliver-review]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        try {
          await ViModApi.post(
            "/reviews/" + encodeURIComponent(form.dataset.deliverReview) + "/deliver",
            { observation: data.get("observation"), dictamen: data.get("dictamen") },
          );
          await loadReviews();
        } catch (error) {
          window.alert(error.message);
        }
      });
    });
  }

  async function applyToReview(id) {
    const amount = window.prompt("Indica tu precio de postulación en COP:");
    if (amount === null) return;
    const message = window.prompt("Escribe un mensaje breve para el cliente:");
    if (message === null) return;
    try {
      await ViModApi.post("/reviews/" + encodeURIComponent(id) + "/applications", {
        amount: Number(amount),
        message,
      });
      await loadReviews();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function reviewAction(id, action) {
    try {
      await ViModApi.post("/reviews/" + encodeURIComponent(id) + "/" + action, {});
      await loadReviews();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function loadReviews() {
    const result = await ViModApi.get("/architect/reviews");
    reviews = result.reviews || [];
    renderOpenReviews(reviews.filter((review) =>
      review.mode === "open" && ["open", "with_applications"].includes(review.status),
    ));
    renderAssignedReviews(reviews.filter((review) =>
      review.mode !== "open" || !["open", "with_applications"].includes(review.status),
    ));
  }

  if (profileForm) profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const profile = {
      nombre: document.getElementById("profile-name").value.trim(),
      especialidad: document.getElementById("profile-specialty").value.trim(),
      anosExperiencia: document.getElementById("profile-experience").value,
      zona: document.getElementById("profile-zone").value.trim(),
      honorarioBase: document.getElementById("profile-fee").value,
    };
    try {
      const result = await ViModApi.patch("/architect/profile", profile);
      fillProfile(result.profile);
      if (profileStatus) profileStatus.textContent = "Perfil actualizado.";
    } catch (error) {
      if (profileStatus) profileStatus.textContent = error.message;
    }
  });

  async function initialize() {
    try {
      const result = await ViModApi.get("/architect/profile");
      currentArchitectId = result.profile.id;
      fillProfile(result.profile);
      await loadReviews();
    } catch (error) {
      if (profileStatus) profileStatus.textContent = error.message;
      ViMod.showRetryError(openList, error.message, initialize);
      ViMod.showRetryError(assignedList, error.message, initialize);
    }
  }

  initialize();
})();
