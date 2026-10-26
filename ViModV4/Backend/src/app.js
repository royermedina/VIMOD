const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { configureRuntimeConfig } = require('../Nucleo/runtime-config');
const { stripeReturnUrls } = require('../Nucleo/stripe-return-routes');
const applicationConfig = { ...env, stripeReturnUrls };
configureRuntimeConfig(applicationConfig);
const routes = require('../Paquetes/Presentacion');
const { notFound, errorHandler } = require('../Nucleo/HTTP');

const app = express();
const allowedOrigins = new Set([
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

if (env.clientOrigin) {
  const configuredOrigins = String(env.clientOrigin)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  configuredOrigins.forEach((origin) => allowedOrigins.add(origin));
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'Payment-Signature'],
  credentials: false,
};

app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: 'Origen no permitido por CORS' });
    return;
  }
  next();
});
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
