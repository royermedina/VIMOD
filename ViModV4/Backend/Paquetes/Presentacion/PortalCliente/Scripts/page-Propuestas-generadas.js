const LETTERS = ["A", "B", "C", "D"];
const IMAGES = [
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuDUhlsWaLL4aDU2xAybZ9gCdycfvS9h8s3Zq00jHlHXtIDVzqJJoMxhztRmEWCM9itTKDhCwplvfakbe-m9tJs3WgviaLYyt1CM5eN6GF63LAg7EaVNfO9SGXuWIjNAXnhlz4R_Mcl77rwO0vExJn7Ml5w_mYYgaf57Ni4S7tBDhDuJ9t6_waTnSoEkCS5mxONoaandCrsBC_6sbfVafwQNInURLBGeMMS9wRQbZ5yqVYH96Uhz59QEyQ",
    caption: "Simulación de fachada",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAAbtGIX5iqVydkTj1mdQuhmOTpGCyV4-C2hQmjKsbTT9O6LneCiby3KeKU4kxu8-8MKn1EuBTaZQ7ECdIfygqFLfucgOClN2yIzooyJw9vduFpChn_LicyAHmohNtGWc2ofusJSVqgC28If41Tt-0u59rH7dPkFbgE5kNid4aV_nPp8FwjAZ8zFRXfcZzXk5TaFGtrbJEWR_t6ZTbsUs3k-Zjuc9-7PvAEmdL-GYtkVEtprCrTN-Sxrg",
    caption: "Simulación bioclimática y jardín",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBXpZ3a8FzklkEXBpo_fAG7j0sYfT3uUXJqxBAlRP-W9DLp9IdjArBkrZLt6Yal6tXFUR2Wl6zW2BnRSLDL7v80F5bwBRcimiISYx1z01WSHo_WwNGzKmqcYF8w3MeULeknR2sZcIdivSqFO9dWF3ofDiVEBdrQbvva9QjKsNXR9rPyK1xCHV4bE7YYEejvJYuoTuG9IWNP8g8r7k6nZNF2X-hhLSMS17K27GwBSpnyHaA7OZ2PXhPXJA",
    caption: "Simulación de volumetría dúplex",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAICWY-mYMg6u7FYPluRw2FIPRrypm-sVONKCdtz2TQi86BP_V3rFa_y6vxQl45YvwjmgsHX2_7OawAUhEO3vKMQyPdxDrG8lCulCOeK7loox4WTLhxPWAnMmCv1xPSJ6nluhKOOazu2d1nueA1nLdHHFJne6rtbMxrbCyVE3iYGgicxT6THi-tZkRrv2dnF-eHHIYnmE7KP6wY9wbV3tjrT-3x1SNB8Lp2E8GiyDU8OyD0hlw7irm-hg",
    caption: "Simulación de patio interior",
  },
];

const formatMoney = ViMod.formatMoney;
let currentProject = null;
let currentProposals = [];
let currentOffers = [];
let currentResult = null;
let activeOfferPaymentSession = null;

function currentProyectoId() {
  return new URLSearchParams(window.location.search).get("proyecto");
}

