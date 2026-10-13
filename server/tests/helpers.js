// Integration-test helpers. Run via `npm test`, which first resets the TEST
// database (DATABASE_URL_TEST) - tests never touch the development data.
require('dotenv').config();
if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST must be set in server/.env');
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT_TEST || '1000';

const request = require('supertest');
const { createApp } = require('../src/app');
const prisma = require('../src/config/prisma');

const ACCOUNTS = {
  coordinator: { email: 'coordinator@stocksure.local', password: 'C0rdin4t0r#5879' },
  student1: { email: 'student1@stocksure.local', password: 'Student@123' },
  student2: { email: 'student2@stocksure.local', password: 'Student@123' },
};

const app = createApp();

/** A cookie-keeping client that has fetched a CSRF token (pre-login session). */
async function anonymousAgent() {
  const agent = request.agent(app);
  const res = await agent.get('/api/csrf-token');
  return { agent, csrf: res.body.data.csrfToken, res };
}

/** Logged-in agent. Returns the NEW csrf token issued after session regeneration. */
async function loginAs(name) {
  const { agent, csrf } = await anonymousAgent();
  const res = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send(ACCOUNTS[name]);
  if (res.status !== 200) throw new Error(`login ${name} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, csrf: res.body.data.csrfToken, user: res.body.data };
}

function sessionCookie(res) {
  const cookies = res.headers['set-cookie'] || [];
  const c = cookies.find((x) => x.startsWith('stocksure.sid='));
  return c ? c.split(';')[0] : null;
}

module.exports = { app, request, prisma, ACCOUNTS, anonymousAgent, loginAs, sessionCookie };
