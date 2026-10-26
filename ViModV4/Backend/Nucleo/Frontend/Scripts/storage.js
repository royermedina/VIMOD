// Capa local de compatibilidad y acceso a la API de ViMod.
const Storage = (function () {
  const repository = new StorageRepository();
  const STORAGE_KEYS = {
    USERS: "vimod_users", SESSION: "vimod_session", TOKEN: "vimod_token",
    TERRENOS: "vimod_terrenos", PROYECTOS: "vimod_proyectos",
    PROJECT_EXTRAS: "vimod_project_extras", PROPUESTAS: "vimod_propuestas",
    SELECTED_PROPOSALS: "vimod_selected_proposals",
    SOLICITUDES_REVISION: "vimod_solicitudes_revision",
    OBSERVACIONES: "vimod_observaciones", CONSTRUCTORAS: "vimod_constructoras",
    SERVICIOS: "vimod_servicios", SOLICITUDES_COTIZACION: "vimod_solicitudes_cotizacion",
  };
  let authenticatedUser = null;
  let sessionReady = Promise.resolve(true);
  let remoteTerrains = null;
  let remoteProjects = null;
  const remoteProposals = Object.create(null);

  function get(key) { return repository.get(key); }
  function set(key, value) { repository.set(key, value); }
  function remove(key) { repository.remove(key); }
  function list(key) { return get(key) || []; }
  function append(key, value) { const values = list(key); values.push(value); set(key, values); }
  function update(key, value) {
    const values = list(key);
    const index = values.findIndex((item) => item.id === value.id);
    if (index !== -1) { values[index] = value; set(key, values); }
  }

  function initializeData() {
    if (!get(STORAGE_KEYS.CONSTRUCTORAS)) set(STORAGE_KEYS.CONSTRUCTORAS, []);
    const users = get(STORAGE_KEYS.USERS);
    if (Array.isArray(users)) set(STORAGE_KEYS.USERS, users.map((user) => {
      const safeUser = { ...user };
      delete safeUser.password;
      delete safeUser.passwordHash;
      return safeUser;
    }));
    [STORAGE_KEYS.TERRENOS, STORAGE_KEYS.PROYECTOS, STORAGE_KEYS.PROPUESTAS,
      STORAGE_KEYS.SOLICITUDES_REVISION, STORAGE_KEYS.OBSERVACIONES,
      STORAGE_KEYS.SERVICIOS, STORAGE_KEYS.SOLICITUDES_COTIZACION].forEach((key) => {
      if (!localStorage.getItem(key)) set(key, []);
    });
    if (!localStorage.getItem(STORAGE_KEYS.PROJECT_EXTRAS)) set(STORAGE_KEYS.PROJECT_EXTRAS, {});
  }

  function getUsers() { return list(STORAGE_KEYS.USERS); }
  function saveUser(user) {
    const safeUser = { ...user };
    delete safeUser.password;
    delete safeUser.passwordHash;
    append(STORAGE_KEYS.USERS, safeUser);
  }
  function findUserByEmail(email) {
    const normalized = (email || "").toLowerCase();
    return getUsers().find((user) => (user.email || user.correo || "").toLowerCase() === normalized);
  }

  function normalizeUser(user) {
    return { id: user.id, nombre: user.nombre, correo: user.correo || user.email,
      email: user.email || user.correo, rol: user.rol,
      requestedRole: user.requestedRole, accountType: user.accountType || user.requestedRole,
      accountStatus: user.accountStatus,
      created_at: user.created_at };
  }
  function getToken() {
    const stored = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!stored) return null;
    try { return JSON.parse(stored); }
    catch (error) { return stored; }
  }
  function getSession() { return authenticatedUser; }
  function setSession(user, token) {
    if (!token) throw new Error("La API no devolvió un token de sesión.");
    authenticatedUser = normalizeUser(user);
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    set(STORAGE_KEYS.SESSION, authenticatedUser);
  }
  function clearSession() {
    authenticatedUser = null;
    remove(STORAGE_KEYS.SESSION);
    remove(STORAGE_KEYS.TOKEN);
  }
  function isLoggedIn() { return !!(authenticatedUser && getToken()); }
  function getCurrentUser() { return authenticatedUser; }
  async function refreshSession() {
    const token = getToken();
    if (!token) { authenticatedUser = null; remove(STORAGE_KEYS.SESSION); return null; }
    const response = await ViModApi.get("/auth/me");
    setSession(response.user, token);
    return authenticatedUser;
  }
  function whenReady() { return sessionReady; }
  function setReady(promise) { sessionReady = promise; }

  function normalizeTerrain(terrain) {
    return { ...terrain, userId: terrain.user_id || terrain.userId,
      fechaRegistro: terrain.created_at || terrain.fechaRegistro };
  }
  async function fetchTerrenos() {
    const response = await ViModApi.get("/terrains");
    remoteTerrains = (response.terrains || []).map(normalizeTerrain);
    return remoteTerrains.slice();
  }
  async function fetchTerrenoById(id) {
    const response = await ViModApi.get("/terrains/" + encodeURIComponent(id));
    const terrain = normalizeTerrain(response.terrain);
    remoteTerrains = (remoteTerrains || []).filter((item) => item.id !== terrain.id);
    remoteTerrains.push(terrain);
    return terrain;
  }
  async function createTerreno(data) {
    const response = await ViModApi.post("/terrains", {
      ubicacion: data.ubicacion, ancho: data.ancho, largo: data.largo,
    });
    const terrain = normalizeTerrain(response.terrain);
    remoteTerrains = remoteTerrains || [];
    remoteTerrains.push(terrain);
    return terrain;
  }
  async function deleteRemoteTerrain(id) {
    await ViModApi.delete("/terrains/" + encodeURIComponent(id));
    remoteTerrains = (remoteTerrains || []).filter((terrain) => terrain.id !== id);
  }

  function getProjectExtras() { return get(STORAGE_KEYS.PROJECT_EXTRAS) || {}; }
  function normalizeProject(project) {
    const normalized = { ...project, userId: project.user_id || project.userId,
      terrenoId: project.terrain_id || project.terrenoId,
      fechaCreacion: project.created_at || project.fechaCreacion };
    const extras = getProjectExtras()[normalized.id] || {};
    return {
      ...normalized,
      ...(normalized.fecha_cierre ? { fechaCierre: normalized.fecha_cierre } : {}),
      ...(normalized.estado === undefined && extras.estado !== undefined ? { estado: extras.estado } : {}),
      ...(normalized.fecha_cierre === undefined
        && normalized.fechaCierre === undefined
        && extras.fechaCierre !== undefined
        ? { fechaCierre: extras.fechaCierre }
        : {}),
    };
  }
  async function fetchProjects() {
    const response = await ViModApi.get("/projects");
    remoteProjects = (response.projects || []).map(normalizeProject);
    return remoteProjects.slice();
  }
  async function fetchProjectById(id) {
    const response = await ViModApi.get("/projects/" + encodeURIComponent(id));
    const project = normalizeProject(response.project);
    remoteProjects = (remoteProjects || []).filter((item) => item.id !== project.id);
    remoteProjects.push(project);
    return project;
  }
  async function createRemoteProject(data) {
    const response = await ViModApi.post("/projects", {
      nombre: data.nombre,
      terrain_id: data.terrain_id,
      presupuesto: data.presupuesto,
      habitaciones: data.habitaciones,
      banos: data.banos,
    });
    const project = response.project;
    const normalized = normalizeProject(project);
    remoteProjects = remoteProjects || [];
    remoteProjects.push(normalized);
    return normalized;
  }
  async function updateRemoteProject(id, data) {
    const response = await ViModApi.patch("/projects/" + encodeURIComponent(id), {
      nombre: data.nombre,
      terrain_id: data.terrain_id,
      presupuesto: data.presupuesto,
      habitaciones: data.habitaciones,
      banos: data.banos,
    });
    const project = normalizeProject(response.project);
    remoteProjects = (remoteProjects || []).filter((item) => item.id !== project.id);
    remoteProjects.push(project);
    return project;
  }
  async function deleteRemoteProject(id) {
    await ViModApi.delete("/projects/" + encodeURIComponent(id));
    remoteProjects = (remoteProjects || []).filter((item) => item.id !== id);
  }
  async function archiveRemoteProject(id) {
    const response = await ViModApi.patch(
      "/projects/" + encodeURIComponent(id) + "/archive",
      {},
    );
    const project = normalizeProject(response.project);
    remoteProjects = (remoteProjects || []).filter((item) => item.id !== project.id);
    remoteProjects.push(project);
    return project;
  }

  function getSelectedProposalIds() { return get(STORAGE_KEYS.SELECTED_PROPOSALS) || {}; }
  function normalizeProposal(proposal, selectedProposalId) {
    const projectId = proposal.projectId || proposal.proyectoId;
    return {
      ...proposal,
      proyectoId: projectId,
      seleccionada: selectedProposalId === proposal.id,
    };
  }
  function cacheProposals(projectId, proposals, selectedProposalId) {
    remoteProposals[projectId] = (proposals || []).map((proposal) =>
      normalizeProposal(proposal, selectedProposalId));
    return remoteProposals[projectId].slice();
  }
  async function getSelectedProposalId(projectId) {
    const response = await ViModApi.get(
      "/projects/" + encodeURIComponent(projectId) + "/selected-proposal",
    );
    return response.proposal ? response.proposal.id : null;
  }
  async function analyzeProject(projectId) {
    const response = await ViModApi.post(
      "/projects/" + encodeURIComponent(projectId) + "/analyze",
      {},
    );
    return response.analysis;
  }
  async function fetchProjectAnalysis(projectId) {
    const response = await ViModApi.get(
      "/projects/" + encodeURIComponent(projectId) + "/analysis",
    );
    return response.analysis;
  }
  async function generateProjectProposals(projectId, regenerate) {
    const endpoint = regenerate
      ? "/projects/" + encodeURIComponent(projectId) + "/proposals/regenerate"
      : "/projects/" + encodeURIComponent(projectId) + "/proposals";
    const response = await ViModApi.post(
      endpoint,
      regenerate ? {} : { regenerate: false },
    );
    const selectedProposalId = await getSelectedProposalId(projectId);
    return {
      ...response,
      proposals: cacheProposals(projectId, response.proposals, selectedProposalId),
    };
  }
  async function fetchProjectProposals(projectId) {
    const response = await ViModApi.get(
      "/projects/" + encodeURIComponent(projectId) + "/proposals",
    );
    const selectedProposalId = await getSelectedProposalId(projectId);
    return {
      ...response,
      proposals: cacheProposals(projectId, response.proposals, selectedProposalId),
    };
  }
  async function fetchProjectProposalById(projectId, proposalId) {
    const response = await ViModApi.get(
      "/projects/" + encodeURIComponent(projectId) + "/proposals/" + encodeURIComponent(proposalId),
    );
    const selectedProposalId = await getSelectedProposalId(projectId);
    const proposal = normalizeProposal(response.proposal, selectedProposalId);
    const cached = remoteProposals[projectId] || [];
    remoteProposals[projectId] = cached.filter((item) => item.id !== proposal.id).concat(proposal);
    return proposal;
  }

  function getTerrenos() { return remoteTerrains ? remoteTerrains.slice() : list(STORAGE_KEYS.TERRENOS); }
  function saveTerreno(item) { append(STORAGE_KEYS.TERRENOS, item); }
  function getTerrenosByUserId(id) { return getTerrenos().filter((item) => (item.user_id || item.userId) === id); }
  function getTerrenoById(id) {
    if (remoteTerrains) return remoteTerrains.find((item) => item.id === id) || null;
    return list(STORAGE_KEYS.TERRENOS).find((item) => item.id === id);
  }
  function getProyectos() { return remoteProjects ? remoteProjects.slice() : list(STORAGE_KEYS.PROYECTOS); }
  function saveProyecto(item) { append(STORAGE_KEYS.PROYECTOS, item); }
  function updateProyecto(item) {
    const index = remoteProjects ? remoteProjects.findIndex((project) => project.id === item.id) : -1;
    if (index !== -1) {
      const extras = getProjectExtras();
      extras[item.id] = { ...(extras[item.id] || {}),
        estado: item.estado, fechaCierre: item.fechaCierre };
      set(STORAGE_KEYS.PROJECT_EXTRAS, extras);
      remoteProjects[index] = normalizeProject(item);
    } else update(STORAGE_KEYS.PROYECTOS, item);
  }
  async function closeProyecto(id) {
    const response = await ViModApi.patch("/projects/" + encodeURIComponent(id) + "/close", {});
    const project = normalizeProject(response.project);
    if (remoteProjects) {
      const index = remoteProjects.findIndex((item) => item.id === project.id);
      if (index === -1) remoteProjects.push(project);
      else remoteProjects[index] = project;
    }
    return project;
  }
  function getProyectosByUserId(id) { return getProyectos().filter((item) => (item.user_id || item.userId) === id); }
  function getProyectoById(id) {
    if (remoteProjects) return remoteProjects.find((item) => item.id === id) || null;
    return list(STORAGE_KEYS.PROYECTOS).find((item) => item.id === id);
  }

  function getPropuestas() { return list(STORAGE_KEYS.PROPUESTAS); }
  function savePropuesta(item) { append(STORAGE_KEYS.PROPUESTAS, item); }
  function getPropuestasByProyectoId(id) {
    if (Object.prototype.hasOwnProperty.call(remoteProposals, id)) return remoteProposals[id].slice();
    return list(STORAGE_KEYS.PROPUESTAS).filter((item) => item.proyectoId === id);
  }
  function updatePropuesta(item) { update(STORAGE_KEYS.PROPUESTAS, item); }
  function getPropuestaById(id) {
    for (const proposals of Object.values(remoteProposals)) {
      const proposal = proposals.find((item) => item.id === id);
      if (proposal) return proposal;
    }
    return list(STORAGE_KEYS.PROPUESTAS).find((item) => item.id === id);
  }
  function setSelectedPropuesta(projectId, proposalId) {
    const selectedIds = getSelectedProposalIds();
    selectedIds[projectId] = proposalId;
    set(STORAGE_KEYS.SELECTED_PROPOSALS, selectedIds);
    if (remoteProposals[projectId]) {
      remoteProposals[projectId] = remoteProposals[projectId].map((item) => ({
        ...item,
        seleccionada: item.id === proposalId,
      }));
      return;
    }
    const items = getPropuestas();
    items.forEach((item) => { if (item.proyectoId === projectId) item.seleccionada = item.id === proposalId; });
    set(STORAGE_KEYS.PROPUESTAS, items);
  }
  function deletePropuestasByProyectoId(id) { set(STORAGE_KEYS.PROPUESTAS, getPropuestas().filter((item) => item.proyectoId !== id)); }
  function getSelectedPropuesta(id) {
    const selectedId = getSelectedProposalIds()[id];
    return getPropuestasByProyectoId(id).find((item) => item.id === selectedId || item.seleccionada);
  }

  function getSolicitudesRevision() { return list(STORAGE_KEYS.SOLICITUDES_REVISION); }
  function saveSolicitudRevision(item) { append(STORAGE_KEYS.SOLICITUDES_REVISION, item); }
  function updateSolicitudRevision(item) { update(STORAGE_KEYS.SOLICITUDES_REVISION, item); }
  function getSolicitudesRevisionByProyectoId(id) { return getSolicitudesRevision().filter((item) => item.proyectoId === id); }
  function hasSolicitudRevisionActiva(id) { return getSolicitudesRevisionByProyectoId(id).some((item) => item.estado === "Pendiente" || item.estado === "En revisión"); }
  function getSolicitudesRevisionPendientes() { return getSolicitudesRevision().filter((item) => item.estado === "Pendiente" || item.estado === "En revisión"); }
  function getObservaciones() { return list(STORAGE_KEYS.OBSERVACIONES); }
  function saveObservacion(item) { append(STORAGE_KEYS.OBSERVACIONES, item); }
  function getObservacionesByProyectoId(id) { return getObservaciones().filter((item) => item.proyectoId === id); }
  function getConstructoras() { return list(STORAGE_KEYS.CONSTRUCTORAS); }
  function getConstructoraById(id) { return getConstructoras().find((item) => item.id === id); }
  function getServicios() { return list(STORAGE_KEYS.SERVICIOS); }
  function saveServicio(item) { append(STORAGE_KEYS.SERVICIOS, item); }
  function updateServicio(item) { update(STORAGE_KEYS.SERVICIOS, item); }
  function getServiciosByConstructoraId(id) { return getServicios().filter((item) => item.constructoraId === id); }
  function getServicioById(id) { return getServicios().find((item) => item.id === id); }
  function resolveConstructoraId(user) {
    if (!user || user.rol !== "constructora") return null;
    if (user.constructoraId) return user.constructoraId;
    const firstName = (user.nombre || "").toLowerCase().split(" ")[0];
    const match = getConstructoras().find((item) => item.nombre.toLowerCase().includes(firstName));
    return match ? match.id : "const-1";
  }
  function getSolicitudesCotizacion() { return list(STORAGE_KEYS.SOLICITUDES_COTIZACION); }
  function saveSolicitudCotizacion(item) { append(STORAGE_KEYS.SOLICITUDES_COTIZACION, item); }
  function updateSolicitudCotizacion(item) { update(STORAGE_KEYS.SOLICITUDES_COTIZACION, item); }
  function hasSolicitudCotizacion(projectId, constructorId) { return getSolicitudesCotizacion().some((item) => item.proyectoId === projectId && item.constructoraId === constructorId); }
  function getSolicitudesCotizacionByProyectoId(id) { return getSolicitudesCotizacion().filter((item) => item.proyectoId === id); }
  function getSolicitudesCotizacionByConstructoraId(id) { return getSolicitudesCotizacion().filter((item) => item.constructoraId === id); }
  function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
  function clearAllData() {
    Object.values(STORAGE_KEYS).forEach(remove);
    authenticatedUser = null;
    remoteTerrains = null;
    remoteProjects = null;
    initializeData();
  }

  initializeData();
  return {
    STORAGE_KEYS, getUsers, saveUser, findUserByEmail, getSession, setSession,
    clearSession, isLoggedIn, getCurrentUser, refreshSession, whenReady, setReady,
    fetchTerrenos, fetchTerrenoById, createTerreno, deleteRemoteTerrain, fetchProjects, fetchProjectById,
      analyzeProject, fetchProjectAnalysis, generateProjectProposals,
      fetchProjectProposals, fetchProjectProposalById,
    createRemoteProject, updateRemoteProject, deleteRemoteProject,
    archiveRemoteProject, getTerrenos, saveTerreno, getTerrenosByUserId,
    getTerrenoById, getProyectos, saveProyecto, updateProyecto, closeProyecto,
    getProyectosByUserId, getProyectoById, getPropuestas, savePropuesta,
    getPropuestasByProyectoId, updatePropuesta, getPropuestaById,
    setSelectedPropuesta, getSelectedPropuesta, deletePropuestasByProyectoId,
    getSolicitudesRevision, saveSolicitudRevision, updateSolicitudRevision,
    getSolicitudesRevisionByProyectoId, hasSolicitudRevisionActiva,
    getSolicitudesRevisionPendientes, getObservaciones, saveObservacion,
    getObservacionesByProyectoId, getConstructoras, getConstructoraById,
    getServicios, saveServicio, updateServicio, getServiciosByConstructoraId,
    getServicioById, resolveConstructoraId, hasSolicitudCotizacion,
    getSolicitudesCotizacion, saveSolicitudCotizacion, updateSolicitudCotizacion,
    getSolicitudesCotizacionByProyectoId, getSolicitudesCotizacionByConstructoraId,
    generateId, clearAllData,
  };
})();