function proposalNumber(proposal, key, estimateKey) {
  const value = proposal.estimate && proposal.estimate[estimateKey] !== undefined
    ? proposal.estimate[estimateKey]
    : proposal[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function proposalDays(proposal) {
  const estimateDays = proposal.estimate && proposal.estimate.executionDays;
  if (estimateDays !== undefined) return Number(estimateDays);
  const match = String(proposal.tiempo || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function updateContinueButton(proposals) {
  const paid = Boolean(currentProject && currentProject.payment && currentProject.payment.paid);
  const payment = currentProject && currentProject.payment;
  const selected = proposals.find((proposal) =>
    proposal.seleccionada
      || currentProject && currentProject.selected_proposal_id === proposal.id
      || payment && payment.proposalId && proposal.id === payment.proposalId);
  const button = document.getElementById("btn-continue-project");
  if (!button) return;
  if (!selected && !paid) {
    button.classList.add("hidden");
    return;
  }
  button.href = ViModRoutes.page("projectDetail", {
    proyecto: currentProject.id,
    vista: "trabajo",
  });
  button.classList.remove("hidden");
  button.classList.add("inline-flex");
}

function renderOfferCards(project, offers) {
  if (!offers.length) return '';
  const payment = project && project.payment;
  const paid = Boolean(payment && payment.paid);
  return '<section class="col-span-full rounded-xl border border-secondary/30 bg-secondary-container/30 p-5"><h2 class="font-headline text-xl font-bold text-on-surface">Ofertas de constructoras</h2><p class="mt-1 text-sm text-on-surface-variant">Ofertas reales recibidas para este proyecto.</p><div class="mt-4 grid gap-4 md:grid-cols-2">' +
    offers.map((offer) => {
      const contracted = paid && payment.offerId === offer.id;
      const action = paid
        ? '<p class="mt-4 rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">El proyecto ya fue contratado; no se pueden aceptar más ofertas.</p>'
        : offer.estado === 'enviada'
          ? '<button type="button" data-accept-offer="' + escapeProposalText(offer.id) + '" class="mt-4 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-on-primary">Aceptar oferta y crear orden</button>'
          : '';
      return '<article class="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4"><div class="flex items-center justify-between gap-2"><span class="rounded-full bg-secondary px-2 py-1 text-xs font-bold text-on-secondary">Oferta comercial</span><span class="text-xs font-semibold text-on-surface-variant">' + (contracted ? 'Contratada y pagada' : escapeProposalText(offer.estado)) + '</span></div><h3 class="mt-3 font-bold">' + escapeProposalText(offer.contractorName || 'Constructora') + '</h3><p class="mt-1 text-sm text-on-surface-variant">' + formatMoney(offer.precio) + ' COP · ' + escapeProposalText(offer.plazoDias) + ' días</p><p class="mt-2 text-xs text-on-surface-variant">' + escapeProposalText((offer.inclusiones || []).join(' · ')) + '</p>' + action + '</article>';
    }).join('') + '</div></section>';
}

function bindOfferButtons(project) {
  document.querySelectorAll('[data-accept-offer]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await ViModApi.post('/projects/' + encodeURIComponent(project.id) + '/offers/' + encodeURIComponent(button.dataset.acceptOffer) + '/accept', {});
      const order = await ViModApi.post('/projects/' + encodeURIComponent(project.id) + '/orders', { offerId: button.dataset.acceptOffer }, { headers: { 'Idempotency-Key': (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : 'offer-' + Date.now()) } });
      const payment = await ViModApi.post('/orders/' + encodeURIComponent(order.order.id) + '/payment-session', {});
      if (payment.session.provider === 'stripe') {
        displayOfferStripeCheckout(order.order, payment.session);
      } else {
        openOfferPaymentSimulation(order.order, payment.session);
      }
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  }));
}

function displayOfferStripeCheckout(order, session) {
  const panel = document.getElementById("offer-stripe-checkout-panel");
  const amount = document.getElementById("offer-stripe-checkout-amount");
  const button = document.getElementById("offer-stripe-checkout-button");
  if (!panel || !amount || !button) throw new Error("No está disponible el pago con Stripe.");
  const usd = (session.amountUsdCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  amount.textContent = ViMod.formatMoney(session.amountCop) + " · " + usd +
    " aprox. (tasa: " + Number(session.copPerUsd).toLocaleString("es-CO") + " COP/USD)";
  button.href = session.url;
  panel.classList.remove("hidden");
  button.focus();
}

function openOfferPaymentSimulation(order, session) {
  activeOfferPaymentSession = session;
  const dialog = document.getElementById("offer-payment-dialog");
  if (!dialog) throw new Error("No está disponible el diálogo de pago simulado.");
  document.getElementById("offer-payment-order-id").textContent = order.id;
  document.getElementById("offer-payment-amount").textContent = formatMoney(order.amount) + " COP";
  document.getElementById("offer-payment-reference").textContent = session.reference;
  document.getElementById("offer-payment-method").innerHTML = (session.methods || []).map((item) =>
    '<option value="' + ViMod.escapeHtml(item.value) + '">' + ViMod.escapeHtml(item.label) + '</option>'
  ).join("");
  document.getElementById("offer-payment-result").innerHTML = (session.results || []).map((item) =>
    '<option value="' + ViMod.escapeHtml(item.value) + '">' + ViMod.escapeHtml(item.label) + '</option>'
  ).join("");
  document.getElementById("offer-payment-reason").value = "";
  document.getElementById("offer-payment-feedback").textContent =
    session.disclaimer || "Simulación académica interna. No se realiza ningún cobro real.";
  dialog.showModal();
}

function bindOfferPaymentSimulation() {
  const dialog = document.getElementById("offer-payment-dialog");
  const form = document.getElementById("offer-payment-form");
  if (!dialog || !form) return;
  document.getElementById("offer-payment-close").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeOfferPaymentSession) return;
    const submit = document.getElementById("offer-payment-submit");
    const feedback = document.getElementById("offer-payment-feedback");
    submit.disabled = true;
    try {
      const result = await ViModApi.post(
        "/payments/" + encodeURIComponent(activeOfferPaymentSession.paymentId) + "/resolve",
        {
          method: document.getElementById("offer-payment-method").value,
          result: document.getElementById("offer-payment-result").value,
          reason: document.getElementById("offer-payment-reason").value.trim(),
        },
      );
      const status = result.payment.status === "approved" ? "aprobado" :
        result.payment.status === "declined" ? "rechazado" :
          result.payment.status === "cancelled" ? "cancelado" : "pendiente";
      const orderStatus = document.getElementById("offer-payment-status");
      if (orderStatus) {
        orderStatus.textContent = "Pago simulado " + status +
          ". Estado de la orden: " + result.orderStatus + ".";
        orderStatus.classList.remove("hidden");
      }
      dialog.close();
      if (result.payment.status === "approved") await loadProjectProposals(false);
    } catch (error) {
      feedback.textContent = error.message || "No se pudo guardar el resultado simulado.";
    } finally {
      submit.disabled = false;
    }
  });
}

