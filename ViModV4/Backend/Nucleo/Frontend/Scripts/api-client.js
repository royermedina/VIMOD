(function () {
  const API_BASE_URL = "http://localhost:3000/api";
  const TOKEN_KEY = "vimod_token";

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code || "API_ERROR";
    }
  }

  async function request(path, options) {
    const settings = options || {};
    const headers = { Accept: "application/json" };
    Object.assign(headers, settings.headers || {});
    const storedToken = localStorage.getItem(TOKEN_KEY);
    let token = storedToken;
    if (storedToken) {
      try {
        token = JSON.parse(storedToken);
      } catch (error) {
        token = storedToken;
      }
    }

    if (settings.body !== undefined) headers["Content-Type"] = "application/json";
    if (settings.auth !== false && token) {
      headers.Authorization = "Bearer " + token;
    }

    const method = settings.method || "GET";
    let response;
    try {
      response = await fetch(API_BASE_URL + path, {
        method,
        headers,
        body:
          settings.body === undefined
            ? undefined
            : JSON.stringify(settings.body),
      });
    } catch (error) {
      throw new ApiError(
        "No se pudo conectar con ViMod. Verifica que el backend esté activo.",
        0,
      );
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const isMissingRoute =
        response.status === 404 &&
        payload &&
        payload.error === "Endpoint no encontrado";
      const apiError = new ApiError(
        isMissingRoute
          ? `La ruta ${method} ${path} no existe en el backend. Comprueba que el servidor esté actualizado.`
          : (payload && payload.error) ||
            (response.status === 404
              ? "No se encontró el recurso solicitado."
              : "La solicitud no pudo completarse."),
        response.status,
        isMissingRoute ? "ROUTE_NOT_FOUND" : "API_ERROR",
      );
      if (response.status === 401 && token && path !== "/auth/me") {
        window.dispatchEvent(
          new CustomEvent("vimod:unauthorized", { detail: apiError }),
        );
      }
      throw apiError;
    }

    return payload;
  }

  window.ViModApi = {
    baseUrl: API_BASE_URL,
    ApiError,
    request,
    get(path, options) {
      return request(path, options);
    },
    post(path, body, options) {
      return request(path, { ...(options || {}), method: "POST", body });
    },
    patch(path, body, options) {
      return request(path, { ...(options || {}), method: "PATCH", body });
    },
    delete(path, options) {
      return request(path, { ...(options || {}), method: "DELETE" });
    },
  };
})();