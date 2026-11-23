const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const activeProject = require('../Nucleo/Frontend/Scripts/proyecto-activo');

function createElement() {
  const attributes = {};
  const listeners = {};
  return {
    attributes,
    listeners,
    textContent: '',
    innerHTML: '',
    classList: {
      add() {},
      remove() {},
    },
    addEventListener(name, handler) {
      listeners[name] = handler;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return attributes[name] || null;
    },
  };
}

test('active project selection persists, clears stale ids, and handles an empty project list', () => {
  const previousStorage = global.localStorage;
  const values = new Map();
  global.localStorage = {
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
  const project = { id: 'project-1', nombre: 'Casa campestre', estado: 'Borrador' };
  const projects = [project];

  try {
    assert.equal(activeProject.resolveProject([], null), null);
    assert.equal(activeProject.getStoredId(), null);

    const toggle = createElement();
    const name = createElement();
    const menu = createElement();
    const documentListeners = {};
    global.ViModRoutes = { page: () => '/crear-proyecto.html' };
    global.document = {
      getElementById(id) {
        return {
          'active-project-toggle': toggle,
          'active-project-name': name,
          'active-project-menu': menu,
        }[id] || null;
      },
      addEventListener(eventName, handler) {
        documentListeners[eventName] = handler;
      },
    };

    const emptySelector = activeProject.initialize([], null);
    assert.equal(emptySelector.getSelected(), null);
    assert.match(menu.innerHTML, /Aún no tienes proyectos/);
    assert.match(menu.innerHTML, /Crear nuevo proyecto/);
    const selector = activeProject.initialize(projects, null);
    selector.select(project.id);
    assert.equal(activeProject.getStoredId(), project.id);
    assert.equal(name.textContent, project.nombre);
    assert.equal(activeProject.resolveProject(projects, null).id, project.id);

    assert.equal(activeProject.resolveProject([], null), null);
    assert.equal(activeProject.getStoredId(), null);
    assert.equal(documentListeners.click instanceof Function, true);
  } finally {
    if (previousStorage === undefined) delete global.localStorage;
    else global.localStorage = previousStorage;
    delete global.document;
    delete global.ViModRoutes;
  }
});

test('service quote flow prompts for a project before submitting when none is active', () => {
  const view = fs.readFileSync(
    path.resolve(__dirname, '../Paquetes/Vista/PortalCliente/Vistas/10. Catalgo contructoras y cotizacion.html'),
    'utf8',
  );
  const script = fs.readFileSync(
    path.resolve(__dirname, '../Paquetes/Vista/PortalCliente/Scripts/page-Catalgo-contructoras-y-cotizacion.js'),
    'utf8',
  );

  assert.match(view, /id="quote-project-select"/);
  assert.match(view, /id="quote-no-projects"/);
  assert.match(view, /id="quote-create-project"/);
  assert.match(script, /if \(!proyectoId\) \{\s*showQuoteFeedback\("Selecciona un proyecto para enviar la solicitud\."/);
});
