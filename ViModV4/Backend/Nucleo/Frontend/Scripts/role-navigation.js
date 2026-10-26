(function (root, factory) {
  const routes = typeof module !== "undefined" && module.exports
    ? require("./rutas")
    : root.ViModRoutes;
  const navigation = factory(routes);
  if (typeof module !== "undefined" && module.exports) module.exports = navigation;
  if (root) root.ViModRoleNavigation = navigation;
})(typeof window !== "undefined" ? window : globalThis, function (routes) {
  const ROLE_HOME = {
    cliente: "clientDashboard",
    arquitecto: "architectDashboard",
    constructora: "contractorServices",
    admin: "adminDashboard",
  };

  function getHomePage(user) {
    if (!user) return null;
    const requestedRole = String(user.requestedRole || user.accountType || "").toLowerCase();
    const accountStatus = String(user.accountStatus || "").toLowerCase();
    if ((requestedRole === "arquitecto" || requestedRole === "constructora")
      && (accountStatus === "pendiente" || accountStatus === "pending")) return null;
    const pageName = ROLE_HOME[user.rol];
    return pageName ? routes.page(pageName) : null;
  }

  return { getHomePage };
});
