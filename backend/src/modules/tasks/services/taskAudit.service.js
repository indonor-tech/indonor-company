import mongoose from 'mongoose';
import { TaskAuditLog } from '../task.models.js';
import { parseUserAgent } from '../../analytics/parse-user-agent.js';
import { dateKeyInZone, getTaskSettings } from './workCalendar.service.js';

const MAX_STRING = 20000;

function plain(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    if (value._id && Object.keys(value).length === 1) return String(value._id);
    if (typeof value.toObject === 'function') return plain(value.toObject());
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['__v', 'passwordHash'].includes(key)).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

function comparable(value) {
  return JSON.stringify(plain(value) ?? null);
}

/** Returns only the fields whose values differ, as { oldValue, newValue } objects. */
export function diffFields(before = {}, after = {}, fields = Object.keys(after)) {
  const oldValue = {};
  const newValue = {};
  for (const field of fields) {
    if (!(field in after)) continue;
    if (comparable(before[field]) !== comparable(after[field])) {
      oldValue[field] = plain(before[field]) ?? null;
      newValue[field] = plain(after[field]) ?? null;
    }
  }
  return Object.keys(newValue).length ? { oldValue, newValue } : null;
}

export async function recordAudit(ctx, entry) {
  const settings = await getTaskSettings();
  const device = ctx.userAgent && ctx.userAgent !== 'system' ? parseUserAgent(ctx.userAgent) : undefined;
  return TaskAuditLog.create({
    task: entry.task || undefined,
    recordType: entry.recordType,
    recordId: entry.recordId || undefined,
    actor: ctx.user?._id || undefined,
    actorEmployee: ctx.user?.employeeId || undefined,
    subjectUser: entry.subjectUser || undefined,
    action: entry.action,
    oldValue: plain(entry.oldValue),
    newValue: plain(entry.newValue),
    workDate: entry.workDate || dateKeyInZone(ctx.now || new Date(), settings.timezone),
    ipAddress: ctx.ipAddress || undefined,
    userAgent: ctx.userAgent || undefined,
    device: device ? { browser: device.browser, os: device.os, deviceType: device.deviceType } : undefined,
    meta: plain({ ...(entry.meta || {}), ...(ctx.system ? { system: true } : {}) }),
    occurredAt: ctx.now || new Date()
  });
}
