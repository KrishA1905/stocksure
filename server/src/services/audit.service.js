const prisma = require('../config/prisma');
const { paginate } = require('../utils/pagination');

function clientIp(req) {
  if (!req) return null;
  return (req.ip || (req.socket && req.socket.remoteAddress) || '').slice(0, 64) || null;
}

function clientUserAgent(req) {
  if (!req || typeof req.get !== 'function') return null;
  return (req.get('user-agent') || '').slice(0, 255) || null;
}

/**
 * Append-only audit log writer.
 *
 * @param {object}  entry
 * @param {number?} entry.userId     acting user (defaults to req.user.id)
 * @param {string}  entry.action     one of AUDIT_ACTIONS
 * @param {string}  entry.entityType one of ENTITY_TYPES
 * @param {string|number?} entry.entityId
 * @param {object?} entry.metadata   extra JSON (never put passwords/secrets here)
 * @param {object?} entry.req        Express request (for IP / user agent)
 * @param {object}  [db]             pass the transaction client `tx` inside runInTransaction
 */
async function createAuditLog({ userId, action, entityType, entityId, metadata, req } = {}, db = prisma) {
  const actorId = userId !== undefined ? userId : (req && req.user ? req.user.id : null);
  return db.auditLog.create({
    data: {
      userId: actorId ?? null,
      action,
      entityType,
      entityId: entityId === undefined || entityId === null ? null : String(entityId),
      metadata: metadata ?? undefined,
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),
    },
  });
}

/** Coordinator-only listing (enforced in the route). Read-only. */
async function listAuditLogs({ page, pageSize, action, entityType, entityId, userId }) {
  const where = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = String(entityId);
  if (userId) where.userId = userId;

  const { skip, take, meta } = paginate({ page, pageSize });
  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, role: true } } },
    }),
  ]);
  return { items: rows, pagination: meta(total) };
}

module.exports = { createAuditLog, listAuditLogs };
