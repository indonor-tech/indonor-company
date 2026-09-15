import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import { env } from '../../config/env.js';
import { normalizeRole } from '../auth/roles.js';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  googleAuthUrl,
  googleCalendarStatus,
  verifyGoogleState
} from '../../services/googleCalendar.service.js';

const router = express.Router();

function requireAdmin(req, _res, next) {
  const role = normalizeRole(req.user.role);
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return next();
  return next(new AppError('Only Super Admin or Admin can connect Google Calendar.', 403));
}

router.get('/status', authenticate, requireAdmin, asyncHandler(async (_req, res) => {
  return sendSuccess(res, await googleCalendarStatus(), 'Google Calendar status fetched');
}));

router.get('/connect', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  return sendSuccess(res, { url: googleAuthUrl(req.user._id) }, 'Google Calendar connect URL created');
}));

router.delete('/', authenticate, requireAdmin, asyncHandler(async (_req, res) => {
  await disconnectGoogleCalendar();
  return sendSuccess(res, await googleCalendarStatus(), 'Google Calendar disconnected');
}));

router.get('/callback', asyncHandler(async (req, res) => {
  const settings = `${env.activeAdminUrl}/settings`;
  try {
    if (req.query.error) throw new AppError(String(req.query.error), 400);
    verifyGoogleState(req.query.state);
    await connectGoogleCalendar(req.query.code);
    return res.redirect(`${settings}?google=connected`);
  } catch {
    return res.redirect(`${settings}?google=error`);
  }
}));

export default router;
