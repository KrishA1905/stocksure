const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const env = require('./config/env');
const PrismaSessionStore = require('./config/sessionStore');
const { csrfProtection } = require('./middleware/csrf');
const { handleApiError, notFoundHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const SESSION_COOKIE_NAME = 'stocksure.sid';

function createApp({ sessionStore } = {}) {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  // --- Security headers (API only serves JSON) ---
  app.use(helmet());

  // --- Strict CORS: only configured front-end origins, with credentials ---
  app.use(
    cors({
      origin(origin, cb) {
        // Same-origin / server-to-server / curl requests have no Origin header.
        if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
        const err = new Error('Origin not allowed');
        err.code = 'CORS_ORIGIN_DENIED';
        return cb(err);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      maxAge: 600,
    })
  );

  // --- Body parsing with size limits ---
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  // --- Server-side sessions in MySQL, cookie only carries the session ID ---
  const cookieOptions = {
    httpOnly: true,
    secure: env.isProduction || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    maxAge: env.sessionMaxAgeMs,
    path: '/',
  };
  app.set('sessionCookieName', SESSION_COOKIE_NAME);
  app.set('sessionCookieClearOptions', {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: '/',
  });

  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      secret: env.SESSION_SECRET,
      store: sessionStore || new PrismaSessionStore({ defaultMaxAgeMs: env.sessionMaxAgeMs }),
      resave: false,
      saveUninitialized: false,
      rolling: true, // idle timeout: each request extends expiry by maxAge
      proxy: env.TRUST_PROXY > 0,
      cookie: cookieOptions,
    })
  );

  // --- CSRF for every state-changing request under /api ---
  app.use('/api', csrfProtection());

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(handleApiError);

  return app;
}

module.exports = { createApp, SESSION_COOKIE_NAME };
