const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { app, request, prisma, ACCOUNTS, anonymousAgent, loginAs, sessionCookie } = require('./helpers');

const INACTIVE = { email: 'inactive.test@stocksure.local', password: 'Inactive@123' };

test.before(async () => {
  await prisma.user.upsert({
    where: { email: INACTIVE.email },
    update: { active: false },
    create: { email: INACTIVE.email, passwordHash: await bcrypt.hash(INACTIVE.password, 10), role: 'STUDENT', active: false },
  });
});

test.after(() => prisma.$disconnect());

test('valid coordinator login returns safe user + new CSRF token', async () => {
  const { agent, csrf } = await anonymousAgent();
  const res = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send(ACCOUNTS.coordinator);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Login successful');
  assert.equal(res.body.data.email, ACCOUNTS.coordinator.email);
  assert.equal(res.body.data.role, 'COORDINATOR');
  assert.ok(res.body.data.csrfToken);
  assert.notEqual(res.body.data.csrfToken, csrf, 'CSRF token rotates on login');
  assert.ok(!JSON.stringify(res.body).includes('passwordHash'));
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('stocksure.sid='));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test('session ID is regenerated on login (session fixation)', async () => {
  const { agent, res: pre } = await anonymousAgent();
  const before = sessionCookie(pre);
  const res = await agent.post('/api/auth/login').set('X-CSRF-Token', pre.body.data.csrfToken).send(ACCOUNTS.student1);
  const after = sessionCookie(res);
  assert.ok(before && after);
  assert.notEqual(before, after);
  // The pre-login session ID must not be authenticated.
  const fixated = await request(app).get('/api/auth/me').set('Cookie', before);
  assert.equal(fixated.status, 401);
});

test('wrong password, unknown email and inactive account all get the same generic 401', async () => {
  const attempts = [
    { email: ACCOUNTS.student1.email, password: 'Wrong@123' },
    { email: 'nobody@stocksure.local', password: 'Whatever@123' },
    INACTIVE,
  ];
  const messages = [];
  for (const body of attempts) {
    const { agent, csrf } = await anonymousAgent();
    const res = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send(body);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    messages.push(res.body.message);
  }
  assert.equal(new Set(messages).size, 1, 'messages must not reveal which check failed');
});

test('/me: 401 before login, 200 after, 401 after logout', async () => {
  const { agent, csrf } = await anonymousAgent();
  assert.equal((await agent.get('/api/auth/me')).status, 401);

  const login = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send(ACCOUNTS.student1);
  const authedCsrf = login.body.data.csrfToken;
  const sid = sessionCookie(login);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.data.role, 'STUDENT');
  assert.equal(me.body.data.student.enrollmentNo, 'DFIS2026-001');
  assert.ok(!JSON.stringify(me.body).includes('passwordHash'));

  const out = await agent.post('/api/auth/logout').set('X-CSRF-Token', authedCsrf);
  assert.equal(out.status, 200);
  assert.equal((await agent.get('/api/auth/me')).status, 401);

  // A copied cookie from before logout is dead server-side.
  const replay = await request(app).get('/api/auth/me').set('Cookie', sid);
  assert.equal(replay.status, 401);
});

test('deactivating a user kills their existing session', async () => {
  const email = 'deactivate.test@stocksure.local';
  const password = 'Deactivate@123';
  await prisma.user.upsert({
    where: { email },
    update: { active: true },
    create: { email, passwordHash: await bcrypt.hash(password, 10), role: 'STUDENT' },
  });
  const { agent, csrf } = await anonymousAgent();
  await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ email, password }).expect(200);
  await agent.get('/api/auth/me').expect(200);
  await prisma.user.update({ where: { email }, data: { active: false } });
  await agent.get('/api/auth/me').expect(401);
});

test('login validation: malformed email / missing password -> 422 with field errors', async () => {
  const { agent, csrf } = await anonymousAgent();
  const res = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ email: 'not-an-email' });
  assert.equal(res.status, 422);
  const fields = res.body.errors.map((e) => e.field);
  assert.ok(fields.includes('body.email'));
  assert.ok(fields.includes('body.password'));
});

test('login rejects extra fields such as role (no mass assignment)', async () => {
  const { agent, csrf } = await anonymousAgent();
  const res = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .send({ ...ACCOUNTS.student1, role: 'COORDINATOR' });
  assert.equal(res.status, 422);
});

test('loginAs helper works for every demo account', async () => {
  for (const name of Object.keys(ACCOUNTS)) {
    const { user } = await loginAs(name);
    assert.equal(user.email, ACCOUNTS[name].email);
  }
});
