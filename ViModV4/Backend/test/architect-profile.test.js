const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  profileIsComplete,
  shouldShowHomeForm,
} = require('../Paquetes/Vista/PortalArquitecto/Scripts/architect-profile');

const completeProfile = {
  nombre: 'Arquitecta de prueba',
  especialidad: 'Estructuras',
  anosExperiencia: 0,
  zona: 'Centro',
  honorarioBase: 0,
};

test('a complete professional profile hides the setup form while missing fields keep it visible', () => {
  assert.equal(profileIsComplete(completeProfile), true);
  assert.equal(shouldShowHomeForm(completeProfile), false);
  assert.equal(profileIsComplete({ ...completeProfile, zona: '' }), false);
  assert.equal(shouldShowHomeForm({ ...completeProfile, zona: '' }), true);
});
