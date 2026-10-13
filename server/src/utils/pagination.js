/** Converts validated { page, pageSize } into Prisma skip/take + a meta builder. */
function paginate({ page = 1, pageSize = 20 } = {}) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
    meta: (total) => ({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }),
  };
}

module.exports = { paginate };
