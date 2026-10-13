const ApiError = require('../utils/apiError');

function formatZodIssues(error, location) {
  return error.issues.map((issue) => ({
    field: [location, ...issue.path].join('.'),
    message: issue.message,
  }));
}

/**
 * validate({ body, query, params }) - each value is a Zod schema.
 * On success the parsed (coerced, stripped) values replace req.body /
 * req.validatedQuery / req.params. On failure -> 422 with field errors.
 *
 *   router.post('/', requireCoordinator(), validate({ body: createItemSchema }), handler)
 */
function validate(schemas) {
  return function validateMiddleware(req, res, next) {
    const errors = [];
    for (const location of ['params', 'query', 'body']) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location] ?? {});
      if (!result.success) {
        errors.push(...formatZodIssues(result.error, location));
      } else if (location === 'query') {
        // req.query is a getter in Express 5; keep parsed copy separately.
        req.validatedQuery = result.data;
      } else {
        req[location] = result.data;
      }
    }
    if (errors.length) return next(ApiError.validation('Validation failed', errors));
    return next();
  };
}

module.exports = { validate };
