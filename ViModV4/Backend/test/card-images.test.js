const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const cardImages = require('../Nucleo/Frontend/Scripts/imagenes-tarjetas');

const projectDirectory = path.resolve(__dirname, '../../assets/img/proyectos');
const terrainDirectory = path.resolve(__dirname, '../../assets/img/terrenos');

function jpgNames(directory) {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.jpg'))
    .sort();
}

test('card image lists match the generated local assets and remain deterministic', () => {
  assert.deepEqual(
    cardImages.projectImages.map((source) => path.basename(source)).sort(),
    jpgNames(projectDirectory),
  );
  assert.deepEqual(
    cardImages.terrainImages.map((source) => path.basename(source)).sort(),
    jpgNames(terrainDirectory),
  );
  for (const directory of [projectDirectory, terrainDirectory]) {
    for (const name of jpgNames(directory)) {
      assert.ok(fs.statSync(path.join(directory, name)).size <= 150 * 1024);
    }
  }

  const terrainImage = cardImages.terrainImage('terrain-123');
  const projectImage = cardImages.projectImage('project-456');
  delete require.cache[require.resolve('../Nucleo/Frontend/Scripts/imagenes-tarjetas')];
  const reloadedCardImages = require('../Nucleo/Frontend/Scripts/imagenes-tarjetas');
  assert.equal(reloadedCardImages.terrainImage('terrain-123'), terrainImage);
  assert.equal(reloadedCardImages.projectImage('project-456'), projectImage);
});

test('failed card images try the rest of the list before showing the icon', () => {
  const fallback = { hidden: false };
  const handlers = {};
  const candidates = cardImages.terrainImagesFor('terrain-123');
  const image = {
    src: candidates[0],
    dataset: { cardImageKind: 'terrain', cardImageId: 'terrain-123' },
    complete: false,
    hidden: false,
    naturalWidth: 0,
    classList: { add() {}, remove() {} },
    getAttribute(name) { return name === 'src' ? this.src : null; },
    addEventListener(name, handler) { handlers[name] = handler; },
    parentElement: { querySelector() { return fallback; } },
  };

  cardImages.bindFallbacks({ querySelectorAll() { return [image]; } });
  for (let index = 1; index < candidates.length; index += 1) {
    handlers.error();
    assert.equal(image.src, candidates[index]);
    assert.equal(fallback.hidden, false);
  }
  handlers.error();
  assert.equal(image.hidden, true);
  assert.equal(fallback.hidden, false);
});

test('successfully loaded card images replace the fallback icon', () => {
  const fallback = { hidden: false };
  const handlers = {};
  const candidates = cardImages.projectImagesFor('project-456');
  const image = {
    src: candidates[0],
    dataset: { cardImageKind: 'project', cardImageId: 'project-456' },
    complete: false,
    hidden: false,
    naturalWidth: 900,
    classList: { add() {}, remove() {} },
    getAttribute(name) { return name === 'src' ? this.src : null; },
    addEventListener(name, handler) { handlers[name] = handler; },
    parentElement: { querySelector() { return fallback; } },
  };

  cardImages.bindFallbacks({ querySelectorAll() { return [image]; } });
  handlers.load();

  assert.equal(fallback.hidden, true);
  assert.equal(image.hidden, false);
});

test('registered terrain cards use the horizontal shared image layout', () => {
  const script = fs.readFileSync(
    path.resolve(__dirname, '../Paquetes/Vista/PortalCliente/Scripts/page-Registrar-terreno.js'),
    'utf8',
  );
  const baseCss = fs.readFileSync(
    path.resolve(__dirname, '../Nucleo/Frontend/Estilos/base.css'),
    'utf8',
  );

  assert.match(script, /sm:flex-row/);
  assert.match(script, /gap-4/);
  assert.match(script, /Eliminar terreno/);
  assert.match(script, /alt="Vista del terreno"/);
  assert.match(baseCss, /max-width: 220px/);
  assert.match(baseCss, /@media \(max-width: 639px\)/);
});
