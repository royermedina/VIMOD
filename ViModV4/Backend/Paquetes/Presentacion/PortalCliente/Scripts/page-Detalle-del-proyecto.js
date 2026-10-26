(function () {
  const analysisBtn = document.getElementById("btn-run-analysis");
  const progressText = document.getElementById("progress-indicator");
  const progressBanner = document.getElementById("analysis-progress-banner");
  const progressBarFill = document.getElementById("progress-bar-fill");
  const proposalStatusText = document.getElementById("proposal-status-text");
  const closeProjectBtn = document.getElementById("btn-close-project");
  const editProjectButtons = [
    document.getElementById("btn-edit-project"),
    document.getElementById("btn-edit-project-inline"),
  ].filter(Boolean);
  const archiveProjectBtn = document.getElementById("btn-archive-project");
  const deleteProjectBtn = document.getElementById("btn-delete-project");
  const projectTitle = document.getElementById("project-title");
  const projectStatus = document.getElementById("project-status");
  const projectReference = document.getElementById("project-reference");
  const projectUpdatedAt = document.getElementById("project-updated-at");
  const terrainArea = document.getElementById("terrain-area");
  const terrainDimensions = document.getElementById("terrain-dimensions");
  const terrainLocation = document.getElementById("terrain-location");
  const terrainWidth = document.getElementById("terrain-width");
  const terrainLength = document.getElementById("terrain-length");
  const terrainLoadWarning = document.getElementById("terrain-load-warning");
  const projectLoadError = document.getElementById("project-load-error");
  const projectBudget = document.getElementById("project-budget");
  const projectNeeds = document.getElementById("project-needs");
  const projectNeedsDetails = document.getElementById("project-needs-details");
  const contractedSummary = document.getElementById("contracted-project-summary");
  const contractedDetails = document.getElementById("contracted-project-details");
  const editModal = document.getElementById("project-edit-modal");
  const editForm = document.getElementById("project-edit-form");
  const editError = document.getElementById("project-edit-error");
  const terrainPreviewButton = document.getElementById("btn-expand-terrain-preview");
  const terrainPreviewModal = document.getElementById("terrain-preview-modal");
  const terrainPreviewImage = document.getElementById("terrain-preview-image");
  const terrainPreviewLarge = document.getElementById("terrain-preview-large");
  const workProgressPanel = document.getElementById("work-progress-panel");
  const urlParams = new URLSearchParams(window.location.search);
  const proyectoId = urlParams.get("proyecto");
  const isWorkView = urlParams.get("vista") === "trabajo";
  let analysisRunning = false;
  let projectAnalysis = null;
  let projectTerrainAvailable = false;

  function formatDimension(value) {
    const dimension = Number(value);
    return Number.isFinite(dimension)
      ? dimension.toLocaleString("es-CO", { maximumFractionDigits: 2 }) + " m"
      : "—";
  }

  function displayProjectData(project) {
    if (projectBudget) {
      projectBudget.textContent = project.presupuesto === undefined
        ? "—"
        : ViMod.formatMoney(project.presupuesto);
    }
    if (projectNeeds) {
      const bedrooms = project.habitaciones === undefined ? "—" : project.habitaciones;
      const bathrooms = project.banos === undefined ? "—" : project.banos;
      projectNeeds.textContent = bedrooms + " habitaciones · " + bathrooms + " baños";
    }
    if (projectNeedsDetails) {
      projectNeedsDetails.textContent = "Necesidades registradas por el cliente";
    }
    const payment = project.payment;
    if (contractedSummary && contractedDetails) {
      contractedSummary.classList.toggle("hidden", !payment || !payment.paid);
      if (payment && payment.paid) {
        const date = payment.paidAt ? new Date(payment.paidAt) : null;
        const dateLabel = date && !Number.isNaN(date.getTime())
          ? date.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })
          : "Fecha no disponible";
        contractedDetails.textContent =
          (payment.proposalName || (payment.offerId ? "Oferta de constructora" : "Compra del proyecto")) +
          " · " + ViMod.formatMoney(payment.amount) + " COP · " + dateLabel +
          " · " + (payment.provider === "stripe" ? "Stripe" : "Simulación") +
          (payment.contractorName ? " · Constructora: " + payment.contractorName : "");
      }
    }
  }

  function toggleModal(modal, open) {
    if (!modal) return;
    modal.classList.toggle("hidden", !open);
    modal.classList.toggle("flex", open);
  }

  function fillEditForm(project) {
    document.getElementById("edit-project-name").value = project.nombre || "";
    document.getElementById("edit-project-budget").value = project.presupuesto || "";
    document.getElementById("edit-project-bedrooms").value = project.habitaciones || "";
    document.getElementById("edit-project-bathrooms").value = project.banos || "";
  }

  function displayTerrainData(terrain) {
    if (!terrain) return;
    const area = Number(terrain.area);
    const width = formatDimension(terrain.ancho);
    const length = formatDimension(terrain.largo);
    if (terrainArea) {
      terrainArea.textContent = Number.isFinite(area)
        ? area.toLocaleString("es-CO", { maximumFractionDigits: 2 }) + " m²"
        : "—";
    }
    if (terrainDimensions) terrainDimensions.textContent = width + " × " + length;
    if (terrainWidth) terrainWidth.textContent = width;
    if (terrainLength) terrainLength.textContent = length;
    if (terrainLocation) terrainLocation.textContent = "Terreno: " + terrain.ubicacion;
  }

  async function loadProject() {
    const proyecto = proyectoId
      ? await Storage.fetchProjectById(proyectoId)
      : null;
    if (!proyecto) return null;
    if (projectTitle) projectTitle.textContent = "Proyecto: " + proyecto.nombre;
    if (projectStatus) projectStatus.textContent = "Estado actual: " + proyecto.estado;
    if (projectReference) projectReference.textContent = "Proyecto #" + proyecto.id.slice(0, 8);
    if (projectUpdatedAt) {
      const updatedAt = new Date(proyecto.updated_at || proyecto.created_at);
      projectUpdatedAt.textContent = Number.isNaN(updatedAt.getTime())
        ? "Fecha de actualización no disponible"
        : "Actualizado: " + updatedAt.toLocaleString("es-CO");
    }
    displayProjectData(proyecto);
    try {
      if (!proyecto.terrenoId) throw new Error("El proyecto no tiene un terreno asociado.");
      const terrain = await Storage.fetchTerrenoById(proyecto.terrenoId);
      displayTerrainData(terrain);
      projectTerrainAvailable = Number.isFinite(Number(terrain.ancho))
        && Number(terrain.ancho) > 0
        && Number.isFinite(Number(terrain.largo))
        && Number(terrain.largo) > 0;
      if (!projectTerrainAvailable && terrainLoadWarning) {
        terrainLoadWarning.textContent = "El terreno no tiene dimensiones válidas registradas.";
        terrainLoadWarning.classList.remove("hidden");
      }
    } catch (error) {
      projectTerrainAvailable = false;
      ViMod.showRetryError(
        terrainLoadWarning,
        "No se pudieron cargar los datos del terreno: " + error.message,
        async function () {
          const terrain = await Storage.fetchTerrenoById(proyecto.terrenoId);
          displayTerrainData(terrain);
          projectTerrainAvailable = Number(terrain.ancho) > 0 && Number(terrain.largo) > 0;
          terrainLoadWarning.classList.add("hidden");
        },
      );
    }
    const isClosed = proyecto.estado === "Cerrado" || proyecto.estado === "Archivado";
    if (closeProjectBtn) {
      closeProjectBtn.disabled = isClosed;
      closeProjectBtn.innerHTML = isClosed
        ? '<span class="material-symbols-outlined text-base">task_alt</span>' + proyecto.estado
        : '<span class="material-symbols-outlined text-base">lock</span>Cerrar proyecto';
    }
    editProjectButtons.forEach(function (button) {
      button.disabled = proyecto.estado !== "Borrador";
      button.title = button.disabled
        ? "Solo se editan proyectos en borrador"
        : "Editar datos del proyecto";
    });
    if (archiveProjectBtn) archiveProjectBtn.disabled = proyecto.estado === "Archivado";
    if (deleteProjectBtn) deleteProjectBtn.disabled = proyecto.estado === "Archivado";
    fillEditForm(proyecto);
    return proyecto;
  }

  function setWorkStage(id, label, complete) {
    const stage = document.getElementById(id);
    if (!stage) return;
    stage.textContent = (complete ? "✓ " : "○ ") + label;
    stage.classList.toggle("text-primary", complete);
    stage.classList.toggle("font-semibold", complete);
  }

  function workRoute(pageName) {
    return ViModRoutes.page(pageName, { proyecto: proyectoId });
  }

  async function updateWorkProgress(project, selectedProposal) {
    if (!isWorkView || !workProgressPanel) return;
    workProgressPanel.classList.remove("hidden");
    const nextStep = document.getElementById("work-next-step");
    const projectReady = !!project
      && !!project.terrenoId
      && Number.isFinite(Number(project.presupuesto))
      && Number(project.presupuesto) > 0
      && Number.isInteger(Number(project.habitaciones))
      && Number(project.banos) > 0
      && Number.isInteger(Number(project.banos));
    const reviewResult = await ViModApi.get(
      "/projects/" + encodeURIComponent(proyectoId) + "/reviews",
    );
    const quoteResult = await ViModApi.get(
      "/projects/" + encodeURIComponent(proyectoId) + "/quotes",
    );
    const reviews = reviewResult.reviews || [];
    const quotes = quoteResult.quotes || [];
    const hasReviewRequest = reviews.some((review) => review.active);
    const hasReview = reviews.some((review) => review.status === "delivered");
    const reviewInProgress = reviews.some((review) => review.status === "in_review");
    const hasQuoteRequest = quotes.some((quote) => quote.status === "requested");
    const acceptedQuote = quotes.some((quote) => quote.status === "accepted");
    const receivedQuote = quotes.some((quote) => quote.status === "responded");
    const expiredQuote = quotes.some((quote) => quote.status === "expired");
    const rejectedQuote = quotes.some((quote) => quote.status === "rejected");
    const hasQuote = acceptedQuote || receivedQuote || expiredQuote || rejectedQuote;
    const stages = [
      projectTerrainAvailable,
      projectReady,
      !!selectedProposal,
      hasReview,
      hasQuote,
    ];
    setWorkStage("work-stage-terrain", "Terreno registrado", stages[0]);
    setWorkStage("work-stage-project", "Datos del proyecto completos", stages[1]);
    setWorkStage(
      "work-stage-proposal",
      project.payment && project.payment.paid ? "Propuesta contratada" : "Propuesta seleccionada",
      stages[2],
    );
    setWorkStage(
      "work-stage-review",
      hasReview ? "Dictamen entregado"
        : reviewInProgress ? "Revisión en curso"
          : hasReviewRequest ? "Solicitud de revisión abierta"
            : "Revisión técnica pendiente",
      stages[3],
    );
    setWorkStage(
      "work-stage-quote",
      acceptedQuote ? "Cotización aceptada"
        : receivedQuote ? "Cotización recibida"
          : expiredQuote ? "Cotización vencida"
            : rejectedQuote ? "Cotización rechazada"
              : hasQuoteRequest ? "Solicitud enviada; pendiente" : "Cotización pendiente",
      stages[4],
    );

    const completed = stages.filter(Boolean).length;
    const summary = document.getElementById("work-progress-summary");
    if (summary) summary.textContent = completed + " de 5 etapas registradas en el proyecto.";
    if (!nextStep) return;

    let route = "#project-title";
    let label = "Revisar datos del proyecto";
    if (projectTerrainAvailable && projectReady && !selectedProposal) {
      route = workRoute("proposals");
      label = "Elegir una propuesta";
    } else if (projectTerrainAvailable && projectReady && selectedProposal && !hasReview) {
      route = workRoute("architectReview");
      label = hasReviewRequest ? "Consultar revisión técnica" : "Solicitar revisión técnica";
    } else if (projectTerrainAvailable && projectReady && selectedProposal && hasReview && !hasQuote) {
      route = workRoute("contractorCatalog");
      label = "Consultar cotizaciones";
    } else if (projectTerrainAvailable && projectReady && selectedProposal && hasReview && hasQuote) {
      route = workRoute("contractorCatalog");
      label = "Ver cotizaciones";
    }
    nextStep.href = route;
    const labelNode = nextStep.querySelector("span:last-child");
    if (labelNode) labelNode.textContent = label;
  }

  function setProgress(val) {
    if (progressText) progressText.textContent = val + "%";
    if (progressBarFill) progressBarFill.style.width = val + "%";
  }

  function showAnalysisState(state) {
    if (state === "progress") {
      if (progressBanner) progressBanner.style.display = "block";
      if (analysisBtn) analysisBtn.style.display = "none";
      if (proposalStatusText) proposalStatusText.style.display = "none";
    } else if (state === "done") {
      if (progressBanner) progressBanner.style.display = "none";
      if (analysisBtn) analysisBtn.style.display = "none";
      if (proposalStatusText) proposalStatusText.style.display = "block";
    } else if (state === "closed") {
      if (progressBanner) progressBanner.style.display = "none";
      if (analysisBtn) analysisBtn.style.display = "none";
      if (proposalStatusText) {
        proposalStatusText.style.display = "block";
        proposalStatusText.textContent = loadedProject && loadedProject.estado === "Archivado"
          ? "Proyecto archivado"
          : "Proyecto cerrado y registrado";
      }
    } else {
      if (progressBanner) progressBanner.style.display = "none";
      if (analysisBtn) analysisBtn.style.display = "flex";
      if (proposalStatusText) proposalStatusText.style.display = "none";
    }
  }

  async function runAnalysis() {
    if (analysisRunning || !proyectoId) return;
    analysisRunning = true;
    if (analysisBtn) analysisBtn.disabled = true;
    showAnalysisState("progress");
    setProgress(0);
    try {
      projectAnalysis = await Storage.analyzeProject(proyectoId);
      await Storage.generateProjectProposals(proyectoId, false);
      setProgress(100);
      window.location.href = workRoute("proposals");
    } catch (error) {
      analysisRunning = false;
      if (analysisBtn) analysisBtn.disabled = false;
      showAnalysisState("idle");
      ViMod.showRetryError(projectLoadError, error.message, runAnalysis);
    }
  }

  async function updateUIByProjectState() {
    projectAnalysis = null;
    if (!proyectoId) {
      showAnalysisState("idle");
      return;
    }

    const proyecto = loadedProject || Storage.getProyectoById(proyectoId);
    if (!proyecto) {
      showAnalysisState("idle");
      return;
    }

    if (proyecto.estado === "Cerrado" || proyecto.estado === "Archivado") {
      showAnalysisState("closed");
    } else {
      try {
        projectAnalysis = await Storage.fetchProjectAnalysis(proyectoId);
        showAnalysisState("done");
        if (proposalStatusText) {
          proposalStatusText.textContent =
            "Análisis preliminar persistido · " + projectAnalysis.catalogVersion;
        }
      } catch (error) {
        if (error.status === 404) {
          showAnalysisState("idle");
        } else {
          showAnalysisState("idle");
          alert(error.message);
          return;
        }
      }
    }

    let propuestasDelProyecto = [];
    try {
      const response = await Storage.fetchProjectProposals(proyectoId);
      propuestasDelProyecto = response.proposals;
    } catch (error) {
      if (error.status !== 404 || error.code === "ROUTE_NOT_FOUND") throw error;
    }
    let seleccionada = null;
    if (proyectoId) {
      const selectedResult = await ViModApi.get(
        "/projects/" + encodeURIComponent(proyectoId) + "/selected-proposal",
      );
      seleccionada = selectedResult.proposal;
      await updateWorkProgress(proyecto, seleccionada);
    }
    const tabCount = document.getElementById("proposal-tab-count");
    if (tabCount) tabCount.textContent = String(propuestasDelProyecto.length);
    const chip = document.getElementById("selected-proposal-chip");
    const chipText = document.getElementById("selected-proposal-chip-text");
    if (chip) {
      if (seleccionada) {
        chip.style.display = "inline-flex";
        if (chipText)
          chipText.textContent =
              (seleccionada.contracted ? "Contratada y pagada: " : "Seleccionada: ") +
            (seleccionada.code
              ? "Propuesta " + seleccionada.code + " · "
              : "") +
            seleccionada.name;
      } else {
        chip.style.display = "none";
      }
    }
    if (proposalStatusText && seleccionada) {
      proposalStatusText.textContent =
        "Propuestas generadas • Seleccionada: " + seleccionada.name;
    }
  }

  let loadedProject = null;
  if (closeProjectBtn) {
    closeProjectBtn.addEventListener("click", async function () {
      if (!proyectoId || !loadedProject || loadedProject.estado === "Cerrado"
        || loadedProject.estado === "Archivado") return;
      if (!confirm("¿Deseas cerrar este proyecto? Quedará registrado en Mis proyectos.")) return;
      closeProjectBtn.disabled = true;
      try {
        loadedProject = await Storage.closeProyecto(proyectoId);
        if (projectStatus) projectStatus.textContent = "Estado actual: " + loadedProject.estado;
        closeProjectBtn.textContent = "Proyecto cerrado";
        showAnalysisState("closed");
        alert("Proyecto cerrado y guardado correctamente.");
      } catch (error) {
        alert(error.message);
      } finally {
        closeProjectBtn.disabled = loadedProject && (
          loadedProject.estado === "Cerrado" || loadedProject.estado === "Archivado"
        );
      }
    });
  }

  async function initializeProjectPage() {
    await Storage.whenReady();
    try {
      loadedProject = await loadProject();
      await updateUIByProjectState();
    } catch (error) {
      showAnalysisState("idle");
      ViMod.showRetryError(projectLoadError, error.message, initializeProjectPage);
      const workSummary = document.getElementById("work-progress-summary");
      if (isWorkView && workSummary && workProgressPanel) {
        workProgressPanel.classList.remove("hidden");
        workSummary.textContent = "No se pudo cargar el avance: " + error.message;
      }
    }
  }

  initializeProjectPage();

  const tabPropuestas = document.getElementById("tab-propuestas-btn");
  const proposalButtons = [
    tabPropuestas,
    document.getElementById("work-open-proposals"),
  ];
  proposalButtons.forEach(function (button) {
    if (button) {
      button.addEventListener("click", function () {
        if (proyectoId) {
          window.location.href = workRoute("proposals");
        }
      });
    }
  });
  const reviewNavigation = document.getElementById("tab-reviews-btn");
  const requestReviewButton = document.getElementById("btn-request-review");
  [
    reviewNavigation,
    requestReviewButton,
    document.getElementById("work-open-reviews"),
  ].forEach(function (button) {
    if (button) button.addEventListener("click", function () {
      if (proyectoId) {
        window.location.href = workRoute("architectReview");
      }
    });
  });
  const quotesNavigation = document.getElementById("tab-quotes-btn");
  [quotesNavigation, document.getElementById("work-open-quotes")].forEach(function (button) {
    if (button) button.addEventListener("click", function () {
      if (proyectoId) {
        window.location.href = workRoute("contractorCatalog");
      }
    });
  });

  if (analysisBtn) {
    analysisBtn.addEventListener("click", async function () {
      if (!proyectoId) {
        alert("No se encontró el proyecto");
        return;
      }
      await runAnalysis();
    });
  }

  editProjectButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      if (!loadedProject || loadedProject.estado !== "Borrador") return;
      fillEditForm(loadedProject);
      if (editError) {
        editError.textContent = "";
        editError.classList.add("hidden");
      }
      toggleModal(editModal, true);
    });
  });

  [document.getElementById("btn-close-edit-modal"), document.getElementById("btn-cancel-edit")]
    .forEach(function (button) {
      if (button) button.addEventListener("click", function () {
        toggleModal(editModal, false);
      });
    });

  if (editForm) {
    editForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!loadedProject || !proyectoId) return;
      const saveButton = document.getElementById("btn-save-project");
      const data = {
        nombre: document.getElementById("edit-project-name").value.trim(),
        terrain_id: loadedProject.terrenoId,
        presupuesto: Number(document.getElementById("edit-project-budget").value),
        habitaciones: Number(document.getElementById("edit-project-bedrooms").value),
        banos: Number(document.getElementById("edit-project-bathrooms").value),
      };
      if (saveButton) saveButton.disabled = true;
      try {
        loadedProject = await Storage.updateRemoteProject(proyectoId, data);
        await loadProject();
        await updateUIByProjectState();
        toggleModal(editModal, false);
        alert("Los datos del proyecto se actualizaron.");
      } catch (error) {
        if (editError) {
          editError.textContent = error.message;
          editError.classList.remove("hidden");
        } else alert(error.message);
      } finally {
        if (saveButton) saveButton.disabled = false;
      }
    });
  }

  function returnToProjectList() {
    window.location.href = ViModRoutes.page("clientDashboard");
  }

  if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener("click", async function () {
      if (!loadedProject || !proyectoId) return;
      if (!confirm("¿Eliminar este proyecto? Solo se pueden borrar borradores sin actividad.")) return;
      deleteProjectBtn.disabled = true;
      try {
        await Storage.deleteRemoteProject(proyectoId);
        returnToProjectList();
      } catch (error) {
        if (error.status !== 409) {
          alert(error.message);
          deleteProjectBtn.disabled = false;
          return;
        }
        if (!confirm(error.message + "\n\n¿Deseas archivarlo en lugar de eliminarlo?")) {
          deleteProjectBtn.disabled = false;
          return;
        }
        try {
          await Storage.archiveRemoteProject(proyectoId);
          alert("El proyecto quedó archivado y conserva su actividad.");
          returnToProjectList();
        } catch (archiveError) {
          alert(archiveError.message);
          deleteProjectBtn.disabled = false;
        }
      }
    });
  }

  if (archiveProjectBtn) {
    archiveProjectBtn.addEventListener("click", async function () {
      if (!loadedProject || !proyectoId || loadedProject.estado === "Archivado") return;
      if (!confirm("¿Archivar este proyecto? Se conservarán sus propuestas, revisiones y cotizaciones.")) return;
      archiveProjectBtn.disabled = true;
      try {
        await Storage.archiveRemoteProject(proyectoId);
        returnToProjectList();
      } catch (error) {
        alert(error.message);
        archiveProjectBtn.disabled = false;
      }
    });
  }

  if (terrainPreviewButton && terrainPreviewImage && terrainPreviewLarge) {
    const closeTerrainPreview = document.getElementById("btn-close-terrain-modal");
    terrainPreviewButton.addEventListener("click", function () {
      terrainPreviewLarge.src = terrainPreviewImage.src;
      toggleModal(terrainPreviewModal, true);
    });
    if (closeTerrainPreview) {
      closeTerrainPreview.addEventListener("click", function () {
        toggleModal(terrainPreviewModal, false);
      });
    }
    terrainPreviewModal.addEventListener("click", function (event) {
      if (event.target === terrainPreviewModal) toggleModal(terrainPreviewModal, false);
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      toggleModal(editModal, false);
      toggleModal(terrainPreviewModal, false);
    }
  });
})();
