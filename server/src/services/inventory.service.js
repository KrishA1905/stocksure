// OWNER: Person 2 (business logic) - integrated into the shared backend by Person 1.
const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const { paginate } = require('../utils/pagination');
const { runInTransaction } = require('../utils/transaction');
const { createAuditLog } = require('./audit.service');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');
const { lockRows, syncIndividualCounts, isAssetAvailable, assetStatus } = require('./stock.helpers');

const LOCATION_SELECT = { id: true, department: true, laboratory: true, room: true, storageUnit: true };

const ASSET_SUMMARY_SELECT = { id: true, assetTag: true, serialNumber: true, conditionStatus: true, isIssued: true, active: true };

function presentAsset(a) {
  return { ...a, available: isAssetAvailable(a), status: assetStatus(a) };
}

/** Adds the computed figures the UI needs; the counters themselves are authoritative. */
function presentItem(item) {
  const outstandingQuantity = Math.max(0, item.totalQuantity - item.availableQuantity - item.unavailableQuantity);
  let availability = 'IN_STOCK';
  if (!item.active) availability = 'INACTIVE';
  else if (item.availableQuantity === 0) availability = 'OUT_OF_STOCK';
  else if (item.availableQuantity <= Math.ceil(item.totalQuantity * 0.2)) availability = 'LOW';

  const out = { ...item, outstandingQuantity, availability };
  if (item.assets) out.assets = item.assets.map(presentAsset);
  return out;
}

async function listItems(q) {
  const where = {};
  if (q.search) {
    where.OR = [{ name: { contains: q.search } }, { itemCode: { contains: q.search } }, { category: { contains: q.search } }];
  }
  if (q.category) where.category = q.category;
  if (q.trackingMode) where.trackingMode = q.trackingMode;
  if (q.active !== undefined) where.active = q.active;
  if (q.locationId) where.locationId = q.locationId;
  if (q.available === true) where.availableQuantity = { gt: 0 };
  if (q.available === false) where.availableQuantity = 0;

  const { skip, take, meta } = paginate(q);
  const [total, rows, categories] = await prisma.$transaction([
    prisma.item.count({ where }),
    prisma.item.findMany({
      where,
      skip,
      take,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        location: { select: LOCATION_SELECT },
        assets: { where: { active: true }, orderBy: { assetTag: 'asc' }, select: ASSET_SUMMARY_SELECT },
      },
    }),
    prisma.item.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
  ]);
  return { items: rows.map(presentItem), pagination: meta(total), categories: categories.map((c) => c.category) };
}

async function getItem(id) {
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      location: { select: LOCATION_SELECT },
      assets: { orderBy: { assetTag: 'asc' }, include: { location: { select: LOCATION_SELECT } } },
      stockMovements: { orderBy: { createdAt: 'desc' }, take: 15, include: { createdBy: { select: { email: true } } } },
    },
  });
  if (!item) throw ApiError.notFound('Item not found');
  return presentItem(item);
}

async function assertLocation(tx, locationId) {
  if (!locationId) return;
  const loc = await tx.location.findUnique({ where: { id: locationId } });
  if (!loc) throw ApiError.notFound('Location not found');
}

/** Generates a unique item code from the name when the client didn't send one. */
async function generateItemCode(tx, name) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ITEM';
  for (let n = 0; n < 50; n += 1) {
    const code = n === 0 ? base : `${base}-${n + 1}`;
    if (!(await tx.item.findUnique({ where: { itemCode: code } }))) return code;
  }
  return `${base}-${Date.now()}`;
}

/**
 * POST /api/inventory
 * QUANTITY: totalQuantity units go straight to the shelf.
 * INDIVIDUAL: optional `assets` are created in the same transaction
 *   (Person 2 feature); counts are derived from them.
 */
async function createItem({ assets = [], ...body }, req) {
  return runInTransaction(async (tx) => {
    await assertLocation(tx, body.locationId);
    const itemCode = body.itemCode || (await generateItemCode(tx, body.name));
    if (body.itemCode && (await tx.item.findUnique({ where: { itemCode } }))) {
      throw ApiError.conflict(`Item code ${itemCode} already exists`);
    }
    if (assets.length) {
      const taken = await tx.asset.findMany({ where: { assetTag: { in: assets.map((a) => a.assetTag) } }, select: { assetTag: true } });
      if (taken.length) throw ApiError.conflict(`Asset tag already exists: ${taken.map((a) => a.assetTag).join(', ')}`);
    }
    const isQuantity = body.trackingMode === 'QUANTITY';
    const qty = isQuantity ? body.totalQuantity : 0;

    const item = await tx.item.create({
      data: { ...body, itemCode, totalQuantity: qty, availableQuantity: qty, unavailableQuantity: 0 },
    });

    if (qty > 0) {
      await tx.stockMovement.create({
        data: { itemId: item.id, movementType: 'INITIAL', quantityDelta: qty, reason: 'Initial stock', createdById: req.user.id },
      });
    }

    if (!isQuantity && assets.length) {
      for (const a of assets) {
        await tx.asset.create({ data: { ...a, itemId: item.id, locationId: body.locationId ?? null } });
      }
      const counts = await syncIndividualCounts(tx, item.id);
      await tx.stockMovement.create({
        data: { itemId: item.id, movementType: 'INITIAL', quantityDelta: counts.total, reason: `${assets.length} asset(s) registered`, createdById: req.user.id },
      });
    }

    await createAuditLog(
      {
        action: AUDIT_ACTIONS.ITEM_CREATED,
        entityType: ENTITY_TYPES.ITEM,
        entityId: item.id,
        metadata: { itemCode, name: item.name, trackingMode: item.trackingMode, totalQuantity: qty, assetCount: assets.length },
        req,
      },
      tx
    );
    return getItemTx(tx, item.id);
  });
}

