const { sendError } = require('../utils/response');

/**
 * Placeholder handler for Person 2 endpoints. The auth/RBAC/validation
 * middleware in front of it is already final - Person 2 replaces ONLY this
 * handler with the real service call.
 */
module.exports = function notImplemented(name) {
  return (req, res) => sendError(res, 501, `${name} is not implemented yet (Person 2)`);
};
