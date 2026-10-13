const { z, trimmed, optionalText, pagination } = require('./common.schema');

const createStudentSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email address').max(191),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .regex(/[A-Z]/, 'Password needs an uppercase letter')
      .regex(/[a-z]/, 'Password needs a lowercase letter')
      .regex(/[0-9]/, 'Password needs a digit'),
    name: trimmed(120),
    enrollmentNo: trimmed(50).regex(/^[A-Za-z0-9\-/]+$/, 'Enrollment number may contain letters, digits, - and /'),
    programme: trimmed(120),
    semester: z.coerce.number().int().min(1).max(12),
    contactDetails: optionalText(255),
  })
  .strict();

const updateStudentSchema = createStudentSchema
  .omit({ email: true, password: true, enrollmentNo: true })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');

const listStudentsQuery = pagination
  .extend({ search: z.string().trim().max(100).optional() })
  .strict();

module.exports = { createStudentSchema, updateStudentSchema, listStudentsQuery };
