(function () {
  let habCount = 2;
  let bathCount = 2;

  const inputNombre = document.getElementById("input-nombre-proyecto");
  const previewNombre = document.getElementById("preview-nombre");
  const selectTerreno = document.getElementById("select-terreno");
  const terrainLoadError = document.getElementById("terrain-load-error");
  const previewTerreno = document.getElementById("preview-terreno");
  const previewSuperficie = document.getElementById("preview-superficie");
  const inputPresupuesto = document.getElementById("input-presupuesto");
  const previewPresupuesto = document.getElementById("preview-presupuesto");

  const labelHab = document.getElementById("label-hab-count");
  const labelBath = document.getElementById("label-bath-count");
  const previewBathCount = document.getElementById("preview-bath-count");
  const previewDistribucion = document.getElementById("preview-distribucion");

  const btnHabAdd = document.getElementById("btn-hab-add");
  const btnHabSub = document.getElementById("btn-hab-sub");
  const btnBathAdd = document.getElementById("btn-bath-add");
  const btnBathSub = document.getElementById("btn-bath-sub");

  const btnCrear = document.getElementById("btn-crear-proyecto");
  const modal = document.getElementById("modal-confirmacion");
  const modalClose = document.getElementById("btn-modal-close");
  const modalProjectName = document.getElementById("modal-project-name");

  function updatePreviewDistribucion() {
    if (previewBathCount) previewBathCount.textContent = String(bathCount);
    if (previewDistribucion) {
      previewDistribucion.textContent =
        habCount + " Hab • " + bathCount + " Baños";
    }
  }

  if (labelBath) labelBath.textContent = String(bathCount);
  if (previewNombre) previewNombre.textContent = "Sin nombre de proyecto";
  if (previewTerreno) previewTerreno.textContent = "Sin terreno seleccionado";
  if (previewSuperficie) previewSuperficie.textContent = "0 m²";
  if (previewPresupuesto) previewPresupuesto.textContent = ViMod.formatMoney(0);
  updatePreviewDistribucion();

  // Cargar terrenos del usuario en sesión
  async function loadUserTerrenos() {
    await Storage.whenReady();
    const user = Storage.getCurrentUser();
    if (user && selectTerreno) {
      const terrenos = await Storage.fetchTerrenos();
      if (terrainLoadError) {
        terrainLoadError.replaceChildren();
        terrainLoadError.classList.add("hidden");
      }

      // Limpiar opciones existentes excepto la primera
      selectTerreno.innerHTML =
        '<option value="">Selecciona un terreno...</option>';

      // Agregar terrenos del usuario
      terrenos.forEach((terreno) => {
        const option = document.createElement("option");
        option.value = terreno.id;
        option.textContent = `${terreno.ubicacion} (${terreno.area} m²)`;
        option.dataset.area = terreno.area;
        option.dataset.ubicacion = terreno.ubicacion;
        selectTerreno.appendChild(option);
      });

      // Si no hay terrenos, mostrar mensaje
      if (terrenos.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No tienes terrenos registrados";
        option.disabled = true;
        selectTerreno.appendChild(option);
      }
    }
  }

  if (inputNombre) {
    inputNombre.addEventListener("input", function (e) {
      const val = e.target.value.trim();
      previewNombre.textContent = val ? val : "Sin nombre (Borrador)";
    });
  }

  if (selectTerreno) {
    selectTerreno.addEventListener("change", function (e) {
      const selectedOption = selectTerreno.options[selectTerreno.selectedIndex];
      if (selectedOption && selectedOption.value) {
        previewTerreno.textContent =
          selectedOption.dataset.ubicacion || "Terreno seleccionado";
        previewSuperficie.textContent = `${selectedOption.dataset.area} m²`;
      } else {
        previewTerreno.textContent = "Sin terreno seleccionado";
        previewSuperficie.textContent = "0 m²";
      }
    });
  }

  if (inputPresupuesto) {
    inputPresupuesto.addEventListener("input", function (e) {
      let raw = e.target.value.replace(/[^0-9]/g, "");
      if (raw) {
        const num = parseInt(raw, 10);
        e.target.value = num.toLocaleString("es-CO");
        previewPresupuesto.textContent = ViMod.formatMoney(num);
      } else {
        previewPresupuesto.textContent = ViMod.formatMoney(0);
      }
    });
  }

  // Lógica para crear proyecto
  if (btnCrear) {
    btnCrear.addEventListener("click", async function () {
      await Storage.whenReady();
      const user = Storage.getCurrentUser();
      if (!user) {
        alert("Debes iniciar sesión para crear un proyecto");
        window.location.href = ViModRoutes.page("login");
        return;
      }

      const terrenoId = selectTerreno.value;
      const presupuestoStr = inputPresupuesto.value.replace(/[^0-9]/g, "");
      const presupuesto = parseInt(presupuestoStr, 10);

      // Validaciones
      if (!terrenoId) {
        alert("Debes seleccionar un terreno");
        return;
      }

      if (!presupuestoStr) {
        alert("El presupuesto es obligatorio");
        return;
      }

      if (!presupuesto || presupuesto <= 0) {
        alert("El presupuesto debe ser mayor a 0");
        return;
      }

      // Obtener datos del terreno seleccionado
      const terreno = Storage.getTerrenoById(terrenoId);
      if (!terreno) {
        alert("Terreno no encontrado");
        return;
      }

      btnCrear.disabled = true;
      let nuevoProyecto;
      try {
        nuevoProyecto = await Storage.createRemoteProject(
          {
            nombre: inputNombre.value.trim() || "Proyecto sin nombre",
            terrain_id: terrenoId,
            presupuesto,
            habitaciones: habCount,
            banos: bathCount,
          },
        );
      } catch (error) {
        btnCrear.disabled = false;
        alert(error.message);
        return;
      }

      // Redirigir al detalle del proyecto
      window.location.href = ViModRoutes.page("projectDetail", {
        proyecto: nuevoProyecto.id,
      });
    });
  }

  // Cargar terrenos al iniciar
  loadUserTerrenos().catch(function (error) {
    ViMod.showRetryError(
      terrainLoadError,
      error.message || "No se pudieron cargar los terrenos.",
      loadUserTerrenos,
    );
  });

  // Agregar event listeners para habitaciones y baños
  if (btnHabAdd) {
    btnHabAdd.addEventListener("click", function () {
      if (habCount < 6) {
        habCount += 1;
        labelHab.textContent = habCount;
        updatePreviewDistribucion();
      }
    });
  }

  if (btnHabSub) {
    btnHabSub.addEventListener("click", function () {
      if (habCount > 1) {
        habCount -= 1;
        labelHab.textContent = habCount;
        updatePreviewDistribucion();
      }
    });
  }

  if (btnBathAdd) {
    btnBathAdd.addEventListener("click", function () {
      if (bathCount < 6) {
        bathCount += 1;
        labelBath.textContent = bathCount;
        updatePreviewDistribucion();
      }
    });
  }

  if (btnBathSub) {
    btnBathSub.addEventListener("click", function () {
      if (bathCount > 1) {
        bathCount -= 1;
        labelBath.textContent = bathCount;
        updatePreviewDistribucion();
      }
    });
  }

  if (modalClose) {
    modalClose.addEventListener("click", function () {
      if (modal) {
        modal.classList.add("hidden");
      }
    });
  }
})();
