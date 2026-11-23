(function (root, factory) {
  const activeProject = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = activeProject;
  if (root) root.ViModProyectoActivo = activeProject;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  const STORAGE_KEY = "vimod_active_project_id";
  let mountedSelector = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function getStoredId() {
    return root.localStorage.getItem(STORAGE_KEY);
  }

  function setStoredId(projectId) {
    if (projectId) root.localStorage.setItem(STORAGE_KEY, String(projectId));
    else root.localStorage.removeItem(STORAGE_KEY);
  }

  function findProject(projects, projectId) {
    if (!projectId) return null;
    return projects.find((project) => String(project.id) === String(projectId)) || null;
  }

  function resolveProject(projects, preferredId) {
    const availableProjects = Array.isArray(projects) ? projects : [];
    const project = findProject(availableProjects, preferredId)
      || findProject(availableProjects, getStoredId());
    setStoredId(project ? project.id : null);
    return project;
  }

  function stateLabel(project) {
    const labels = {
      draft: "Borrador",
      under_review: "En revisión",
      contracted: "Contratado",
      archived: "Archivado",
      closed: "Cerrado",
    };
    const status = project.estado || project.status;
    return labels[status] || status || "Sin estado";
  }

  function initialize(projects, preferredId, onChange) {
    const toggle = root.document.getElementById("active-project-toggle");
    const name = root.document.getElementById("active-project-name");
    const menu = root.document.getElementById("active-project-menu");
    if (!toggle || !name || !menu) return null;
    if (mountedSelector && mountedSelector.toggle === toggle) {
      mountedSelector.updateProjects(projects, preferredId, onChange);
      return mountedSelector;
    }

    const state = {
      projects: Array.isArray(projects) ? projects : [],
      selected: null,
      onChange,
    };
    const closeMenu = () => {
      menu.classList.add("hidden");
      toggle.setAttribute("aria-expanded", "false");
    };
    const renderSelection = () => {
      name.textContent = state.selected ? state.selected.nombre || "Proyecto" : "Sin proyecto";
      toggle.setAttribute(
        "aria-label",
        "Proyecto activo: " + name.textContent + ". Cambiar proyecto",
      );
    };
    const renderMenu = () => {
      const createProjectUrl = root.ViModRoutes
        ? root.ViModRoutes.page("projectCreation")
        : "#";
      const options = state.projects.map((project) =>
        '<button type="button" role="menuitemradio" aria-checked="' +
        !!(state.selected && String(state.selected.id) === String(project.id)) +
        '" data-active-project-option="' + escapeHtml(project.id) +
        '" class="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-surface-container">' +
        '<span class="font-semibold">' + escapeHtml(project.nombre || "Proyecto") + '</span>' +
        '<span class="text-xs text-on-surface-variant">' + escapeHtml(stateLabel(project)) + '</span>' +
        '</button>').join("");
      const emptyState = state.projects.length
        ? ""
        : '<p class="px-3 py-2 text-sm text-on-surface-variant">Aún no tienes proyectos.</p>' +
          '<a href="' + escapeHtml(createProjectUrl) +
          '" class="block rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-container">Crear nuevo proyecto</a>';
      menu.innerHTML =
        '<button type="button" role="menuitemradio" aria-checked="' + !state.selected +
        '" data-active-project-option="" class="w-full rounded-lg px-3 py-2 text-left font-semibold hover:bg-surface-container">Sin proyecto</button>' +
        options + emptyState;
    };
    const selectProject = (projectId) => {
      const project = projectId ? findProject(state.projects, projectId) : null;
      if (projectId && !project) throw new Error("El proyecto seleccionado ya no está disponible.");
      state.selected = project;
      setStoredId(project ? project.id : null);
      renderSelection();
      renderMenu();
      closeMenu();
      if (typeof state.onChange === "function") state.onChange(project);
      return project;
    };

    toggle.addEventListener("click", () => {
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";
      if (isExpanded) closeMenu();
      else {
        menu.classList.remove("hidden");
        toggle.setAttribute("aria-expanded", "true");
      }
    });
    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-active-project-option]");
      if (!option) return;
      try {
        selectProject(option.getAttribute("data-active-project-option"));
      } catch (error) {
        root.console.error(error);
      }
    });
    root.document.addEventListener("click", (event) => {
      if (!event.target.closest("#active-project-selector")) closeMenu();
    });
    root.document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    mountedSelector = {
      toggle,
      getSelected() {
        return state.selected;
      },
      select: selectProject,
      getProjects() {
        return state.projects.slice();
      },
      updateProjects(nextProjects, nextPreferredId, nextOnChange) {
        state.projects = Array.isArray(nextProjects) ? nextProjects : [];
        state.selected = resolveProject(state.projects, nextPreferredId);
        if (typeof nextOnChange === "function") state.onChange = nextOnChange;
        renderSelection();
        renderMenu();
      },
    };
    mountedSelector.updateProjects(projects, preferredId, onChange);
    return mountedSelector;
  }

  return Object.freeze({
    STORAGE_KEY,
    getStoredId,
    setStoredId,
    resolveProject,
    initialize,
  });
});
