const app = require('./app');
const env = require('./config/env');
const { AccesoDatos: database } = require('../Paquetes/Persistencia');
const { AdminService } = require('../Paquetes/Aplicacion/Administracion');

async function start() {
  await database.connect({
    mongodbUri: env.mongodbUri,
    mongodbDatabase: env.mongodbDatabase,
  });
  await new AdminService().provisionConfiguredAdmin();
  const server = app.listen(env.port, () => {
    console.log(`ViMod backend escuchando en http://localhost:${env.port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Señal ${signal} recibida; cerrando ViMod backend.`);
    server.close(async (error) => {
      try {
        await database.close();
      } catch (closeError) {
        console.error('Error al cerrar MongoDB:', closeError.message);
        process.exitCode = 1;
      }
      if (error) {
        console.error('Error al cerrar Express:', error.message);
        process.exitCode = 1;
      }
    });
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

start().catch(async (error) => {
  console.error('No fue posible iniciar ViMod backend:', error.message);
  await database.close().catch(() => {});
  process.exitCode = 1;
});
