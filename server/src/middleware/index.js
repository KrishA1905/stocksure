// Convenience barrel for Person 2:
//   const { requireCoordinator, validate, runInTransaction, createAuditLog, ... } = require('../middleware');
module.exports = {
  ...require('./auth'),
  ...require('./validate'),
  ...require('./csrf'),
  ...require('./errorHandler'),
};
