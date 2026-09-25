import mongoose from 'mongoose';
import { clientIp } from '../../analytics/parse-user-agent.js';
import { AppError } from '../../../utils/errors.js';

/** Builds the actor context for services. Time always comes from the server clock. */
export function requestContext(req) {
  return {
    user: req.user,
    ipAddress: clientIp(req),
    userAgent: String(req.get?.('user-agent') || '').slice(0, 500),
    now: new Date()
  };
}

export function systemContext(now = new Date()) {
  return { user: null, ipAddress: '', userAgent: 'system', now, system: true };
}

export const idOf = (value) => (value ? String(value._id || value) : '');

export function sameId(a, b) {
  return Boolean(a && b && idOf(a) === idOf(b));
}

export function assertObjectId(value, label = 'id') {
  if (!mongoose.isValidObjectId(value) || String(value).length !== 24) throw new AppError(`Invalid ${label}`, 422);
  return String(value);
}

export function uniqueIds(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => idOf(value)))];
}

export class LockedError extends AppError {
  constructor(message = 'This working date is locked. Submit a correction request to change historical records.') {
    super(message, 423);
    this.code = 'DATE_LOCKED';
  }
}
