# Arquitectura de ViMod

## Estructura

```text
Backend/
├── Nucleo/
│   ├── Frontend/{Vistas,Scripts,Estilos}
│   ├── HTTP/
│   ├── env.js
│   ├── http-error.js
│   ├── object-id.js
│   ├── runtime-config.js
│   └── stripe-return-routes.js
├── Paquetes/
│   ├── Presentacion/{PortalArquitecto,PanelAdmin,PortalCliente,PortalConstructora}/
│   │   └── {Vistas,Scripts,Api,Estilos}
│   ├── Aplicacion/{PedidosPagos,Cotizaciones,Servicios,Revisiones,Administracion,Autenticacion,Propuestas,Proyectos,Terrenos}/
│   ├── Persistencia/{AccesoDatos,Repositorios}/
│   └── Dominio/{ModeloPagos,ModeloComercial,ModeloRevisiones,Usuarios,ModeloPropuestas,ModeloProyectos}/
├── src/{server.js,app.js,config}
├── scripts/
├── test/
└── docs/
```

`Nucleo` es transversal, no una capa de negocio ni un paquete. Contiene configuración leída de `process.env`, `HttpError`, utilidades de ObjectId, manejadores HTTP y recursos frontend compartidos. Las vistas de registro e inicio de sesión están en `Nucleo/Frontend/Vistas`, porque son la entrada compartida a los cuatro portales y no pertenecen a un paquete de portal. `PortalCliente/Api` conserva las rutas públicas de autenticación.

## Módulos de Aplicación y modelos de Dominio

| Aplicación | Modelo de Dominio permitido |
| --- | --- |
| PedidosPagos | ModeloPagos |
| Cotizaciones | ModeloComercial |
| Servicios | ModeloComercial |
| Revisiones | ModeloRevisiones |
| Administracion | Usuarios |
| Autenticacion | Usuarios |
| Propuestas | ModeloPropuestas, ModeloProyectos |
| Proyectos | ModeloProyectos |
| Terrenos | ModeloProyectos |

## Dependencias

```text
Presentacion → Aplicacion → Persistencia → Dominio
                         └→ Dominio
Persistencia ─────────────────→ Dominio
Nucleo puede ser usado por todas las capas.
```

Dominio no importa otras capas. Persistencia se limita a Dominio, Nucleo, AccesoDatos y librerías; los repositorios solo ejecutan consultas y escrituras por AccesoDatos. `Aplicacion/Proyectos/contracted-project-service.js` deriva el estado pagado de órdenes y pagos antiguos, prioriza el más reciente y coordina la actualización del proyecto y ofertas; el repositorio solo proporciona acceso MongoDB. Aplicación no importa `src`, Presentacion, `getDb` ni AccesoDatos; Presentacion no importa Persistencia ni Dominio. `src/app.js` y `src/server.js` son la raíz de composición: configuran la aplicación y conectan la base de datos, sin cambiar las rutas HTTP.

Las dependencias entre módulos de Aplicación no dibujadas por el diagrama son excepciones explícitas; cada importación cruza por el `index.js` público:

| Desde → hacia | Justificación |
| --- | --- |
| Administracion → Autenticacion | Reutiliza el resolvedor de roles para los controles de usuario administrador. |
| Cotizaciones → Autenticacion | Verifica que la constructora tenga cuenta aprobada. |
| Cotizaciones → Proyectos | Consulta el estado contratado derivado por el servicio de Aplicación. |
| PedidosPagos → Proyectos | Reutiliza contexto y autorización de proyectos con ámbito de propietario. |
| PedidosPagos → Propuestas | Reutiliza el flujo de propuestas y la regla de estimación COP. |
| PedidosPagos → Revisiones | El facade del workflow de cliente conserva las operaciones de revisión junto con pagos. |
| PedidosPagos → Servicios | El facade del workflow de cliente conserva las operaciones de catálogo. |
| PedidosPagos → Cotizaciones | El facade del workflow de cliente conserva las operaciones de cotización. |
| Propuestas → Proyectos | Respuestas y selección aplican el estado contratado derivado por Aplicación. |
| Revisiones → Autenticacion | Verifica el rol efectivo y aprobado de arquitecto. |
| Revisiones → Proyectos | Consulta el estado pagado y la propuesta contratada por el servicio de Aplicación. |
| Servicios → Autenticacion | Verifica rol y aprobación de constructoras. |

`test/architecture.test.js` mantiene esta lista de excepciones y valida paquetes, imports resueltos y reglas de capa/modelo.

## Páginas por portal

Rutas relativas a la raíz del workspace. Cada vista de portal usa su script `page-*.js` homónimo y estilos exclusivos cuando se indican.

| Portal | Vistas HTML |
| --- | --- |
| Comun en Nucleo | `Frontend/Vistas/1._registro_de_usuario.html`, `Frontend/Vistas/2. Inicio de sesion.html` |
| PortalCliente | `3. Panel principal del cliente.html`, `4. Registrar terreno.html`, `5. crear proyecto de vivienda.html`, `6. Detalle del proyecto.html`, `7. Propuestas Generadas.html`, `8. Detalles Propuestas.html`, `9. Revision por arquitecto.html`, `10. Catalgo contructoras y cotizacion.html` |
| PortalConstructora | `12. Constructora mis servicios.html`, `13. Constructora solicitudes.html` |
| PortalArquitecto | `11. Panel arquitecto.html` |
| PanelAdmin | `14. Acceso administrativo.html`, `15. Consola administrativa.html` |

Las vistas de portal están en `Paquetes/Presentacion/<Portal>/Vistas`, y sus scripts, estilos y API en las subcarpetas del portal. Las páginas 9 y 10 son del cliente; el arquitecto atiende revisiones en su portal. Login y registro son comunes; el inicio de sesión redirige según el rol autorizado.

## Inicio y verificaciones

Live Server sirve la raíz del workspace en el puerto 5500. Abrir la aplicación en:
`http://localhost:5500/Backend/Nucleo/Frontend/Vistas/2.%20Inicio%20de%20sesion.html`

El `index.html` raíz dirige a esa misma vista. `FRONTEND_URL` se mantiene como origen, por ejemplo `http://localhost:5500`; las rutas Stripe se construyen en `Nucleo/stripe-return-routes.js` y se inyectan desde la composición raíz. Desde `Backend`, iniciar con `node src/server.js`; `npm run check` y `npm test` incluyen la verificación de arquitectura y enlaces frontend.
