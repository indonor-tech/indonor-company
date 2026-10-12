import Counter from '../common/counter.model.js';
import { AuditLog, Notification } from '../common/support.model.js';
import { normalizeRole } from '../auth/roles.js';
import { FINANCIAL_PAGE_KEYS, REMINDER_PREFERENCES } from './constants.js';
import { CrmLead } from './crm.models.js';

const FINANCIAL_FIELDS = [
  'contractValue', 'paymentTerms', 'billingCycle', 'tax', 'discount', 'finalAmount',
  'annualTurnover', 'subtotal', 'totalAmount', 'amountPaid', 'amount',
  'invoiceNumber', 'transactionId', 'referenceNumber'
];

export async function nextCrmId(name, prefix) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `${prefix}-${String(counter.value).padStart(6, '0')}`;
}

export function isSuperAdmin(user) {
  return normalizeRole(user?.role) === 'SUPER_ADMIN';
}

export function isViewAdmin(user) {
  return normalizeRole(user?.role) === 'VIEW_ADMIN';
}

export function stripFinancial(doc) {
  if (!doc) return doc;
  const raw = doc.toObject ? doc.toObject() : { ...doc };
  for (const field of FINANCIAL_FIELDS) delete raw[field];
  return raw;
}

export function stripFinancialList(items, user) {
  if (isSuperAdmin(user)) return items;
  return items.map((item) => stripFinancial(item));
}

export function canAccessFinancial(user) {
  return isSuperAdmin(user);
}

export function isFinancialPage(pageKey) {
  return FINANCIAL_PAGE_KEYS.includes(pageKey);
}

export async function writeCrmAudit(req, action, entityType, entityId, changes = {}) {
  await AuditLog.create({
    actor: req.user?._id,
    action,
    entityType,
    entityId,
    changes,
    ipAddress: req.ip,
    userAgent: req.get?.('user-agent'),
    occurredAt: new Date()
  });
}

export async function notifyUser({ recipient, type, title, message, entityType, entityId, link, actor, dedupeKey }) {
  if (!recipient) return null;
  try {
    return await Notification.create({
      recipient,
      type,
      title,
      message,
      entityType,
      entityId,
      link,
      actor,
      dedupeKey
    });
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pageParams(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

export function syncInvoiceStatus(invoice) {
  if (invoice.status === 'CANCELLED' || invoice.status === 'DRAFT') return invoice.status;
  const paid = Number(invoice.amountPaid || 0);
  const total = Number(invoice.totalAmount || 0);
  if (paid <= 0) {
    if (invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status === 'SENT') return 'OVERDUE';
    return invoice.status === 'OVERDUE' ? 'OVERDUE' : (invoice.status || 'SENT');
  }
  if (paid >= total) return 'PAID';
  return 'PARTIALLY_PAID';
}

/** Compute reminder UTC datetime from local date+time+timezone preference. */
export function computeReminderDateTime({
  nextFollowUpDate,
  nextFollowUpTime = '09:00',
  timezone = 'Asia/Kolkata',
  reminderPreference = '30_MINUTES_BEFORE'
}) {
  if (!nextFollowUpDate) return null;
  const datePart = new Date(nextFollowUpDate).toISOString().slice(0, 10);
  const timePart = String(nextFollowUpTime || '09:00').padStart(5, '0').slice(0, 5);
  // Interpret wall-clock time in the given IANA timezone using Intl offset.
  const localStamp = `${datePart}T${timePart}:00`;
  const asUtcGuess = new Date(`${localStamp}Z`);
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, asUtcGuess);
  const followUpUtc = new Date(asUtcGuess.getTime() - offsetMinutes * 60_000);
  const minutesBefore = REMINDER_PREFERENCES[reminderPreference] ?? 30;
  return new Date(followUpUtc.getTime() - minutesBefore * 60_000);
}

function getTimezoneOffsetMinutes(timeZone, date = new Date()) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit'
    });
    const parts = dtf.formatToParts(date);
    const tz = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
    const match = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!match) return 0;
    const sign = match[1] === '-' ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
  } catch {
    return 330; // Asia/Kolkata fallback
  }
}

export async function findLeadDuplicates({ email, phone, excludeId } = {}) {
  const or = [];
  if (email) or.push({ email: String(email).trim().toLowerCase() });
  if (phone) or.push({ phone: String(phone).trim() });
  if (!or.length) return [];
  const filter = { isDeleted: false, isArchived: false, $or: or };
  if (excludeId) filter._id = { $ne: excludeId };
  return CrmLead.find(filter).select('leadId leadName companyName email phone status').limit(10).lean();
}
