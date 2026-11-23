const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const routes = require('../Nucleo/Frontend/Scripts/rutas');

const backendDirectory = path.resolve(__dirname, '..');
const workspaceDirectory = path.resolve(backendDirectory, '..');
const viewsDirectory = path.join(
  backendDirectory,
  'Paquetes',
  'Vista',
  'PortalArquitecto',
  'Vistas',
);
const frontendDirectory = path.join(backendDirectory, 'Nucleo', 'Frontend');
const architectScriptPrefix = '/Backend/Paquetes/Presentacion/PortalArquitecto/Scripts/';

function getSection(source, tag) {
  const match = source.match(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'i'));
  assert.ok(match, `missing <${tag}> section`);
  return match[0];
}

function headResources(source) {
  const head = getSection(source, 'head');
  return [...head.matchAll(/<(?:script|link)\b[^>]*>/gi)].map(([tag]) => {
    const reference = tag.match(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/i);
    return reference ? reference[2] : tag;
  });
}

function sidebarSignature(source) {
  return getSection(source, 'aside')
    .replace(/\saria-current="page"/g, '')
    .replace(/<a\b[^>]*>/gi, (tag) => tag.replace(/\sclass="[^"]*"/i, ''))
    .replace(/class="font-label text-body-sm font-semibold"/g, 'class="font-label text-body-sm"')
    .replace(/\s+/g, ' ')
    .replace(/\s+>/g, '>')
    .trim();
}

function headerSignature(source) {
  return getSection(source.slice(source.indexOf('</aside>')), 'header')
    .replace(/\bid="(?:assigned-project-search|review-search)"/, 'id="search-input"')
    .replace(/<span class="sr-only">[\s\S]*?<\/span>/, '<span class="sr-only">Buscar</span>')
    .replace(/\bplaceholder="[^"]*"/, 'placeholder="Buscar"')
    .replace(/\s+/g, ' ')
    .replace(/\s+>/g, '>')
    .trim();
}

function assertLocalReferencesExist(source, sourceFile) {
  for (const match of source.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
    const reference = decodeURIComponent(match[2].replace(/&amp;/gi, '&'));
    if (!reference || /^[a-z][a-z\d+.-]*:/i.test(reference) || reference.startsWith('//')) continue;
    const pathname = reference.split(/[?#]/, 1)[0];
    if (!pathname) continue;
    let target = path.resolve(
      pathname.startsWith('/')
        ? workspaceDirectory
        : path.dirname(sourceFile),
      pathname.replace(/^[/\\]+/, ''),
    );
    const relativeTarget = path.relative(workspaceDirectory, target).replace(/\\/g, '/');
    if (relativeTarget.startsWith('Backend/Paquetes/Presentacion/')) {
      target = path.join(
        workspaceDirectory,
        'Backend',
        'Paquetes',
        'Vista',
        relativeTarget.slice('Backend/Paquetes/Presentacion/'.length),
      );
    }
    assert.ok(fs.existsSync(target), `${path.relative(workspaceDirectory, sourceFile)} -> ${reference}`);
  }
}

test('all architect views keep the shared head, shell, local assets, and ordered scripts', () => {
  const viewFiles = fs.readdirSync(viewsDirectory)
    .filter((name) => name.toLowerCase().endsWith('.html'))
    .map((name) => path.join(viewsDirectory, name));
  const referenceFile = viewFiles.find((file) => path.basename(file).startsWith('11.'));
  assert.ok(referenceFile, 'missing reference view 11');
  const reference = fs.readFileSync(referenceFile, 'utf8');
  const referenceHead = headResources(reference);
  const referenceSidebar = sidebarSignature(reference);
  const referenceHeader = headerSignature(reference);
  const referenceBodyClass = reference.match(/<body\b[^>]*\bclass="([^"]*)"/i)?.[1];
  const referenceShell = reference.match(/<div class="pl-72">/i)?.[0];
  const requiredResources = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'fonts.googleapis.com/css2?family=Literata',
    'fonts.googleapis.com/css2?family=Material+Symbols+Outlined',
    '/Backend/Nucleo/Frontend/Scripts/resource-loader.js?v=13',
    'https://cdn.tailwindcss.com?plugins=forms,container-queries',
    '../Estilos/panel-arquitecto.css?v=2',
  ];

  for (const file of viewFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const relativeFile = path.relative(viewsDirectory, file);
    const expectedActivePath = path.basename(file).startsWith('11.')
      ? 'proyectos-asignados'
      : 'revisiones-tecnicas';
    const activeLink = source.match(/<a\b(?=[^>]*aria-current="page")[^>]*data-path="([^"]+)"/i);
    const pageScript = source.match(/<script\s+src="([^"]*page-(?:Panel|Revisiones)[^"]*)"/i);

    assert.deepEqual(headResources(source), referenceHead, `${relativeFile} must preserve the shared head resources`);
    assert.equal(sidebarSignature(source), referenceSidebar, `${relativeFile} must preserve the shared sidebar`);
    assert.equal(headerSignature(source), referenceHeader, `${relativeFile} must preserve the shared header`);
    assert.equal(
      source.match(/<body\b[^>]*\bclass="([^"]*)"/i)?.[1],
      referenceBodyClass,
      `${relativeFile} must preserve the body classes`,
    );
    assert.equal(source.match(/<div class="pl-72">/i)?.[0], referenceShell);
    assert.ok(activeLink, `${relativeFile} must have one active menu entry`);
    assert.equal(activeLink[1], expectedActivePath);
    for (const resource of requiredResources) {
      assert.ok(source.includes(resource), `${relativeFile} is missing ${resource}`);
    }
    assertLocalReferencesExist(source, file);

    assert.ok(source.indexOf('resource-loader.js') < source.indexOf('architect-profile.js'));
    assert.ok(source.indexOf('architect-profile.js') < source.indexOf('page-'));
    assert.ok(pageScript, `${relativeFile} must load its own page script`);
    assert.ok(pageScript[1].startsWith(architectScriptPrefix));
  }

  const loader = fs.readFileSync(path.join(frontendDirectory, 'Scripts', 'resource-loader.js'), 'utf8');
  const sharedLoadOrder = [
    "common + '/Scripts/rutas.js",
    "common + '/Scripts/imagenes-tarjetas.js",
    "common + '/Estilos/base.css",
    "common + '/Estilos/components.css",
    "common + '/Estilos/tailwind.generated.css",
    "common + '/Scripts/tailwind-config.js",
    "common + '/Scripts/page-utils.js",
    "common + '/Scripts/page-actions.js",
    "common + '/Scripts/api-client.js",
    "common + '/Scripts/storage-repository.js",
    "common + '/Scripts/role-navigation.js",
    "common + '/Scripts/storage.js",
  ].map((resource) => loader.indexOf(resource));
  assert.ok(sharedLoadOrder.every((index) => index >= 0), 'resource-loader must provide every shared dependency');
  assert.deepEqual(sharedLoadOrder, [...sharedLoadOrder].sort((a, b) => a - b));

  for (const relativePath of [
    'Scripts/rutas.js',
    'Scripts/imagenes-tarjetas.js',
    'Scripts/tailwind-config.js',
    'Scripts/page-utils.js',
    'Scripts/page-actions.js',
    'Scripts/api-client.js',
    'Scripts/storage-repository.js',
    'Scripts/role-navigation.js',
    'Scripts/storage.js',
    'Estilos/base.css',
    'Estilos/components.css',
    'Estilos/tailwind.generated.css',
  ]) {
    assert.ok(fs.existsSync(path.join(frontendDirectory, relativePath)), relativePath);
  }

  const reviewRoute = decodeURIComponent(routes.page('architectReviews').split('?')[0]);
  const reviewFile = reviewRoute
    .slice(1)
    .replace(/^Backend\/Paquetes\/Presentacion\//, 'Backend/Paquetes/Vista/');
  assert.ok(fs.existsSync(path.resolve(workspaceDirectory, reviewFile)));
});
