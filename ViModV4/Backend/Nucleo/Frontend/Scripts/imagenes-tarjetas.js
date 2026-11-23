(function (root, factory) {
  const cardImages = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = cardImages;
  if (root) root.ViModCardImages = cardImages;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const terrainImages = Object.freeze([
    "/assets/img/terrenos/terreno-1.jpg",
    "/assets/img/terrenos/terreno-2.jpg",
    "/assets/img/terrenos/terreno-3.jpg",
    "/assets/img/terrenos/terreno-4.jpg",
  ]);
  const projectImages = Object.freeze([
    "/assets/img/proyectos/casa-1.jpg",
    "/assets/img/proyectos/casa-2.jpg",
    "/assets/img/proyectos/casa-3.jpg",
    "/assets/img/proyectos/casa-4.jpg",
    "/assets/img/proyectos/casa-5.jpg",
    "/assets/img/proyectos/casa-6.jpg",
  ]);

  function hashId(id) {
    const value = String(id == null ? "" : id);
    let hash = 2166136261;
    for (const character of value) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function imagesFor(images, id) {
    if (!images.length) return [];
    const start = hashId(id) % images.length;
    return images.slice(start).concat(images.slice(0, start));
  }

  function imageFor(images, id) {
    return imagesFor(images, id)[0] || null;
  }

  function terrainImagesFor(id) {
    return imagesFor(terrainImages, id);
  }

  function projectImagesFor(id) {
    return imagesFor(projectImages, id);
  }

  function terrainImage(id) {
    return imageFor(terrainImages, id);
  }

  function projectImage(id) {
    return imageFor(projectImages, id);
  }

  function bindFallbacks(container) {
    if (!container) return;
    container.querySelectorAll("img[data-card-image]").forEach((image) => {
      const fallback = image.parentElement
        && image.parentElement.querySelector("[data-card-fallback]");
      if (!fallback) return;

      const showFallback = () => {
        image.hidden = true;
        fallback.hidden = false;
      };
      const showImage = () => {
        image.classList.remove("opacity-0");
        image.classList.add("opacity-100");
        fallback.hidden = true;
      };

      const dataset = image.dataset || {};
      const candidates = dataset.cardImageKind === "terrain"
        ? terrainImagesFor(dataset.cardImageId)
        : dataset.cardImageKind === "project"
          ? projectImagesFor(dataset.cardImageId)
          : [];
      const initialSource = image.getAttribute("src");
      let candidateIndex = candidates.indexOf(initialSource);
      if (candidateIndex < 0 && candidates.length) candidateIndex = 0;

      const tryNextImage = () => {
        candidateIndex += 1;
        if (candidateIndex >= candidates.length) {
          showFallback();
          return;
        }
        image.src = candidates[candidateIndex];
      };

      image.addEventListener("load", showImage);
      image.addEventListener("error", tryNextImage);
      if (image.complete) {
        if (image.naturalWidth > 0) showImage();
        else tryNextImage();
      }
    });
  }

  return Object.freeze({
    terrainImages,
    projectImages,
    terrainImagesFor,
    projectImagesFor,
    terrainImage,
    projectImage,
    bindFallbacks,
  });
});
