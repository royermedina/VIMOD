const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const backendDirectory = path.resolve(__dirname, '..');
const workspaceDirectory = path.resolve(backendDirectory, '..');
const frontendScriptsDirectory = path.join(backendDirectory, 'Nucleo', 'Frontend', 'Scripts');
const architectScriptsDirectory = path.join(
  backendDirectory,
  'Paquetes',
  'Vista',
  'PortalArquitecto',
  'Scripts',
);
const storageScripts = [
  'architect-profile.js',
  'page-Panel-arquitecto.js',
  'page-Revisiones-tecnicas.js',
  path.join('..', '..', '..', '..', 'Nucleo', 'Frontend', 'Scripts', 'role-navigation.js'),
  path.join('..', '..', '..', '..', 'Nucleo', 'Frontend', 'Scripts', 'resource-loader.js'),
];

function createLocalStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function loadActualStorage() {
  const context = {
    console,
    localStorage: createLocalStorage(),
    document: {
      documentElement: { style: {} },
      addEventListener() {},
      querySelectorAll() { return []; },
    },
    location: {
      pathname: '/2. Inicio de sesion.html',
      href: '',
    },
    addEventListener() {},
    alert() {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(frontendScriptsDirectory, 'storage-repository.js'), 'utf8'),
    context,
    { filename: 'storage-repository.js' },
  );
  vm.runInContext(
    fs.readFileSync(path.join(frontendScriptsDirectory, 'storage.js'), 'utf8'),
    context,
    { filename: 'storage.js' },
  );
  return { context, storage: vm.runInContext('Storage', context) };
}

test('all Storage methods called by architect and shared scripts exist in the real storage module', async () => {
  const { context, storage } = loadActualStorage();
  await vm.runInContext('Storage.whenReady()', context);
  const calls = new Map();
  const profileSource = fs.readFileSync(
    path.join(architectScriptsDirectory, 'architect-profile.js'),
    'utf8',
  );
  assert.match(profileSource, /typeof window !== "undefined" \? window : globalThis/);

  for (const relativePath of storageScripts) {
    const sourcePath = path.resolve(architectScriptsDirectory, relativePath);
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const match of source.matchAll(/\bStorage\.(\w+)/g)) {
      if (!calls.has(match[1])) calls.set(match[1], []);
      calls.get(match[1]).push(path.relative(workspaceDirectory, sourcePath));
    }
    assert.doesNotMatch(source, /\broot\.Storage\./, `${relativePath} must use the app Storage binding`);
  }

  assert.ok(calls.size > 0, 'expected to find Storage calls in the inspected scripts');
  for (const [method, files] of calls) {
    assert.equal(
      typeof storage[method],
      'function',
      `Storage.${method} used by ${files.join(', ')} is missing`,
    );
  }
});
