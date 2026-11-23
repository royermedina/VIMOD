const requiredPasswords = {
  VIMOD_ROOT_PWD: process.env.VIMOD_ROOT_PWD,
  VIMOD_APP_PWD: process.env.VIMOD_APP_PWD,
  VIMOD_ANALISTA_PWD: process.env.VIMOD_ANALISTA_PWD,
  VIMOD_CATALOGO_PWD: process.env.VIMOD_CATALOGO_PWD,
};

const missingPasswords = Object.entries(requiredPasswords)
  .filter(([, password]) => !password)
  .map(([name]) => name);

if (missingPasswords.length > 0) {
  throw new Error(`Define las variables requeridas: ${missingPasswords.join(', ')}`);
}

const adminDb = db.getSiblingDB('admin');
const vimodDatabase = 'vimod';

function ensureRole(roleName, privileges) {
  const existingRole = adminDb.getRole(roleName, { showPrivileges: true });
  const definition = { privileges, roles: [] };

  if (existingRole) {
    adminDb.updateRole(roleName, definition);
  } else {
    adminDb.createRole({ role: roleName, ...definition });
  }
}

function ensureUser(username, password, roles) {
  const existingUser = adminDb.getUser(username);

  if (existingUser) {
    adminDb.updateUser(username, { pwd: password, roles });
  } else {
    adminDb.createUser({ user: username, pwd: password, roles });
  }
}

ensureUser('vimod_root', requiredPasswords.VIMOD_ROOT_PWD, [{ role: 'root', db: 'admin' }]);

ensureRole('vimodAnalistaRead', [{
  resource: { db: vimodDatabase, collection: '' },
actions: ['find'],}]);

ensureRole('vimodCatalogoEditor', ['services', 'proposalModels'].map((collection) => ({
  resource: { db: vimodDatabase, collection },
  actions: ['find', 'insert', 'update'],
})));

ensureUser('vimod_app', requiredPasswords.VIMOD_APP_PWD, [{ role: 'readWrite', db: vimodDatabase }]);
ensureUser('vimod_analista', requiredPasswords.VIMOD_ANALISTA_PWD, [{ role: 'vimodAnalistaRead', db: 'admin' }]);
ensureUser('vimod_catalogo', requiredPasswords.VIMOD_CATALOGO_PWD, [{ role: 'vimodCatalogoEditor', db: 'admin' }]);

if (process.env.VIMOD_TEST_PWD) {
  ensureUser('vimod_test', process.env.VIMOD_TEST_PWD, [
    { role: 'readWriteAnyDatabase', db: 'admin' },
    { role: 'dbAdminAnyDatabase', db: 'admin' },
  ]);
}

print('Roles y usuarios MongoDB de ViMod creados o actualizados.');
if (!process.env.VIMOD_TEST_PWD) {
  print('vimod_test no se modificó: VIMOD_TEST_PWD no está definida.');
}
