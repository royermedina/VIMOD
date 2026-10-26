# ViMod Backend

Para probar el frontend localmente, sirve la raíz del espacio de trabajo con Live Server en el puerto 5500 y abre la página compartida de inicio de sesión: `[http://localhost:5500/Backend/Nucleo/Frontend/Vistas/2.%20Inicio%20de%20sesion.html](http://localhost:5500/Backend/Nucleo/Frontend/Vistas/2.%20Inicio%20de%20sesion.html)`. `FRONTEND_URL` debe contener únicamente el origen (`[http://localhost:5500](http://localhost:5500)`).

## Cuentas y administración

El registro público admite los roles `cliente`, `arquitecto` y `constructora`. El tipo seleccionado se almacena en MongoDB como `rol`, `requestedRole` y `accountType`. En el caso de arquitectos y constructoras, la cuenta permanece en estado `pendiente`, por lo que el servidor resuelve su rol efectivo como `cliente` y deniega el acceso a las rutas profesionales hasta que un administrador la apruebe. El rol `admin` nunca se acepta como rol público. Las rutas privadas siempre autentican el JWT y determinan el rol efectivo a partir del documento del usuario en MongoDB o de la configuración confiable del servidor.

### Inicio de sesión administrativo

El nombre de usuario administrativo es `RoyeryAngel`. El backend crea esta cuenta al iniciarse cuando `ADMIN_PASSWORD` está presente en el entorno de su proceso. En MongoDB únicamente se almacena un hash bcrypt; cuando la cuenta configurada ya existe como administrador activo, el inicio actualiza su hash para que coincida con la contraseña configurada, sin crear una cuenta duplicada. No agregues una contraseña real a `.env`, al control de versiones, a los archivos del frontend, a los argumentos de la línea de comandos ni a los registros de ejecución. Para uso local, introduce la contraseña mediante un indicador oculto de PowerShell, almacénala en el entorno del proceso del backend e inicia el servidor en esa misma terminal:

```powershell
$secure = Read-Host "Introduce la contraseña administrativa" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
Set-Location "C:\Users\Royer Medina\Desktop\ViModV4\Backend"
node src\server.js
```

La cuenta se crea de manera idempotente por el backend; no se utiliza ninguna página de configuración, secreto de un solo uso ni endpoint de configuración inicial. Si el nombre de usuario configurado ya pertenece a una cuenta que no es administradora, el inicio falla en lugar de elevar sus privilegios. Para eliminar el secreto del proceso después de apagar el servidor, ejecuta:

```powershell
Remove-Variable secure
$env:ADMIN_PASSWORD = $null
```

Sirve el proyecto mediante la configuración existente del frontend y abre `Backend/Paquetes/Presentacion/PanelAdmin/Vistas/14. Acceso administrativo.html` (por ejemplo, `[http://localhost:5500/Backend/Paquetes/Presentacion/PanelAdmin/Vistas/14.%20Acceso%20administrativo.html](http://localhost:5500/Backend/Paquetes/Presentacion/PanelAdmin/Vistas/14.%20Acceso%20administrativo.html)`). Introduce el nombre de usuario `RoyeryAngel` y la contraseña configurada. El formulario utiliza el endpoint compartido `POST /api/auth/login`; el frontend solo redirige si la respuesta indica `rol: admin`. El middleware del backend vuelve a cargar de forma independiente al usuario desde MongoDB para `/api/admin/*`, y las visitas directas a la consola validan `/api/auth/me` antes de mostrar la página. Las credenciales habituales de clientes, arquitectos y constructoras no permiten acceder a las rutas administrativas.

Los administradores no pueden deshabilitarse mediante el endpoint de estado de usuario, lo que protege la cuenta administrativa. Se han eliminado el antiguo endpoint `POST /api/auth/admin/setup` y el flujo de configuración inicial mediante `ADMIN_SECRET`.

Los endpoints `GET /api/admin/overview`, `/users`, `/role-requests`, `/projects`, `/orders`, `/reviews`, `/services`, `/quotes`, `/payments` y `/audit` son exclusivos para administradores. Las aprobaciones y los rechazos, la asignación de revisiones y los cambios de estado de las cuentas se registran en `adminAudit`. Las respuestas de las listas de usuarios omiten los hashes de contraseñas y los tokens.

