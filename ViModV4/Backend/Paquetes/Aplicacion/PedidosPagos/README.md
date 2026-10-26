# Pasarela de pagos y roles

## Pasarela de pagos

- **Composición/configuración:** `src/app.js` carga la configuración y las URLs de retorno de Stripe; `src/server.js` inicia la conexión con MongoDB.
- **Flujo de aplicación:** `Paquetes/Aplicacion/PedidosPagos/index.js` compone los servicios. `OrderPaymentService` crea pedidos con el monto calculado en el servidor y abre la sesión de pago.
- **Stripe:** `StripePaymentService` crea y confirma sesiones de Checkout a través del SDK. Solo admite claves `sk_test_`; no acepta claves live.
- **Respaldo simulado:** `PaymentSimulator` ofrece métodos y resultados ficticios, sin cobrar ni aceptar datos financieros reales.
- **Proyecto contratado:** `Paquetes/Aplicacion/Proyectos/contracted-project-service.js` obtiene el estado derivado del pago y coordina el marcado del proyecto y de las ofertas relacionadas.
- **Persistencia y rutas:** `Paquetes/Persistencia/Repositorios` contiene `OrderRepository`, `PaymentRepository` y los repositorios relacionados. Las rutas y controladores están en `Paquetes/Presentacion/PortalCliente/Api`.
- **Reglas puras:** `Paquetes/Dominio/ModeloPagos` contiene reglas de pagos, como conversión COP/USD y transiciones de estado.

Stripe se configura con `PAYMENT_PROVIDER=stripe`, una `STRIPE_SECRET_KEY` de prueba, `COP_PER_USD` positivo y `FRONTEND_URL` como origen del frontend. Sin Stripe configurado se usa el simulador.

## Roles y autorización

- **Cliente:** puede registrarse públicamente y queda activo con rol `cliente`.
- **Arquitecto y constructora:** pueden solicitar esos roles durante el registro. La cuenta queda `pendiente` hasta que administración apruebe la solicitud; mientras tanto, su rol efectivo es `cliente`.
- **Administrador:** no puede registrarse públicamente. Se provisiona al iniciar el backend mediante la configuración `ADMIN_USERNAME` y `ADMIN_PASSWORD`; su contraseña se almacena como hash bcrypt.

`Paquetes/Aplicacion/Autenticacion/AuthService` registra e inicia sesión. `Paquetes/Dominio/Usuarios` define los roles válidos y calcula el rol efectivo según el usuario y el estado de la cuenta. `role-assignments.js` aplica asignaciones confiables configuradas en el servidor. `Paquetes/Aplicacion/Administracion/AdminService` aprueba o rechaza solicitudes de arquitecto y constructora; al rechazarlas, la cuenta vuelve al rol efectivo de cliente.

En `Paquetes/Presentacion/PortalCliente/Api`, `requireAuth` verifica el JWT, `load-user` vuelve a cargar el usuario desde MongoDB y `requireRole` protege cada ruta por su rol efectivo. Las rutas de los portales de cliente, constructora, arquitecto y administración aplican esas comprobaciones; la interfaz no otorga permisos por sí misma.

