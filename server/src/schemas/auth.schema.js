const { z } = require('./common.schema');

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email address').max(191),
    password: z.string().min(1, 'Password is required').max(128),
  })
  .strict();

module.exports = { loginSchema };
