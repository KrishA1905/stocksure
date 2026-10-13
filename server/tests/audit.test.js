const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, anonymousAgent, loginAs, ACCOUNTS } = require('./helpers');
const { createAuditLog } = require('../src/services/audit.service');
const { runInTransaction } = require('../src/utils/transaction');
const ApiError = require('../src/utils/apiError');
const { AUDIT_ACTIONS } = require('../src/config/constants');

test.after(() => prisma.$disconnect());

test('login success / failure / logout are audited with IP and user agent', async () => {
  const start = new Date(Date.now() - 1000);
  const user = await prisma.user.findUnique({ where: { email: ACCOUNTS.student2.email } });

  const bad = await anonymousAgent();
  await bad.agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', bad.csrf)
    .set('User-Agent', 'audit-test-agent')
    .send({ email: ACCOUNTS.student2.email, password: 'Wrong@1234' })
    .expect(401);

  const { agent, csrf } = await loginAs('student2');
  await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).expect(200);

  const logs = await prisma.auditLog.findMany({
    where: { userId: user.id, createdAt: { gte: start } },
    orderBy: { id: 'asc' },
  });
  const actions = logs.map((l) => l.action);
  assert.ok(actions.includes(AUDIT_ACTIONS.LOGIN_FAILURE));
  assert.ok(actions.includes(AUDIT_ACTIONS.LOGIN_SUCCESS));
  assert.ok(actions.includes(AUDIT_ACTIONS.LOGOUT));

  const failure = logs.find((l) => l.action === AUDIT_ACTIONS.LOGIN_FAILURE);
  assert.equal(failure.userAgent, 'audit-test-agent');
  assert.ok(failure.ipAddress);
  assert.equal(failure.metadata.reason, 'BAD_PASSWORD');
  assert.ok(!JSON.stringify(failure.metadata).includes('Wrong@1234'), 'password never logged');
});

test('audit + data writes inside runInTransaction roll back together on failure', async () => {
  const marker = `rollback-test-${Date.now()}`;
  const cables = await prisma.item.findUnique({ where: { itemCode: 'USB-CABLE' } });

  await assert.rejects(
    runInTransaction(async (tx) => {
      await tx.item.update({ where: { id: cables.id }, data: { availableQuantity: { decrement: 1 } } });
      await createAuditLog({ userId: null, action: AUDIT_ACTIONS.STOCK_ADJUSTED, entityType: 'ITEM', entityId: cables.id, metadata: { marker } }, tx);
      throw ApiError.conflict('simulated business-rule failure');
    }),
    (err) => err.statusCode === 409
  );

  const after = await prisma.item.findUnique({ where: { id: cables.id } });
  assert.equal(after.availableQuantity, cables.availableQuantity, 'stock unchanged');
  const rows = await prisma.auditLog.findMany({ where: { action: AUDIT_ACTIONS.STOCK_ADJUSTED }, select: { metadata: true } });
  assert.equal(rows.filter((r) => r.metadata && r.metadata.marker === marker).length, 0, 'audit row rolled back');
});

test('audit API is read-only (no POST/PATCH/DELETE routes)', async () => {
  const { agent, csrf } = await loginAs('coordinator');
  for (const method of ['post', 'patch', 'delete']) {
    const res = await agent[method]('/api/audit').set('X-CSRF-Token', csrf).send({});
    assert.equal(res.status, 404, method);
  }
  const list = await agent.get('/api/audit?action=LOGIN_SUCCESS&pageSize=3');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.every((r) => r.action === 'LOGIN_SUCCESS'));
  assert.ok(list.body.data.items.every((r) => !('passwordHash' in (r.user || {}))));
});
