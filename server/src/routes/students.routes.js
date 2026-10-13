const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const { sendSuccess, sendCreated } = require('../utils/response');
const { paginate } = require('../utils/pagination');
const { validate } = require('../middleware/validate');
const { requireCoordinator, requireStudent } = require('../middleware/auth');
const { idParam } = require('../schemas/common.schema');
const { createStudentSchema, updateStudentSchema, listStudentsQuery } = require('../schemas/student.schema');
const { getStudentFromUser } = require('../services/auth.service');

const router = express.Router();

const STUDENT_SELECT = {
  id: true,
  name: true,
  enrollmentNo: true,
  programme: true,
  semester: true,
  contactDetails: true,
  createdAt: true,
  user: { select: { id: true, email: true, active: true } },
};

/** GET /api/students/me (student) - own profile. */
router.get(
  '/me',
  requireStudent(),
  asyncHandler(async (req, res) => {
    const student = await getStudentFromUser(req.user);
    const full = await prisma.student.findUnique({ where: { id: student.id }, select: STUDENT_SELECT });
    return sendSuccess(res, full, 'Student profile');
  })
);

/** GET /api/students (coordinator) - list/search registered students (issue form picker). */
router.get(
  '/',
  requireCoordinator(),
  validate({ query: listStudentsQuery }),
  asyncHandler(async (req, res) => {
    const { search, page, pageSize } = req.validatedQuery;
    const where = search
      ? {
          OR: [
            { name: { contains: search } },
            { enrollmentNo: { contains: search } },
            { user: { email: { contains: search } } },
          ],
        }
      : {};
    const { skip, take, meta } = paginate({ page, pageSize });
    const [total, items] = await prisma.$transaction([
      prisma.student.count({ where }),
      prisma.student.findMany({ where, skip, take, orderBy: { enrollmentNo: 'asc' }, select: STUDENT_SELECT }),
    ]);
    return sendSuccess(res, { items, pagination: meta(total) }, 'Students');
  })
);

/** GET /api/students/:id (coordinator). */
router.get(
  '/:id',
  requireCoordinator(),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.id }, select: STUDENT_SELECT });
    if (!student) throw ApiError.notFound('Student not found');
    return sendSuccess(res, student, 'Student');
  })
);

/** POST /api/students (coordinator) - register a student (creates User with role STUDENT). */
router.post(
  '/',
  requireCoordinator(),
  validate({ body: createStudentSchema }),
  asyncHandler(async (req, res) => {
    const { email, password, ...profile } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash, role: 'STUDENT' } });
      return tx.student.create({ data: { ...profile, userId: user.id }, select: STUDENT_SELECT });
    });
    return sendCreated(res, student, 'Student registered');
  })
);

/** PATCH /api/students/:id (coordinator) - profile fields only (never role/user). */
router.patch(
  '/:id',
  requireCoordinator(),
  validate({ params: idParam, body: updateStudentSchema }),
  asyncHandler(async (req, res) => {
    const student = await prisma.student.update({ where: { id: req.params.id }, data: req.body, select: STUDENT_SELECT });
    return sendSuccess(res, student, 'Student updated');
  })
);

module.exports = router;
