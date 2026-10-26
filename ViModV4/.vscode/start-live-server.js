const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workspaceDirectory = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const extensionsDirectory = path.join(os.homedir(), ".vscode", "extensions");

function versionParts(value) {
  return value.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function findLiveServerModule() {
  if (!fs.existsSync(extensionsDirectory)) {
    throw new Error(`No existe el directorio de extensiones: ${extensionsDirectory}`);
  }
  const candidates = fs.readdirSync(extensionsDirectory)
    .filter((name) => name.startsWith("ritwickdey.liveserver-"))
    .map((name) => {
      const extensionPath = path.join(extensionsDirectory, name);
      const manifestPath = path.join(extensionPath, "package.json");
      if (!fs.existsSync(manifestPath)) return null;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const modulePath = path.join(extensionPath, "node_modules", "live-server");
      return manifest.name === "LiveServer" && fs.existsSync(modulePath)
        ? { version: manifest.version, modulePath }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => compareVersions(right.version, left.version));

  if (!candidates.length) {
    throw new Error("Instala la extensión ritwickdey.LiveServer para iniciar el frontend.");
  }
  return candidates[0].modulePath;
}
const liveServer = require(findLiveServerModule());
const entryUrl = "/Backend/Nucleo/Frontend/Vistas/2.%20Inicio%20de%20sesion.html";
const server = liveServer.start({
  root: workspaceDirectory,
  host: "localhost",
  port: 5500,
  open: entryUrl,
  logLevel: 1,
  wait: 100,
});

server.once("listening", () => {
  console.log(`VI[LiveServer] READY http://localhost:5500${entryUrl}`);
});

server.once("error", (error) => {
  console.error(`Live Server no pudo iniciar: ${error.message}`);
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);