async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const credentialAlert = document.getElementById("credential-alert");

  try {
    const response = await ViModApi.post(
      "/auth/login",
      { correo: email, password },
      { auth: false },
    );
    const user = response.user;
    credentialAlert.classList.add("hidden");

    if ((user.requestedRole === "arquitecto" || user.requestedRole === "constructora")
      && (user.accountStatus === "pendiente" || user.accountStatus === "pending")) {
      Storage.clearSession();
      const heading = credentialAlert.querySelector(".font-label");
      const description = credentialAlert.querySelector("p");
      credentialAlert.classList.remove("hidden");
      if (heading) heading.textContent = "Solicitud de perfil pendiente";
      if (description) description.textContent = "Tu solicitud de acceso como " +
        (user.requestedRole === "arquitecto" ? "arquitecto" : "constructora") +
        " sigue pendiente. No tendrás acceso a las funciones profesionales hasta que un administrador la apruebe.";
      return;
    }

    const homePage = ViModRoleNavigation.getHomePage(user);
    if (!homePage) {
      Storage.clearSession();
      credentialAlert.classList.remove("hidden");
      const heading = credentialAlert.querySelector(".font-label");
      const description = credentialAlert.querySelector("p");
      if (heading) heading.textContent = "Tipo de cuenta no reconocido";
      if (description) description.textContent = "El servidor no devolvió un rol autorizado para esta sesión. Contacta al administrador.";
      return;
    }
    Storage.setSession(user, response.token);
    if (user.accountStatus === "rechazado" || user.accountStatus === "rejected") {
      const heading = credentialAlert.querySelector(".font-label");
      const description = credentialAlert.querySelector("p");
      credentialAlert.classList.remove("hidden");
      if (heading) heading.textContent = "Solicitud de perfil rechazada";
      if (description) description.textContent = "Puedes continuar usando tu cuenta de cliente. Contacta al administrador si deseas solicitar una nueva revisión.";
      window.setTimeout(function () { window.location.href = homePage; }, 3500);
      return;
    }
    window.location.href = homePage;
  } catch (error) {
    credentialAlert.classList.remove("hidden");
    const heading = credentialAlert.querySelector(".font-label");
    const description = credentialAlert.querySelector("p");
    if (heading) {
      heading.textContent =
        error.status === 401
          ? "Credenciales no reconocidas"
          : "No fue posible iniciar sesión";
    }
    if (description) description.textContent = error.message;
  }
}
