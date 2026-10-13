// Person 2 business rules, tested end-to-end through the real HTTP stack
// (auth + CSRF + RBAC + validation + transactions) against the TEST database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, loginAs } = require('./helpers');
const { toCalendarDate, addCalendarDays, startOfCalendarDay } = require('../src/utils/dates');

let coord;
let s1;
let s2;
let student1;
let student2;

const item = (itemCode) => prisma.item.findUnique({ where: { itemCode } });
const freeBoards = (take = 1) =>
  prisma.asset.findMany({ where: { item: { itemCode: 'DB-DEV' }, isIssued: false, conditionStatus: 'USABLE', active: true }, orderBy: { id: 'asc' }, take });

const post = (who, url, body) => who.agent.post(url).set('X-CSRF-Token', who.csrf).send(body);
const patch = (who, url, body) => who.agent.patch(url).set('X-CSRF-Token', who.csrf).send(body);

async function issue(lines, studentId = student1.id, extra = {}) {
  return post(coord, '/api/issues', { studentId, lines, ...extra });
}

test.before(async () => {
  coord = await loginAs('coordinator');
  s1 = await loginAs('student1');
  s2 = await loginAs('student2');
  student1 = await prisma.student.findUnique({ where: { enrollmentNo: 'DFIS2026-001' } });
  student2 = await prisma.student.findUnique({ where: { enrollmentNo: 'DFIS2026-002' } });
});

test.after(() => prisma.$disconnect());

