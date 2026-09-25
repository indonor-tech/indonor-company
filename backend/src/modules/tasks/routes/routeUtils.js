import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import { AppError } from '../../../utils/errors.js';

export const objectId = Joi.string().hex().length(24);
export const optionalObjectId = objectId.allow('', null);
export const dateKeySchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

const perUser = (req) => String(req.user?._id || req.ip);
const limiterDefaults = { standardHeaders: true, legacyHeaders: false, keyGenerator: perUser, validate: { xForwardedForHeader: false, trustProxy: false } };

export const writeLimiter = rateLimit({ ...limiterDefaults, windowMs: 60 * 1000, limit: 120, message: { success: false, message: 'Too many changes in a short time. Please wait a moment.', errors: [] } });
export const uploadLimiter = rateLimit({ ...limiterDefaults, windowMs: 10 * 60 * 1000, limit: 40, message: { success: false, message: 'Too many uploads. Please wait a few minutes.', errors: [] } });
export const exportLimiter = rateLimit({ ...limiterDefaults, windowMs: 10 * 60 * 1000, limit: 30, message: { success: false, message: 'Too many exports. Please wait a few minutes.', errors: [] } });

/** Multipart forms send arrays/objects as JSON strings; JSON bodies pass through untouched. */
export function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new AppError('Malformed JSON field in form data.', 422);
    }
  }
  return fallback === undefined ? value : trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

export function validateValue(schema, value) {
  const { error, value: result } = schema.validate(value, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError('Validation failed', 422, error.details.map((item) => ({ field: item.path.join('.'), message: item.message })));
  return result;
}

export const methodNotAllowed = (message) => (_req, _res, next) => next(new AppError(message, 405));

export function contentDisposition(fileName, inline = false) {
  const safe = String(fileName || 'file').replace(/[\r\n"]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
