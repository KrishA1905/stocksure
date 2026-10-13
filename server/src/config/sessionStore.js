const session = require('express-session');
const prisma = require('./prisma');

/**
 * Minimal express-session store backed by the Prisma `Session` model (MySQL).
 * Sessions survive server restarts and expired rows are pruned periodically.
 */
class PrismaSessionStore extends session.Store {
  constructor({ defaultMaxAgeMs, pruneIntervalMs = 15 * 60 * 1000 } = {}) {
    super();
    this.defaultMaxAgeMs = defaultMaxAgeMs;
    if (pruneIntervalMs > 0) {
      this.pruneTimer = setInterval(() => this.prune().catch(() => {}), pruneIntervalMs);
      this.pruneTimer.unref();
    }
  }

  expiryFor(sess) {
    if (sess && sess.cookie && sess.cookie.expires) return new Date(sess.cookie.expires);
    return new Date(Date.now() + this.defaultMaxAgeMs);
  }

  get(sid, cb) {
    prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        if (!row) return cb(null, null);
        if (row.expiresAt.getTime() <= Date.now()) {
          return this.destroy(sid, () => cb(null, null));
        }
        return cb(null, JSON.parse(row.data));
      })
      .catch((err) => cb(err));
  }

  set(sid, sess, cb = () => {}) {
    const data = JSON.stringify(sess);
    const expiresAt = this.expiryFor(sess);
    prisma.session
      .upsert({ where: { sid }, create: { sid, data, expiresAt }, update: { data, expiresAt } })
      .then(() => cb(null))
      .catch((err) => cb(err));
  }

  touch(sid, sess, cb = () => {}) {
    prisma.session
      .updateMany({ where: { sid }, data: { expiresAt: this.expiryFor(sess) } })
      .then(() => cb(null))
      .catch((err) => cb(err));
  }

  destroy(sid, cb = () => {}) {
    prisma.session
      .deleteMany({ where: { sid } })
      .then(() => cb(null))
      .catch((err) => cb(err));
  }

  prune() {
    return prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  }

  close() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
  }
}

module.exports = PrismaSessionStore;
