// OWNER: Person 2 (business logic) - integrated into the shared backend by Person 1.
const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const { paginate } = require('../utils/pagination');
const { runInTransaction } = require('../utils/transaction');
const { createAuditLog } = require('./audit.service');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');
const { lockRows, syncIndividualCounts, isAssetAvailable, assetStatus, ISSUABLE_ASSET } = require('./stock.helpers');

const LOCATION_SELECT = { id: true, department: true, laboratory: true, room: true, storageUnit: true };

const ASSET_INCLUDE = {
  item: { select: { id: true, name: true, itemCode: true, category: true } },
  location: { select: LOCATION_SELECT },
  // The open loan (if any) so the UI can show who currently holds the asset.
  issueLines: {
    where: { returnedQuantity: 0 },
    take: 1,
    orderBy: { id: 'desc' },
    select: { id: true, issue: { select: { id: true, dueDate: true, student: { select: { id: true, name: true, enrollmentNo: true } } } } },
  },
};

function presentAsset(a) {
  const { issueLines, ...rest } = a;
  const open = a.isIssued && issueLines && issueLines[0] ? issueLines[0] : null;
  return {
    ...rest,
    available: isAssetAvailable(a),
    status: assetStatus(a),
    holder: open ? { issueId: open.issue.id, issueLineId: open.id, dueDate: open.issue.dueDate, student: open.issue.student } : null,
  };
}

async function listAssets(q) {
  const where = {};
  if (q.itemId) where.itemId = q.itemId;
  if (q.conditionStatus) where.conditionStatus = q.conditionStatus;
  if (q.active !== undefined) where.active = q.active;
  if (q.locationId) where.locationId = q.locationId;
  if (q.available === true) Object.assign(where, ISSUABLE_ASSET);
  if (q.available === false) where.NOT = ISSUABLE_ASSET;
  if (q.search) where.OR = [{ assetTag: { contains: q.search } }, { serialNumber: { contains: q.search } }];

  const { skip, take, meta } = paginate(q);
  const [total, rows] = await prisma.$transaction([
    prisma.asset.count({ where }),
    prisma.asset.findMany({ where, skip, take, orderBy: { assetTag: 'asc' }, include: ASSET_INCLUDE }),
  ]);
  return { items: rows.map(presentAsset), pagination: meta(total) };
}

async function createAsset(body, req) {
  return runInTransaction(async (tx) => {
    await lockRows(tx, 'item', [body.itemId]);
    const item = await tx.item.findUnique({ where: { id: body.itemId } });
    if (!item) throw ApiError.notFound('Item not found');
    if (item.trackingMode !== 'INDIVIDUAL') throw ApiError.conflict(`${item.name} is quantity-tracked and has no individual assets`);
    if (!item.active) throw ApiError.conflict(`${item.name} is inactive`);
    if (body.locationId && !(await tx.location.findUnique({ where: { id: body.locationId } }))) {
      throw ApiError.notFound('Location not found');
    }

    if (await tx.asset.findUnique({ where: { assetTag: body.assetTag } })) {
      throw ApiError.conflict(`Asset tag ${body.assetTag} already exists`);
    }
    const asset = await tx.asset.create({ data: { ...body, locationId: body.locationId ?? item.locationId } });
    await syncIndividualCounts(tx, item.id);
    await tx.stockMovement.create({
      data: { itemId: item.id, movementType: 'ADJUSTMENT', quantityDelta: 1, reason: `Asset ${asset.assetTag} registered`, createdById: req.user.id },
    });
    await createAuditLog(
      { action: AUDIT_ACTIONS.ASSET_CREATED, entityType: ENTITY_TYPES.ASSET, entityId: asset.id, metadata: { assetTag: asset.assetTag, itemId: item.id, conditionStatus: asset.conditionStatus }, req },
      tx
    );
    return presentAsset(await tx.asset.findUnique({ where: { id: asset.id }, include: ASSET_INCLUDE }));
  });
}

/**
 * Condition / location / active changes. Changing DAMAGED|LOST|MAINTENANCE
 * -> USABLE is the explicit coordinator RESTORE that makes an asset issuable.
 */
async function updateAsset(id, { reason, ...changes }, req) {
  return runInTransaction(async (tx) => {
    const current = await tx.asset.findUnique({ where: { id }, select: { itemId: true } });
    if (!current) throw ApiError.notFound('Asset not found');
    await lockRows(tx, 'item', [current.itemId]);
    await lockRows(tx, 'asset', [id]);
    const before = await tx.asset.findUnique({ where: { id } });

    const conditionChanging = changes.conditionStatus && changes.conditionStatus !== before.conditionStatus;
    const deactivating = changes.active === false && before.active;
    if (before.isIssued && (conditionChanging || deactivating)) {
      throw ApiError.conflict(`${before.assetTag} is on loan. Record its return (with condition) first`);
    }
    if (before.conditionStatus === 'RETIRED' && conditionChanging) {
      throw ApiError.conflict(`${before.assetTag} is retired and cannot be restored`);
    }
    if (changes.locationId && !(await tx.location.findUnique({ where: { id: changes.locationId } }))) {
      throw ApiError.notFound('Location not found');
    }

    await tx.asset.update({ where: { id }, data: changes });
    await syncIndividualCounts(tx, before.itemId);

    const statusChange = conditionChanging || (changes.active !== undefined && changes.active !== before.active);
    if (conditionChanging) {
      const restored = changes.conditionStatus === 'USABLE';
      await tx.stockMovement.create({
        data: {
          itemId: before.itemId,
          movementType: restored ? 'RESTORE' : changes.conditionStatus === 'RETIRED' ? 'WRITE_OFF' : 'ADJUSTMENT',
          quantityDelta: 0,
          reason: `${before.assetTag}: ${before.conditionStatus} -> ${changes.conditionStatus}${reason ? ` (${reason})` : ''}`,
          createdById: req.user.id,
        },
      });
    }
    await createAuditLog(
      {
        action: statusChange ? AUDIT_ACTIONS.ASSET_STATUS_CHANGED : AUDIT_ACTIONS.ASSET_UPDATED,
        entityType: ENTITY_TYPES.ASSET,
        entityId: id,
        metadata: {
          assetTag: before.assetTag,
          from: { conditionStatus: before.conditionStatus, active: before.active },
          to: { conditionStatus: changes.conditionStatus ?? before.conditionStatus, active: changes.active ?? before.active },
          reason: reason || null,
        },
        req,
      },
      tx
    );
    return presentAsset(await tx.asset.findUnique({ where: { id }, include: ASSET_INCLUDE }));
  });
}

module.exports = { listAssets, createAsset, updateAsset };