const PUBLIC_PAGES = ["", "1._registro_de_usuario.html", "2. inicio de sesion.html"];
const PAGE_ROLE_MAP = {
  "3. panel principal del cliente.html": "cliente", "4. registrar terreno.html": "cliente",
  "5. crear proyecto de vivienda.html": "cliente", "6. detalle del proyecto.html": "cliente",
  "7. propuestas generadas.html": "cliente", "8. detalles propuestas.html": "cliente",
  "9. revision por arquitecto.html": "cliente", "10. catalgo contructoras y cotizacion.html": "cliente",
  "11. panel arquitecto.html": "arquitecto", "12. constructora mis servicios.html": "constructora",
  "13. constructora solicitudes.html": "constructora",
};
const ROLE_HOME = {
  cliente: "clientDashboard",
  arquitecto: "architectDashboard",
  constructora: "contractorServices",
  admin: "adminDashboard",
};
const NAV_TARGETS = {
  "mis-terrenos": ["terrainRegistration"], "mis-proyectos": ["clientDashboard"],
  constructoras: ["contractorCatalog"], propuestas: ["clientDashboard", { vista: "propuestas" }],
  "proyectos-asignados": ["architectDashboard"], "revisiones-tecnicas": ["architectDashboard"],
  "mis-servicios": ["contractorServices"], "solicitudes-recibidas": ["contractorRequests"],
};
const ROL_LABEL = { cliente: "Cliente", arquitecto: "Arquitecto/a", constructora: "Constructora" };

