const {
  z,
  id,
  trimmed,
  optionalText,
  nonZeroDelta,
  boolFromQuery,
  pagination,
  TRACKING_MODE,
  CONDITION_STATUS,
} = require('./common.schema');

// ---------- Items ----------
const createItemSchema = z
  .object({
    itemCode: trimmed(50).regex(/^[A-Za-z0-9\-_]+$/, 'Item code may contain letters, digits, - and _').transform((s) => s.toUpperCase()),
    name: trimmed(150),
    category: trimmed(80),
    description: optionalText(2000),
    makeModel: optionalText(150),
    trackingMode: TRACKING_MODE,
    // QUANTITY items: initial stock. INDIVIDUAL items: derived from assets (send 0 / omit).
    totalQuantity: z.coerce.number().int().min(0).max(100000).default(0),
    locationId: id.optional().nullable(),
  })
  .strict();

// trackingMode and quantities are NOT editable here (use stock adjustment / assets).
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
    trackingMode: TRACKING_MODE.optional(),
    active: boolFromQuery.optional(),
    available: boolFromQuery.optional(),
    locationId: id.optional(),
  })
  .strict();

const stockAdjustmentSchema = z
  .object({
    quantityDelta: nonZeroDelta,
    reason: trimmed(500, 3),
  })
  .strict();

// ---------- Assets ----------
const createAssetSchema = z
  .object({
    itemId: id,
    assetTag: trimmed(60).regex(/^[A-Za-z0-9\-_]+$/, 'Asset tag may contain letters, digits, - and _').transform((s) => s.toUpperCase()),
    serialNumber: optionalText(120),
    locationId: id.optional().nullable(),
    conditionStatus: CONDITION_STATUS.default('USABLE'),
  })
  .strict();

// isIssued is never client-editable (only the issue/return workflow changes it).
const updateAssetSchema = z
  .object({
    serialNumber: optionalText(120),
    locationId: id.optional().nullable(),
    conditionStatus: CONDITION_STATUS.optional(),
    active: z.boolean().optional(),
    reason: optionalText(500),
  })
  .strict()
  .refine((o) => Object.keys(o).filter((k) => k !== 'reason').length > 0, 'At least one field is required');

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
  createAssetSchema,
  updateAssetSchema,
  listAssetsQuery,
  createLocationSchema,
};