async function handleStripeCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get("pago");
  const status = document.getElementById("offer-payment-status");
  if (payment === "exito" && params.get("session_id")) {
    try {
      const result = await ViModApi.post("/payments/stripe/confirm", {
        sessionId: params.get("session_id"),
      });
      if (status) {
        status.textContent = result.status === "approved"
          ? "Pago aprobado por Stripe. La orden de la oferta está pagada."
          : result.status === "expired"
            ? "La sesión de pago expiró; puedes volver a intentarlo."
            : "Stripe todavía informa el pago como pendiente.";
        status.classList.remove("hidden");
      }
      await loadProjectProposals(false);
    } catch (error) {
      if (status) {
        status.textContent = error.message || "No se pudo confirmar el pago con Stripe.";
        status.classList.remove("hidden");
      }
    }
  } else if (payment === "cancelado") {
    try {
      const orderId = params.get("orden_id");
      if (orderId) {
        await ViModApi.post("/orders/" + encodeURIComponent(orderId) + "/payment-cancel", {});
      }
      if (status) {
        status.textContent = "Pago cancelado. La orden no se marcó como pagada y puedes volver a intentarlo.";
        status.classList.remove("hidden");
      }
      await loadProjectProposals(false);
    } catch (error) {
      if (status) {
        status.textContent = error.message || "No se pudo actualizar el estado del pago cancelado.";
        status.classList.remove("hidden");
      }
    }
  }
}

function renderProposals(project, terreno, propuestas, result, offers = []) {
  currentProject = project;
  currentProposals = propuestas || [];
  currentOffers = offers || [];
  currentResult = result || {};
  const width = Number(terreno.ancho);
  const length = Number(terreno.largo);
  const area = Number(terreno.area);
  const dimensions = Number.isFinite(width) && Number.isFinite(length)
    ? width.toLocaleString("es-CO") + " × " + length.toLocaleString("es-CO") + " m"
    : "dimensiones no disponibles";
  const loteArea = Number.isFinite(area) ? area.toLocaleString("es-CO") : null;
  const loteEl = document.getElementById("lote-summary");
  const subEl = document.getElementById("proposals-subtitle");
  const projectNameEl = document.getElementById("proposal-project-name");
  if (projectNameEl) projectNameEl.textContent = "Proyecto: " + project.nombre + " · ID: " + project.id;
  if (loteEl) loteEl.textContent = "Terreno " + dimensions + (loteArea ? " · " + loteArea + " m²" : "");
  if (subEl) {
    subEl.textContent = "Solicitaste " + project.habitaciones + " habitaciones, " +
      project.banos + " baños y un presupuesto de " +
      formatMoney(project.presupuesto) + ". Las propuestas usan estos datos." +
      (project.payment && project.payment.paid ? " Proyecto contratado y pagado." : "");
  }

  const message = document.getElementById("proposal-list-message");
  if (message) {
    const isOutdated = currentResult.outdated === true;
    const text = isOutdated
      ? currentResult.message || "Los datos cambiaron; regenera las propuestas."
      : currentResult.viable === false
        ? currentResult.message || "No hay propuestas viables con estos datos."
        : currentResult.message || "";
    message.textContent = text;
    message.classList.toggle("hidden", !text);
    message.classList.toggle("bg-error-container", isOutdated || currentResult.viable === false);
    message.classList.toggle("text-on-error-container", isOutdated || currentResult.viable === false);
    message.classList.toggle("bg-secondary-container", !isOutdated && currentResult.viable !== false);
    message.classList.toggle("text-on-secondary-container", !isOutdated && currentResult.viable !== false);
  }

  const regenerateButton = document.getElementById("btn-regenerate-proposals");
  if (regenerateButton) regenerateButton.classList.remove("hidden");
  updateContinueButton(currentProposals);
  applyProposalFilters();
}