// ---------------------------------------------------------------------------
test('Demo scenario: issue -> renewal request -> approval -> partial return', async (t) => {
  const boardsBefore = await item('DB-DEV');
  const cablesBefore = await item('USB-CABLE');
  const [board] = await freeBoards();

  // Issue 1 board + 2 cables to Student 1
  const res = await issue(
    [
      { itemId: boardsBefore.id, assetId: board.id },
      { itemId: cablesBefore.id, quantity: 2 },
    ],
    student1.id,
    { purpose: 'Embedded lab practical' }
  );
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const iss = res.body.data;
  assert.equal(iss.purpose, 'Embedded lab practical');
  assert.equal(iss.status, 'ACTIVE');
  assert.equal(iss.outstandingQuantity, 3);
  assert.equal(iss.dueCalendarDate, addCalendarDays(toCalendarDate(iss.issueDate), 15), 'due = issue date + 15 days');
  assert.equal(new Date(iss.dueDate) - new Date(iss.issueDate), 15 * 86400000);

  const boardsAfter = await item('DB-DEV');
  const cablesAfter = await item('USB-CABLE');
  assert.equal(boardsAfter.availableQuantity, boardsBefore.availableQuantity - 1, 'boards 10 -> 9');
  assert.equal(cablesAfter.availableQuantity, cablesBefore.availableQuantity - 2, 'cables 20 -> 18');
  assert.equal((await prisma.asset.findUnique({ where: { id: board.id } })).isIssued, true);
  assert.equal(await prisma.auditLog.count({ where: { action: 'ISSUE_CREATED', entityId: String(iss.id) } }), 1);

  const boardLine = iss.lines.find((l) => l.assetId === board.id);
  const cableLine = iss.lines.find((l) => l.itemId === cablesBefore.id);
  const originalDue = iss.dueDate;

  await t.test('student sees own borrowing; other student cannot', async () => {
    const mine = await s1.agent.get('/api/issues/mine');
    assert.equal(mine.status, 200);
    assert.ok(mine.body.data.some((i) => i.id === iss.id));
    const theirs = await s2.agent.get('/api/issues/mine');
    assert.ok(!theirs.body.data.some((i) => i.id === iss.id));
    assert.equal((await s2.agent.get(`/api/issues/${iss.id}`)).status, 404);
    assert.equal((await s1.agent.get(`/api/issues/${iss.id}`)).status, 200);
    assert.equal((await coord.agent.get(`/api/issues/${iss.id}`)).status, 200);
  });

  let renewalId;
  await t.test('wrong student cannot request renewal (404, no leak)', async () => {
    const r = await post(s2, '/api/renewals', { issueId: iss.id });
    assert.equal(r.status, 404);
  });

  await t.test('renewal request does NOT change the due date', async () => {
    const r = await post(s1, '/api/renewals', { issueId: iss.id, remarks: 'Need one more week' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.status, 'PENDING');
    assert.equal(new Date(r.body.data.oldDueDate).toISOString(), originalDue);
    renewalId = r.body.data.id;
    const after = await prisma.issue.findUnique({ where: { id: iss.id } });
    assert.equal(after.dueDate.toISOString(), originalDue);
    const dup = await post(s1, '/api/renewals', { issueId: iss.id });
    assert.equal(dup.status, 409, 'only one pending renewal at a time');
  });

  await t.test('student sees own renewals only', async () => {
    const mine = await s1.agent.get('/api/renewals');
    assert.ok(mine.body.data.items.some((r) => r.id === renewalId));
    const theirs = await s2.agent.get('/api/renewals');
    assert.ok(!theirs.body.data.items.some((r) => r.id === renewalId));
  });

  await t.test('approval extends the EXISTING due date by exactly 15 days', async () => {
    // Person 2's field name `decision` is accepted as an alias of `status`.
    const r = await patch(coord, `/api/renewals/${renewalId}`, { decision: 'APPROVED', remarks: 'OK' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.status, 'APPROVED');
    const expected = new Date(new Date(originalDue).getTime() + 15 * 86400000).toISOString();
    assert.equal(new Date(r.body.data.newDueDate).toISOString(), expected);
    const after = await prisma.issue.findUnique({ where: { id: iss.id } });
    assert.equal(after.dueDate.toISOString(), expected);
    assert.equal(await prisma.auditLog.count({ where: { action: 'RENEWAL_APPROVED', entityId: String(renewalId) } }), 1);

    const again = await patch(coord, `/api/renewals/${renewalId}`, { status: 'APPROVED' });
    assert.equal(again.status, 409, 'cannot approve twice');
    const still = await prisma.issue.findUnique({ where: { id: iss.id } });
    assert.equal(still.dueDate.toISOString(), expected, 'failed approval does not move the due date');
  });

  await t.test('rejection leaves the due date unchanged', async () => {
    const before = await prisma.issue.findUnique({ where: { id: iss.id } });
    const req2 = await post(s1, '/api/renewals', { issueId: iss.id });
    assert.equal(req2.status, 201);
    const r = await patch(coord, `/api/renewals/${req2.body.data.id}`, { status: 'REJECTED', remarks: 'Needed by another batch' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.status, 'REJECTED');
    const after = await prisma.issue.findUnique({ where: { id: iss.id } });
    assert.equal(after.dueDate.toISOString(), before.dueDate.toISOString());
  });

  await t.test('partial return: 1 of 2 cables (USABLE) goes back on the shelf', async () => {
    const before = await item('USB-CABLE');
    // Person 2's field name `condition` is accepted as an alias.
    const r = await post(coord, '/api/returns', { issueLineId: cableLine.id, quantity: 1, condition: 'USABLE', remarks: 'Fine' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.issueLine.outstandingQuantity, 1);
    assert.equal(r.body.data.issueStatus, 'PARTIALLY_RETURNED');
    assert.equal((await item('USB-CABLE')).availableQuantity, before.availableQuantity + 1);
  });

  await t.test('over-return is rejected with no state change', async () => {
    const before = await prisma.issueLine.findUnique({ where: { id: cableLine.id } });
    const r = await post(coord, '/api/returns', { issueLineId: cableLine.id, quantity: 2, conditionStatus: 'USABLE' });
    assert.equal(r.status, 409);
    const after = await prisma.issueLine.findUnique({ where: { id: cableLine.id } });
    assert.equal(after.returnedQuantity, before.returnedQuantity);
  });

  await t.test('board returned DAMAGED stays unavailable until restored', async () => {
    const before = await item('DB-DEV');
    const r = await post(coord, '/api/returns', { issueLineId: boardLine.id, quantity: 1, conditionStatus: 'DAMAGED', remarks: 'Cracked header' });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.issueLine.outstandingQuantity, 0, 'board outstanding = 0');
    const asset = await prisma.asset.findUnique({ where: { id: board.id } });
    assert.equal(asset.isIssued, false);
    assert.equal(asset.conditionStatus, 'DAMAGED');
    const after = await item('DB-DEV');
    assert.equal(after.availableQuantity, before.availableQuantity, 'damaged board does not become available');
    assert.equal(after.unavailableQuantity, before.unavailableQuantity + 1);

    const reissue = await issue([{ itemId: after.id, assetId: board.id }], student2.id);
    assert.equal(reissue.status, 409, 'damaged asset cannot be issued');

    const restore = await patch(coord, `/api/assets/${board.id}`, { conditionStatus: 'USABLE', reason: 'Repaired' });
    assert.equal(restore.status, 200);
    assert.equal(restore.body.data.available, true);
    assert.equal((await item('DB-DEV')).availableQuantity, before.availableQuantity + 1);
  });

  await t.test('last cable returned DAMAGED: issue RETURNED, unit unavailable, then restored', async () => {
    const before = await item('USB-CABLE');
    const r = await post(coord, '/api/returns', { issueLineId: cableLine.id, quantity: 1, conditionStatus: 'DAMAGED' });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.issueStatus, 'RETURNED');
    let after = await item('USB-CABLE');
    assert.equal(after.availableQuantity, before.availableQuantity);
    assert.equal(after.unavailableQuantity, before.unavailableQuantity + 1);

    const again = await post(coord, '/api/returns', { issueLineId: cableLine.id, quantity: 1, conditionStatus: 'USABLE' });
    assert.equal(again.status, 409, 'already fully returned');

    const restored = await post(coord, `/api/inventory/${after.id}/restore`, { quantity: 1, reason: 'Cable re-crimped' });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    after = await item('USB-CABLE');
    assert.equal(after.unavailableQuantity, before.unavailableQuantity);
    assert.equal(after.availableQuantity, before.availableQuantity + 1);
  });

  await t.test('audit trail has the whole story', async () => {
    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of ['ISSUE_CREATED', 'RENEWAL_REQUESTED', 'RENEWAL_APPROVED', 'RENEWAL_REJECTED', 'RETURN_CREATED', 'ASSET_STATUS_CHANGED', 'STOCK_ADJUSTED']) {
      assert.ok(actions.includes(a), `missing ${a}`);
    }
  });
});

// ---------------------------------------------------------------------------
test('Renewal policy: max 2 approved renewals; student reason and coordinator remarks kept separately', async () => {
  const cables = await item('USB-CABLE');
  const created = await issue([{ itemId: cables.id, quantity: 1 }], student1.id);
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  for (let n = 1; n <= 2; n += 1) {
    const req = await post(s1, '/api/renewals', { issueId: id, remarks: `Reason ${n}` });
    assert.equal(req.status, 201, JSON.stringify(req.body));
    const ok = await patch(coord, `/api/renewals/${req.body.data.id}`, { status: 'APPROVED', remarks: `Approved ${n}` });
    assert.equal(ok.body.data.remarks, `Reason ${n}`, 'student reason preserved');
    assert.equal(ok.body.data.decisionRemarks, `Approved ${n}`);
  }
  const third = await post(s1, '/api/renewals', { issueId: id });
  assert.equal(third.status, 409);
  assert.match(third.body.message, /Renewal limit/);
});

test('Insufficient stock -> 409 and nothing changes', async () => {
  const cables = await item('USB-CABLE');
  const issuesBefore = await prisma.issue.count();
  const r = await issue([{ itemId: cables.id, quantity: cables.availableQuantity + 1 }]);
  assert.equal(r.status, 409);
  assert.match(r.body.message, /Insufficient stock/);
  assert.equal((await item('USB-CABLE')).availableQuantity, cables.availableQuantity);
  assert.equal(await prisma.issue.count(), issuesBefore);
});

test('Two lines of the same item cannot together exceed stock (bug fixed from P2 draft)', async () => {
  const cables = await item('USB-CABLE');
  const half = Math.ceil(cables.availableQuantity / 2) + 1;
  const r = await issue([
    { itemId: cables.id, quantity: half },
    { itemId: cables.id, quantity: half },
  ]);
  assert.equal(r.status, 409);
  assert.equal((await item('USB-CABLE')).availableQuantity, cables.availableQuantity);
});

test('Failed issue rolls back earlier lines (no partial issue)', async () => {
  const cables = await item('USB-CABLE');
  const boards = await item('DB-DEV');
  const [b1] = await freeBoards();
  const first = await issue([{ itemId: boards.id, assetId: b1.id }], student2.id);
  assert.equal(first.status, 201);

  const issuesBefore = await prisma.issue.count();
  const cablesBefore = (await item('USB-CABLE')).availableQuantity;
  const r = await issue([
    { itemId: cables.id, quantity: 1 }, // valid
    { itemId: boards.id, assetId: b1.id }, // already issued -> whole issue fails
  ]);
  assert.equal(r.status, 409);
  assert.match(r.body.message, /already issued/);
  assert.equal(await prisma.issue.count(), issuesBefore, 'no issue row');
  assert.equal((await item('USB-CABLE')).availableQuantity, cablesBefore, 'cable stock untouched');
});

test('Duplicate active individual asset -> 409', async () => {
  const boards = await item('DB-DEV');
  const [b] = await freeBoards();
  assert.equal((await issue([{ itemId: boards.id, assetId: b.id }], student1.id)).status, 201);
  const second = await issue([{ itemId: boards.id, assetId: b.id }], student2.id);
  assert.equal(second.status, 409);
});

test('Tracking-mode rules: asset required for INDIVIDUAL, forbidden for QUANTITY; wrong item asset rejected', async () => {
  const boards = await item('DB-DEV');
  const cables = await item('USB-CABLE');
  const [b] = await freeBoards();
  assert.equal((await issue([{ itemId: boards.id, quantity: 1 }])).status, 422);
  assert.equal((await issue([{ itemId: cables.id, assetId: b.id }])).status, 422);
  assert.equal((await issue([{ itemId: cables.id, quantity: 1 }], 999999)).status, 404, 'unknown student');
});

test('Concurrency (Person 2 test): two simultaneous issues of the same asset -> one 201, one 409', async () => {
  const boards = await item('DB-DEV');
  const [b] = await freeBoards();
  const [r1, r2] = await Promise.all([
    issue([{ itemId: boards.id, assetId: b.id }], student1.id, { purpose: 'Race 1' }),
    issue([{ itemId: boards.id, assetId: b.id }], student2.id, { purpose: 'Race 2' }),
  ]);
  assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
  assert.equal(await prisma.issueLine.count({ where: { assetId: b.id, returnedQuantity: 0 } }), 1);
});

test('Concurrency: racing for the last cables never makes stock negative', async () => {
  const cables = await item('USB-CABLE');
  const want = cables.availableQuantity; // each request asks for ALL remaining stock
  const results = await Promise.all([1, 2, 3].map(() => issue([{ itemId: cables.id, quantity: want }], student2.id)));
  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [201, 409, 409]);
  const after = await item('USB-CABLE');
  assert.equal(after.availableQuantity, 0);
  assert.ok(after.availableQuantity >= 0);
});

