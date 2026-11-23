const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const packageRoot = path.join(backendRoot, 'Paquetes');
const expectedStructure = {
  Modelo: ['Aplicacion', 'Dominio', 'Persistencia'],
  Controlador: ['HTTP', 'PanelAdmin', 'PortalArquitecto', 'PortalCliente', 'PortalConstructora'],
  Vista: ['PanelAdmin', 'PortalArquitecto', 'PortalCliente', 'PortalConstructora'],
};

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : (entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : []);
  });
}

function pathWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function resolveDependency(file, specifier) {
  try {
    return { file: createRequire(file).resolve(specifier) };
  } catch {
    return { error: `${path.relative(packageRoot, file)} -> unresolved require(${specifier})` };
  }
}

function packageLayer(target) {
  if (!pathWithin(packageRoot, target)) return null;
  return path.relative(packageRoot, target).split(path.sep)[0];
}

test('Paquetes has explicit Modelo, Controlador, and Vista module groups', () => {
  const violations = [];
  const actualLayers = fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(actualLayers, Object.keys(expectedStructure).sort());

  for (const [layer, expectedModules] of Object.entries(expectedStructure)) {
    const actualModules = fs.readdirSync(path.join(packageRoot, layer), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    if (JSON.stringify(actualModules) !== JSON.stringify([...expectedModules].sort())) {
      violations.push(`${layer}: expected ${expectedModules.join(', ')}, found ${actualModules.join(', ')}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('MVC imports respect model, view, controller, and repository boundaries', () => {
  const violations = [];
  for (const file of walk(packageRoot)) {
    const sourceLayer = packageLayer(file);
    const sourcePath = path.relative(packageRoot, file);
    const requires = fs.readFileSync(file, 'utf8').matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g);

    for (const match of requires) {
      const dependency = resolveDependency(file, match[1]);
      if (dependency.error) {
        violations.push(dependency.error);
        continue;
      }

      const target = dependency.file;
      const targetLayer = packageLayer(target);
      const isModelCode = sourceLayer === 'Modelo';
      const isViewCode = sourceLayer === 'Vista';
      const isControllerCode = sourceLayer === 'Controlador';
      const isRepository = pathWithin(path.join(packageRoot, 'Modelo', 'Persistencia'), target);
      const isApplicationService = pathWithin(path.join(packageRoot, 'Modelo', 'Aplicacion'), file);
      const isPersistenceCode = pathWithin(path.join(packageRoot, 'Modelo', 'Persistencia'), file);
      const isApplicationModel = pathWithin(path.join(packageRoot, 'Modelo', 'Aplicacion'), target);

      if (isModelCode && ['Controlador', 'Vista'].includes(targetLayer)) {
        violations.push(`${sourcePath} imports ${targetLayer}`);
      }
      if (isViewCode && targetLayer === 'Modelo') {
        violations.push(`${sourcePath} imports Modelo directly`);
      }
      if (isControllerCode && targetLayer === 'Modelo' && !isApplicationModel) {
        violations.push(`${sourcePath} must use Modelo/Aplicacion rather than a lower model layer`);
      }
      if (isControllerCode && isRepository) {
        violations.push(`${sourcePath} imports a repository directly`);
      }
      if (isRepository && !isApplicationService && !isPersistenceCode) {
        violations.push(`${sourcePath} uses persistence outside an application service`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