async function getItemTx(tx, id) {
  const item = await tx.item.findUnique({
    where: { id },
    include: { location: { select: LOCATION_SELECT }, assets: { orderBy: { assetTag: 'asc' }, select: ASSET_SUMMARY_SELECT } },
  });
  return presentItem(item);
}

async function updateItem(id, body, req) {
  return runInTransaction(async (tx) => {
    const before = await tx.item.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound('Item not found');
    await assertLocation(tx, body.locationId);
    const item = await tx.item.update({ where: { id }, data: body });
    const changed = Object.keys(body).filter((k) => String(before[k]) !== String(item[k]));
    await createAuditLog(
      { action: AUDIT_ACTIONS.ITEM_UPDATED, entityType: ENTITY_TYPES.ITEM, entityId: id, metadata: { itemCode: item.itemCode, changed }, req },
      tx
    );
    return getItemTx(tx, id);
  });
}

async function lockQuantityItem(tx, id) {
  await lockRows(tx, 'item', [id]);
  const item = await tx.item.findUnique({ where: { id } });
  if (!item) throw ApiError.notFound('Item not found');
  if (item.trackingMode !== 'QUANTITY') {
    throw ApiError.conflict('Individually tracked items are managed through their assets (add assets / change asset condition)');
  }
  return item;
}

/** POST /api/inventory/:id/adjust - audited stock correction for QUANTITY items. */
async function adjustStock(id, { quantityDelta, reason, pool }, req) {
  return runInTransaction(async (tx) => {
    const item = await lockQuantityItem(tx, id);
    const field = pool === 'UNAVAILABLE' ? 'unavailableQuantity' : 'availableQuantity';

    if (quantityDelta < 0 && item[field] < -quantityDelta) {
      const label = pool === 'UNAVAILABLE' ? 'unavailable' : 'on the shelf';
      throw ApiError.conflict(`${item.name}: only ${item[field]} ${label}, cannot remove ${-quantityDelta}`);
    }
    await tx.item.update({
      where: { id },
      data: { [field]: { increment: quantityDelta }, totalQuantity: { increment: quantityDelta } },
    });
    const movement = await tx.stockMovement.create({
      data: {
        itemId: id,
        movementType: quantityDelta < 0 ? 'WRITE_OFF' : 'ADJUSTMENT',
        quantityDelta,
        reason,
        createdById: req.user.id,
      },
    });
    await createAuditLog(
      { action: AUDIT_ACTIONS.STOCK_ADJUSTED, entityType: ENTITY_TYPES.ITEM, entityId: id, metadata: { quantityDelta, pool, reason, movementId: movement.id }, req },
      tx
    );
    return getItemTx(tx, id);
  });
}

/** POST /api/inventory/:id/restore - repaired units go back on the shelf (explicit coordinator step). */
async function restoreStock(id, { quantity, reason }, req) {
  return runInTransaction(async (tx) => {
    const item = await lockQuantityItem(tx, id);
    if (item.unavailableQuantity < quantity) {
      throw ApiError.conflict(`${item.name}: only ${item.unavailableQuantity} unavailable unit(s) to restore`);
    }
    await tx.item.update({
      where: { id },
      data: { unavailableQuantity: { decrement: quantity }, availableQuantity: { increment: quantity } },
    });
    const movement = await tx.stockMovement.create({
      data: { itemId: id, movementType: 'RESTORE', quantityDelta: quantity, reason, createdById: req.user.id },
    });
    await createAuditLog(
      { action: AUDIT_ACTIONS.STOCK_ADJUSTED, entityType: ENTITY_TYPES.ITEM, entityId: id, metadata: { restored: quantity, reason, movementId: movement.id }, req },
      tx
    );
    return getItemTx(tx, id);
  });
}

module.exports = { listItems, getItem, createItem, updateItem, adjustStock, restoreStock, presentItem, LOCATION_SELECT };