function filteredProposals() {
  const maxPrice = Number(document.getElementById("filter-price").value);
  const minArea = Number(document.getElementById("filter-area").value);
  const bedrooms = document.getElementById("filter-bedrooms").value;
  const maxDays = Number(document.getElementById("filter-days").value);
  const sort = document.getElementById("sort-proposals").value;
  const hasPrice = document.getElementById("filter-price").value !== "";
  const hasArea = document.getElementById("filter-area").value !== "";
  const hasDays = document.getElementById("filter-days").value !== "";

  const visible = currentProposals.filter(function (proposal) {
    const price = proposalNumber(proposal, "costo", "costCop");
    const area = proposalNumber(proposal, "area", "areaM2");
    const rooms = Number(proposal.habitaciones || proposal.bedrooms);
    const days = proposalDays(proposal);
    return (!hasPrice || (price !== null && price <= maxPrice))
      && (!hasArea || (area !== null && area >= minArea))
      && (!bedrooms || rooms === Number(bedrooms))
      && (!hasDays || (days !== null && days <= maxDays));
  });
  const sortKeys = {
    "price-asc": (proposal) => proposalNumber(proposal, "costo", "costCop"),
    "price-desc": (proposal) => proposalNumber(proposal, "costo", "costCop"),
    "area-asc": (proposal) => proposalNumber(proposal, "area", "areaM2"),
    "area-desc": (proposal) => proposalNumber(proposal, "area", "areaM2"),
    "bedrooms-asc": (proposal) => Number(proposal.habitaciones || proposal.bedrooms),
    "bedrooms-desc": (proposal) => Number(proposal.habitaciones || proposal.bedrooms),
    "days-asc": proposalDays,
    "days-desc": proposalDays,
  };
  const key = sortKeys[sort];
  if (key) {
    const descending = sort.endsWith("-desc");
    visible.sort(function (first, second) {
      const firstValue = key(first);
      const secondValue = key(second);
      if (firstValue === null) return 1;
      if (secondValue === null) return -1;
      return descending ? secondValue - firstValue : firstValue - secondValue;
    });
  } else {
    visible.sort(function (first, second) {
      return Number(second.recomendada) - Number(first.recomendada);
    });
  }
  return visible;
}