test('Asset on loan cannot be marked damaged/deactivated directly', async () => {
  const onLoan = await prisma.asset.findFirst({ where: { isIssued: true } });
  const r = await patch(coord, `/api/assets/${onLoan.id}`, { conditionStatus: 'LOST' });
  assert.equal(r.status, 409);
  const r2 = await patch(coord, `/api/assets/${onLoan.id}`, { active: false });
  assert.equal(r2.status, 409);
});

// ---------------------------------------------------------------------------
test('Overdue: calendar-day rule, listing, report, dashboard, renewal blocked', async () => {
  const boards = await item('DB-DEV');
  const [b] = await freeBoards();
  const created = await issue([{ itemId: boards.id, assetId: b.id }], student1.id);
  assert.equal(created.status, 201);
  const id = created.body.data.id;

  // Simulate time passing: due date 3 calendar days ago.
  const threeDaysAgo = new Date(startOfCalendarDay().getTime() - 3 * 86400000 + 10 * 3600000);
  await prisma.issue.update({ where: { id }, data: { dueDate: threeDaysAgo } });

  const list = await coord.agent.get('/api/issues?overdue=true');
  const row = list.body.data.items.find((i) => i.id === id);
  assert.ok(row, 'appears in overdue filter');
  assert.equal(row.isOverdue, true);
  assert.equal(row.overdueDays, 3);
  assert.equal(row.displayStatus, 'OVERDUE');

  const report = await coord.agent.get('/api/issues/overdue');
  const line = report.body.data.find((l) => l.issueId === id);
  assert.equal(line.overdueDays, 3);
  assert.equal(line.assetTag, b.assetTag);
  assert.equal(line.studentName, student1.name);

  const dash = await coord.agent.get('/api/dashboard');
  assert.ok(dash.body.data.overdueIssues >= 1);
  assert.ok(dash.body.data.overdueList.some((l) => l.issueId === id));

  const renew = await post(s1, '/api/renewals', { issueId: id });
  assert.equal(renew.status, 409, 'cannot renew after the due date');

  // Due TODAY (later today) is not overdue yet.
  await prisma.issue.update({ where: { id }, data: { dueDate: new Date(startOfCalendarDay().getTime() + 60000) } });
  const today = await coord.agent.get(`/api/issues/${id}`);
  assert.equal(today.body.data.isOverdue, false);
});

