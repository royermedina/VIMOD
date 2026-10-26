require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseRoleAssignments(value) {
  const assignments = Object.create(null);
  if (!value) return assignments;

  value.split(';').forEach((entry) => {
    if (!entry) return;
    const separator = entry.indexOf('=');
    const userId = entry.slice(0, separator).trim().toLowerCase();
    const role = entry.slice(separator + 1).trim().toLowerCase();
    if (separator < 0 || !/^[a-f\d]{24}$/.test(userId)) {
      throw new Error('ROLE_ASSIGNMENTS debe contener pares ObjectId=rol separados por punto y coma');
    }
    if (role !== 'arquitecto' && role !== 'constructora' && role !== 'admin' && role !== 'administrador') {
      throw new Error('ROLE_ASSIGNMENTS solo admite los roles arquitecto, constructora y admin');
    }
    assignments[userId] = role === 'administrador' ? 'admin' : role;
  });

  return assignments;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27021',
  mongodbDatabase: process.env.MONGODB_DATABASE || 'vimod',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5500',
  paymentProvider: process.env.PAYMENT_PROVIDER || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  copPerUsd: positiveNumber(process.env.COP_PER_USD),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5500',
  roleAssignments: parseRoleAssignments(process.env.ROLE_ASSIGNMENTS),
  adminUsername: 'RoyeryAngel',
  adminPassword: process.env.ADMIN_PASSWORD || '',
};
