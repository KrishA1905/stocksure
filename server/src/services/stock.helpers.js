/**
 * Stock model + row locking (Person 2 logic, adapted to the shared schema).
 *
 * Invariant for every item:
 *   totalQuantity = availableQuantity + unavailableQuantity + (units out on loan)
 *
 * QUANTITY items: the counters are moved by issue / return / adjustment /
 *   restore inside a transaction, after the item row is locked.
 * INDIVIDUAL items: the counters are recomputed from the asset rows
 *   (syncIndividualCounts), so they can never drift from real asset state:
 *     total       = active assets that are not RETIRED
 *     available   = active + USABLE + not issued
 *     unavailable = active, not RETIRED, not USABLE, not issued
 */

const ISSUABLE_ASSET = { active: true, conditionStatus: 'USABLE', isIssued: false };

// Physical table names (see @@map in schema.prisma). Whitelisted - never user input.
const TABLES = Object.freeze({
  item: 'items',
  asset: 'assets',
  issue: 'issues',
  issueLine: 'issue_lines',
  renewal: 'renewals',
});

/**
 * SELECT ... FOR UPDATE on rows, always in ascending id order so two
 * transactions locking overlapping sets can never deadlock each other.
 * Concurrent issue/return/renewal requests on the same rows queue up here.
 */
async function lockRows(tx, model, ids) {
  const table = TABLES[model];
  if (!table) throw new Error(`lockRows: unknown model ${model}`);
  const sorted = [...new Set(ids.map(Number))].filter(Number.isInteger).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const placeholders = sorted.map(() => '?').join(',');
  return tx.$queryRawUnsafe(`SELECT id FROM \`${table}\` WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`, ...sorted);
}

async function syncIndividualCounts(tx, itemId) {
  const notRetired = { active: true, conditionStatus: { not: 'RETIRED' } };
  const [total, available, unavailable] = await Promise.all([
    tx.asset.count({ where: { itemId, ...notRetired } }),
    tx.asset.count({ where: { itemId, ...ISSUABLE_ASSET } }),
    tx.asset.count({ where: { itemId, active: true, isIssued: false, conditionStatus: { notIn: ['USABLE', 'RETIRED'] } } }),
  ]);
  await tx.item.update({
    where: { id: itemId },
    data: { totalQuantity: total, availableQuantity: available, unavailableQuantity: unavailable },
  });
  return { total, available, unavailable };
}

function isAssetAvailable(asset) {
  return Boolean(asset.active && asset.conditionStatus === 'USABLE' && !asset.isIssued);
}

/** Person 2's asset status vocabulary, derived from the shared schema. */
function assetStatus(asset) {
  if (asset.isIssued) return 'ISSUED';
  return isAssetAvailable(asset) ? 'AVAILABLE' : 'UNAVAILABLE';
}

module.exports = { ISSUABLE_ASSET, TABLES, lockRows, syncIndividualCounts, isAssetAvailable, assetStatus };
