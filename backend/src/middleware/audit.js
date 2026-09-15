import { AuditLog } from '../modules/common/support.model.js';

export function audit(action, entityType) {
  return async (req, _res, next) => {
    resAudit(req, action, entityType).catch(next);
    next();
  };
}

async function resAudit(req, action, entityType) {
  await AuditLog.create({
    actor: req.user?._id, action, entityType, entityId: req.params.id,
    ipAddress: req.ip, userAgent: req.get('user-agent'),
    changes: ['password', 'passwordHash', 'salary'].some((key) => key in (req.body || {})) ? { changed: true } : req.body
  });
}