## Gestión de proyectos del cliente

- `PATCH /api/projects/:id` actualiza un proyecto en borrador del cliente después de validar su nombre, un terreno perteneciente al propietario, un presupuesto positivo en COP, entre 1 y 6 habitaciones enteras y entre 1 y 6 baños enteros. Los cambios en los datos de entrada marcan como desactualizado el análisis guardado hasta que se realice un nuevo análisis. La selección de propuestas y la existencia de actividad de revisión, cotización o pedido impiden la edición.
- `DELETE /api/projects/:id` elimina únicamente un proyecto en borrador que no tenga análisis, propuesta, revisión, observación, cotización o pedido asociado. De lo contrario, devuelve `409`, y el cliente puede utilizar `PATCH /api/projects/:id/archive` para conservar el proyecto y sus registros relacionados.
- `DELETE /api/terrains/:id` elimina un terreno perteneciente al propietario únicamente cuando no tiene proyectos activos. Los proyectos cerrados y archivados no impiden la eliminación; los nombres de los proyectos activos se devuelven junto con el código `409`.
- La cantidad de baños se representa mediante valores numéricos en el documento del proyecto y en la respuesta de la API; por ejemplo, `2` sigue siendo `2` desde el formulario del cliente hasta MongoDB y las consultas de proyectos.

### Asignaciones confiables de roles heredados

Para las cuentas autorizadas fuera del flujo de aprobación, un administrador obtiene el `_id` del usuario en MongoDB y configura una entrada exclusiva del servidor en `ROLE_ASSIGNMENTS`:

```text
ROLE_ASSIGNMENTS=<existing-user-object-id>=arquitecto;<another-user-object-id>=constructora
```

Cada ID debe identificar un documento existente en `vimod.users`. Los roles admitidos son `arquitecto`, `constructora` y `admin`. El servidor aplica las asignaciones después de autenticar el JWT y cargar al usuario desde MongoDB. Este proceso no modifica los documentos de los usuarios. Reinicia el backend después de cambiar una asignación. Nunca expongas al navegador los valores de las variables de entorno administrativas.

Para consultar el ID de una cuenta existente mediante una consola de MongoDB autorizada:

```javascript
use vimod
db.users.find({ correo: "person@example.com" }, { _id: 1, nombre: 1, correo: 1, rol: 1 })
```

## Verificaciones

Ejecuta la comprobación estática con `npm.cmd run check`. Ejecuta las pruebas de integración con `npm.cmd test` mientras el servidor dedicado de MongoDB esté disponible en `127.0.0.1:27021`. Las pruebas utilizan una base de datos con un nombre único que sigue el patrón `vimod_stage1_test_*` y eliminan únicamente esa base de datos después de la ejecución; no utilizan ni vacían `vimod`.

Las pruebas de la etapa 2 también utilizan una base de datos con un nombre único que sigue el patrón `vimod_stage2_test_*` y eliminan únicamente esa base de datos de pruebas al finalizar.

Las pruebas de la etapa 3 utilizan una base de datos con un nombre único que sigue el patrón `vimod_stage3_test_*`. Comprueban CORS, los roles de las cuentas públicas, la creación y autenticación del administrador configurado, las decisiones de aprobación, la autorización y persistencia de HU-08 a HU-12, la idempotencia de las cotizaciones y los pedidos, y el rechazo de confirmaciones de pago no verificadas. Solo eliminan su base de datos de pruebas aislada.

Las pruebas de Stripe de la etapa 5 utilizan una base de datos con un nombre único que sigue el patrón `vimod_stage5_stripe_test_*` y un cliente de Stripe simulado. No realizan llamadas a Stripe ni utilizan la base de datos `vimod`.

## Flujos de trabajo persistentes del proyecto y preparación de pagos

