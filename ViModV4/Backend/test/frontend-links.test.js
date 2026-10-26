const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const backendDirectory = path.resolve(__dirname, '..');
const workspaceDirectory = path.resolve(backendDirectory, '..');
const legacyHtmlDirectory = path.join(workspaceDirectory, 'HTML');
const legacyPagesDirectory = path.join(backendDirectory, 'Funciones', 'Paginas');
const presentationDirectory = path.join(backendDirectory, 'Paquetes', 'Presentacion');
const nucleusFrontendDirectory = path.join(backendDirectory, 'Nucleo', 'Frontend');
const inlineScriptPattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

function walk(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walk(fullPath, predicate)
      : (predicate(fullPath) ? [fullPath] : []);
  });
}

function existingPageFiles() {
  return [
    ...walk(legacyHtmlDirectory, (file) => file.toLowerCase().endsWith('.html')),
    ...walk(presentationDirectory, (file) => file.toLowerCase().endsWith('.html')),
    ...walk(nucleusFrontendDirectory, (file) => file.toLowerCase().endsWith('.html')),
  ];
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function localPathFromReference(reference, sourceFile) {
  const value = decodePath(reference.trim().replace(/&amp;/gi, '&'));
  if (!value || value.startsWith('#') || value.startsWith('//')
    || value.startsWith('${') || value.startsWith('{{')
    || /^[a-z][a-z\d+.-]*:/i.test(value)) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!pathname) return null;
  return path.resolve(pathname.startsWith('/')
    ? workspaceDirectory
    : path.dirname(sourceFile), pathname.replace(/^[/\\]+/, ''));
}

test('all local frontend links and page routes resolve to files', () => {
  const missing = [];
  const pages = existingPageFiles();
  const scripts = [
    ...walk(legacyPagesDirectory, (file) => file.endsWith('.js')),
    ...walk(presentationDirectory, (file) => file.endsWith('.js')
      && file.split(path.sep).includes('Scripts')),
    ...walk(nucleusFrontendDirectory, (file) => file.endsWith('.js')
      && file.split(path.sep).includes('Scripts')),
  ];
  const htmlReferencePattern = /(["'`])([^"'`\r\n]*?\.html(?:[?#][^"'`\r\n]*)?)\1/gi;
  const attributePattern = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi;
  const assetReferencePattern = /(["'`])((?:\/|\.{1,2}\/)[^"'`\s]*\.(?:js|css)(?:[?#][^"'`\s]*)?)\1/gi;

  for (const pageFile of pages) {
    const source = fs.readFileSync(pageFile, 'utf8');
    for (const match of source.matchAll(attributePattern)) {
      const target = localPathFromReference(match[2], pageFile);
      if (target && !fs.existsSync(target)) {
        missing.push(`${path.relative(workspaceDirectory, pageFile)} -> ${match[2]}`);
      }
      if (target && /\.(?:js|css)$/i.test(target) && !fs.statSync(target, { throwIfNoEntry: false })?.isFile()) {
        missing.push(`${path.relative(workspaceDirectory, pageFile)} -> missing ${match[2]}`);
      }
    }
    for (const inlineScript of source.matchAll(inlineScriptPattern)) {
      for (const route of inlineScript[1].matchAll(htmlReferencePattern)) {
        const target = localPathFromReference(route[2], pageFile);
        if (target && !fs.existsSync(target)) {
          missing.push(`${path.relative(workspaceDirectory, pageFile)} -> inline page ${route[2]}`);
        }
      }
    }
  }

  for (const scriptFile of scripts) {
    const source = fs.readFileSync(scriptFile, 'utf8');
    const base = source.match(/const common\s*=\s*(["'])(.*?)\1/)?.[2] || '';
    if (/^page-.*\.js$/i.test(path.basename(scriptFile)) || path.basename(scriptFile) === 'rutas.js') {
      for (const match of source.matchAll(htmlReferencePattern)) {
        const target = localPathFromReference(match[2], path.join(legacyHtmlDirectory, '_page.html'));
        if (target && !fs.existsSync(target)) {
          missing.push(`${path.relative(workspaceDirectory, scriptFile)} -> page ${match[2]}`);
        }

        const entryFiles = [
          {
            file: path.join(workspaceDirectory, 'index.html'),
            pattern: /http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^;\s"']+)/i,
            label: 'index refresh',
          },
          {
            file: path.join(workspaceDirectory, '.vscode', 'start-live-server.js'),
            pattern: /const entryUrl\s*=\s*["']([^"']+\.html)["']/,
            label: 'Live Server entry',
          },
        ];
        for (const entry of entryFiles) {
          const source = fs.readFileSync(entry.file, 'utf8');
          const reference = source.match(entry.pattern)?.[1];
          const target = reference && localPathFromReference(reference, entry.file);
          if (!target || !fs.existsSync(target)) {
            missing.push(`${path.relative(workspaceDirectory, entry.file)} -> ${entry.label} ${reference || 'not found'}`);
          }
        }
      }
    }
    for (const match of source.matchAll(assetReferencePattern)) {
      const reference = /^\/(?:Scripts|Estilos)\//.test(match[2]) && base
        ? base + match[2]
        : match[2];
      const target = localPathFromReference(reference, scriptFile);
      if (target && !fs.existsSync(target)) {
        missing.push(`${path.relative(workspaceDirectory, scriptFile)} -> asset ${reference}`);
      }
    }
  }

  assert.deepEqual([...new Set(missing)].sort(), []);
});
