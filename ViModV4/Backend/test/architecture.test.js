const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const packageRoot = path.join(backendRoot, 'Paquetes');
const nucleusRoot = path.join(backendRoot, 'Nucleo');
const packageDirectories = {
  Presentacion: ['PortalArquitecto', 'PanelAdmin', 'PortalCliente', 'PortalConstructora'],
  Aplicacion: [
    'PedidosPagos',
    'Cotizaciones',
    'Servicios',
    'Revisiones',
    'Administracion',
    'Autenticacion',
    'Propuestas',
    'Proyectos',
    'Terrenos',
  ],
  Persistencia: ['AccesoDatos', 'Repositorios'],
  Dominio: [
    'ModeloPagos',
    'ModeloComercial',
    'ModeloRevisiones',
    'Usuarios',
    'ModeloPropuestas',
    'ModeloProyectos',
  ],
};
const applicationDomainDependencies = {
  PedidosPagos: ['ModeloPagos'],
  Cotizaciones: ['ModeloComercial'],
  Servicios: ['ModeloComercial'],
  Revisiones: ['ModeloRevisiones'],
  Administracion: ['Usuarios'],
  Autenticacion: ['Usuarios'],
  Propuestas: ['ModeloPropuestas', 'ModeloProyectos'],
  Proyectos: ['ModeloProyectos'],
  Terrenos: ['ModeloProyectos'],
};

// Every cross-module Application dependency is explicit and must target the other module's index.js.
const documentedApplicationExceptions = [
  { from: 'Administracion', to: 'Autenticacion', reason: 'Admin user and role checks reuse the authentication role resolver.' },
  { from: 'Cotizaciones', to: 'Autenticacion', reason: 'Offers and quote requests require approved contractor accounts.' },
  { from: 'Cotizaciones', to: 'Proyectos', reason: 'Offer workflows use the application service that derives contracted-project state.' },
  { from: 'PedidosPagos', to: 'Proyectos', reason: 'The payment workflow reuses owner-scoped project context and authorization.' },
  { from: 'PedidosPagos', to: 'Propuestas', reason: 'Payment orders use the public proposal workflow and COP estimate rule.' },
  { from: 'PedidosPagos', to: 'Revisiones', reason: 'The existing client workflow facade exposes review operations alongside payment operations.' },
  { from: 'PedidosPagos', to: 'Servicios', reason: 'The existing client workflow facade exposes catalog operations alongside payment operations.' },
  { from: 'PedidosPagos', to: 'Cotizaciones', reason: 'The existing client workflow facade exposes quote operations alongside payment operations.' },
  { from: 'Propuestas', to: 'Proyectos', reason: 'Proposal responses and selection enforce the application-derived contracted-project state.' },
  { from: 'Revisiones', to: 'Autenticacion', reason: 'Architect review endpoints verify the effective approved role.' },
  { from: 'Revisiones', to: 'Proyectos', reason: 'Review workflows use the application service to resolve paid proposal context.' },
  { from: 'Servicios', to: 'Autenticacion', reason: 'The service catalog verifies effective contractor roles and approval.' },
];
const exceptionKeys = new Set(documentedApplicationExceptions.map(({ from, to }) => `${from}->${to}`));

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
    return { file: createRequire(file).resolve(specifier), local: specifier.startsWith('.') };
  } catch (error) {
    return { error: `${path.relative(packageRoot, file)} -> unresolved require(${specifier})` };
  }
}

function packageLocation(target) {
  if (!pathWithin(packageRoot, target)) return null;
  const relative = path.relative(packageRoot, target);
  const [layer, moduleName] = relative.split(path.sep);
  return { layer, moduleName };
}

function sourceModule(file) {
  return path.relative(path.join(packageRoot, 'Aplicacion'), file).split(path.sep)[0];
}

