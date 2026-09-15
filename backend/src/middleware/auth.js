import jwt from 'jsonwebtoken';
import User from '../modules/auth/user.model.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { hasPermission, hasTabAccess } from '../modules/auth/roles.js';

export function isOwnEmployee(user, employeeId) {
  return Boolean(user?.employeeId && employeeId && String(user.employeeId) === String(employeeId));
}

export async function authenticate(req, _res, next) {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    if (!token) throw new AppError('Authentication required', 401);
    const payload = jwt.verify(token, env.accessSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) throw new AppError('Account is inactive or unavailable', 401);
    req.user = user;
    next();
  } catch (error) {
    next(error instanceof jwt.JsonWebTokenError ? new AppError('Invalid or expired token', 401) : error);
  }
}

export const authorize = (...permissions) => (req, _res, next) => {
  if (!permissions.length) return next();
  if (permissions.some((permission) => hasPermission(req.user, permission))) return next();
  return next(new AppError('You do not have permission for this action', 403));
};

export const authorizeOwnOr = (...permissions) => (req, _res, next) => {
  if (permissions.some((permission) => hasPermission(req.user, permission))) return next();
  const employeeId = req.params.id || req.params.employeeId || req.params.ownerId;
  if (isOwnEmployee(req.user, employeeId)) return next();
  return next(new AppError('You do not have permission for this action', 403));
};

export const authorizeOwnTab = (tab, level, fallbackPermissions = []) => (req, _res, next) => {
  if (fallbackPermissions.some((permission) => hasPermission(req.user, permission))) return next();
  const employeeId = req.params.id || req.params.employeeId || req.params.ownerId;
  if (isOwnEmployee(req.user, employeeId) && hasTabAccess(req.user, tab, level)) return next();
  return next(new AppError('You do not have permission for this action', 403));
};