- `POST /api/projects/:id/select-proposal` y `GET /api/projects/:id/selected-proposal` guardan y recuperan una selección validada por propietario en el documento del proyecto de MongoDB.
- `POST /api/projects/:id/reviews`, `GET /api/projects/:id/reviews`, `GET /api/architect/reviews` y `POST /api/reviews/:id/observations` implementan revisiones asignadas con prevención de duplicados y autorización basada en el propietario y el arquitecto. Los administradores pueden asignar revisiones mediante `PATCH /api/admin/reviews/:id/assign`.
- `GET /api/services` devuelve los servicios publicados que están activos. Las constructoras autorizadas gestionan sus propios registros mediante `/api/contractor/services`.
- Los clientes crean y consultan cotizaciones en `/api/projects/:id/quotes`; las constructoras las consultan y responden mediante `/api/contractor/quotes`.
- Los pedidos utilizan una propuesta seleccionada del proyecto o una cotización respondida por una constructora. Se almacenan por separado del estado del pago y requieren una clave `Idempotency-Key`. `POST /api/orders/:id/payment-session` crea la sesión de pago configurada utilizando el importe guardado del pedido. `GET /api/payments` devuelve el historial del cliente autenticado. Las confirmaciones de pago enviadas por el cliente mediante la antigua ruta `/confirm` siguen siendo rechazadas.

## Proceso de pago y simulación interna de pagos

El simulador de pagos académico interno sigue disponible como alternativa. Muestra el pedido, el importe en COP, el método simulado, el resultado seleccionado y una advertencia clara de que no se realiza ningún cobro. Los intentos se almacenan en la colección compartida `payments` con `simulated: true`.

Configura `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` con una clave de prueba que comience por `sk_test_`, `COP_PER_USD` con una tasa de cambio positiva de COP por USD y `FRONTEND_URL` con el origen del frontend (por ejemplo, `[http://localhost:5500](http://localhost:5500)`) para utilizar Stripe Checkout. Si Stripe no está seleccionado o falta su clave, ViMod utiliza el simulador interno. Las claves de producción se rechazan. Nunca expongas ni registres la clave secreta en los logs.

El backend convierte el importe total almacenado en COP a centavos de USD mediante `round(amountCOP / COP_PER_USD * 100)`; no se utiliza ningún importe enviado desde el navegador. Los registros de pagos de Stripe permanecen en `payments` e incluyen el ID de la sesión, los importes en COP y USD, la tasa de cambio, el proveedor y el estado. `POST /api/payments/stripe/confirm` recupera y verifica la sesión de Stripe y sus metadatos antes de marcar un pedido como pagado. `POST /api/orders/:id/payment-cancel` registra una cancelación autenticada del proceso de pago. Tarjetas de prueba: `4242 4242 4242 4242` se aprueba y `4000 0000 0000 0002` se rechaza. Nunca utilices datos de tarjetas reales en el modo de prueba.

Cuando Stripe no está configurado, los métodos admitidos por el simulador son `test_card`, `simulated_transfer` y `test_balance`; los resultados posibles son `approved`, `declined`, `cancelled` y `pending`. El simulador no acepta ni almacena números de tarjetas, códigos CVV ni credenciales financieras reales.

## Análisis preliminar y catálogo académico de propuestas

Los endpoints de proyectos proporcionan:

- `POST /api/projects/:id/analyze` y `GET /api/projects/:id/analysis`.
- `POST /api/projects/:id/proposals` y `GET /api/projects/:id/proposals`.
- `POST /api/projects/:id/proposals/regenerate` para recalcular explícitamente la misma generación determinista.
- `GET /api/projects/:id/proposals/:proposalId` para consultar una propuesta y su estimación almacenada, validando la propiedad del proyecto.

Todos están protegidos mediante JWT, usuario cargado y rol `cliente`; además, el servicio consulta el proyecto y su terreno utilizando el ObjectId del propietario autenticado. El análisis se almacena en `projectAnalyses`. Las propuestas se almacenan en `proposals`; cada propuesta incorpora la estimación y sus parámetros, lo que evita una segunda escritura que podría generar inconsistencias en el despliegue de MongoDB independiente.

