import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
import Joi from 'joi';
import User from './user.model.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AuditLog, LoginHistory } from '../common/support.model.js';
import { publicUser, normalizeRole } from './roles.js';

const router = express.Router();
const credentials = Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(8).required() });
const accessToken = (user) => jwt.sign({ sub: user._id.toString(), role: user.role }, env.accessSecret, { expiresIn: env.accessExpiresIn });

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, { httpOnly: true, secure: env.cookieSecure, sameSite: env.cookieSecure ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
}

router.post('/login', validate(credentials), asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  if (!user || !user.isActive || !(await user.verifyPassword(req.body.password))) throw new AppError('Invalid email or password', 401);
  const refresh = jwt.sign({ sub: user._id.toString(), type: 'refresh' }, env.refreshSecret, { expiresIn: env.refreshExpiresIn });
  user.refreshTokenHash = crypto.createHash('sha256').update(refresh).digest('hex');
  user.lastLoginAt = new Date();
  await user.save();
  setRefreshCookie(res, refresh);
  try {
    await LoginHistory.create({ user: user._id, action: 'LOGIN', ipAddress: req.ip, userAgent: req.get('user-agent') });
    await AuditLog.create({ actor: user._id, action: 'LOGIN', entityType: 'User', entityId: user._id, ipAddress: req.ip, userAgent: req.get('user-agent') });
  } catch (error) {
    process.stderr.write(`Login audit failed: ${error.message}\n`);
  }
  return sendSuccess(res, { user: publicUser(user), accessToken: accessToken(user) }, 'Login successful');
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken || req.body.refreshToken;
  if (!token) throw new AppError('Refresh token required', 401);
  const payload = jwt.verify(token, env.refreshSecret);
  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  if (!user || !user.isActive || user.refreshTokenHash !== hash) throw new AppError('Refresh token has been revoked', 401);
  const nextRefresh = jwt.sign({ sub: user._id.toString(), type: 'refresh' }, env.refreshSecret, { expiresIn: env.refreshExpiresIn });
  user.refreshTokenHash = crypto.createHash('sha256').update(nextRefresh).digest('hex');
  await user.save();
  setRefreshCookie(res, nextRefresh);
  return sendSuccess(res, { user: publicUser(user), accessToken: accessToken(user) }, 'Token refreshed');
}));

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshTokenHash: 1 } });
  await LoginHistory.create({ user: req.user._id, action: 'LOGOUT', ipAddress: req.ip, userAgent: req.get('user-agent') });
  await AuditLog.create({ actor: req.user._id, action: 'LOGOUT', entityType: 'User', entityId: req.user._id, ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.clearCookie('refreshToken');
  return sendSuccess(res, null, 'Logout successful');
}));

router.get('/me', authenticate, (req, res) => sendSuccess(res, publicUser(req.user), 'Current user'));
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase();
  const user = await User.findOne({ email });
  if (user) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    if (env.nodeEnv !== 'production') res.set('X-Development-Reset-Token', resetToken);
  }
  return sendSuccess(res, null, 'If that email exists, reset instructions have been sent');
}));
router.post('/reset-password', asyncHandler(async (req, res) => {
  const schema = Joi.object({ token: Joi.string().required(), newPassword: Joi.string().min(8).required() });
  const { error, value } = schema.validate(req.body);
  if (error) throw new AppError('Validation failed', 422, error.details);
  const hash = crypto.createHash('sha256').update(value.token).digest('hex');
  const user = await User.findOne({ resetTokenHash: hash, resetTokenExpiresAt: { $gt: new Date() } }).select('+passwordHash');
  if (!user) throw new AppError('Reset token is invalid or expired', 400);
  user.passwordHash = await User.hashPassword(value.newPassword); user.resetTokenHash = undefined; user.resetTokenExpiresAt = undefined; user.refreshTokenHash = undefined;
  await user.save();
  return sendSuccess(res, null, 'Password reset successfully');
}));
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const role = normalizeRole(req.user.role);
  if (role === 'EMPLOYEE' || role === 'MANAGER') {
    throw new AppError('Ask an Admin to update your password. You cannot change your CRM password or role.', 403);
  }
  const schema = Joi.object({ currentPassword: Joi.string().required(), newPassword: Joi.string().min(8).max(72).required() });
  const { error, value } = schema.validate(req.body);
  if (error) throw new AppError('Validation failed', 422, error.details);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || !user.isActive) throw new AppError('Account is inactive or unavailable', 401);
  if (!(await user.verifyPassword(value.currentPassword))) throw new AppError('Current password is incorrect', 400);
  if (value.currentPassword === value.newPassword) throw new AppError('Choose a new password that is different from the current one.', 422);
  const refresh = jwt.sign({ sub: user._id.toString(), type: 'refresh' }, env.refreshSecret, { expiresIn: env.refreshExpiresIn });
  user.passwordHash = await User.hashPassword(value.newPassword);
  user.refreshTokenHash = crypto.createHash('sha256').update(refresh).digest('hex');
  await user.save();
  setRefreshCookie(res, refresh);
  return sendSuccess(res, null, 'Password changed successfully');
}));

export default router;
