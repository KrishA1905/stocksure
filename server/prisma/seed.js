/* Idempotent demo seed for StockSure. Safe to run repeatedly:
 * - users/students/items/assets are upserted by their unique keys
 * - existing rows are NOT overwritten (so issued stock is never reset)
 * - INITIAL stock movements are only written when an item is first created
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const COORDINATOR = { email: 'coordinator@stocksure.local', password: 'C0rdin4t0r#5879' };
const STUDENTS = [
  {
    email: 'student1@stocksure.local',
    password: 'Student@123',
    name: 'Student One',
    enrollmentNo: 'DFIS2026-001',
    programme: 'M.Sc. DFIS',
    semester: 1,
    contactDetails: '+91-90000-00001',
  },
  {
    email: 'student2@stocksure.local',
    password: 'Student@123',
    name: 'Student Two',
    enrollmentNo: 'DFIS2026-002',
    programme: 'M.Sc. DFIS',
    semester: 1,
    contactDetails: '+91-90000-00002',
  },
];
const LOCATION = {
  department: 'DFIS',
  laboratory: 'Development Lab',
  room: 'Lab-01',
  storageUnit: 'Equipment Cupboard A',
};
const BOARD_COUNT = 10;
const CABLE_COUNT = 20;

async function upsertUser(email, password, role) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Keep demo passwords in sync if they were changed in this file.
    if (await bcrypt.compare(password, existing.passwordHash)) return existing;
    return prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  }
  return prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 10), role } });
}

async function main() {
  const coordinator = await upsertUser(COORDINATOR.email, COORDINATOR.password, 'COORDINATOR');

  for (const s of STUDENTS) {
    const user = await upsertUser(s.email, s.password, 'STUDENT');
    await prisma.student.upsert({
      where: { enrollmentNo: s.enrollmentNo },
      update: {},
      create: {
        userId: user.id,
        name: s.name,
        enrollmentNo: s.enrollmentNo,
        programme: s.programme,
        semester: s.semester,
        contactDetails: s.contactDetails,
      },
    });
  }

  const location = await prisma.location.upsert({
    where: { department_laboratory_room_storageUnit: LOCATION },
    update: {},
    create: LOCATION,
  });

  // --- Development boards: INDIVIDUAL, 10 assets DB-001..DB-010 ---
  let boards = await prisma.item.findUnique({ where: { itemCode: 'DB-DEV' } });
  if (!boards) {
    boards = await prisma.item.create({
      data: {
        itemCode: 'DB-DEV',
        name: 'Development Board',
        category: 'Electronics',
        description: 'Microcontroller development board (individually tracked)',
        makeModel: 'Generic Dev Board v2',
        trackingMode: 'INDIVIDUAL',
        totalQuantity: BOARD_COUNT,
        availableQuantity: BOARD_COUNT,
        locationId: location.id,
      },
    });
    await prisma.stockMovement.create({
      data: { itemId: boards.id, movementType: 'INITIAL', quantityDelta: BOARD_COUNT, reason: 'Seed data', createdById: coordinator.id },
    });
  }
  for (let i = 1; i <= BOARD_COUNT; i += 1) {
    const assetTag = `DB-${String(i).padStart(3, '0')}`;
    await prisma.asset.upsert({
      where: { assetTag },
      update: {},
      create: {
        itemId: boards.id,
        assetTag,
        serialNumber: `SN-DB-2026-${String(i).padStart(4, '0')}`,
        locationId: location.id,
        conditionStatus: 'USABLE',
      },
    });
  }

  // --- USB cables: QUANTITY, 20 ---
  const cables = await prisma.item.findUnique({ where: { itemCode: 'USB-CABLE' } });
  if (!cables) {
    const created = await prisma.item.create({
      data: {
        itemCode: 'USB-CABLE',
        name: 'USB Cable',
        category: 'Accessories',
        description: 'USB-A to USB-C cable (quantity tracked)',
        makeModel: 'Generic 1m',
        trackingMode: 'QUANTITY',
        totalQuantity: CABLE_COUNT,
        availableQuantity: CABLE_COUNT,
        locationId: location.id,
      },
    });
    await prisma.stockMovement.create({
      data: { itemId: created.id, movementType: 'INITIAL', quantityDelta: CABLE_COUNT, reason: 'Seed data', createdById: coordinator.id },
    });
  }

  const summary = {
    users: await prisma.user.count(),
    students: await prisma.student.count(),
    locations: await prisma.location.count(),
    items: await prisma.item.count(),
    assets: await prisma.asset.count(),
  };
  console.log('Seed complete:', summary);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
