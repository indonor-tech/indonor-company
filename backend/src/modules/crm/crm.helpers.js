import mongoose from 'mongoose';
import Counter from '../common/counter.model.js';
import { AuditLog, Notification } from '../common/support.model.js';
import { hasPermission, normalizeRole } from '../auth/roles.js';
import {
  DEFAULT_PAYMENT_REMINDER_DAYS, FINANCIAL_PAGE_KEYS, REMINDER_PREFERENCES,
  countsTowardReceived, isClosedProjectStatus, normalizeProjectStatus
} from './constants.js';
import { CrmLead, CrmPayment, CrmProject, PaymentCredit } from './crm.models.js';

const FINANCIAL_FIELDS = [
  'contractValue', 'paymentTerms', 'billingCycle', 'tax', 'discount', 'finalAmount',
  'annualTurnover', 'subtotal', 'totalAmount', 'amountPaid', 'amount',
  'invoiceNumber', 'transactionId', 'referenceNumber', 'confirmedReceived',
  'creditsTotal', 'outstanding', 'upiTransactionId', 'utr', 'chequeNumber',
  'payerName', 'bankName', 'accountHolder', 'maskedAccountNumber', 'receiptNumber',
  'companySharePercent', 'referralCommission', 'referralPercent', 'allowUnevenPercent',
  'shareBasis', 'settlement'
];

const CREDENTIAL_KEY = /password|passwd|otp|pin|cvv|cvc|secret|token/i;

export function moneyAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export async function nextCrmId(name, prefix, session) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session: session || undefined }
  );
  return `${prefix}-${String(counter.value).padStart(6, '0')}`;
}

export function isSuperAdmin(user) {
  return normalizeRole(user?.role) === 'SUPER_ADMIN';
}

export function isViewAdmin(user) {
  return normalizeRole(user?.role) === 'VIEW_ADMIN';
}

export function isFinanceRole(user) {
  const role = normalizeRole(user?.role);
  return role === 'SUPER_ADMIN' || role === 'FINANCE';
}

export function stripFinancial(doc) {
  if (!doc) return doc;
  const raw = doc.toObject ? doc.toObject() : { ...doc };
  for (const field of FINANCIAL_FIELDS) delete raw[field];
  return raw;
}

export function stripFinancialList(items, user) {
  if (canAccessFinancial(user)) return items;
  return items.map((item) => stripFinancial(item));
}

export function canAccessFinancial(user) {
  return isSuperAdmin(user) || normalizeRole(user?.role) === 'FINANCE' || hasPermission(user, 'crm:finance:read');
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

export async function notifyUser({ recipient, type, title, message, entityType, entityId, link, actor, dedupeKey, dueDate }) {
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
      dueDate,
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
    return 330;
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

function isTransactionUnsupported(error) {
  const message = String(error?.message || error?.errmsg || '');
  return /Transaction numbers are only allowed|replica set member|not supported|IllegalOperation|as replica set/i.test(message);
}

export async function withCrmTransaction(work) {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      return work(null);
    }
    throw error;
  } finally {
    await session?.endSession();
  }
}

export function sessionOpts(session) {
  return session ? { session } : {};
}

export function applyQuotedAmount(payload = {}) {
  const next = { ...payload };
  if (next.quotedAmount != null && next.expectedDealValue == null) next.expectedDealValue = next.quotedAmount;
  if (next.expectedDealValue != null && next.quotedAmount == null) next.quotedAmount = next.expectedDealValue;
  return next;
}

export function quotedAmountOf(lead = {}) {
  const value = lead.quotedAmount ?? lead.expectedDealValue;
  return value == null || value === '' ? null : moneyAmount(value);
}

export function stripCredentialFields(payload = {}) {
  const next = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (CREDENTIAL_KEY.test(key)) continue;
    next[key] = value;
  }
  return next;
}

export function maskAccountNumber(value) {
  const digits = String(value || '').replace(/[\s-]/g, '');
  if (!digits) return '';
  if (/^\*+\d{2,4}$/.test(digits)) return digits;
  const last4 = digits.replace(/\D/g, '').slice(-4);
  if (!last4) return '';
  return `****${last4}`;
}

