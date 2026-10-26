(function () {
  const formulario = document.getElementById("registro-form");
  const inputNombre = document.getElementById("nombre-completo");
  const inputCorreo = document.getElementById("correo-usuario");
  const inputTipoCuenta = document.getElementById("tipo-cuenta");
  const inputPass = document.getElementById("contrasena");
  const inputConfirm = document.getElementById("confirmar-contrasena");
  const togglePass = document.getElementById("alternar-contrasena");
  const checkTerminos = document.getElementById("terminos");

  const errorNombre = document.getElementById("error-nombre");
  const errorCorreoInvalido = document.getElementById("error-correo-invalido");
  const errorCorreoDuplicado = document.getElementById(
    "error-correo-duplicado",
  );
  const iconoValidacionCorreo = document.getElementById(
    "icono-validacion-correo",
  );
  const errorConfirmacion = document.getElementById("error-confirmacion");
  const exitoConfirmacion = document.getElementById("exito-confirmacion");

  const barra1 = document.getElementById("barra-nivel-1");
  const barra2 = document.getElementById("barra-nivel-2");
  const barra3 = document.getElementById("barra-nivel-3");
  const textoSeguridad = document.getElementById("texto-seguridad");

  const banner = document.getElementById("banner-notificacion");
  const bannerIcono = document.getElementById("banner-icono");
  const bannerTitulo = document.getElementById("banner-titulo");
  const bannerDesc = document.getElementById("banner-descripcion");

  // Alternar visibilidad de contraseña
  if (togglePass && inputPass) {
    togglePass.addEventListener("click", function () {
      const tipoActual = inputPass.getAttribute("type");
      const nuevoTipo = tipoActual === "password" ? "text" : "password";
      inputPass.setAttribute("type", nuevoTipo);
      const icono = togglePass.querySelector(".material-symbols-outlined");
      if (icono) {
        icono.textContent =
          nuevoTipo === "password" ? "visibility" : "visibility_off";
      }
    });
  }

  // Comprobador de robustez de contraseña
  if (inputPass) {
    inputPass.addEventListener("input", function () {
      const val = inputPass.value;
      let puntaje = 0;

      if (val.length >= 8) puntaje++;
      if (/[A-ZÁÉÍÓÚÑ]/.test(val)) puntaje++;
      if (/[0-9]/.test(val) || /[^A-Za-z0-9]/.test(val)) puntaje++;

      // Reinicio de barras
      barra1.className = "h-full bg-surface-dim transition-colors duration-200";
      barra2.className = "h-full bg-surface-dim transition-colors duration-200";
      barra3.className = "h-full bg-surface-dim transition-colors duration-200";

      if (val.length === 0) {
        textoSeguridad.textContent = "Nivel de seguridad: Sin evaluar";
        textoSeguridad.className =
          "font-body text-on-surface-variant font-medium";
      } else if (puntaje === 1) {
        barra1.classList.remove("bg-surface-dim");
        barra1.classList.add("bg-error");
        textoSeguridad.textContent = "Nivel de seguridad: Débil";
        textoSeguridad.className = "font-body text-error font-medium";
      } else if (puntaje === 2) {
        barra1.classList.remove("bg-surface-dim");
        barra1.classList.add("bg-tertiary-container");
        barra2.classList.remove("bg-surface-dim");
        barra2.classList.add("bg-tertiary-container");
        textoSeguridad.textContent = "Nivel de seguridad: Media";
        textoSeguridad.className = "font-body text-tertiary font-medium";
      } else if (puntaje >= 3) {
        barra1.classList.remove("bg-surface-dim");
        barra1.classList.add("bg-primary");
        barra2.classList.remove("bg-surface-dim");
        barra2.classList.add("bg-primary");
        barra3.classList.remove("bg-surface-dim");
        barra3.classList.add("bg-primary");
        textoSeguridad.textContent = "Nivel de seguridad: Fuerte";
        textoSeguridad.className = "font-body text-primary font-medium";
      }

      validarConfirmacion();
    });
  }

  // Validación de coincidencia de contraseña
  function validarConfirmacion() {
    if (!inputConfirm.value) {
      errorConfirmacion.classList.add("hidden");
      exitoConfirmacion.classList.add("hidden");
      return true;
    }
    if (inputConfirm.value !== inputPass.value) {
      errorConfirmacion.classList.remove("hidden");
      exitoConfirmacion.classList.add("hidden");
      return false;
    } else {
      errorConfirmacion.classList.add("hidden");
      exitoConfirmacion.classList.remove("hidden");
      return true;
    }
  }

  if (inputConfirm) {
    inputConfirm.addEventListener("input", validarConfirmacion);
  }

  // Validación de correo en tiempo real
  if (inputCorreo) {
    inputCorreo.addEventListener("blur", function () {
      validarCorreo();
    });
    inputCorreo.addEventListener("input", function () {
      if (
        !errorCorreoInvalido.classList.contains("hidden") ||
        !errorCorreoDuplicado.classList.contains("hidden")
      ) {
        validarCorreo();
      }
    });
  }

  function validarCorreo() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valor = inputCorreo.value.trim();

    errorCorreoInvalido.classList.add("hidden");
    errorCorreoDuplicado.classList.add("hidden");
    iconoValidacionCorreo.classList.add("hidden");

    if (!valor) return false;

    if (!emailRegex.test(valor)) {
      errorCorreoInvalido.classList.remove("hidden");
      iconoValidacionCorreo.classList.remove("hidden");
      iconoValidacionCorreo.textContent = "error";
      iconoValidacionCorreo.className =
        "material-symbols-outlined absolute right-3 text-error text-[20px]";
      return false;
    }

    iconoValidacionCorreo.classList.remove("hidden");
    iconoValidacionCorreo.textContent = "check_circle";
    iconoValidacionCorreo.className =
      "material-symbols-outlined absolute right-3 text-primary text-[20px]";
    return true;
  }

  // Envío de formulario y estados de banner
  if (formulario) {
    formulario.addEventListener("submit", async function (e) {
      e.preventDefault();

      let esValido = true;

      if (!inputNombre.value.trim()) {
        errorNombre.classList.remove("hidden");
        esValido = false;
      } else {
        errorNombre.classList.add("hidden");
      }

      const correoOk = validarCorreo();
      if (!correoOk) esValido = false;

      const passOk =
        inputPass.value.length >= 8 &&
        /[A-ZÁÉÍÓÚÑ]/.test(inputPass.value) &&
        /[0-9]/.test(inputPass.value);
      if (!passOk) {
        esValido = false;
      }

      const coincidenciaOk = validarConfirmacion();
      if (!coincidenciaOk || !inputConfirm.value) {
        errorConfirmacion.classList.remove("hidden");
        esValido = false;
      }

      if (!checkTerminos.checked) {
        esValido = false;
      }

      banner.classList.remove(
        "hidden",
        "bg-error-container",
        "text-on-error-container",
        "border-error/30",
        "bg-primary-container/20",
        "text-on-surface",
        "border-primary/40",
      );

      if (!esValido) {
        banner.classList.add(
          "bg-error-container",
          "text-on-error-container",
          "border-error/30",
        );
        bannerIcono.textContent = "report_problem";
        bannerTitulo.textContent = "Faltan datos requeridos";
        bannerDesc.textContent =
          "Por favor revisa los campos señalados antes de proceder a la creación del perfil técnico.";
        banner.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        const submitButton = formulario.querySelector('[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        try {
          await ViModApi.post(
            "/auth/register",
            {
              nombre: inputNombre.value.trim(),
              correo: inputCorreo.value.trim(),
              password: inputPass.value,
              rol: inputTipoCuenta ? inputTipoCuenta.value : "cliente",
            },
            { auth: false },
          );
        } catch (error) {
          if (submitButton) submitButton.disabled = false;
          banner.classList.add(
            "bg-error-container",
            "text-on-error-container",
            "border-error/30",
          );
          bannerIcono.textContent = "report_problem";
          bannerIcono.className =
            "material-symbols-outlined text-[20px] mt-0.5 text-error";
          bannerTitulo.textContent = "No se pudo crear la cuenta";
          bannerDesc.textContent = error.message;
          if (error.status === 409) {
            errorCorreoDuplicado.classList.remove("hidden");
            iconoValidacionCorreo.classList.remove("hidden");
            iconoValidacionCorreo.textContent = "cancel";
            iconoValidacionCorreo.className =
              "material-symbols-outlined absolute right-3 text-error text-[20px]";
          }
          banner.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        banner.classList.add(
          "bg-primary-container/20",
          "text-on-surface",
          "border-primary/40",
        );
        bannerIcono.textContent = "verified";
        bannerIcono.className =
          "material-symbols-outlined text-[20px] mt-0.5 text-primary";
        bannerTitulo.textContent = "¡Cuenta configurada con éxito!";
        const tipoCuentaSeleccionado = inputTipoCuenta ? inputTipoCuenta.value : "cliente";
        const mensajeCuenta =
          tipoCuentaSeleccionado === "cliente"
            ? "Tu cuenta ya está registrada. Ya puedes iniciar sesión y comenzar a planificar tu vivienda."
            : "Tu solicitud queda pendiente de aprobación por el administrador. Cuando sea autorizada, podrás acceder a las funciones de tu tipo de cuenta.";
        bannerDesc.textContent = mensajeCuenta;

        formulario.reset();
        barra1.className = "h-full bg-surface-dim";
        barra2.className = "h-full bg-surface-dim";
        barra3.className = "h-full bg-surface-dim";
        textoSeguridad.textContent = "Nivel de seguridad: Sin evaluar";
        iconoValidacionCorreo.classList.add("hidden");
        exitoConfirmacion.classList.add("hidden");
        banner.scrollIntoView({ behavior: "smooth", block: "start" });

        // Redirigir a login después de 2 segundos
        setTimeout(() => {
          window.location.href = ViModRoutes.page("login");
        }, 2000);
      }
    });
  }
})();
