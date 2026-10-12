import { AppError } from '../../../utils/errors.js';
import { normalizeRole } from '../../auth/roles.js';
import { ViewAdminPagePermission } from '../crm.models.js';
import { canAccessFinancial, isFinancialPage, isViewAdmin } from '../crm.helpers.js';
import { CRM_PAGE_KEYS } from '../constants.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Reject all mutating methods for VIEW_ADMIN. */
export function rejectViewAdminMutations(req, _res, next) {
  if (isViewAdmin(req.user) && MUTATING.has(req.method)) {
    return next(new AppError('VIEW_ADMIN accounts are read-only', 403));
  }
  return next();
}

/** Require Super Admin for financial data routes. */
export function requireSuperAdminFinance(req, _res, next) {
  if (!canAccessFinancial(req.user)) {
    return next(new AppError('Financial information is restricted to Super Admin', 403));
  }
  return next();
}

/**
 * Page-level access for VIEW_ADMIN. Other roles pass through (existing RBAC applies).
 * Financial pages stay Super Admin only unless separately authorized later.
 */
const PAGE_ALIASES = {
  leads: ['leads', 'sales_pipeline'],
  sales_pipeline: ['sales_pipeline', 'leads']
};

export function requireCrmPage(pageKey) {
  return async (req, _res, next) => {
    try {
      if (!CRM_PAGE_KEYS.includes(pageKey)) {
        return next(new AppError('Unknown CRM page', 500));
      }
      const role = normalizeRole(req.user?.role);
      if (role === 'SUPER_ADMIN' || role === 'ADMIN') return next();
      if (isFinancialPage(pageKey) && !canAccessFinancial(req.user)) {
        return next(new AppError('Financial information is restricted to Super Admin', 403));
      }
      if (!isViewAdmin(req.user)) return next();
      const keys = PAGE_ALIASES[pageKey] || [pageKey];
      const access = req.user.pageAccess || {};
      if (keys.some((key) => access[key])) return next();
      const grant = await ViewAdminPagePermission.findOne({
        userId: req.user._id,
        pageKey: { $in: keys },
        canView: true
      }).lean();
      if (!grant) return next(new AppError('You do not have access to this page', 403));
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export async function getViewAdminPages(userId) {
  const rows = await ViewAdminPagePermission.find({ userId, canView: true }).lean();
  return rows.map((row) => row.pageKey);
}
