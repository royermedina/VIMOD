(function () {
  const message = document.getElementById("admin-message");

  function showMessage(text, success) {
    message.textContent = text;
    message.classList.remove("hidden", "bg-red-100", "text-red-800", "bg-emerald-100", "text-emerald-900");
    message.classList.add(success ? "bg-emerald-100" : "bg-red-100", success ? "text-emerald-900" : "text-red-800");
  }

  document.getElementById("admin-login").addEventListener("submit", async function (event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await ViModApi.post("/auth/login", {
        usuario: document.getElementById("admin-username").value.trim(),
        password: document.getElementById("admin-password").value,
      }, { auth: false });
      if (!result.user || result.user.rol !== "admin") {
        showMessage("Esta cuenta no tiene autorización administrativa.", false);
        return;
      }
      if (!result.token) {
        showMessage("El servidor no devolvió una sesión válida.", false);
        return;
      }
      localStorage.setItem("vimod_token", result.token);
      localStorage.setItem("vimod_session", JSON.stringify(result.user));
      window.location.href = ViModRoutes.page("adminDashboard");
    } catch (error) {
      showMessage(error.message, false);
    } finally {
      button.disabled = false;
    }
  });
})();
