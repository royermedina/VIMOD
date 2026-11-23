# ViMod V4

La documentación completa, las instrucciones de instalación y ejecución, la estructura del proyecto, los roles, los pagos y los scripts están en el [README principal](../README.md).

Este documento resume cómo ejecutar el proyecto, dónde están los diagramas de arquitectura y dónde se aplica el patrón MVC.

## Arquitectura (MVC)

El patrón **MVC (Modelo - Vista - Controlador)** se aplica en el backend, dentro de la carpeta [`Backend/paquetes/`](Backend/paquetes/). Cada paquete organiza su lógica separando la capa de datos (modelos), la capa de presentación (vistas) y la capa que coordina ambas (controladores).

## Diagramas

Los diagramas de arquitectura están en la carpeta [`Diagramas C4 y Despliegue`](Diagramas%20C4%20y%20Despliegue/). Allí se encuentran:

- El modelo C4 (contexto, contenedores y componentes).
- El diagrama de despliegue.

Las imágenes usadas en la interfaz están en [`assets/img`](assets/img/).

## Cómo ejecutar el proyecto

`index.html` redirige automáticamente a la página de inicio de sesión. Sin embargo, la aplicación completa necesita **MongoDB** y el **backend** en funcionamiento.

### Requisitos

- Node.js y npm
- MongoDB activo
- VS Code (opcional, para usar los comandos de Run and Debug)

### 1. Iniciar el backend

Desde PowerShell, en la carpeta `ViModV4`:

```powershell
cd .\Backend
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd start
```

Asegúrate de tener MongoDB activo y revisa el archivo `Backend\.env`. El backend quedará disponible en:

```text
http://localhost:3000
```

### 2. Iniciar el frontend

Abre otra terminal, en la carpeta `ViModV4`:

```powershell
node .vscode\start-live-server.js
```

Luego abre en el navegador:

```text
http://localhost:5500/
```

El `index.html` te llevará automáticamente a la pantalla de inicio de sesión. También puedes abrir directamente:

```text
http://localhost:5500/Backend/Nucleo/Frontend/Vistas/2.%20Inicio%20de%20sesion.html
```

### Alternativa desde VS Code

En **Run and Debug** ejecuta primero **ViMod Backend (MongoDB)** y después **ViMod Frontend (Live Server)**.

> No se recomienda abrir el HTML mediante `file:///...`, porque algunos módulos y las llamadas a la API no funcionarán correctamente.