function applyProposalFilters() {
  const grid = document.getElementById("proposals-grid");
  if (!grid) return;
  const visible = filteredProposals();
  const count = document.getElementById("proposal-filter-count");
  if (count) {
    const stale = currentResult.outdated === true;
    const viableCount = currentProposals.filter((proposal) => proposal.viable !== false).length;
    const suffix = stale ? " desactualizadas" : " viables";
    count.textContent = visible.length + " visibles · " + viableCount + " viables de " + currentProposals.length + suffix;
  }
  const countBadge = document.getElementById("proposal-count-badge");
  if (countBadge) {
    const viableCount = currentProposals.filter((proposal) => proposal.viable !== false).length;
    countBadge.textContent = currentResult.outdated
      ? currentProposals.length + " desactualizadas"
      : currentResult.viable === false
        ? "Sin propuestas viables"
        : viableCount + " propuestas viables";
  }
  if (!visible.length && !currentOffers.length) {
    grid.innerHTML =
      '<p class="text-sm text-on-surface-variant">' +
      escapeProposalText(currentProposals.length
        ? "Ninguna propuesta coincide con estos filtros."
        : currentResult.message || "No se encontraron combinaciones viables.") +
      "</p>";
    return;
  }
  grid.innerHTML = (visible.length ? visible
    .map((p, index) => {
      const letter = p.codigo || LETTERS[index] || String(index + 1);
      const num = String(p.indice || index + 1).padStart(2, "0");
      const stale = currentResult.outdated === true || p.stale === true;
      const notViable = p.viable === false;
      const payment = currentProject && currentProject.payment;
      const contracted = Boolean(payment && payment.paid && payment.proposalId === p.id);
      const selectedBadge = contracted
        ? '<span class="font-label text-xs px-space-8 py-space-4 rounded-full bg-primary text-on-primary font-bold">Contratada y pagada</span>'
        : payment && payment.paid
          ? '<span class="font-label text-xs px-space-8 py-space-4 rounded-full bg-surface-container text-on-surface-variant font-bold">Proyecto contratado</span>'
        : stale
        ? '<span class="font-label text-xs px-space-8 py-space-4 rounded-full bg-error-container text-on-error-container font-bold">Desactualizada</span>'
        : notViable
        ? '<span class="font-label text-xs px-space-8 py-space-4 rounded-full bg-error-container text-on-error-container font-bold">Fuera de presupuesto</span>'
        : p.seleccionada
        ? '<span class="font-label text-xs px-space-8 py-space-4 rounded-full bg-primary text-on-primary font-bold">Seleccionada</span>'
        : '<span class="font-label text-xs px-space-8 py-space-4 rounded-full ' +
          (p.recomendada
            ? "bg-secondary-container text-on-secondary-container"
            : "bg-primary/10 text-primary") +
          ' font-bold">' +
          (p.etiqueta || "Viable") +
          "</span>";
      const recBar = p.recomendada && !stale
        ? '<div class="bg-primary text-on-primary py-space-4 px-space-16 flex items-center justify-between"><span class="font-label text-xs font-bold uppercase tracking-wider flex items-center gap-space-4"><span class="material-symbols-outlined text-sm">auto_awesome</span>Propuesta Recomendada</span><span class="font-label text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">' +
          (p.etiqueta || "") +
          "</span></div>"
        : "";
      const cardClass = contracted
        ? "group relative flex flex-col bg-surface-container-lowest rounded-xl shadow-md ring-2 ring-primary transition-all duration-300 overflow-hidden"
        : stale || notViable
        ? "group relative flex flex-col bg-surface-container-lowest rounded-xl shadow-sm border border-error/30 opacity-80 overflow-hidden"
        : p.seleccionada
        ? "group relative flex flex-col bg-surface-container-lowest rounded-xl shadow-md ring-2 ring-primary transition-all duration-300 overflow-hidden"
        : p.recomendada
          ? "group relative flex flex-col bg-surface-container-lowest rounded-xl shadow-md ring-2 ring-primary/40 transition-all duration-300 overflow-hidden"
          : "group relative flex flex-col bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/40 hover:shadow-md transition-all duration-300 overflow-hidden";
      const btnClass =
        stale || notViable
          ? "w-full py-space-12 px-space-16 bg-surface-container text-on-surface-variant font-label text-sm font-semibold rounded-lg cursor-not-allowed"
          : p.seleccionada || p.recomendada
          ? "w-full py-space-12 px-space-16 bg-primary hover:bg-primary-container text-on-primary font-label text-sm font-semibold rounded-lg shadow-sm hover:shadow flex items-center justify-center gap-space-8 transition-all duration-200"
          : "w-full py-space-12 px-space-16 bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface font-label text-sm font-semibold rounded-lg flex items-center justify-center gap-space-8 transition-all duration-200";
      const estimateDetails = p.estimate
        ? [["Consumo anual estimado", Number(p.estimate.energyKwhPerYear).toLocaleString("es-CO") + " " + p.estimate.energyUnit]]
        : [];
      const tecnicos = (p.tecnicos || []).concat(estimateDetails)
        .map(function (row) {
          return (
            '<div class="flex items-center justify-between"><span>' +
            escapeProposalText(row[0]) +
            ':</span><span class="font-semibold text-on-surface">' +
            escapeProposalText(row[1]) +
            "</span></div>"
          );
        })
        .join("");
      const href = ViModRoutes.page("proposalDetail", {
        proyecto: currentProject.id,
        propuesta: p.id,
      });
      return (
        '<div class="' +
        cardClass +
        '">' +
        recBar +
        '<div class="p-space-20 pb-0 flex items-center justify-between"><span class="font-label text-xs uppercase tracking-wider ' +
        (contracted || p.seleccionada || p.recomendada
          ? "bg-primary/10 text-primary font-bold"
          : "bg-surface-container-high text-on-surface-variant font-semibold") +
        ' px-space-8 py-space-4 rounded-md">Propuesta ' +
        num +
        " / " +
        letter +
        "</span>" +
        selectedBadge +
        "</div>" +
        '<div class="px-space-20 pt-space-12 mb-space-16"><h3 class="font-headline text-xl text-on-surface font-semibold group-hover:text-primary transition-colors">' +
        escapeProposalText(p.nombre) +
        '</h3><p class="font-body text-sm text-on-surface-variant mt-space-4">' +
        escapeProposalText(p.descripcion) +
        "</p>" +
        (payment && payment.paid && !contracted
          ? '<p class="mt-2 text-xs font-semibold text-on-surface-variant">El proyecto ya tiene una propuesta contratada; esta opción solo está disponible para consulta.</p>'
          : '') +
        "</div>" +
        '<div class="px-space-20 mb-space-16"><div class="relative h-32 rounded-lg overflow-hidden"><img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="' +
        (p.imagen || IMAGES[0].src) +
        '" alt="Imagen ilustrativa; no es un diseño generado para este proyecto" loading="lazy"/><div class="absolute inset-0 bg-gradient-to-t from-on-surface/60 via-transparent to-transparent"></div><div class="absolute bottom-space-8 left-space-8 text-on-primary font-label text-xs">' +
        escapeProposalText(p.imagenCaption || "Imagen ilustrativa; no es un diseño generado") +
        "</div></div></div>" +
        '<div class="mx-space-20 p-space-16 bg-surface-container-low rounded-xl mb-space-16 border border-outline-variant/30"><div class="mb-space-12 pb-space-12 border-b border-outline-variant/40"><span class="font-label text-xs uppercase text-on-surface-variant font-semibold block mb-space-2">Inversión Estimada</span><span class="font-headline text-3xl font-bold text-on-surface tracking-tight">' +
        formatMoney(p.costo) +
        '</span></div><div class="grid grid-cols-2 gap-space-12"><div class="flex items-center gap-space-8"><div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary"><span class="material-symbols-outlined text-lg">aspect_ratio</span></div><div class="flex flex-col"><span class="font-headline text-lg font-bold text-on-surface">' +
        escapeProposalText(p.area) +
        ' m²</span><span class="font-label text-xs text-on-surface-variant">Área Habitable</span></div></div><div class="flex items-center gap-space-8"><div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary"><span class="material-symbols-outlined text-lg">calendar_today</span></div><div class="flex flex-col"><span class="font-headline text-lg font-bold text-on-surface">' +
        escapeProposalText(p.tiempo) +
        '</span><span class="font-label text-xs text-on-surface-variant">Plazo Entrega</span></div></div></div></div>' +
        '<div class="px-space-20 mb-space-16"><details class="group/det text-sm bg-surface-container-high/40 rounded-lg p-space-12 border border-outline-variant/20"><summary class="cursor-pointer font-label text-sm font-semibold text-on-surface flex items-center justify-between"><span class="flex items-center gap-space-8"><span class="material-symbols-outlined text-base text-primary">tune</span>Ver detalles técnicos</span><span class="material-symbols-outlined text-base transition-transform group-open/det:rotate-180 text-secondary">expand_more</span></summary><div class="mt-space-12 pt-space-8 border-t border-outline-variant/40 flex flex-col gap-space-8 text-on-surface-variant font-label text-xs">' +
        tecnicos +
        "</div></details></div>" +
        '<div class="mt-auto p-space-20 pt-0"><a href="' +
        (stale || notViable ? "#" : href) +
        '" class="' +
        btnClass +
        '"' +
        (stale || notViable ? ' aria-disabled="true" tabindex="-1"' : "") +
        '><span>' +
        (stale ? "Regenera para continuar" : notViable ? "Fuera de presupuesto" : "Ver detalle de la propuesta") +
        '</span><span class="material-symbols-outlined text-lg">' +
        (stale ? "block" : "arrow_forward") +
        "</span></a></div></div>"
      );
    })
    .join("") : '') + renderOfferCards(currentProject, currentOffers);
  bindOfferButtons(currentProject);
}

