const fs = require('fs');
const vm = require('vm');

const context = { window: {} };
vm.runInNewContext(
  fs.readFileSync('Backend/Nucleo/Frontend/Scripts/tailwind-config.js', 'utf8'),
  context,
);

module.exports = context.window.tailwind.config;
module.exports.content = [
  './Backend/Paquetes/Presentacion/**/Vistas/**/*.html',
  './Backend/**/*.js',
];
