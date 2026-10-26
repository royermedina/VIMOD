(function () {
  const params = new URLSearchParams(window.location.search);
  const propuestaId = params.get("propuesta");
  const projectId = params.get("proyecto");

  const formatMoney = ViMod.formatMoney;
  let currentProposal = null;
  let isSelected = false;
  let projectPaymentState = null;
  let activePaymentSession = null;

  function paymentStatusLabel(order) {
    const labels = {
      created: "Listo para pagar",
      pending: "Pago pendiente",
      approved: "Pago aprobado",
      declined: "Pago rechazado",
      cancelled: "Pago cancelado",
      expired: "Pago expirado",
      error: "Error de pago",
      voided: "Pago anulado",
      not_configured: "Proveedor no configurado",
      awaiting_payment_configuration: "Esperando configuración de pago",
      payment_pending: "Pago pendiente",
      payment_failed: "Pago fallido",
      payment_cancelled: "Pago cancelado",
      payment_expired: "Pago expirado",
      paid: "Pagado",
    };
    const status = order.paymentStatus || order.orderStatus || "sin estado";
    return labels[status] || status;
  }

  function openPaymentSimulation(order, session) {
    activePaymentSession = session;
    const dialog = document.getElementById("payment-simulation-dialog");
    const orderNode = document.getElementById("simulation-order-id");
    const amountNode = document.getElementById("simulation-order-amount");
    const referenceNode = document.getElementById("simulation-payment-reference");
    const method = document.getElementById("simulation-payment-method");
    const result = document.getElementById("simulation-payment-result");
    const reason = document.getElementById("simulation-payment-reason");
    const feedback = document.getElementById("simulation-payment-feedback");
    if (!dialog || !session) return;
    if (orderNode) orderNode.textContent = order.id;
    if (amountNode) amountNode.textContent = formatMoney(order.amount) + " COP";
    if (referenceNode) referenceNode.textContent = session.reference;
    if (method) method.innerHTML = (session.methods || []).map((item) =>
      '<option value="' + ViMod.escapeHtml(item.value) + '">' + ViMod.escapeHtml(item.label) + '</option>'
    ).join("");
    if (result) result.innerHTML = (session.results || []).map((item) =>
      '<option value="' + ViMod.escapeHtml(item.value) + '">' + ViMod.escapeHtml(item.label) + '</option>'
    ).join("");
    if (reason) reason.value = "";
    if (feedback) feedback.textContent = session.disclaimer || "Simulación académica interna. No se realiza ningún cobro real.";
    dialog.showModal();
  }

  function bindPaymentSimulation() {
    const dialog = document.getElementById("payment-simulation-dialog");
    const form = document.getElementById("payment-simulation-form");
    const close = document.getElementById("close-payment-simulation");
    if (!dialog || !form) return;
    if (close) close.addEventListener("click", () => dialog.close());
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!activePaymentSession) return;
      const submit = document.getElementById("confirm-payment-simulation");
      if (submit) submit.disabled = true;
      try {
        const result = await ViModApi.post(
          "/payments/" + encodeURIComponent(activePaymentSession.paymentId) + "/resolve",
          {
            method: document.getElementById("simulation-payment-method").value,
            result: document.getElementById("simulation-payment-result").value,
            reason: document.getElementById("simulation-payment-reason").value.trim(),
          },
        );
        const orderStatus = document.getElementById("payment-order-status");
        if (orderStatus) {
          orderStatus.textContent = "Pago simulado " +
            paymentStatusLabel({ paymentStatus: result.payment.status }) + ".";
          orderStatus.classList.remove("hidden");
        }
        dialog.close();
        await refreshProjectPaymentState();
      } catch (error) {
        const feedback = document.getElementById("simulation-payment-feedback");
        if (feedback) feedback.textContent = error.message || "No se pudo guardar el resultado simulado.";
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  function displayStripeCheckout(session) {
    const checkout = document.getElementById("stripe-checkout-panel");
    const amount = document.getElementById("stripe-checkout-amount");
    const button = document.getElementById("stripe-checkout-button");
    if (!checkout || !amount || !button) {
      throw new Error("No está disponible el panel de pago con Stripe.");
    }
    const usd = (session.amountUsdCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    amount.textContent = formatMoney(session.amountCop) + " · " + usd +
      " aprox. (tasa: " + Number(session.copPerUsd).toLocaleString("es-CO") + " COP/USD)";
    button.href = session.url;
    checkout.classList.remove("hidden");
    button.focus();
  }

  async function handleStripeReturn() {
    const paymentStatus = params.get("pago");
    const statusNode = document.getElementById("payment-order-status");
    if (paymentStatus === "exito" && params.get("session_id")) {
      try {
        const result = await ViModApi.post("/payments/stripe/confirm", {
          sessionId: params.get("session_id"),
        });
        if (statusNode) {
          statusNode.textContent = result.status === "approved"
            ? "Pago aprobado por Stripe. La orden está pagada."
            : result.status === "expired"
              ? "La sesión de pago expiró. Puedes volver a intentarlo."
              : "Stripe todavía informa el pago como pendiente. Actualiza en unos momentos.";
          statusNode.classList.remove("hidden");
        }
        await refreshProjectPaymentState();
      } catch (error) {
        if (statusNode) {
          statusNode.textContent = error.message || "No se pudo confirmar el pago con Stripe.";
          statusNode.classList.remove("hidden");
        }
      }
    } else if (paymentStatus === "cancelado") {
      const orderId = params.get("orden_id");
      try {
        if (orderId) {
          await ViModApi.post("/orders/" + encodeURIComponent(orderId) + "/payment-cancel", {});
        }
        if (statusNode) {
          statusNode.textContent = "Cancelaste el pago. La orden no se marcó como pagada; puedes reintentarlo.";
          statusNode.classList.remove("hidden");
        }
      } catch (error) {
        if (statusNode) {
          statusNode.textContent = error.message || "El pago fue cancelado, pero no se pudo actualizar su estado.";
          statusNode.classList.remove("hidden");
        }
      }
      const checkout = document.getElementById("stripe-checkout-panel");
      if (checkout) checkout.classList.add("hidden");
      await refreshProjectPaymentState();
    }
  }

  function formatPaymentDate(value) {
    if (!value) return "Fecha no disponible";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Fecha no disponible"
      : date.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  }

  function renderPaymentHistory(orders) {
    const section = document.getElementById("payment-history-section");
    const list = document.getElementById("payment-history-list");
    if (!section || !list) return;
    const projectOrders = (orders || []).filter((order) => order.projectId === projectId);
    list.replaceChildren();
    projectOrders.forEach((order) => {
      const item = document.createElement("li");
      const status = order.paymentStatus || order.payment && order.payment.status || "created";
      const labels = {
        approved: "Aprobado",
        created: "Pendiente",
        pending: "Pendiente",
        declined: "Rechazado",
        cancelled: "Cancelado",
        expired: "Expirado",
        payment_failed: "Rechazado",
        payment_cancelled: "Cancelado",
        payment_expired: "Expirado",
      };
      const provider = order.payment && order.payment.provider === "stripe"
        ? "Stripe"
        : "Simulación";
      const date = order.payment && order.payment.updatedAt || order.updatedAt || order.createdAt;
      item.className = "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container-low p-3 text-sm";
      const summary = document.createElement("span");
      summary.className = "text-on-surface";
      summary.textContent = formatPaymentDate(date) + " · " + formatMoney(order.amount) +
        " COP · " + provider;
      const badge = document.createElement("span");
      badge.className = "rounded-full bg-secondary-container px-3 py-1 text-xs font-bold text-on-secondary-container";
      badge.textContent = labels[status] || "Pendiente";
      item.append(summary, badge);
      list.appendChild(item);
    });
    section.classList.toggle("hidden", projectOrders.length === 0);
  }

  function updateContractedProjectUI(payment, selected = isSelected) {
    if (payment && typeof payment === "object") projectPaymentState = payment;
    const currentPayment = projectPaymentState;
    const paid = Boolean(currentPayment && currentPayment.paid);
    const badge = document.getElementById("badge-selected");
    const btn = document.getElementById("btn-select-proposal");
    const orderBtn = document.getElementById("btn-create-order");
    const workButton = document.getElementById("btn-work-project");
    const badgeText = badge && badge.querySelector("span:last-child");
    if (badge) badge.style.display = (paid || selected) ? "inline-flex" : "none";
    if (badgeText && paid) {
      badgeText.textContent = currentPayment.proposalId === (currentProposal && currentProposal.id)
        ? "Propuesta contratada y pagada"
        : "El proyecto ya tiene una propuesta contratada";
    }
    if (btn) {
      btn.style.display = (paid || selected) ? "none" : "inline-flex";
    }
    if (orderBtn) {
      if (paid) orderBtn.remove();
      else orderBtn.disabled = !selected;
    }
    if (workButton) {
      workButton.href = ViModRoutes.page("projectDetail", {
        proyecto: projectId,
        vista: "trabajo",
      });
      workButton.classList.toggle("hidden", !selected && !paid);
      workButton.classList.toggle("inline-flex", selected || paid);
    }
    const summary = document.getElementById("contracted-project-summary");
    const details = document.getElementById("contracted-project-details");
    if (summary && details) {
      summary.classList.toggle("hidden", !paid);
      if (paid) {
        const name = currentPayment.proposalName || (currentPayment.offerId ? "Oferta de constructora" : "Compra del proyecto");
        const provider = currentPayment.provider === "stripe" ? "Stripe" : "Simulación";
        const contractor = currentPayment.contractorName ? " · Constructora: " + currentPayment.contractorName : "";
        details.textContent = name + " · " + formatMoney(currentPayment.amount) + " COP · " +
          formatPaymentDate(currentPayment.paidAt) + " · Proveedor: " + provider + contractor + ".";
      }
    }
  }

  async function refreshProjectPaymentState() {
    const [projectResult, ordersResult] = await Promise.all([
      ViModApi.get("/projects/" + encodeURIComponent(projectId)),
      ViModApi.get("/orders"),
    ]);
    const project = projectResult.project;
    updateContractedProjectUI(project && project.payment);
    renderPaymentHistory(ordersResult.orders || []);
    return project && project.payment;
  }

  async function loadProposal() {
    await Storage.whenReady();
    let proposal;
    try {
      proposal = projectId && propuestaId
        ? await Storage.fetchProjectProposalById(projectId, propuestaId)
        : propuestaId ? Storage.getPropuestaById(propuestaId) : null;
    } catch (error) {
      ViMod.showRetryError(
        document.getElementById("proposal-detail-error"),
        error.message || "No se pudo cargar la propuesta.",
        loadProposal,
      );
      return;
    }
    if (!proposal) {
      ViMod.showRetryError(
        document.getElementById("proposal-detail-error"),
        "No se encontró la propuesta solicitada.",
        loadProposal,
      );
      return;
    }
    const detailError = document.getElementById("proposal-detail-error");
    if (detailError) {
      detailError.replaceChildren();
      detailError.classList.add("hidden");
    }

    const estimate = proposal.estimate || null;
    const letter = proposal.codigo || "";
    const title = document.getElementById("proposal-title");
    const iteration = document.getElementById("proposal-iteration");
    const cost = document.getElementById("proposal-cost");
    const area = document.getElementById("proposal-area");
    const time = document.getElementById("proposal-time");
    const energy = document.getElementById("proposal-energy");
    const footprint = document.getElementById("proposal-footprint");
    const assumptions = document.getElementById("proposal-estimate-assumptions");
    const costText = document.getElementById("proposal-cost-assumption");
    const timeText = document.getElementById("proposal-time-assumption");
    const energyText = document.getElementById("proposal-energy-assumption");
    currentProposal = proposal;
    if (title) title.textContent = (letter ? "Propuesta " + letter + ": " : "") + proposal.nombre;
    if (iteration) iteration.textContent = "Estimación " + (estimate ? estimate.catalogVersion || "académica" : "local");
    if (cost) cost.textContent = formatMoney(estimate ? estimate.costCop : proposal.costo);
    if (area) area.textContent = (estimate ? estimate.areaM2 : proposal.area) + " m²";
    if (time) time.textContent = estimate ? estimate.executionDays + " días" : proposal.tiempo || "—";
    if (energy) energy.textContent = estimate
      ? Number(estimate.energyKwhPerYear).toLocaleString("es-CO") + " " + estimate.energyUnit
      : "— kWh/año";
    if (footprint && estimate) {
      footprint.textContent = estimate.parameters.layout.footprintWidthM + " × " +
        estimate.parameters.layout.footprintLengthM + " m";
    }
    if (assumptions) assumptions.textContent = estimate ? estimate.assumptions : "Estimación no disponible.";
    if (costText && estimate) costText.textContent = "Catálogo académico expresado en COP; no es cotización comercial.";
    if (timeText && estimate) timeText.textContent = "Modelo secuencial: " + estimate.parameters.executionDaysRule + " días.";
    if (energyText && estimate) energyText.textContent = "Consumo anual calculado desde la cantidad de módulos por uso.";
    try {
      const selected = await ViModApi.get("/projects/" +
        encodeURIComponent(proposal.proyectoId) + "/selected-proposal");
      isSelected = !!(selected.proposal && selected.proposal.id === proposal.id);
    } catch (error) {
      isSelected = false;
      ViMod.showRetryError(
        detailError,
        error.message || "No se pudo comprobar la propuesta seleccionada.",
        loadProposal,
      );
    }
    updateContractedProjectUI(projectPaymentState, isSelected);

    const backBtn = document.getElementById("btn-back-proposals");
    if (backBtn) backBtn.addEventListener("click", function () {
      window.location.href = ViModRoutes.page("proposals", {
        proyecto: proposal.proyectoId,
      });
    });

    const selectBtn = document.getElementById("btn-select-proposal");
    if (selectBtn) selectBtn.addEventListener("click", async function () {
      selectBtn.disabled = true;
      try {
        await ViModApi.post("/projects/" + encodeURIComponent(proposal.proyectoId) +
          "/select-proposal", { proposalId: proposal.id });
        isSelected = true;
        updateContractedProjectUI(projectPaymentState, true);
        const status = document.getElementById("proposal-selection-status");
        if (status) {
          status.textContent = "La propuesta quedó guardada para este proyecto.";
          status.classList.remove("hidden");
        }
      } catch (error) {
        ViMod.showRetryError(
          detailError,
          error.message || "No se pudo cargar el historial de pedidos.",
          loadProposal,
        );
      } finally {
        selectBtn.disabled = false;
      }
    });
    if (isSelected) {
      const status = document.getElementById("proposal-selection-status");
      if (status) {
        status.textContent = "Esta propuesta está guardada como la seleccionada del proyecto.";
        status.classList.remove("hidden");
      }
    }

    const orderBtn = document.getElementById("btn-create-order");
    const orderStatus = document.getElementById("payment-order-status");
    let pendingProjectOrder = null;
    try {
      const ordersResult = await ViModApi.get("/orders");
      const projectOrders = (ordersResult.orders || []).filter(
        (order) => order.projectId === proposal.proyectoId,
      );
      pendingProjectOrder = projectOrders.find((order) =>
        ["created", "pending", "declined", "cancelled", "expired"].includes(order.paymentStatus));
      if (pendingProjectOrder && orderBtn) orderBtn.textContent = "Continuar con el pago";
      renderPaymentHistory(ordersResult.orders || []);
      const projectResult = await ViModApi.get("/projects/" + encodeURIComponent(projectId));
      updateContractedProjectUI(projectResult.project && projectResult.project.payment, isSelected);
      if (projectPaymentState && projectPaymentState.paid) pendingProjectOrder = null;
    } catch (error) {
      window.alert(error.message);
    }
    if (orderBtn && orderBtn.isConnected) orderBtn.addEventListener("click", async function () {
      if (!currentProposal || !isSelected) return;
      if (!window.confirm("Crear el pedido e iniciar el pago? El importe se toma del pedido guardado en el servidor.")) return;
      orderBtn.disabled = true;
      try {
        if (pendingProjectOrder) {
          const session = await ViModApi.post(
            "/orders/" + encodeURIComponent(pendingProjectOrder.id) + "/payment-session",
            {},
          );
          if (session.session.provider === "stripe") {
            displayStripeCheckout(session.session);
            orderBtn.textContent = "Pago listo en Stripe";
          } else {
            openPaymentSimulation(pendingProjectOrder, session.session);
          }
          return;
        }
        const key = window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : "vimod-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        const result = await ViModApi.post("/projects/" +
          encodeURIComponent(currentProposal.proyectoId) + "/orders", {}, {
          headers: { "Idempotency-Key": key },
        });
        if (orderStatus) {
          orderStatus.textContent = `Pedido ${result.order.id} registrado por ${formatMoney(result.order.amount)}. Preparando el pago...`;
          orderStatus.classList.remove("hidden");
        }
        const session = await ViModApi.post(
          "/orders/" + encodeURIComponent(result.order.id) + "/payment-session",
          {},
        );
        if (session.session.provider === "stripe") {
          displayStripeCheckout(session.session);
          orderBtn.textContent = "Pago listo en Stripe";
        } else {
          openPaymentSimulation(result.order, session.session);
        }
      } catch (error) {
        if (orderStatus) {
          orderStatus.textContent = error.message || "No se pudo iniciar la simulación de pago.";
          orderStatus.classList.remove("hidden");
        }
      } finally {
        orderBtn.disabled = false;
      }
    });

    document.querySelectorAll("button").forEach(function (btn) {
      const text = (btn.textContent || "").trim();
      if (text.indexOf("Solicitar revisión profesional") !== -1) {
        btn.addEventListener("click", function () {
          window.location.href = ViModRoutes.page("architectReview", {
            proyecto: proposal.proyectoId,
          });
        });
      }
      if (text.indexOf("Pedir cotizaciones formales") !== -1) {
        btn.addEventListener("click", function () {
          window.location.href = ViModRoutes.page("contractorCatalog", {
            proyecto: proposal.proyectoId,
          });
        });
      }
    });
  }

  bindPaymentSimulation();
  if (!propuestaId && params.get("pago")) {
    handleStripeReturn();
  } else {
    loadProposal().then(handleStripeReturn);
  }
})();
