const {
  z,
  id,
  trimmed,
  optionalText,
  nonZeroDelta,
  positiveQty,
  boolFromQuery,
  pagination,
  withAliases,
  TRACKING_MODE,
  CONDITION_STATUS,
} = require('./common.schema');

// Person 2 used ASSET for individually tracked items.
const trackingModeInput = z.preprocess((v) => (v === 'ASSET' ? 'INDIVIDUAL' : v), TRACKING_MODE);

const assetTag = trimmed(60)
  .regex(/^[A-Za-z0-9\-_]+$/, 'Asset tag may contain letters, digits, - and _')
  .transform((s) => s.toUpperCase());

// ---------- Items ----------
const newAssetSchema = withAliases(
  z
    .object({
      assetTag,
      serialNumber: optionalText(120),
      conditionStatus: CONDITION_STATUS.exclude(['RETIRED']).default('USABLE'),
    })
    .strict(),
  { tag: 'assetTag', condition: 'conditionStatus' }
);

const createItemSchema = z
  .object({
    // Optional: generated from the name when omitted (Person 2's samples have no code).
    itemCode: trimmed(50)
      .regex(/^[A-Za-z0-9\-_]+$/, 'Item code may contain letters, digits, - and _')
      .transform((s) => s.toUpperCase())
      .optional(),
    name: trimmed(150),
    category: trimmed(80),
    description: optionalText(2000),
    makeModel: optionalText(150),
    trackingMode: trackingModeInput,
    // QUANTITY items: initial stock. INDIVIDUAL items: derived from assets.
    totalQuantity: z.coerce.number().int().min(0).max(100000).default(0),
    locationId: id.optional().nullable(),
    // INDIVIDUAL items may be created together with their assets.
    assets: z.array(newAssetSchema).max(500).optional(),
  })
  .strict()
  .superRefine((o, ctx) => {
    if (o.trackingMode === 'QUANTITY' && o.assets && o.assets.length) {
      ctx.addIssue({ code: 'custom', path: ['assets'], message: 'Quantity-tracked items do not have individual assets' });
    }
    if (o.trackingMode === 'INDIVIDUAL' && o.totalQuantity > 0) {
      ctx.addIssue({ code: 'custom', path: ['totalQuantity'], message: 'Individually tracked items get their quantity from assets - send `assets` instead' });
    }
    if (o.assets) {
      const tags = o.assets.map((a) => a.assetTag);
      if (new Set(tags).size !== tags.length) ctx.addIssue({ code: 'custom', path: ['assets'], message: 'Duplicate asset tags' });
    }
  });

// trackingMode and quantities are NOT editable here (use adjust / restore / assets).
const updateItemSchema = z
  .object({
    name: trimmed(150).optional(),
    category: trimmed(80).optional(),
    description: optionalText(2000),
    makeModel: optionalText(150),
    locationId: id.optional().nullable(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');

const listItemsQuery = pagination
  .extend({
    search: z.string().trim().max(100).optional(),
    category: z.string().trim().max(80).optional(),
    trackingMode: trackingModeInput.optional(),
    active: boolFromQuery.optional(),
    available: boolFromQuery.optional(),
    locationId: id.optional(),
  })
  .strict();

/**
 * Stock adjustment (QUANTITY items).
 *  +n  new stock arrives (goes to available)
 *  -n  write-off / count correction, taken from `pool` (default AVAILABLE)
 */
const stockAdjustmentSchema = z
  .object({
    quantityDelta: nonZeroDelta,
    reason: trimmed(500, 3),
    pool: z.enum(['AVAILABLE', 'UNAVAILABLE']).default('AVAILABLE'),
  })
  .strict()
  .refine((o) => !(o.quantityDelta > 0 && o.pool === 'UNAVAILABLE'), {
    message: 'New stock always goes to the available pool',
    path: ['pool'],
  });

/** Move repaired units (QUANTITY items) from unavailable back to available. */
const restoreStockSchema = z
  .object({
    quantity: positiveQty,
    reason: trimmed(500, 3),
  })
  .strict();

// ---------- Assets ----------
const createAssetSchema = withAliases(
  z
    .object({
      itemId: id,
      assetTag,
      serialNumber: optionalText(120),
      locationId: id.optional().nullable(),
      conditionStatus: CONDITION_STATUS.exclude(['RETIRED']).default('USABLE'),
    })
    .strict(),
  { tag: 'assetTag', condition: 'conditionStatus' }
);

// isIssued is never client-editable (only the issue/return workflow changes it).
const updateAssetSchema = withAliases(
  z
    .object({
      serialNumber: optionalText(120),
      locationId: id.optional().nullable(),
      conditionStatus: CONDITION_STATUS.optional(),
      active: z.boolean().optional(),
      reason: optionalText(500),
    })
    .strict()
    .refine((o) => Object.keys(o).filter((k) => k !== 'reason').length > 0, 'At least one field is required'),
  { condition: 'conditionStatus' }
);

const listAssetsQuery = pagination
  .extend({
    itemId: id.optional(),
    conditionStatus: CONDITION_STATUS.optional(),
    available: boolFromQuery.optional(),
    active: boolFromQuery.optional(),
    locationId: id.optional(),
    search: z.string().trim().max(100).optional(),
  })
  .strict();

// ---------- Locations ----------
const createLocationSchema = z
  .object({
    department: trimmed(120),
    laboratory: trimmed(120),
    room: trimmed(60),
    storageUnit: trimmed(120),
  })
  .strict();

module.exports = {
  createItemSchema,
  updateItemSchema,
  listItemsQuery,
  stockAdjustmentSchema,
  restoreStockSchema,
  createAssetSchema,
  updateAssetSchema,
  listAssetsQuery,
  createLocationSchema,
};
