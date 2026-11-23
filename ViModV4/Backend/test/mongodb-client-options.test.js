const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getMongoClientOptions } = require('../Nucleo/mongodb-client-options');

function withMongoEnvironment(values, action) {
  const names = ['MONGODB_USER', 'MONGODB_PASSWORD', 'MONGODB_AUTH_SOURCE'];
  const originalValues = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  names.forEach((name) => {
    if (Object.hasOwn(values, name)) process.env[name] = values[name];
    else delete process.env[name];
  });

  try {
    return action();
  } finally {
    names.forEach((name) => {
      if (originalValues[name] === undefined) delete process.env[name];
      else process.env[name] = originalValues[name];
    });
  }
}

test('MongoDB credentials are omitted when their environment variables are empty', () => {
  const options = withMongoEnvironment({
    MONGODB_USER: '',
    MONGODB_PASSWORD: '',
    MONGODB_AUTH_SOURCE: '',
  }, () => getMongoClientOptions());
  assert.deepEqual(options, {});
});

test('MongoDB credentials and authentication source are passed when configured', () => {
  const options = withMongoEnvironment({
    MONGODB_USER: 'vimod_app',
    MONGODB_PASSWORD: 'test-password',
    MONGODB_AUTH_SOURCE: 'admin',
  }, () => getMongoClientOptions());
  assert.deepEqual(options, {
    auth: { username: 'vimod_app', password: 'test-password' },
    authSource: 'admin',
  });
});

test('MongoDB authentication rejects a partially configured credential pair', () => {
  withMongoEnvironment({
    MONGODB_USER: 'vimod_app',
    MONGODB_PASSWORD: '',
  }, () => assert.throws(
    () => getMongoClientOptions(),
    /MONGODB_USER y MONGODB_PASSWORD deben configurarse juntos/,
  ));
});