test('Paquetes contains exactly the package layers and modules drawn in the diagram', () => {
  const actualLayers = fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(actualLayers, Object.keys(packageDirectories).sort());

  const violations = [];
  for (const [layer, expectedModules] of Object.entries(packageDirectories)) {
    const actualModules = fs.readdirSync(path.join(packageRoot, layer), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    if (JSON.stringify(actualModules) !== JSON.stringify([...expectedModules].sort())) {
      violations.push(`${layer}: expected ${expectedModules.join(', ')}, found ${actualModules.join(', ')}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('resolved package imports obey the diagram, module-model table, and documented exceptions', () => {
  const violations = [];
  for (const file of walk(packageRoot)) {
    const location = packageLocation(file);
    const source = fs.readFileSync(file, 'utf8');
    if (location.layer === 'Aplicacion' && /\b(?:getDb|AccesoDatos)\b/.test(source)) {
      violations.push(`${path.relative(packageRoot, file)} uses getDb or AccesoDatos`);
    }
    const requires = source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of requires) {
      const dependency = resolveDependency(file, match[1]);
      if (dependency.error) {
        violations.push(dependency.error);
        continue;
      }
      const target = dependency.file;
      if (pathWithin(nucleusRoot, target)) continue;
      const targetLocation = packageLocation(target);
      if (!targetLocation) {
        if (dependency.local) {
          violations.push(`${path.relative(packageRoot, file)} imports outside Paquetes and Nucleo`);
        } else if (location.layer === 'Dominio') {
          violations.push(`${path.relative(packageRoot, file)} imports an external module`);
        }
        continue;
      }
      const { layer: targetLayer, moduleName: targetModule } = targetLocation;
      if (location.layer === 'Dominio' && targetLayer !== 'Dominio') {
        violations.push(`${path.relative(packageRoot, file)} imports outside Dominio`);
      } else if (location.layer === 'Persistencia') {
        const allowedPersistenceTarget = targetLayer === 'Dominio'
          || (targetLayer === 'Persistencia'
            && (location.moduleName === 'index.js'
              || (location.moduleName === 'Repositorios'
                && (targetModule === 'AccesoDatos'
                  || (path.basename(file) === 'index.js' && targetModule === 'Repositorios')))
              || (location.moduleName === 'AccesoDatos' && targetModule === 'AccesoDatos')));
        if (!allowedPersistenceTarget) {
          violations.push(`${path.relative(packageRoot, file)} imports forbidden persistence dependency ${targetLayer}/${targetModule}`);
        }
      } else if (location.layer === 'Aplicacion'
        && !['Aplicacion', 'Persistencia', 'Dominio'].includes(targetLayer)) {
        violations.push(`${path.relative(packageRoot, file)} imports forbidden layer ${targetLayer}`);
      } else if (location.layer === 'Presentacion'
        && !['Presentacion', 'Aplicacion'].includes(targetLayer)) {
        violations.push(`${path.relative(packageRoot, file)} imports forbidden layer ${targetLayer}`);
      }

      if (location.layer === 'Aplicacion' && targetLayer === 'Dominio') {
        const sourceName = sourceModule(file);
        const allowedModels = applicationDomainDependencies[sourceName] || [];
        if (!allowedModels.includes(targetModule)) {
          violations.push(`${sourceName} may not import domain model ${targetModule}`);
        }
        if (path.basename(target) !== 'index.js') {
          violations.push(`${path.relative(packageRoot, file)} must import ${targetModule}/index.js`);
        }
      }
      if (location.layer === 'Aplicacion' && targetLayer === 'Aplicacion') {
        const from = sourceModule(file);
        const to = targetModule;
        if (from !== to) {
          const key = `${from}->${to}`;
          if (!exceptionKeys.has(key)) {
            violations.push(`${from} -> ${to} is not a documented Application exception`);
          }
          if (path.basename(target) !== 'index.js') {
            violations.push(`${path.relative(packageRoot, file)} must import ${to}/index.js`);
          }
        }
        if (location.layer === 'Presentacion'
          && targetLayer === 'Aplicacion'
          && path.basename(target) !== 'index.js') {
          violations.push(`${path.relative(packageRoot, file)} must import the public Application index`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
  assert.ok(documentedApplicationExceptions.every(({ reason }) => reason.length > 0));
});