function escapeProposalText(value) {
  return String(value || "").replace(/[&<>'"]/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
  });
}

function setDataError(message) {
  const errorBox = document.getElementById("project-data-error");
  if (!errorBox) return;
  ViMod.showRetryError(errorBox, message, function () {
    return loadProjectProposals(false);
  });
}

function missingProjectData(project, terrain) {
  const missing = [];
  if (!project.terrenoId) missing.push("terreno asociado");
  if (!Number.isFinite(Number(terrain.ancho)) || Number(terrain.ancho) <= 0) missing.push("ancho del terreno");
  if (!Number.isFinite(Number(terrain.largo)) || Number(terrain.largo) <= 0) missing.push("largo del terreno");
  if (!Number.isFinite(Number(project.presupuesto)) || Number(project.presupuesto) <= 0) missing.push("presupuesto");
  if (!Number.isInteger(Number(project.habitaciones)) || Number(project.habitaciones) < 1) missing.push("habitaciones");
  if (!Number.isInteger(Number(project.banos)) || Number(project.banos) < 1 || Number(project.banos) > 6) {
    missing.push("baños enteros entre 1 y 6");
  }
  return missing;
}

async function loadProjectProposals(regenerate) {
  await Storage.whenReady();
  const proyectoId = currentProyectoId();
  if (!proyectoId || !/^[a-f0-9]{24}$/i.test(proyectoId)) {
    window.location.href = ViModRoutes.page("clientDashboard", { vista: "propuestas" });
    return;
  }
  try {
    const proyecto = await Storage.fetchProjectById(proyectoId);
    if (!proyecto || proyecto.id !== proyectoId) {
      window.location.href = ViModRoutes.page("clientDashboard", { vista: "propuestas" });
      return;
    }
    if (!proyecto.terrenoId) {
      setDataError("Este proyecto no tiene un terreno asociado. Edita sus detalles antes de generar propuestas.");
      return;
    }
    const terreno = await Storage.fetchTerrenoById(proyecto.terrenoId);
    const missing = missingProjectData(proyecto, terreno);
    if (missing.length) {
      setDataError("Faltan datos del proyecto para generar propuestas: " + missing.join(", ") + ". No se completaron con valores supuestos.");
      return;
    }
    currentProject = proyecto;
    const errorBox = document.getElementById("project-data-error");
    if (errorBox) errorBox.classList.add("hidden");

    let result;
    if (regenerate) {
      result = await Storage.generateProjectProposals(proyectoId, true);
    } else {
      try {
        result = await Storage.fetchProjectProposals(proyectoId);
        if (result.requiresGeneration) {
          result = await Storage.generateProjectProposals(proyectoId, false);
        }
      } catch (error) {
        if (error.status !== 404 || error.code === "ROUTE_NOT_FOUND") throw error;
        result = await Storage.generateProjectProposals(proyectoId, false);
      }
    }
    const offersResult = await ViModApi.get('/projects/' + encodeURIComponent(proyectoId) + '/offers');
    const proposals = (result.proposals || []).map((proposal) => ({
      ...proposal,
      seleccionada: proposal.id === proyecto.selected_proposal_id
        || Boolean(proyecto.payment && proyecto.payment.paid
          && proposal.id === proyecto.payment.proposalId),
    }));
    renderProposals(proyecto, terreno, proposals, result, offersResult.offers || []);
  } catch (error) {
    if (error.status === 404) {
      window.location.href = ViModRoutes.page("clientDashboard", { vista: "propuestas" });
      return;
    }
    setDataError(error.message || "No se pudieron cargar las propuestas.");
  }
}

function bindFilters() {
  const priceFilter = document.getElementById("filter-price");
  if (priceFilter) priceFilter.value = "";
  ["filter-price", "filter-area", "filter-bedrooms", "filter-days", "sort-proposals"]
    .forEach(function (id) {
      const control = document.getElementById(id);
      if (control) control.addEventListener("input", applyProposalFilters);
      if (control) control.addEventListener("change", applyProposalFilters);
    });
}

function bindRegenerateButton() {
  const button = document.getElementById("btn-regenerate-proposals");
  if (!button) return;
  button.addEventListener("click", async function () {
    button.disabled = true;
    button.textContent = "Regenerando...";
    try {
      await loadProjectProposals(true);
    } finally {
      button.innerHTML = '<span class="material-symbols-outlined text-lg">autorenew</span>Regenerar con datos actuales';
      button.disabled = false;
    }
  });
}

bindFilters();
bindRegenerateButton();
bindOfferPaymentSimulation();
handleStripeCheckoutReturn();
loadProjectProposals(false);
