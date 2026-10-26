(function () {
  const TOKEN_KEY = "vimod_token";
  const content = document.getElementById("admin-content");
  const errorBox = document.getElementById("admin-error");
  const noticeBox = document.getElementById("admin-notice");
  let cachedUsers = [];
  let activeSection = "overview";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function formatMoney(value) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function showError(message) {
    noticeBox.classList.add("hidden");
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function showNotice(message) {
    errorBox.classList.add("hidden");
    noticeBox.textContent = message;
    noticeBox.classList.remove("hidden");
  }

  async function get(path) { return ViModApi.get(path); }
  async function patch(path, body) { return ViModApi.patch(path, body); }

  function renderTable(title, rows, columns) {
    if (!rows.length) return `<h2 class="text-xl font-bold">${escapeHtml(title)}</h2><p class="mt-4 border border-dashed border-stone-300 p-5 text-slate-600">No hay registros para mostrar.</p>`;
    const headers = columns.map((column) => `<th scope="col" class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">${escapeHtml(column.label)}</th>`).join("");
    const body = rows.map((row) => `<tr class="border-t border-stone-200">${columns.map((column) => `<td class="px-4 py-3 align-top text-sm">${column.render ? column.render(row) : escapeHtml(row[column.key])}</td>`).join("")}</tr>`).join("");
    return `<h2 class="mb-4 text-xl font-bold">${escapeHtml(title)}</h2><div class="overflow-x-auto border border-stone-200"><table class="min-w-full"><caption class="sr-only">${escapeHtml(title)}</caption><thead class="bg-stone-100"><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function statusLabel(status) {
    const normalized = String(status || "").toLowerCase();
    const style = ["active", "aprobado", "approved", "responded", "paid", "completed", "created"].includes(normalized)
      ? "bg-emerald-50 text-emerald-900"
      : ["pendiente", "pending", "requested", "payment_pending", "awaiting_payment", "awaiting_payment_configuration"].includes(normalized)
        ? "bg-amber-50 text-amber-900"
        : ["rechazado", "rejected", "disabled", "failed"].includes(normalized)
          ? "bg-red-50 text-red-900"
          : "bg-stone-100 text-stone-800";
    return `<span class="inline-flex border border-current/10 px-2 py-1 text-xs font-bold ${style}">${escapeHtml(status || "sin estado")}</span>`;
  }

  async function loadOverview() {
    const result = await get("/admin/overview");
    const data = result.overview;
    const metrics = [
      ["Usuarios registrados", data.users],
      ["Clientes activos", data.activeClients],
      ["Arquitectos · pendientes", data.architects.pending],
      ["Arquitectos · aprobados", data.architects.approved],
      ["Constructoras · pendientes", data.constructors.pending],
      ["Constructoras · aprobadas", data.constructors.approved],
      ["Proyectos", data.projects],
      ["Solicitudes de revisión", data.reviewRequests],
      ["Solicitudes de cotización", data.quoteRequests],
      ["Servicios", data.services],
      ["Pedidos", data.operations],
      ["Registros de pago", data.payments],
      ["Solicitudes de asesoría", data.advisorRequests],
    ];
    content.innerHTML = `<h2 class="mb-4 text-xl font-bold">Resumen general</h2><dl class="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">${metrics.map(([label, value]) => `<div class="flex items-baseline justify-between gap-4 border-b border-stone-200 py-3"><dt class="text-sm text-slate-600">${escapeHtml(label)}</dt><dd class="text-lg font-bold tabular-nums text-emerald-900">${Number(value || 0).toLocaleString("es-CO")}</dd></div>`).join("")}</dl>`;
  }

  async function loadUsers() {
    const search = document.getElementById("user-search")?.value || "";
    const type = document.getElementById("user-type")?.value || "";
    const status = document.getElementById("user-status")?.value || "";
    const query = new URLSearchParams({ search, type, status });
    content.setAttribute("aria-busy", "true");
    let result;
    try {
      result = await get("/admin/users?" + query.toString());
    } catch (error) {
      showError(error.message);
      content.setAttribute("aria-busy", "false");
      return;
    }
    content.setAttribute("aria-busy", "false");
    cachedUsers = result.users || [];
    const toolbar = `<form id="user-filter-form" class="mb-5 flex flex-wrap items-end gap-3"><label class="min-w-56 flex-1 text-sm font-semibold text-slate-700">Buscar nombre o correo<input id="user-search" value="${escapeHtml(search)}" placeholder="Nombre o correo" class="mt-1 block w-full rounded-md border-stone-300" /></label><label class="text-sm font-semibold text-slate-700">Tipo de cuenta<select id="user-type" class="mt-1 block w-full rounded-md border-stone-300"><option value="">Todos</option>${["cliente", "arquitecto", "constructora"].map((role) => `<option value="${role}" ${type === role ? "selected" : ""}>${role}</option>`).join("")}</select></label><label class="text-sm font-semibold text-slate-700">Estado<select id="user-status" class="mt-1 block w-full rounded-md border-stone-300"><option value="">Todos</option>${["active", "pendiente", "aprobado", "rechazado", "disabled"].map((state) => `<option value="${state}" ${status === state ? "selected" : ""}>${state}</option>`).join("")}</select></label><button id="user-filter" type="submit" class="rounded-md bg-emerald-900 px-4 py-2 font-bold text-white hover:bg-emerald-800">Aplicar filtros</button></form>`;
    const table = renderTable("Usuarios registrados", cachedUsers, [
      { label: "Nombre", key: "nombre" },
      { label: "Correo", key: "correo" },
      { label: "Solicitado", key: "requestedRole" },
      { label: "Rol efectivo", key: "rol" },
      { label: "Estado", render: (user) => statusLabel(user.accountStatus) },
      { label: "Cuenta", render: (user) => user.rol === "admin" ? "Protegida" : `<button data-user-status="${escapeHtml(user.id)}" data-next-status="${user.accountStatus === "disabled" ? "active" : "disabled"}" class="rounded border border-slate-300 px-3 py-1 text-xs font-bold">${user.accountStatus === "disabled" ? "Habilitar" : "Deshabilitar"}</button>` },
    ]);
    content.innerHTML = toolbar + table;
    document.getElementById("user-filter-form").addEventListener("submit", (event) => {
      event.preventDefault();
      loadUsers();
    });
    content.querySelectorAll("[data-user-status]").forEach((button) => button.addEventListener("click", async () => {
      if (!window.confirm(button.dataset.nextStatus === "disabled"
        ? "¿Deshabilitar esta cuenta?"
        : "¿Habilitar esta cuenta?")) return;
      button.disabled = true;
      try {
        await patch(`/admin/users/${encodeURIComponent(button.dataset.userStatus)}/status`, { status: button.dataset.nextStatus });
        showNotice("El estado de la cuenta se actualizó.");
        await loadUsers();
      } catch (error) {
        showError(error.message);
        button.disabled = false;
      }
    }));
  }

  async function loadRequests() {
    const result = await get("/admin/role-requests");
    const rows = result.requests || [];
    content.innerHTML = renderTable("Solicitudes de acceso privilegiado", rows, [
      { label: "Nombre", key: "nombre" }, { label: "Correo", key: "correo" },
      { label: "Tipo solicitado", key: "requestedRole" }, { label: "Fecha", key: "createdAt" },
      { label: "Decisión", render: (user) => `<div class="flex gap-2"><button data-decision="approve" data-id="${escapeHtml(user.id)}" class="rounded bg-emerald-800 px-3 py-1.5 font-bold text-white">Aprobar</button><button data-decision="reject" data-id="${escapeHtml(user.id)}" class="rounded bg-red-700 px-3 py-1.5 font-bold text-white">Rechazar</button></div>` },
    ]);
    content.querySelectorAll("[data-decision]").forEach((button) => button.addEventListener("click", async () => {
      const decision = button.dataset.decision;
      if (!window.confirm(decision === "approve"
        ? "¿Aprobar esta solicitud de rol?"
        : "¿Rechazar esta solicitud de rol?")) return;
      button.disabled = true;
      try {
        await patch(`/admin/role-requests/${encodeURIComponent(button.dataset.id)}`, { decision });
        showNotice(decision === "approve" ? "Solicitud aprobada." : "Solicitud rechazada.");
        await loadRequests();
      } catch (error) {
        showError(error.message);
        button.disabled = false;
      }
    }));
  }

  async function loadRows(path, title, columns) {
    const result = await get(path);
    content.innerHTML = renderTable(title, result.items || result.events || [], columns);
  }

  async function loadReviews() {
    const [reviews, users] = await Promise.all([get("/admin/reviews"), get("/admin/users?type=arquitecto&status=aprobado")]);
    const architects = users.users || [];
    content.innerHTML = renderTable("Solicitudes de revisión", reviews.items || [], [
      { label: "Proyecto", render: (row) => escapeHtml(row.project && row.project.nombre || row.projectId) }, { label: "Cliente", render: (row) => escapeHtml(row.owner && row.owner.nombre || row.ownerId) },
      { label: "Estado", render: (row) => statusLabel(row.status) },
      { label: "Arquitecto asignado", render: (row) => `<select data-assign="${escapeHtml(row.id)}" data-previous="${escapeHtml(row.architectId || "")}" aria-label="Arquitecto asignado" class="rounded-md border-stone-300"><option value="">Sin asignar</option>${architects.map((user) => `<option value="${escapeHtml(user.id)}" ${row.architectId === user.id ? "selected" : ""}>${escapeHtml(user.nombre)} · ${escapeHtml(user.correo)}</option>`).join("")}</select>` },
    ]);
    content.querySelectorAll("[data-assign]").forEach((select) => select.addEventListener("change", async () => {
      const previous = select.dataset.previous || "";
      if (!select.value) {
        select.value = previous;
        return;
      }
      select.disabled = true;
      try {
        await patch(`/admin/reviews/${encodeURIComponent(select.dataset.assign)}/assign`, { architectId: select.value });
        select.dataset.previous = select.value;
        showNotice("La solicitud se asignó al arquitecto seleccionado.");
      } catch (error) {
        select.value = previous;
        showError(error.message);
      } finally {
        select.disabled = false;
      }
    }));
  }

  async function loadAdvisorRequests() {
    const result = await get("/admin/advisor-requests");
    const rows = result.items || [];
    const labels = {
      pending: "Pendiente de revisión",
      in_progress: "En atención",
      attended: "Atendida",
      cancelled: "Cancelada",
    };
    content.innerHTML = renderTable("Solicitudes de asesoría técnica", rows, [
      { label: "Motivo", key: "topic" },
      { label: "Cliente", render: (row) => escapeHtml(row.owner && row.owner.nombre || row.ownerId) },
      { label: "Proyecto", render: (row) => escapeHtml(row.project && row.project.nombre || "Orientación general") },
      { label: "Descripción", key: "message" },
      { label: "Estado", render: (row) => `<select data-advisor-status="${escapeHtml(row.id)}" class="rounded-md border-stone-300 text-sm"><option value="pending" ${row.status === "pending" ? "selected" : ""}>${labels.pending}</option><option value="in_progress" ${row.status === "in_progress" ? "selected" : ""}>${labels.in_progress}</option><option value="attended" ${row.status === "attended" ? "selected" : ""}>${labels.attended}</option><option value="cancelled" ${row.status === "cancelled" ? "selected" : ""}>${labels.cancelled}</option></select>` },
      { label: "Nota", render: (row) => `<input data-advisor-note="${escapeHtml(row.id)}" value="${escapeHtml(row.adminNote || "")}" maxlength="2000" class="w-56 rounded-md border-stone-300 text-sm" placeholder="Nota interna" />` },
    ]);
    content.querySelectorAll("[data-advisor-status]").forEach((select) => select.addEventListener("change", async () => {
      const note = content.querySelector(`[data-advisor-note="${select.dataset.advisorStatus}"]`);
      select.disabled = true;
      try {
        await patch(`/admin/advisor-requests/${encodeURIComponent(select.dataset.advisorStatus)}`, {
          status: select.value,
          adminNote: note ? note.value : "",
        });
        showNotice("La solicitud de asesoría se actualizó.");
      } catch (error) {
        showError(error.message);
      } finally {
        select.disabled = false;
      }
    }));
  }

  async function loadSection(section) {
    activeSection = section;
    errorBox.classList.add("hidden");
    noticeBox.classList.add("hidden");
    content.setAttribute("aria-busy", "true");
    const sectionButtons = document.querySelectorAll("[data-section]");
    sectionButtons.forEach((button) => { button.disabled = true; });
    content.innerHTML = '<p class="text-slate-500">Cargando datos desde ViMod…</p>';
    try {
      if (section === "overview") return await loadOverview();
      if (section === "users") return await loadUsers();
      if (section === "requests") return await loadRequests();
      if (section === "projects") return await loadRows("/admin/projects", "Proyectos", [{ label: "Nombre", key: "nombre" }, { label: "Propietario", render: (row) => escapeHtml(row.owner && row.owner.nombre || row.ownerId) }, { label: "Estado", key: "estado" }, { label: "Propuesta seleccionada", render: (row) => escapeHtml(row.selectedProposal && row.selectedProposal.name || "Sin selección") }, { label: "Creado", key: "createdAt" }]);
      if (section === "orders") return await loadRows("/admin/orders", "Pedidos comerciales", [{ label: "Pedido", key: "id" }, { label: "Proyecto", key: "projectId" }, { label: "Cliente", render: (row) => escapeHtml(row.owner && row.owner.nombre || row.ownerId) }, { label: "Importe", render: (row) => formatMoney(row.amount) }, { label: "Origen", key: "amountSource" }, { label: "Estado", key: "orderStatus" }]);
      if (section === "reviews") return await loadReviews();
      if (section === "services") return await loadRows("/admin/services", "Servicios registrados", [{ label: "Servicio", key: "name" }, { label: "Categoría", key: "category" }, { label: "Constructora", key: "contractorName" }, { label: "Precio informativo", render: (row) => row.price == null ? "No especificado" : formatMoney(row.price) }, { label: "Estado", key: "status" }]);
      if (section === "quotes") return await loadRows("/admin/quotes", "Solicitudes de cotización", [{ label: "Proyecto", render: (row) => escapeHtml(row.project && row.project.nombre || row.projectId) }, { label: "Cliente", render: (row) => escapeHtml(row.owner && row.owner.nombre || row.ownerId) }, { label: "Constructora", key: "contractorName" }, { label: "Estado", key: "status" }, { label: "Respuesta", render: (row) => row.response ? formatMoney(row.response.amount) : "Pendiente" }]);
      if (section === "advisor") return await loadAdvisorRequests();
      if (section === "payments") return await loadRows("/admin/payments", "Pedidos y pagos", [{ label: "Pedido", key: "id" }, { label: "Cliente", key: "ownerId" }, { label: "Importe", render: (row) => formatMoney(row.amount) }, { label: "Origen", key: "amountSource" }, { label: "Estado", render: (row) => statusLabel(row.status || row.paymentStatus || row.orderStatus) }]);
      if (section === "audit") return await loadRows("/admin/audit", "Auditoría administrativa", [{ label: "Fecha", key: "createdAt" }, { label: "Administrador", key: "adminId" }, { label: "Acción", key: "action" }, { label: "Entidad", render: (row) => `${escapeHtml(row.entityType)} · ${escapeHtml(row.entityId)}` }]);
    } catch (error) { showError(error.message); }
    finally {
      content.setAttribute("aria-busy", "false");
      sectionButtons.forEach((button) => { button.disabled = false; });
    }
  }

  async function initializeDashboard() {
    if (!localStorage.getItem(TOKEN_KEY)) {
      window.location.replace(ViModRoutes.page("adminLogin"));
      return;
    }
    try {
      const result = await ViModApi.get("/auth/me");
      if (!result.user || result.user.rol !== "admin") {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("vimod_session");
        window.location.replace(ViModRoutes.page("adminLogin"));
        return;
      }
      localStorage.setItem("vimod_session", JSON.stringify(result.user));
      document.getElementById("admin-identity").textContent = result.user.nombre || "Administrador";
      document.body.style.visibility = "";
      document.getElementById("admin-logout").addEventListener("click", function () {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("vimod_session");
        window.location.href = ViModRoutes.page("adminLogin");
      });
      document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", function () {
        document.querySelectorAll("[data-section]").forEach((tab) => {
          tab.setAttribute("aria-selected", "false");
        });
        button.setAttribute("aria-selected", "true");
        loadSection(button.dataset.section);
      }));
      await loadSection(activeSection);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("vimod_session");
        window.location.replace(ViModRoutes.page("adminLogin"));
        return;
      }
      showError("No se pudo validar la sesión administrativa con el servidor. Comprueba que el backend esté activo y vuelve a cargar esta página. " + error.message);
    }
  }

  initializeDashboard();
})();
