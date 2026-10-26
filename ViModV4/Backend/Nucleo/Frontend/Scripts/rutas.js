(function (root, factory) {
  const routes = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = routes;
  if (root) root.ViModRoutes = routes;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const pages = Object.freeze({
    registration: '/Backend/Nucleo/Frontend/Vistas/1._registro_de_usuario.html',
    login: '/Backend/Nucleo/Frontend/Vistas/2.%20Inicio%20de%20sesion.html',
    clientDashboard: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/3.%20Panel%20principal%20del%20cliente.html',
    terrainRegistration: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/4.%20Registrar%20terreno.html',
    projectCreation: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/5.%20crear%20proyecto%20de%20vivienda.html',
    projectDetail: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/6.%20Detalle%20del%20proyecto.html',
    proposals: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/7.%20Propuestas%20Generadas.html',
    proposalDetail: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/8.%20Detalles%20Propuestas.html',
    architectReview: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/9.%20Revision%20por%20arquitecto.html',
    contractorCatalog: '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/10.%20Catalgo%20contructoras%20y%20cotizacion.html',
    architectDashboard: '/Backend/Paquetes/Presentacion/PortalArquitecto/Vistas/11.%20Panel%20arquitecto.html',
    contractorServices: '/Backend/Paquetes/Presentacion/PortalConstructora/Vistas/12.%20Constructora%20mis%20servicios.html',
    contractorRequests: '/Backend/Paquetes/Presentacion/PortalConstructora/Vistas/13.%20Constructora%20solicitudes.html',
    adminLogin: '/Backend/Paquetes/Presentacion/PanelAdmin/Vistas/14.%20Acceso%20administrativo.html',
    adminDashboard: '/Backend/Paquetes/Presentacion/PanelAdmin/Vistas/15.%20Consola%20administrativa.html',
  });

  function page(name, query) {
    const route = pages[name];
    if (!route) throw new Error('Ruta de página desconocida: ' + name);
    const parameters = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) parameters.set(key, String(value));
    });
    return parameters.size ? route + '?' + parameters.toString() : route;
  }

  return Object.freeze({ pages, page });
});
