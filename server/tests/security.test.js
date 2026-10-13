const test = require('node:test');
const assert = require('node:assert/strict');
const { app, request, prisma, ACCOUNTS, anonymousAgent, loginAs } = require('./helpers');

test.after(() => prisma.$disconnect());

// ---------------- CSRF ----------------
test('CSRF: state-changing request without token -> 403', async () => {
  const { agent } = await anonymousAgent();
  const res = await agent.post('/api/auth/login').send(ACCOUNTS.coordinator);
  assert.equal(res.status, 403);
  assert.equal(res.body.message, 'Invalid or missing CSRF token');
});

test('CSRF: wrong token -> 403', async () => {
  const { agent } = await anonymousAgent();
  const res = await agent.post('/api/auth/login').set('X-CSRF-Token', 'a'.repeat(64)).send(ACCOUNTS.coordinator);
  assert.equal(res.status, 403);
});

test('CSRF: pre-login token is invalid after login (rotated)', async () => {
  const { agent, csrf } = await anonymousAgent();
  await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send(ACCOUNTS.coordinator).expect(200);
  const res = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf);
  assert.equal(res.status, 403);
});

test('CSRF: token from another session is rejected', async () => {
  const a = await loginAs('coordinator');
  const b = await loginAs('student1');
  const res = await a.agent.post('/api/auth/logout').set('X-CSRF-Token', b.csrf);
  assert.equal(res.status, 403);
});

test('CSRF: logged-in coordinator with no token cannot mutate', async () => {
  const { agent } = await loginAs('coordinator');
  const res = await agent.post('/api/locations').send({ department: 'X', laboratory: 'Y', room: 'Z', storageUnit: 'W' });
  assert.equal(res.status, 403);
});

// ---------------- RBAC ----------------
test('RBAC: unauthenticated -> 401 on protected routes', async () => {
  for (const path of ['/api/audit', '/api/inventory', '/api/issues/mine', '/api/students', '/api/dashboard']) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, path);
    assert.deepEqual(Object.keys(res.body).sort(), ['data', 'message', 'success']);
  }
});

test('RBAC: student is forbidden from coordinator endpoints', async () => {
  const { agent, csrf } = await loginAs('student1');
  assert.equal((await agent.get('/api/audit')).status, 403);
  assert.equal((await agent.get('/api/students')).status, 403);
  assert.equal((await agent.get('/api/issues')).status, 403);
  assert.equal((await agent.get('/api/assets')).status, 403);
  const issue = await agent
    .post('/api/issues')
    .set('X-CSRF-Token', csrf)
    .send({ studentId: 1, lines: [{ itemId: 1, quantity: 1 }] });
  assert.equal(issue.status, 403);
  const approve = await agent.patch('/api/renewals/1').set('X-CSRF-Token', csrf).send({ status: 'APPROVED' });
  assert.equal(approve.status, 403);
  const inv = await agent
    .post('/api/inventory')
    .set('X-CSRF-Token', csrf)
    .send({ itemCode: 'HACK', name: 'x', category: 'x', trackingMode: 'QUANTITY', totalQuantity: 5 });
  assert.equal(inv.status, 403);
});

test('RBAC: coordinator is forbidden from student-only endpoints', async () => {
  const { agent, csrf } = await loginAs('coordinator');
  assert.equal((await agent.get('/api/issues/mine')).status, 403);
  assert.equal((await agent.get('/api/students/me')).status, 403);
  const renew = await agent.post('/api/renewals').set('X-CSRF-Token', csrf).send({ issueId: 1 });
  assert.equal(renew.status, 403);
});

test('RBAC: coordinator passes guards on coordinator endpoints', async () => {
  const { agent } = await loginAs('coordinator');
  const audit = await agent.get('/api/audit?page=1&pageSize=5');
  assert.equal(audit.status, 200);
  assert.ok(Array.isArray(audit.body.data.items));
  assert.equal(audit.body.data.pagination.pageSize, 5);
  const students = await agent.get('/api/students');
  assert.equal(students.status, 200);
  assert.ok(students.body.data.items.length >= 2);
  assert.ok(!JSON.stringify(students.body).includes('passwordHash'));
});