export function contractValueOf(project = {}) {
  return moneyAmount(project.finalAmount ?? project.contractValue ?? 0);
}

export function projectOverdueMeta(project, now = new Date()) {
  const deadline = project?.expectedEndDate ? new Date(project.expectedEndDate) : null;
  const closed = isClosedProjectStatus(project?.status);
  const isOverdue = Boolean(deadline && !closed && deadline < now);
  const daysOverdue = isOverdue ? Math.ceil((now - deadline) / 86_400_000) : 0;
  return {
    canonicalStatus: normalizeProjectStatus(project?.status),
    isOverdue,
    daysOverdue,
    isDelayed: isOverdue
  };
}

export async function computeProjectLedger(project, { session } = {}) {
  const projectId = project._id || project;
  const doc = project.contractValue != null || project.finalAmount != null
    ? project
    : await CrmProject.findById(projectId).session(session || null).lean();
  const [payments, credits] = await Promise.all([
    CrmPayment.find({ projectId: doc._id, isDeleted: false }).session(session || null).lean(),
    PaymentCredit.find({ projectId: doc._id, isDeleted: false }).session(session || null).lean()
  ]);
  const contractValue = contractValueOf(doc);
  const confirmedPayments = moneyAmount(
    payments.filter((row) => countsTowardReceived(row.status)).reduce((sum, row) => sum + moneyAmount(row.amount), 0)
  );
  const pendingPayments = moneyAmount(
    payments.filter((row) => row.status === 'PENDING').reduce((sum, row) => sum + moneyAmount(row.amount), 0)
  );
  const creditsTotal = moneyAmount(credits.reduce((sum, row) => sum + moneyAmount(row.amount), 0));
  const outstanding = moneyAmount(Math.max(0, contractValue - confirmedPayments - creditsTotal));
  const dueDate = doc.nextPaymentDueDate || null;
  const now = new Date();
  const overdueAmount = dueDate && new Date(dueDate) < now ? outstanding : 0;
  return {
    projectId: doc.projectId,
    mongoId: doc._id,
    projectName: doc.projectName,
    contractValue,
    confirmedPayments,
    pendingPayments,
    creditsTotal,
    outstanding,
    overdueAmount,
    paymentCount: payments.length,
    confirmedCount: payments.filter((row) => countsTowardReceived(row.status)).length,
    currency: doc.currency || 'INR',
    nextPaymentDueDate: dueDate,
    reminderDays: doc.paymentReminderDays ?? DEFAULT_PAYMENT_REMINDER_DAYS,
    payments,
    credits
  };
}

export async function computeClientLedger(clientId, { session } = {}) {
  const projects = await CrmProject.find({ clientId, isDeleted: false }).session(session || null).lean();
  const ledgers = [];
  for (const project of projects) {
    ledgers.push(await computeProjectLedger(project, { session }));
  }
  const sum = (key) => moneyAmount(ledgers.reduce((total, row) => total + moneyAmount(row[key]), 0));
  return {
    projectCount: projects.length,
    contractValue: sum('contractValue'),
    confirmedPayments: sum('confirmedPayments'),
    pendingPayments: sum('pendingPayments'),
    creditsTotal: sum('creditsTotal'),
    outstanding: sum('outstanding'),
    overdueAmount: sum('overdueAmount'),
    currency: ledgers[0]?.currency || projects[0]?.currency || 'INR',
    projects: ledgers.map(({ payments, credits, ...rest }) => rest)
  };
}

export async function syncProjectLedger(projectId, { session } = {}) {
  const project = await CrmProject.findById(projectId).session(session || null);
  if (!project) return null;
  const ledger = await computeProjectLedger(project, { session });
  project.confirmedReceived = ledger.confirmedPayments;
  project.creditsTotal = ledger.creditsTotal;
  project.outstanding = ledger.outstanding;
  await project.save(sessionOpts(session));
  return { project, ledger };
}

export function startOfDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}