Las suposiciones académicas iniciales están centralizadas en `src/config/modular-catalog.js`: los módulos tienen una huella uniforme de 6 × 4 m (24 m²), se requiere un módulo común, cada módulo de habitaciones admite hasta 2 habitaciones y cada módulo de núcleo húmedo admite hasta 2 baños. Los costos indicativos en COP son de 45.000.000 por módulo común, 58.000.000 por módulo de habitaciones y 72.000.000 por módulo de núcleo húmedo (aproximadamente entre 1,9 y 3,0 millones de COP por m²). Estos valores son supuestos académicos, no cotizaciones de mercado. Las estimaciones de consumo energético anual son de 900, 450 y 300 kWh/año, respectivamente. El tiempo de ejecución se calcula como 10 días de preparación más 4 días secuenciales por módulo. Estos valores son estimaciones para trabajos académicos, no estudios profesionales del suelo ni cotizaciones comerciales garantizadas.

La propuesta contiene los módulos necesarios según la capacidad requerida de habitaciones y baños. La distribución solo se acepta si las filas y columnas de módulos de 6 × 4 m, incluida la orientación rotada, caben dentro de las dimensiones del terreno introducidas. El catálogo solo modela cuadrículas rectangulares de módulos; actualmente no admite tipologías con nombres específicos, como distribuciones en forma de L o dúplex. Si se repite la generación con datos de entrada sin cambios, se actualizan o insertan registros mediante el proyecto, la huella digital de los datos de entrada y el código de opción, sin crear duplicados. Un cambio en la versión del catálogo recalcula las propuestas utilizando los nuevos supuestos de costos en COP. Los importes almacenados anteriormente no se convierten.

## Cuentas de demostración de constructoras

La carga inicial crea seis cuentas de constructoras aprobadas y sus servicios y materiales de ejemplo. Cada registro se marca con `demo: true` y la operación es idempotente. Ejecuta estos comandos desde `Backend`; proporciona una contraseña de al menos ocho caracteres mediante el indicador oculto. La contraseña se codifica mediante el mismo costo bcrypt utilizado durante el registro y nunca se almacena en archivos de código fuente:

```powershell
$env:DEMO_MONGODB_DATABASE = "vimod_demo_20261025"
$secure = Read-Host "Contraseña común para las constructoras demo" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:DEMO_SEED_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  node scripts\seed-demo-constructoras.js
  if ($LASTEXITCODE -ne 0) { throw "Falló la carga de constructoras demo." }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable secure
  $env:DEMO_SEED_PASSWORD = $null
  $env:DEMO_MONGODB_DATABASE = $null
}
```

Para eliminar únicamente las cuentas y publicaciones creadas por este script, configura el mismo valor de `DEMO_MONGODB_DATABASE` y ejecuta `node scripts\seed-demo-constructoras.js --remove` desde `Backend`. No elimina registros que no estén marcados como datos de demostración creados por esta carga inicial.

## Arquitectos de demostración y proyectos de clientes

La carga inicial aislada de la plataforma crea cuatro perfiles de arquitectos aprobados, una cuenta de cliente y cuatro proyectos en borrador con sus terrenos asociados. Utiliza un marcador de origen independiente (`vimod-demo-platform-v1`) y es idempotente. El script requiere un nombre de base de datos explícito que comience por `vimod_demo_` o `vimod_stage`; se niega a ejecutarse contra `vimod`.

Desde `Backend`, configura una contraseña privada y una base de datos aislada antes de ejecutarlo:

```powershell
$env:DEMO_MONGODB_DATABASE = "vimod_demo_20261025"
$secure = Read-Host "Contraseña común para la plataforma demo" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:DEMO_SEED_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  node scripts\seed-demo-platform.js
  if ($LASTEXITCODE -ne 0) { throw "Falló la carga de la plataforma demo." }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable secure
  $env:DEMO_SEED_PASSWORD = $null
  $env:DEMO_MONGODB_DATABASE = $null
}
```

Utiliza la misma configuración de base de datos al iniciar el backend para la demostración. Para eliminar únicamente los datos creados por esta carga inicial, vuelve a configurar `DEMO_MONGODB_DATABASE` y ejecuta `node scripts\seed-demo-platform.js --remove`.