function currentFileName() {
  const parts = window.location.pathname.split("/");
  return decodeURIComponent(parts[parts.length - 1] || "").trim();
}
async function checkAuth() {
  const fileKey = currentFileName().toLowerCase();
  const publicPage = PUBLIC_PAGES.includes(fileKey);
  let user = null;
  if (localStorage.getItem(Storage.STORAGE_KEYS.TOKEN)) {
    try { user = await Storage.refreshSession(); }
    catch (error) {
      if (error.status === 401) {
        Storage.clearSession();
        if (!publicPage) { alert("Tu sesión expiró. Inicia sesión nuevamente."); window.location.href = ViModRoutes.page("login"); return false; }
      } else if (!publicPage) {
        alert("No se pudo validar tu sesión con el servidor. Inicia sesión cuando la conexión esté disponible.");
        window.location.href = ViModRoutes.page("login");
        return false;
      }
    }
  } else Storage.clearSession();
  if (!publicPage) {
    if (!user) { window.location.href = ViModRoutes.page("login"); return false; }
    const role = PAGE_ROLE_MAP[fileKey];
    if (role && user.rol !== role) {
      window.location.href = ViModRoutes.page(ROLE_HOME[user.rol] || "login");
      return false;
    }
  } else if (user && fileKey === "2. inicio de sesion.html") {
    window.location.href = ViModRoutes.page(ROLE_HOME[user.rol] || "login");
    return false;
  }
  return true;
}
function updateMenuByRole() {
  const user = Storage.getCurrentUser();
  if (!user) return;
  const menus = { cliente: ["mis-terrenos", "mis-proyectos", "constructoras", "propuestas"], arquitecto: ["proyectos-asignados", "revisiones-tecnicas"], constructora: ["mis-servicios", "solicitudes-recibidas"] };
  document.querySelectorAll("aside nav a[data-path]").forEach((item) => {
    item.style.display = menus[user.rol] && menus[user.rol].includes(item.getAttribute("data-path")) ? "flex" : "none";
  });
  const nav = document.querySelector("aside nav");
  if (!nav) return;
  Array.from(nav.children).forEach((child) => {
    if (child.tagName !== "DIV") return;
    let sibling = child.nextElementSibling;
    let visible = false;
    while (sibling && sibling.tagName === "A") { if (sibling.style.display !== "none") visible = true; sibling = sibling.nextElementSibling; }
    child.style.display = visible ? "" : "none";
  });
}
function wireSidebarNav() {
  document.querySelectorAll("aside nav a[data-path]").forEach((item) => {
    const target = NAV_TARGETS[item.getAttribute("data-path")];
    if (target) item.setAttribute("href", ViModRoutes.page(target[0], target[1]));
  });
}
function logoutAndRedirect() {
  if (!confirm("¿Seguro que deseas cerrar sesión?")) return;
  Storage.clearSession();
  window.location.href = ViModRoutes.page("login");
}
function injectLogout() {
  const nav = document.querySelector("aside nav");
  if (!nav || nav.querySelector("[data-logout]")) return;
  const link = document.createElement("a");
  link.href = ViModRoutes.page("login");
  link.setAttribute("data-logout", "1");
  link.className = "flex items-center gap-3 px-3 py-2 mt-2 rounded-lg text-error hover:bg-error-container transition-all font-medium text-sm cursor-pointer";
  link.innerHTML = '<span class="material-symbols-outlined text-xl">logout</span><span>Cerrar sesión</span>';
  link.addEventListener("click", (event) => { event.preventDefault(); logoutAndRedirect(); });
  nav.appendChild(link);
}
function updateProfileCard(user) {
  if (!user) return;
  const initials = String(user.nombre || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("es-CO"))
    .join("") || "V";
  let sidebarCard = null;
  document.querySelectorAll('img[alt="Profile"]').forEach((image) => {
    const avatar = document.createElement("span");
    avatar.className = image.className + " flex items-center justify-center bg-primary text-on-primary font-bold";
    avatar.textContent = initials;
    avatar.setAttribute("role", "img");
    avatar.setAttribute("aria-label", "Avatar de " + user.nombre);
    const card = image.parentElement;
    image.replaceWith(avatar);
    if (card && card.closest("aside")) sidebarCard = card;
  });
  const card = sidebarCard;
  if (!card) return;
  const info = card.querySelector("div.flex.flex-col");
  if (info) {
    const spans = info.querySelectorAll("span");
    if (spans[0]) spans[0].textContent = user.nombre;
    if (spans[1]) spans[1].textContent = ROL_LABEL[user.rol] || "Cuenta ViMod";
  }
  const more = Array.prototype.find.call(card.children, (item) => (item.textContent || "").trim() === "more_vert");
  if (more) { more.style.cursor = "pointer"; more.title = "Cerrar sesión"; more.addEventListener("click", logoutAndRedirect); }
  document.querySelectorAll("[data-user-role]").forEach((element) => {
  element.textContent = ROL_LABEL[user.rol] || "Cuenta ViMod";
  });
}
function wireDeadLinks() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || link.hasAttribute("data-logout")) return;
    if (link.getAttribute("href") === "#") { event.preventDefault(); alert("Esta función aún no está disponible en esta versión de demostración."); }
  });
}
(function vimodBootstrap() {
  const publicPage = PUBLIC_PAGES.includes(currentFileName().toLowerCase());
  if (!publicPage) document.documentElement.style.visibility = "hidden";
  Storage.setReady(checkAuth().then((ok) => { if (ok) document.documentElement.style.visibility = ""; return ok; }));
  window.addEventListener("vimod:unauthorized", (event) => {
    Storage.clearSession();
    alert((event.detail && event.detail.message ? event.detail.message + " " : "") + "Inicia sesión nuevamente.");
    window.location.href = ViModRoutes.page("login");
  });
  document.addEventListener("DOMContentLoaded", async () => {
    if (!(await Storage.whenReady())) return;
    const user = Storage.getCurrentUser();
    if (!user) return;
    document.querySelectorAll("button, a").forEach((control) => { control.classList.add("vimod-focusable"); if (control.tagName === "BUTTON") control.classList.add("vimod-action"); });
    wireSidebarNav();
    updateMenuByRole();
    updateProfileCard(user);
    injectLogout();
    wireDeadLinks();
  });
})();