test('Dashboard: coordinator gets department stats, student gets only own', async () => {
  const c = await coord.agent.get('/api/dashboard');
  assert.equal(c.status, 200);
  const d = c.body.data;
  for (const k of ['totalItemTypes', 'totalQuantity', 'availableQuantity', 'outstandingQuantity', 'overdueIssues', 'pendingRenewals', 'overdueList', 'byCategory', 'assetStatus', 'trend', 'recentActivity']) {
    assert.ok(k in d, `missing ${k}`);
  }
  assert.equal(d.totalQuantity, d.availableQuantity + d.unavailableQuantity + d.outstandingQuantity);
  assert.equal(d.trend.length, 14);

  const s = await s2.agent.get('/api/dashboard');
  assert.equal(s.status, 200);
  assert.equal(s.body.data.role, 'STUDENT');
  assert.ok(s.body.data.openIssues.every((i) => i.student.id === student2.id));
  assert.ok(!('overdueList' in s.body.data));
});

// ---------------------------------------------------------------------------
test('Inventory: create QUANTITY item (code auto-generated), adjust stock', async () => {
  const r = await post(coord, '/api/inventory', { name: 'Ethernet Cable', category: 'Networking', trackingMode: 'QUANTITY', totalQuantity: 10 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.itemCode, 'ETHERNET-CABLE');
  assert.equal(r.body.data.availableQuantity, 10);
  const id = r.body.data.id;

  const add = await post(coord, `/api/inventory/${id}/adjust`, { quantityDelta: 5, reason: 'New delivery' });
  assert.equal(add.body.data.totalQuantity, 15);
  const tooMany = await post(coord, `/api/inventory/${id}/adjust`, { quantityDelta: -100, reason: 'Count correction' });
  assert.equal(tooMany.status, 409);
  const remove = await post(coord, `/api/inventory/${id}/adjust`, { quantityDelta: -3, reason: 'Lost in lab' });
  assert.equal(remove.body.data.availableQuantity, 12);
  assert.equal(await prisma.stockMovement.count({ where: { itemId: id } }), 3);

  const dupCode = await post(coord, '/api/inventory', { itemCode: 'ETHERNET-CABLE', name: 'X', category: 'Y', trackingMode: 'QUANTITY' });
  assert.equal(dupCode.status, 409);
});

test('Inventory: create ASSET item with assets in one call (Person 2 format)', async () => {
  const r = await post(coord, '/api/inventory', {
    name: 'Oscilloscope',
    category: 'Test Equipment',
    trackingMode: 'ASSET',
    assets: [{ tag: 'osc-001' }, { tag: 'OSC-002', condition: 'DAMAGED' }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const it = r.body.data;
  assert.equal(it.trackingMode, 'INDIVIDUAL');
  assert.equal(it.totalQuantity, 2);
  assert.equal(it.availableQuantity, 1);
  assert.equal(it.unavailableQuantity, 1);
  assert.deepEqual(it.assets.map((a) => a.assetTag), ['OSC-001', 'OSC-002']);

  const extra = await post(coord, '/api/assets', { itemId: it.id, tag: 'OSC-003', serialNumber: 'SN-9' });
  assert.equal(extra.status, 201);
  assert.equal((await prisma.item.findUnique({ where: { id: it.id } })).totalQuantity, 3);
  const dupTag = await post(coord, '/api/assets', { itemId: it.id, assetTag: 'OSC-003' });
  assert.equal(dupTag.status, 409);
  const toQuantity = await post(coord, '/api/assets', { itemId: (await item('USB-CABLE')).id, assetTag: 'USB-X' });
  assert.equal(toQuantity.status, 409);
});

test('Inventory/asset listing and filters', async () => {
  const inv = await s1.agent.get('/api/inventory?trackingMode=INDIVIDUAL');
  assert.equal(inv.status, 200);
  assert.ok(inv.body.data.items.every((i) => i.trackingMode === 'INDIVIDUAL'));
  const boards = inv.body.data.items.find((i) => i.itemCode === 'DB-DEV');
  assert.equal(boards.assets.length, 10);
  assert.ok(inv.body.data.categories.includes('Electronics'));

  const avail = await coord.agent.get('/api/assets?available=true&pageSize=100');
  assert.ok(avail.body.data.items.every((a) => a.available));
  const issued = await coord.agent.get('/api/assets?available=false&pageSize=100');
  const loan = issued.body.data.items.find((a) => a.isIssued);
  assert.ok(loan.holder && loan.holder.student, 'issued asset shows who holds it');

  const detail = await coord.agent.get(`/api/inventory/${boards.id}`);
  assert.equal(detail.status, 200);
  assert.ok(Array.isArray(detail.body.data.stockMovements));
});
