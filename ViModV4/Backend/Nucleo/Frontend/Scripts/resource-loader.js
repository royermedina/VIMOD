(function loadViModSharedResources() {
  const common = "/Backend/Nucleo/Frontend";
  document.write('<script src="' + common + '/Scripts/rutas.js"><\/script>');
  document.write('<link rel="stylesheet" href="' + common + '/Estilos/base.css">');
  document.write('<link rel="stylesheet" href="' + common + '/Estilos/components.css">');
  document.write('<link rel="stylesheet" href="' + common + '/Estilos/tailwind.generated.css">');
  var pageStyles = {
    '1._registro_de_usuario.html': common + '/Estilos/registro-usuario.css',
    '5. crear proyecto de vivienda.html': '/Backend/Paquetes/Presentacion/PortalCliente/Estilos/crear-proyecto.css',
    '6. detalle del proyecto.html': '/Backend/Paquetes/Presentacion/PortalCliente/Estilos/detalle-proyecto.css',
    '8. detalles propuestas.html': '/Backend/Paquetes/Presentacion/PortalCliente/Estilos/detalles-propuestas.css',
    '12. constructora mis servicios.html': '/Backend/Paquetes/Presentacion/PortalConstructora/Estilos/constructora-servicios.css',
    '13. constructora solicitudes.html': '/Backend/Paquetes/Presentacion/PortalConstructora/Estilos/constructora-solicitudes.css'
  };
  var currentPage = decodeURIComponent(window.location.pathname.split('/').pop() || '').toLowerCase();
  document.write('<script>document.documentElement.setAttribute("data-vimod-page", "' + currentPage.replace(/"/g, '') + '");<\/script>');
  if (pageStyles[currentPage]) {
    document.write('<link rel="stylesheet" href="' + pageStyles[currentPage] + '">');
  }
  document.write('<script src="' + common + '/Scripts/tailwind-config.js"><\/script>');
  document.write('<script src="' + common + '/Scripts/page-utils.js"><\/script>');
  document.write('<script src="' + common + '/Scripts/page-actions.js"><\/script>');
  document.write('<script src="' + common + '/Scripts/api-client.js?v=3"><\/script>');
  document.write('<script src="' + common + '/Scripts/storage-repository.js"><\/script>');
  document.write('<script src="' + common + '/Scripts/role-navigation.js"><\/script>');
  document.write('<script src="' + common + '/Scripts/storage.js?v=9"><\/script>');
})();
