(function () {
  const assignedList = document.getElementById("assigned-projects-list");
  const searchInput = document.getElementById("assigned-project-search");
  let assignedReviews = [];
  let search = "";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function statusLabel(status) {
    const labels = {
      directed: "Pendiente de aceptación",
      assigned: "Asignada",
      in_review: "En revisión",
      delivered: "Entregada",
      rejected: "Rechazada",
      closed: "Cerrada",
      canceled: "Cancelada",
    };
    return labels[status] || status || "Sin estado";
  }

  function projectImage(projectId) {
    return '<div class="vimod-card-image-frame-project relative mb-3 flex h-[120px] items-center justify-center overflow-hidden rounded-lg bg-surface-container">' +
      '<img data-card-image data-card-image-kind="project" data-card-image-id="' + escapeHtml(projectId) +
      '" src="' + ViModCardImages.projectImage(projectId) +
      '" alt="Vista de la vivienda" loading="lazy" class="absolute inset-0 h-full w-full object-cover object-center opacity-0" />' +
      '<span data-card-fallback class="material-symbols-outlined text-5xl text-primary">home_work</span></div>';
  }

  function renderAssignedReviews() {
    if (!assignedList) return;
    const filtered = assignedReviews.filter((review) => {
      const text = [
        review.project && review.project.nombre,
        review.clientName,
        review.proposal && review.proposal.nombre,
      ].join(" ").toLocaleLowerCase("es-CO");
      return text.includes(search);
    });
    assignedList.innerHTML = filtered.length
      ? filtered.map((review) => {
        const project = review.project || {};
        return '<article class="architect-review-card">' +
          projectImage(project.id) +
          '<h3>' + escapeHtml(project.nombre || "Proyecto") + '</h3>' +
          '<p>Cliente: ' + escapeHtml(review.clientName || "No indicado") + '</p>' +
          '<p>Estado: ' + escapeHtml(statusLabel(review.status)) + '</p>' +
          '<p>Propuesta: ' + escapeHtml(review.proposal && review.proposal.nombre || "No indicada") + '</p>' +
          '<a class="client-primary-action mt-3 inline-flex px-4 py-2 text-sm" href="' +
          escapeHtml(ViModRoutes.page("architectReviews", { revision: review.id })) +
          '">Abrir revisión</a></article>';
      }).join("")
      : '<p class="text-sm text-on-surface-variant">' +
        (assignedReviews.length ? "No hay proyectos que coincidan con la búsqueda." : "Aún no tienes proyectos asignados.") +
        '</p>';
    ViModCardImages.bindFallbacks(assignedList);
  }

  function updateSummary(reviews, architectId, profile) {
    const open = reviews.filter((review) => review.mode === "open"
      && ["open", "with_applications"].includes(review.status));
    const mine = reviews.filter((review) => review.architectId === architectId
      && ["directed", "assigned", "in_review", "delivered"].includes(review.status));
    const values = {
      "stat-open-reviews": open.length,
      "stat-in-review": mine.filter((review) => review.status === "in_review").length,
      "stat-delivered": mine.filter((review) => review.status === "delivered").length,
      "stat-rating": profile.ratingAverage == null ? "—" : profile.ratingAverage + " / 5",
    };
    Object.keys(values).forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(values[id]);
    });
    assignedReviews = mine;
    renderAssignedReviews();
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      search = searchInput.value.trim().toLocaleLowerCase("es-CO");
      renderAssignedReviews();
    });
  }

  async function initialize() {
    const error = document.getElementById("architect-dashboard-error");
    try {
      const sessionReady = await Storage.whenReady();
      if (!sessionReady) return;
      const user = Storage.getCurrentUser();
      if (!user || !user.id) {
        window.location.href = ViModRoutes.page("login");
        return;
      }
      const [profile, result] = await Promise.all([
        ViModArchitectProfile.initialize(),
        ViModApi.get("/architect/reviews"),
      ]);
      if (error) {
        error.textContent = "";
        error.classList.add("hidden");
      }
      updateSummary(result.reviews || [], user.id, profile);
    } catch (loadError) {
      const message = loadError && loadError.status >= 400 && loadError.status < 500
        ? loadError.message || "No se pudo cargar el panel del arquitecto."
        : "No se pudo cargar el panel del arquitecto.";
      ViMod.showRetryError(
        error,
        message,
        initialize,
      );
    }
  }

  initialize();
})();
