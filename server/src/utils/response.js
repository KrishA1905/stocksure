/**
 * Standard success response:
 * { "success": true, "message": "...", "data": {...} }
 */
function sendSuccess(res, data = null, message = 'Operation successful', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

function sendCreated(res, data = null, message = 'Created successfully') {
  return sendSuccess(res, data, message, 201);
}

/**
 * Standard error response:
 * { "success": false, "message": "...", "data": null }
 * 422 responses additionally carry `errors: [{ field, message }]`.
 */
function sendError(res, statusCode, message, errors) {
  const body = { success: false, message, data: null };
  if (errors && errors.length) body.errors = errors;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess, sendCreated, sendError };
