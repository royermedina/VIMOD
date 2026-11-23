# ViMod

### Plataforma para planificar viviendas modulares

ViMod conecta a clientes, arquitectos y constructoras en un solo flujo de trabajo: desde el registro de terrenos y proyectos hasta la generación de propuestas, revisiones técnicas, cotizaciones, pedidos y pagos. Este repositorio contiene la aplicación ViMod V4 en la carpeta `ViModV4`.

> **Estado del producto:** proyecto académico. Los costos y tiempos de las propuestas son estimaciones de referencia, no estudios técnicos ni cotizaciones comerciales. Los pagos se simulan o se procesan con Stripe exclusivamente en modo de prueba.

## Contenido

- [Funciones](#funciones)
- [Tecnologías](#tecnologías)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Flujo de uso](#flujo-de-uso)
- [Requisitos e inicio local](#requisitos-e-inicio-local)
- [Configuración del entorno](#configuración-del-entorno)
- [Roles y permisos](#roles-y-permisos)
- [Pagos](#pagos)
- [API](#api)
- [Datos y reglas de negocio](#datos-y-reglas-de-negocio)
- [Scripts disponibles](#scripts-disponibles)
- [Verificaciones y solución de problemas](#verificaciones-y-solución-de-problemas)

## Funciones

### Clientes

- Crear una cuenta e iniciar sesión.
- Registrar terrenos y administrarlos mientras no tengan proyectos activos asociados.
- Crear proyectos con presupuesto, dimensiones del terreno, habitaciones y baños.
- Analizar la viabilidad del proyecto y generar propuestas modulares con estimaciones.
- Consultar propuestas, seleccionar una para continuar y solicitar o seguir revisiones arquitectónicas.
- Consultar constructoras y sus servicios publicados, pedir cotizaciones y revisar ofertas.
- Crear pedidos a partir de una propuesta seleccionada o de una cotización aceptada; consultar pagos y pedidos.

### Arquitectos

- Completar un perfil profesional.
- Consultar revisiones asignadas o disponibles, postularse o aceptar asignaciones y administrar su estado.
- Agregar observaciones, registrar criterios de revisión y entregar resultados al cliente.

### Constructoras

- Completar un perfil y administrar sus servicios publicados.
- Consultar solicitudes de cotización y responderlas.
- Consultar proyectos disponibles, presentar ofertas y retirar ofertas propias.

### Administración

- Consultar el resumen de la plataforma, usuarios, solicitudes de roles y solicitudes de asesores.
- Aprobar o rechazar solicitudes de arquitectos y constructoras.
- Cambiar estados de cuentas, asignar revisiones y consultar proyectos, pedidos, cotizaciones, servicios, pagos y auditoría.
- El acceso administrativo se valida en el backend; no depende solo de ocultar páginas o botones en el navegador.

## Tecnologías

| Área | Tecnologías |
| --- | --- |
| Interfaz web | HTML, CSS, JavaScript, Tailwind CSS y recursos frontend compartidos |
| Backend y API | Node.js, Express y JavaScript |
| Base de datos | MongoDB y el driver oficial de Node.js |
| Autenticación | JWT y contraseñas con hash bcrypt |
| Pagos | Simulador académico y Stripe Checkout en modo de prueba |
| Pruebas | Node.js Test Runner (`node:test`) |

## Estructura del proyecto

```text
VIMOD_ENTREGA/
├── README.md
└── ViModV4/
    ├── .vscode/
    │   └── start-live-server.js    # Inicia Live Server en localhost:5500
    ├── assets/
    │   └── img/
    │       ├── proyectos/          # Imágenes locales de proyectos
    │       └── terrenos/           # Imágenes locales de terrenos
    ├── Backend/
    │   ├── Nucleo/
    │   │   ├── Frontend/
    │   │   │   ├── Vistas/         # Registro e inicio de sesión comunes
    │   │   │   ├── Scripts/        # Scripts JavaScript compartidos
    │   │   │   └── Estilos/        # Estilos compartidos
    │   │   └── *.js                # Configuración, errores y utilidades comunes
    │   ├── Paquetes/
    │   │   ├── Modelo/
    │   │   │   ├── Aplicacion/     # Servicios y casos de uso
    │   │   │   ├── Dominio/        # Reglas y modelos de negocio
    │   │   │   └── Persistencia/   # Repositorios y acceso a MongoDB
    │   │   ├── Vista/
    │   │   │   ├── PortalCliente/       # Vistas, scripts y estilos del cliente
    │   │   │   ├── PortalArquitecto/    # Vistas, scripts y estilos del arquitecto
    │   │   │   ├── PortalConstructora/  # Vistas, scripts y estilos de constructora
    │   │   │   └── PanelAdmin/          # Vistas y scripts; estilos propios embebidos
    │   │   └── Controlador/
    │   │       ├── HTTP/           # Manejo de errores y utilidades HTTP
    │   │       ├── PortalCliente/  # Rutas y controladores de cliente
    │   │       ├── PortalArquitecto/
    │   │       ├── PortalConstructora/
    │   │       └── PanelAdmin/     # Rutas, controladores y middleware de administración
    │   ├── scripts/                # Seeds, exportación, MongoDB y herramientas
    │   ├── src/
    │   │   ├── app.js              # Composición de Express, CORS y API
    │   │   └── server.js           # Conexión a MongoDB e inicio del servidor
    │   ├── test/                   # Pruebas de arquitectura, interfaz e integración
    │   ├── .env.example            # Plantilla de configuración local
    │   ├── package.json
    │   └── package-lock.json
    ├── index.html                 # Entrada del workspace para la interfaz
    └── tailwind.config.cjs
```

La dependencia principal sigue este sentido:

```text
Vista → Controlador → Modelo/Aplicacion → Dominio
                                  └──────→ Persistencia → MongoDB
```

Los controladores HTTP validan el acceso y delegan operaciones en servicios de Aplicación. Estos coordinan las reglas de Dominio y los repositorios de Persistencia. La Vista no accede directamente al Modelo. `Nucleo` comparte configuración, utilidades y la entrada común de autenticación.

La carpeta `assets/` está fuera de `Backend` y se sirve desde la raíz de `ViModV4`. Las imágenes originales y la herramienta para prepararlas están en `ViModV4/Backend/imagenes vimod` y `ViModV4/Backend/scripts/preparar-imagenes.py`, respectivamente.

## Flujo de uso

1. **Registro e inicio de sesión:** el usuario crea una cuenta desde la página común. El cliente puede usar las funciones de cliente. Arquitectos y constructoras pueden solicitar su rol, que requiere aprobación administrativa. El administrador no puede registrarse públicamente.
2. **Terreno y proyecto:** el cliente registra un terreno y crea un proyecto asociado. Los proyectos en borrador se pueden actualizar; los proyectos con actividad relacionada se archivan en vez de eliminarse.
3. **Análisis y propuestas:** ViMod verifica los datos del proyecto, estima módulos y costos, y determina si las dimensiones permiten distribuirlos en una cuadrícula rectangular. El cliente revisa y selecciona una propuesta.
4. **Revisión profesional:** el cliente solicita una revisión y puede seguir su asignación, observaciones y entrega. El arquitecto gestiona la revisión desde su portal.
5. **Cotización u oferta:** el cliente consulta servicios de constructoras, solicita cotizaciones o revisa ofertas asociadas al proyecto. Una respuesta aceptada puede usarse para crear un pedido.
6. **Pedido y pago:** se crea un pedido persistente con un importe calculado en el servidor. El cliente puede pagar mediante el simulador académico o, si está configurado, Stripe Checkout de prueba.
7. **Administración:** un administrador autorizado gestiona solicitudes de roles, usuarios, revisiones y consultas operativas desde el panel.

## Requisitos e inicio local

### Requisitos

- Node.js y npm, en versiones compatibles con las dependencias de `ViModV4/Backend/package.json`.
- Una instancia local o accesible de MongoDB.
- Visual Studio Code y la extensión **Live Server** para servir el frontend.
- Python y pip únicamente si se va a ejecutar la preparación opcional de imágenes.
- `mongosh` únicamente para administrar o verificar roles de MongoDB.

La configuración de ejemplo apunta a MongoDB en `127.0.0.1:27021`, backend en el puerto `3000` y frontend en `localhost:5500`. Asegúrate de que esos puertos estén libres o actualiza las variables correspondientes.

### 1. Instalar dependencias y crear la configuración local

Desde PowerShell, en la raíz del repositorio:

```powershell
Set-Location .\ViModV4\Backend
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edita `ViModV4/Backend/.env` localmente. Como mínimo, cambia `JWT_SECRET` por un secreto privado y verifica `MONGODB_URI`, `MONGODB_DATABASE` y los orígenes del frontend. No compartas ni subas `.env`.

### 2. Iniciar MongoDB

Inicia MongoDB según tu instalación y confirma que está escuchando en el host y puerto configurados en `MONGODB_URI`. La cuenta de MongoDB no es lo mismo que una cuenta de usuario de ViMod.

### 3. Iniciar el backend

Desde `ViModV4/Backend`:

```powershell
npm.cmd start
```

El servidor se inicia en `http://localhost:3000`. Para comprobar que la API responde, abre `http://localhost:3000/api/health`. Deja esta terminal abierta mientras uses la aplicación.

### 4. Iniciar y abrir el frontend

Abre otra terminal en la raíz del repositorio y ejecuta el lanzador incluido:

```powershell
Set-Location .\ViModV4
node .vscode\start-live-server.js
```

El lanzador requiere que la extensión Live Server esté instalada en VS Code, sirve `ViModV4` como raíz, usa el puerto `5500` y abre la pantalla de inicio de sesión. También configura el alias de las antiguas rutas públicas `Backend/Paquetes/Presentacion` hacia los archivos actuales de `Backend/Paquetes/Vista`.

La dirección de inicio de sesión es:

```text
http://localhost:5500/Backend/Nucleo/Frontend/Vistas/2.%20Inicio%20de%20sesion.html
```

También se puede abrir `ViModV4` como carpeta del workspace en VS Code e iniciar Live Server desde la página de inicio de sesión. Asegúrate de servir la raíz `ViModV4`, no `Backend` ni `assets`.

Las páginas cargan Tailwind CSS y fuentes e iconos desde servicios CDN; se requiere conexión a internet para esos recursos visuales. La API y MongoDB se ejecutan localmente según la configuración anterior.

### 5. Ejecutar verificaciones

Con MongoDB disponible, desde `ViModV4/Backend`:

```powershell
npm.cmd run check
npm.cmd test
```

`check` valida la sintaxis de JavaScript. `test` ejecuta pruebas unitarias, de arquitectura, enlaces locales e integración; las pruebas de integración necesitan MongoDB accesible en `MONGODB_URI` y trabajan con bases temporales de prueba.

## Configuración del entorno

La plantilla está en `ViModV4/Backend/.env.example`. El backend carga la configuración mediante `dotenv`; el archivo real `.env` debe permanecer local.

| Variable | Uso |
| --- | --- |
| `NODE_ENV` | Entorno de ejecución; por defecto, `development`. |
| `PORT` | Puerto de Express; por defecto, `3000`. |
| `MONGODB_URI` | Dirección de MongoDB; ejemplo: `mongodb://127.0.0.1:27021`. |
| `MONGODB_DATABASE` | Base de datos de la aplicación; por defecto, `vimod`. |
| `MONGODB_USER`, `MONGODB_PASSWORD` | Credenciales opcionales de MongoDB. Deben configurarse juntas si la instancia exige autenticación. |
| `MONGODB_AUTH_SOURCE` | Base de autenticación de MongoDB; por defecto, `admin`. |
| `JWT_SECRET` | Secreto requerido para firmar tokens. Sustituye el valor de ejemplo antes de usar la aplicación. |
| `JWT_EXPIRES_IN` | Vigencia del token; por defecto, `2h`. |
| `CLIENT_ORIGIN` | Origen u orígenes permitidos por CORS; por defecto, `http://localhost:5500`. |
| `FRONTEND_URL` | Origen usado para construir las URLs de retorno de pago; por defecto, `http://localhost:5500`. |
| `PAYMENT_PROVIDER` | Proveedor de pagos. Para Stripe, usa `stripe`. |
| `STRIPE_SECRET_KEY` | Clave secreta **de prueba** de Stripe; debe comenzar por `sk_test_`. |
| `COP_PER_USD` | Tasa positiva de COP por USD necesaria para convertir pagos a Stripe. |
| `ROLE_ASSIGNMENTS` | Asignaciones confiables `ObjectId=rol`, separadas por `;`, para casos administrados en el servidor. |
| `ADMIN_PASSWORD` | Variable opcional, no incluida en `.env.example`, para provisionar/actualizar el administrador al iniciar el backend. |

El nombre administrativo configurado en la aplicación es `RoyeryAngel`. Si `ADMIN_PASSWORD` no está configurada, el backend no provisiona automáticamente la cuenta. Nunca guardes contraseñas en el código, en el frontend, en comandos registrados ni en el repositorio.

## Roles y permisos

### Roles de ViMod

- **Cliente:** rol disponible al registrarse; administra sus terrenos, proyectos, revisiones, cotizaciones, pedidos y pagos.
- **Arquitecto:** puede solicitar el rol durante el registro. La cuenta profesional queda pendiente hasta que administración la apruebe.
- **Constructora:** puede solicitar el rol durante el registro. La cuenta queda pendiente hasta aprobación y luego administra perfil, servicios, cotizaciones y ofertas propios.
- **Administrador:** no se asigna mediante registro público. El servidor aprovisiona la cuenta configurada y las rutas administrativas verifican autenticación y rol efectivo.

El backend vuelve a cargar la identidad desde MongoDB para proteger rutas privadas. Una interfaz o un rol indicado por el navegador no concede permisos. Las rutas administrativas tampoco permiten deshabilitar la cuenta de administrador.

### Usuarios y roles de MongoDB

El sistema de roles de MongoDB es independiente de los roles de ViMod. Los scripts de administración contemplan:

| Usuario | Acceso previsto |
| --- | --- |
| `vimod_app` | Lectura y escritura de la base `vimod`, para la aplicación. |
| `vimod_analista` | Lectura de datos de `vimod`. |
| `vimod_catalogo` | Lectura, inserción y actualización de las colecciones `services` y `proposalModels`. |
| `vimod_root` | Administración de MongoDB; resérvalo para tareas administrativas. |
| `vimod_test` | Usuario opcional de desarrollo y pruebas, con permisos amplios; no lo uses como cuenta del backend. |

Crear usuarios no habilita por sí solo la autorización de MongoDB. Antes de activar `--auth`, respalda la base, crea las cuentas, comprueba los permisos y configura las credenciales de la aplicación. El script de verificación realiza escrituras temporales controladas para probar permisos y las limpia al terminar.

## Pagos

### Simulador académico

Si Stripe no está configurado, ViMod permite simular el pago de un pedido en COP. Los métodos disponibles son `test_card`, `simulated_transfer` y `test_balance`; los resultados posibles incluyen aprobado, rechazado, cancelado o pendiente. El simulador no cobra, no guarda números de tarjeta ni acepta CVV o credenciales financieras reales.

### Stripe Checkout en modo de prueba

Para habilitarlo, configura:

```text
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
COP_PER_USD=4000
FRONTEND_URL=http://localhost:5500
```

Usa una clave de prueba de Stripe; el backend rechaza claves live. El importe procede del pedido guardado en el servidor, se expresa originalmente en COP y se convierte a centavos USD usando `COP_PER_USD`. La confirmación consulta la sesión de Stripe y verifica sus metadatos antes de actualizar el pedido. La cancelación también requiere la identidad del cliente. No se aceptan confirmaciones de pago basadas únicamente en datos enviados por el navegador.

Stripe no es necesario para ejecutar la aplicación o las pruebas; estas últimas usan un cliente de Stripe simulado y no cobran.

## API

La API JSON se sirve bajo `/api`. Las rutas protegidas requieren el token de autenticación y el rol autorizado.

| Grupo | Rutas principales | Función |
| --- | --- | --- |
| Salud | `GET /api/health` | Comprueba el estado del servicio y la base de datos. |
| Autenticación | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | Registro, inicio de sesión y consulta de la sesión. |
| Terrenos | `/api/terrains` | Crear, listar, consultar y eliminar terrenos propios según las reglas de proyectos activos. |
| Proyectos | `/api/projects` | Crear, listar, consultar, actualizar, archivar, cerrar, analizar y generar o consultar propuestas. |
| Catálogo público | `GET /api/services`, `/api/contractors` | Consultar servicios publicados y perfiles de constructoras. |
| Cliente | `/api/projects/:id/reviews`, `/quotes`, `/offers`, `/orders`, `/api/payments` | Revisiones, cotizaciones, ofertas, pedidos e historial de pagos. |
| Arquitecto | `/api/architect/*`, `/api/reviews/*` | Perfil, revisiones asignadas, observaciones y entregas. |
| Constructora | `/api/contractor/*` | Perfil, servicios propios, cotizaciones y ofertas. |
| Administración | `/api/admin/*` | Gestión administrativa protegida y auditoría. |

Las rutas de consulta y modificación validan la propiedad del recurso. Para crear pedidos se utiliza una clave `Idempotency-Key`, evitando duplicados si se reintenta una solicitud.

## Datos y reglas de negocio

- MongoDB guarda usuarios, terrenos, proyectos, análisis, propuestas, revisiones, servicios, cotizaciones, ofertas, pedidos, pagos y auditoría administrativa en colecciones separadas.
- Las operaciones de un cliente se limitan a recursos de su propiedad; arquitectos, constructoras y administradores tienen permisos distintos.
- Un proyecto que ya tiene actividad relacionada no se elimina como borrador; puede archivarse para conservar su historial.
- Al cambiar datos de un borrador, el análisis anterior se considera desactualizado. Una propuesta seleccionada o actividad posterior limita la edición.
- El catálogo académico modela módulos de huella estándar de **6 × 4 m**. El análisis organiza módulos en cuadrículas rectangulares y contempla rotar su orientación; no genera distribuciones en L ni dúplex.
- Las capacidades y valores monetarios de los módulos son supuestos académicos configurados en `Backend/Paquetes/Modelo/Dominio/ModeloPropuestas/modular-catalog.js`. Las estimaciones en COP no sustituyen un estudio de suelo, un diseño profesional ni una cotización comercial.

## Scripts disponibles

Ejecuta estos comandos desde `ViModV4/Backend`, a menos que se indique lo contrario.

| Script | Uso |
| --- | --- |
| `npm run seed:propuestas` | Aplica el seed de propuestas (`scripts/seed-propuestas.js --apply`). Requiere `DEMO_MONGODB_DATABASE` (o `MONGODB_DATABASE`) y `DEMO_SEED_PASSWORD` de al menos 12 caracteres. Aplicarlo sobre `vimod` requiere además `DEMO_SEED_CONFIRM=YES`, después de revisar el dry-run. |
| `npm run seed:propuestas:undo` | Revierte los datos del seed de propuestas en la base configurada. |
| `node scripts/seed-demo-constructoras.js` | Carga constructoras demo. Requiere `DEMO_MONGODB_DATABASE` con prefijo `vimod_demo_` o `vimod_stage` y `DEMO_SEED_PASSWORD`. `--remove` retira los datos creados por el seed. |
| `node scripts/seed-demo-platform.js` | Carga arquitectos, cliente y proyectos demo en una base aislada con los mismos requisitos. `--remove` retira los datos propios del seed. |
| `node scripts/export-db.js` | Exporta las colecciones a `Backend/export/<base>-export.json`; omite hashes de contraseña y tokens. |
| `scripts/mongodb-roles.js` | Crea o actualiza usuarios y roles; requiere `mongosh` y variables `VIMOD_ROOT_PWD`, `VIMOD_APP_PWD`, `VIMOD_ANALISTA_PWD` y `VIMOD_CATALOGO_PWD`. `VIMOD_TEST_PWD` es opcional. |
| `scripts/mongodb-roles-verify.js` | Comprueba privilegios de MongoDB con las credenciales configuradas. |
| `scripts/mongodb-roles.ps1 -Accion Crear` | En Windows, solicita las contraseñas de forma oculta y ejecuta `mongodb-roles.js`. |
| `scripts/mongodb-roles.ps1 -Accion Verificar` | En Windows, solicita las contraseñas de forma oculta y ejecuta `mongodb-roles-verify.js`. |
| `python scripts/preparar-imagenes.py --inventory-only` | Lista y clasifica las imágenes originales sin generar ni sustituir archivos. |
| `python scripts/preparar-imagenes.py` | Prepara imágenes locales en `ViModV4/assets/img`. Instala primero Pillow con `python -m pip install -r requirements-dev.txt`. |

Los seeds demo de constructoras y plataforma rechazan la base habitual `vimod`: configúralos solo con una base aislada. No ejecutes operaciones de seed, exportación o roles contra datos importantes sin revisar antes la base de destino.

## Verificaciones y solución de problemas

### Pruebas

```powershell
Set-Location .\ViModV4\Backend
npm.cmd run check
npm.cmd test
```

Si las pruebas de integración muestran `ECONNREFUSED`, confirma que MongoDB está activo en `MONGODB_URI`. No desactives las pruebas de integración: verifica que usan la instancia de desarrollo prevista y que la cuenta de MongoDB tiene acceso a crear y eliminar sus bases de prueba aisladas.

### Problemas habituales

- **La API no inicia:** comprueba que MongoDB responde, que `JWT_SECRET` está definido y que el puerto de `PORT` está libre. Revisa el error de inicio en la terminal del backend.
- **La página no encuentra recursos:** inicia Live Server desde la raíz `ViModV4`, no desde `Backend` ni desde `assets`; verifica que usa el puerto `5500`.
- **Errores CORS:** el origen de Live Server debe coincidir con `CLIENT_ORIGIN`. En desarrollo, los valores predeterminados admiten `localhost:5500` y `127.0.0.1:5500`.
- **Stripe no inicia el checkout:** configura una clave `sk_test_`, `PAYMENT_PROVIDER=stripe`, un `COP_PER_USD` positivo y el origen correcto en `FRONTEND_URL`. Sin esa configuración se usa el simulador.
- **No se puede entrar al panel profesional:** las solicitudes de arquitecto y constructora deben aprobarse desde una cuenta administrativa antes de acceder a rutas profesionales.
- **El puerto 5500 está ocupado:** detén el otro servidor Live Server o cambia el puerto de forma consistente con `CLIENT_ORIGIN` y `FRONTEND_URL`.

## Documentación del proyecto

Este README es la guía principal del repositorio. La arquitectura y los flujos funcionales se describen aquí; los detalles implementados se encuentran en `ViModV4/Backend/Paquetes`, la configuración en `ViModV4/Backend/Nucleo` y las pruebas en `ViModV4/Backend/test`.
