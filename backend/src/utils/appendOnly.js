const MUTATING_QUERY_HOOKS = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
  'replaceOne', 'deleteOne', 'deleteMany'
];

export class AppendOnlyViolation extends Error {
  constructor(modelName) {
    super(`${modelName} records are append-only and cannot be modified or deleted.`);
    this.statusCode = 405;
    this.isOperational = true;
  }
}

export function appendOnlyPlugin(schema, { modelName = 'Audit' } = {}) {
  schema.pre('save', function blockResave(next) {
    if (!this.isNew) return next(new AppendOnlyViolation(modelName));
    return next();
  });
  for (const hook of MUTATING_QUERY_HOOKS) {
    schema.pre(hook, { document: false, query: true }, function blockQuery(next) {
      next(new AppendOnlyViolation(modelName));
    });
  }
  schema.pre('deleteOne', { document: true, query: false }, function blockDocumentDelete(next) {
    next(new AppendOnlyViolation(modelName));
  });
  schema.pre('bulkWrite', function blockBulk(next) {
    next(new AppendOnlyViolation(modelName));
  });
}