test('Student isolation: /api/students/me returns only own profile', async () => {
  const s1 = await loginAs('student1');
  const s2 = await loginAs('student2');
  const me1 = await s1.agent.get('/api/students/me');
  const me2 = await s2.agent.get('/api/students/me');
  assert.equal(me1.body.data.enrollmentNo, 'DFIS2026-001');
  assert.equal(me2.body.data.enrollmentNo, 'DFIS2026-002');
  // Query/body identity is ignored - identity comes from the session only.
  const spoof = await s1.agent.get('/api/students/me?studentId=2');
  assert.equal(spoof.body.data.enrollmentNo, 'DFIS2026-001');
  assert.equal((await s1.agent.get('/api/students/2')).status, 403);
});

// ---------------- Validation ----------------
test('Validation: issue payload rejects negative/zero qty, client due dates, bad IDs', async () => {
  const { agent, csrf } = await loginAs('coordinator');
  const post = (body) => agent.post('/api/issues').set('X-CSRF-Token', csrf).send(body);

  assert.equal((await post({ studentId: 1, lines: [{ itemId: 2, quantity: -2 }] })).status, 422);
  assert.equal((await post({ studentId: 1, lines: [{ itemId: 2, quantity: 0 }] })).status, 422);
  assert.equal((await post({ studentId: 'abc', lines: [{ itemId: 2, quantity: 1 }] })).status, 422);
  assert.equal((await post({ studentId: 1, lines: [] })).status, 422);
  assert.equal((await post({ studentId: 1, dueDate: '2030-01-01', lines: [{ itemId: 2, quantity: 1 }] })).status, 422);
  assert.equal((await post({ studentId: 1, lines: [{ itemId: 1, assetId: 3, quantity: 2 }] })).status, 422);
  assert.equal(
    (await post({ studentId: 1, lines: [{ itemId: 1, assetId: 3 }, { itemId: 1, assetId: 3 }] })).status,
    422,
    'duplicate asset in one issue'
  );
  // Valid payload reaches Person 2's handler (501 until implemented, 201 after).
  const ok = await post({ studentId: 1, lines: [{ itemId: 2, quantity: 2 }] });
  assert.ok([201, 409, 501].includes(ok.status), `unexpected ${ok.status}`);
});

test('Validation: invalid enums, IDs, long strings', async () => {
  const { agent, csrf } = await loginAs('coordinator');
  const ret = await agent
    .post('/api/returns')
    .set('X-CSRF-Token', csrf)
    .send({ issueLineId: 1, quantity: 1, conditionStatus: 'BROKEN' });
  assert.equal(ret.status, 422);
  const decide = await agent.patch('/api/renewals/xyz').set('X-CSRF-Token', csrf).send({ status: 'MAYBE' });
  assert.equal(decide.status, 422);
  assert.equal(decide.body.errors.length, 2);
  const loc = await agent
    .post('/api/locations')
    .set('X-CSRF-Token', csrf)
    .send({ department: 'x'.repeat(500), laboratory: 'L', room: 'R', storageUnit: 'S' });
  assert.equal(loc.status, 422);
  const audit = await agent.get('/api/audit?pageSize=1000');
  assert.equal(audit.status, 422);
});

// ---------------- Middleware hardening ----------------
test('Oversized JSON body -> 413', async () => {
  const { agent, csrf } = await anonymousAgent();
  const res = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(200 * 1024) }));
  assert.equal(res.status, 413);
});

test('Malformed JSON -> 400 with standard error shape', async () => {
  const { agent, csrf } = await anonymousAgent();
  const res = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .set('Content-Type', 'application/json')
    .send('{"email": ');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { success: false, message: 'Malformed JSON body', data: null });
});

test('CORS: allowed origin gets credentialed CORS headers, others are refused', async () => {
  const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
  assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(ok.headers['access-control-allow-credentials'], 'true');
  const bad = await request(app).get('/api/health').set('Origin', 'http://evil.example');
  assert.equal(bad.status, 403);
  assert.equal(bad.headers['access-control-allow-origin'], undefined);
});

test('Security headers present, x-powered-by hidden, unknown route -> 404 JSON', async () => {
  const res = await request(app).get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(res.headers['content-security-policy']);
});

test('GET requests never create sessions for anonymous users except csrf-token', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers['set-cookie'], undefined);
});
