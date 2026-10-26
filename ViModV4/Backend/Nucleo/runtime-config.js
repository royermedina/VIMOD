let runtimeConfig;

function configureRuntimeConfig(config) {
  runtimeConfig = config;
}

function getRuntimeConfig() {
  if (!runtimeConfig) {
    throw new Error('La configuración de ejecución de la aplicación no fue inicializada');
  }
  return runtimeConfig;
}

module.exports = { configureRuntimeConfig, getRuntimeConfig };
