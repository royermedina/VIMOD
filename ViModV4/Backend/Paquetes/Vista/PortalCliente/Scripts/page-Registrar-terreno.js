function updateDimensions() {
  const widthInput = document.getElementById("plot-width");
  const lengthInput = document.getElementById("plot-length");
  const validationMsg = document.getElementById("validation-message");
  const areaDisplay = document.getElementById("calculated-area-display");
  const innerAreaDisplay = document.getElementById("schematic-area-inner");
  const widthLabel = document.getElementById("svg-width-label");
  const lengthLabel = document.getElementById("svg-length-label");
  const estimatedModules = document.getElementById("estimated-modules");
  const footprintDisplay = document.getElementById("recommended-footprint");
  const schematicRect = document.getElementById("schematic-rect");
  const submitBtn = document.getElementById("submit-btn");

  const width = parseFloat(widthInput.value);
  const length = parseFloat(lengthInput.value);

  const isInvalid = isNaN(width) || isNaN(length) || width <= 0 || length <= 0;

  if (isInvalid) {
    validationMsg.classList.remove("hidden");
    validationMsg.classList.add("flex");
    areaDisplay.innerText = "0.00";
    innerAreaDisplay.innerText = "0 m²";
    estimatedModules.innerText = "Parámetro no válido";
    footprintDisplay.innerText = "0 m²";
    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-50", "cursor-not-allowed");
    return;
  }

  validationMsg.classList.add("hidden");
  validationMsg.classList.remove("flex");
  submitBtn.disabled = false;
  submitBtn.classList.remove("opacity-50", "cursor-not-allowed");

  const totalArea = width * length;
  areaDisplay.innerText = totalArea.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  innerAreaDisplay.innerText = `${Math.round(totalArea)} m²`;
  widthLabel.innerText = `${width.toFixed(2)} m`;
  lengthLabel.innerText = `${length.toFixed(2)} m`;

  // Modules estimation: standard module ~24m²
  const modCount = Math.max(1, Math.floor((totalArea * 0.6) / 24));
  estimatedModules.innerText = `${modCount} a ${modCount + 2}`;
  footprintDisplay.innerText = `${(totalArea * 0.6).toFixed(1)} m²`;

  // Visual aspect ratio modulation for schematic rect
  const ratio = Math.min(Math.max(width / length, 0.5), 2.0);
  const baseSize = 140;
  schematicRect.style.width = `${Math.round(baseSize * Math.sqrt(ratio))}px`;
  schematicRect.style.height = `${Math.round(baseSize / Math.sqrt(ratio))}px`;
}

async function loadRegisteredTerrenos() {
  await Storage.whenReady();
  const user = Storage.getCurrentUser();
  const list = document.getElementById("registered-terrenos");
  const count = document.getElementById("terrain-count");
  if (!user || !list) return;

  let terrenos;
  try {
    terrenos = await Storage.fetchTerrenos();
  } catch (error) {
    ViMod.showRetryError(list, error.message, loadRegisteredTerrenos);
    if (count) count.textContent = "0 terrenos";
    return;
  }
  if (count) count.textContent = terrenos.length + (terrenos.length === 1 ? " terreno" : " terrenos");
  list.innerHTML = terrenos.length
    ? terrenos.map(function (terreno) {
        return `<article class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col sm:flex-row items-center gap-4">
          <div class="vimod-card-image-frame-terrain relative rounded-lg overflow-hidden bg-surface-container shrink-0 flex items-center justify-center">
            <img data-card-image data-card-image-kind="terrain" data-card-image-id="${escapeTerrainText(terreno.id)}" src="${ViModCardImages.terrainImage(terreno.id)}" alt="Vista del terreno" loading="lazy" class="absolute inset-0 w-full h-full object-cover object-center opacity-0" />
            <span data-card-fallback class="material-symbols-outlined text-5xl text-primary">terrain</span>
            <span class="absolute top-2 left-2 px-space-8 py-space-2 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm">Registrado</span>
          </div>
          <div class="flex min-w-0 flex-1 flex-col justify-center gap-3">
            <div class="min-w-0">
              <h3 class="font-semibold text-on-surface truncate">${escapeTerrainText(terreno.ubicacion || "Sin ubicación")}</h3>
              <p class="text-xs text-on-surface-variant mt-1">Medidas: ${Number(terreno.ancho).toLocaleString("es-CO")} m × ${Number(terreno.largo).toLocaleString("es-CO")} m</p>
            </div>
            <p class="text-sm text-primary font-bold">${Number(terreno.area).toLocaleString("es-CO", { maximumFractionDigits: 2 })} m²</p>
            <button type="button" data-delete-terrain="${escapeTerrainText(terreno.id)}" class="client-secondary-action self-start px-3 py-2 text-sm text-error">Eliminar terreno</button>
          </div>
        </article>`;
      }).join("")
    : '<p class="text-sm text-on-surface-variant md:col-span-2">Todavía no tienes terrenos registrados.</p>';
  ViModCardImages.bindFallbacks(list);
  list.querySelectorAll("[data-delete-terrain]").forEach((button) => {
    button.addEventListener("click", async function () {
      if (!confirm("¿Eliminar este terreno?")) return;
      button.disabled = true;
      try {
        await Storage.deleteRemoteTerrain(button.dataset.deleteTerrain);
        await loadRegisteredTerrenos();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });
}

function escapeTerrainText(value) {
  return String(value || "").replace(/[&<>'"]/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
  });
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const widthInput = document.getElementById("plot-width");
  const lengthInput = document.getElementById("plot-length");
  const locationInput = document.getElementById("plot-location");
  const width = parseFloat(widthInput.value);
  const length = parseFloat(lengthInput.value);

  if (isNaN(width) || isNaN(length) || width <= 0 || length <= 0) {
    document.getElementById("validation-message").classList.remove("hidden");
    document.getElementById("validation-message").classList.add("flex");
    return;
  }

  // Validar que el usuario esté autenticado
  await Storage.whenReady();
  const user = Storage.getCurrentUser();
  if (!user) {
    alert("Debes iniciar sesión para registrar un terreno");
    window.location.href = ViModRoutes.page("login");
    return;
  }

  const submitButton = document.getElementById("submit-btn");
  if (submitButton) submitButton.disabled = true;
  try {
    await Storage.createTerreno({
      ubicacion: locationInput.value.trim(),
      ancho: width,
      largo: length,
    });
  } catch (error) {
    if (submitButton) submitButton.disabled = false;
    alert(error.message);
    return;
  }

  const banner = document.getElementById("success-banner");
  banner.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Redirigir al panel del cliente después de 2 segundos
  setTimeout(() => {
    window.location.href = ViModRoutes.page("clientDashboard");
  }, 2000);
}

function resetOrGoBack() {
  document.getElementById("plot-width").value = "10.00";
  document.getElementById("plot-length").value = "20.00";
  document.getElementById("plot-location").value =
    "";
  document.getElementById("success-banner").classList.add("hidden");
  updateDimensions();
}

// Initial calculation trigger
updateDimensions();
loadRegisteredTerrenos();
