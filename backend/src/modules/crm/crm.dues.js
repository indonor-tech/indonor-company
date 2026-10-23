import { AppError } from '../../utils/errors.js';
import { countsTowardReceived, DUE_STATUSES } from './constants.js';
import { CrmClient, CrmProject, CrmProjectPartner, PartnerDue, PartnerDuePayment } from './crm.models.js';
import { moneyAmount, nextCrmId, sessionOpts, withCrmTransaction } from './crm.helpers.js';

export function lineItemAmount(item = {}) {
  if (item.amount != null && item.amount !== '') return moneyAmount(item.amount);
  const quantity = moneyAmount(item.quantity == null || item.quantity === '' ? 1 : item.quantity);
  const unitPrice = moneyAmount(item.unitPrice || 0);
  return moneyAmount(quantity * unitPrice);
}

export function normalizeLineItems(items = []) {
  return (items || []).filter((item) => String(item.description || '').trim()).map((item) => {
    const amount = lineItemAmount(item);
    if (amount < 0) throw new AppError('Line item amounts cannot be negative', 422);
    return {
      description: String(item.description || '').trim(),
      amount
    };
  });
}

export function originalFromItems(items = []) {
  return moneyAmount(normalizeLineItems(items).reduce((sum, item) => sum + item.amount, 0));
}

function startOfDay(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function deriveDueStatus(due, paid, now = new Date()) {
  if (due.status === 'CANCELLED') return 'CANCELLED';
  const remaining = moneyAmount((due.originalAmount || 0) - paid - (due.adjustmentTotal || 0));
  if (remaining <= 0) return 'SETTLED';
  const overdue = due.dueDate && new Date(due.dueDate) < startOfDay(now);
  if (overdue) return 'OVERDUE';
  if (paid > 0) return 'PARTIALLY_PAID';
  return 'PENDING';
}

export async function confirmedPaidForDue(dueId, { session } = {}) {
  const rows = await PartnerDuePayment.find({ dueId, isDeleted: false }).session(session || null).lean();
  return moneyAmount(
    rows.filter((row) => countsTowardReceived(row.status)).reduce((sum, row) => sum + moneyAmount(row.amount), 0)
  );
}

export function presentDue(due, payments = [], paid) {
  const paidAmount = paid == null
    ? moneyAmount((payments || []).filter((row) => countsTowardReceived(row.status)).reduce((sum, row) => sum + moneyAmount(row.amount), 0))
    : paid;
  const remaining = moneyAmount(Math.max(0, moneyAmount(due.originalAmount) - paidAmount - moneyAmount(due.adjustmentTotal || 0)));
  const status = deriveDueStatus({ ...due, status: due.status }, paidAmount);
  return {
    ...due,
    amountPaid: paidAmount,
    remaining,
    status,
    payments
  };
}

async function loadDueContext(body, session) {
  const project = await CrmProject.findOne({ _id: body.projectId, isDeleted: false }).session(session || null);
  if (!project) throw new AppError('Project not found', 404);
  let clientId = body.clientId || project.clientId;
  if (body.clientId) {
    const client = await CrmClient.findOne({ _id: body.clientId, isDeleted: false }).session(session || null);
    if (!client) throw new AppError('Client not found', 404);
    if (String(project.clientId) !== String(client._id)) {
      throw new AppError('Project does not belong to the selected client', 400);
    }
    clientId = client._id;
  }
  let partner = null;
  if (body.partnerId) {
    partner = await CrmProjectPartner.findOne({
      _id: body.partnerId, projectId: project._id, isDeleted: false
    }).session(session || null);
    if (!partner) throw new AppError('Partner not found on this project', 404);
  }
  return { project, clientId, partner };
}

function partnerSnapshot(body, partner) {
  return {
    partnerId: partner?._id || body.partnerId || null,
    partnerName: body.partnerName || partner?.name || '',
    partnerCompany: body.partnerCompany || partner?.companyName || '',
    partnerEmail: body.partnerEmail || partner?.email || '',
    partnerPhone: body.partnerPhone || partner?.phone || ''
  };
}

export async function createPartnerDue(body, user) {
  const items = normalizeLineItems(body.lineItems);
  if (!items.length) throw new AppError('Add at least one line item', 422);
  const originalAmount = originalFromItems(items);
  if (originalAmount <= 0) throw new AppError('Due total must be greater than zero', 400);
  if (!String(body.partnerName || '').trim() && !body.partnerId) {
    throw new AppError('Partner or person name is required', 422);
  }
  return withCrmTransaction(async (session) => {
    const { project, clientId, partner } = await loadDueContext(body, session);
    const snapshot = partnerSnapshot(body, partner);
    if (!snapshot.partnerName) throw new AppError('Partner or person name is required', 422);
    const [due] = await PartnerDue.create([{
      dueId: await nextCrmId('crm_due', 'DUE', session),
      direction: body.direction,
      title: body.title,
      description: body.description || '',
      notes: body.notes || '',
      priority: body.priority || 'MEDIUM',
      dueDate: body.dueDate || null,
      currency: body.currency || project.currency || 'INR',
      lineItems: items,
      originalAmount,
      amountPaid: 0,
      adjustmentTotal: 0,
      remaining: originalAmount,
      status: deriveDueStatus({ originalAmount, dueDate: body.dueDate, status: 'PENDING' }, 0),
      projectId: project._id,
      clientId,
      assignedTo: body.assignedTo || project.assignedSalesperson || project.projectManager || null,
      ...snapshot,
      createdBy: user._id,
      updatedBy: user._id
    }], session ? { session } : {});
    return presentDue(due.toObject(), [], 0);
  });
}

export async function updatePartnerDue(id, body, user) {
  return withCrmTransaction(async (session) => {
    const due = await PartnerDue.findOne({ _id: id, isDeleted: false }).session(session || null);
    if (!due) throw new AppError('Due not found', 404);
    if (due.status === 'CANCELLED') throw new AppError('Cancelled dues cannot be edited', 400);
    if (due.status === 'SETTLED') throw new AppError('Reopen this due before editing amounts', 400);
    const nextBody = { ...body, projectId: body.projectId || due.projectId, clientId: body.clientId || due.clientId };
    if (body.projectId || body.clientId || body.partnerId) {
      const ctx = await loadDueContext(nextBody, session);
      Object.assign(due, partnerSnapshot({ ...due.toObject(), ...body }, ctx.partner));
      due.projectId = ctx.project._id;
      due.clientId = ctx.clientId;
    } else {
      Object.assign(due, partnerSnapshot({ ...due.toObject(), ...body }, null));
      if (!due.partnerName && body.partnerName !== undefined) due.partnerName = body.partnerName;
    }
    const assignable = ['direction', 'title', 'description', 'notes', 'priority', 'dueDate', 'currency', 'assignedTo', 'partnerName', 'partnerCompany', 'partnerEmail', 'partnerPhone'];
    for (const key of assignable) {
      if (body[key] !== undefined) due[key] = body[key] === '' ? (key === 'dueDate' || key === 'assignedTo' ? null : '') : body[key];
    }
    if (body.lineItems) {
      const items = normalizeLineItems(body.lineItems);
      if (!items.length) throw new AppError('Add at least one line item', 422);
      due.lineItems = items;
      due.originalAmount = originalFromItems(items);
    }
    const paid = await confirmedPaidForDue(due._id, { session });
    if (due.originalAmount < paid) {
      throw new AppError('Line items cannot total less than the amount already paid', 400);
    }
    due.amountPaid = paid;
    due.remaining = moneyAmount(Math.max(0, due.originalAmount - paid - moneyAmount(due.adjustmentTotal)));
    due.status = deriveDueStatus(due, paid);
    due.updatedBy = user._id;
    await due.save(sessionOpts(session));
    const payments = await PartnerDuePayment.find({ dueId: due._id, isDeleted: false }).session(session || null).sort({ paymentDate: 1 }).lean();
    return presentDue(due.toObject(), payments, paid);
  });
}

export async function getPartnerDue(id) {
  const due = await PartnerDue.findOne({ _id: id, isDeleted: false })
    .populate('projectId', 'projectId projectName')
    .populate('clientId', 'clientId clientName companyName')
    .populate('partnerId', 'name companyName email phone role')
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email')
    .lean();
  if (!due) throw new AppError('Due not found', 404);
  const payments = await PartnerDuePayment.find({ dueId: due._id, isDeleted: false })
    .populate('createdBy', 'name email')
    .sort({ paymentDate: 1, createdAt: 1 })
    .lean();
  return presentDue(due, payments);
}

export async function cancelOrDeleteDue(id, user) {
  const due = await PartnerDue.findOne({ _id: id, isDeleted: false });
  if (!due) throw new AppError('Due not found', 404);
  const paid = await confirmedPaidForDue(due._id);
  if (paid > 0 || due.status === 'SETTLED') {
    due.status = 'CANCELLED';
    due.updatedBy = user._id;
    await due.save();
    return { due: presentDue(due.toObject(), [], paid), cancelled: true, deleted: false };
  }
  due.isDeleted = true;
  due.status = 'CANCELLED';
  due.updatedBy = user._id;
  await due.save();
  return { due: presentDue(due.toObject(), [], 0), cancelled: false, deleted: true };
}

export async function recordDuePayment(dueId, body, user) {
  const amount = moneyAmount(body.amount);
  if (amount <= 0) throw new AppError('Payment amount must be greater than zero', 400);
  return withCrmTransaction(async (session) => {
    const due = await PartnerDue.findOne({ _id: dueId, isDeleted: false }).session(session || null);
    if (!due) throw new AppError('Due not found', 404);
    if (due.status === 'CANCELLED') throw new AppError('Cancelled dues cannot accept payments', 400);
    if (due.status === 'SETTLED') throw new AppError('This due is already settled', 400);
    const reference = String(body.transactionId || body.referenceNumber || '').trim();
    if (reference) {
      const duplicate = await PartnerDuePayment.findOne({
        dueId: due._id,
        isDeleted: false,
        status: { $nin: ['FAILED', 'CANCELLED'] },
        $or: [{ transactionId: reference }, { referenceNumber: reference }]
      }).session(session || null).lean();
      if (duplicate) throw new AppError('A payment with this transaction/reference ID already exists on this due', 409);
    }
    const paid = await confirmedPaidForDue(due._id, { session });
    const remaining = moneyAmount(Math.max(0, due.originalAmount - paid - moneyAmount(due.adjustmentTotal)));
    const counts = countsTowardReceived(body.status || 'CONFIRMED');
    if (counts && amount > remaining && !body.allowOverpayment) {
      throw new AppError(`Payment exceeds remaining balance of ${remaining}`, 400);
    }
    const last = await PartnerDuePayment.findOne({ dueId: due._id }).sort({ installmentNumber: -1 }).session(session || null).lean();
    const [payment] = await PartnerDuePayment.create([{
      paymentId: await nextCrmId('crm_due_payment', 'DUP', session),
      dueId: due._id,
      projectId: due.projectId,
      installmentNumber: (last?.installmentNumber || 0) + 1,
      paymentDate: body.paymentDate,
      amount,
      currency: body.currency || due.currency || 'INR',
      status: body.status || 'CONFIRMED',
      paymentMethod: body.paymentMethod || 'BANK_TRANSFER',
      transactionId: body.transactionId || '',
      referenceNumber: body.referenceNumber || reference,
      notes: body.notes || '',
      createdBy: user._id
    }], session ? { session } : {});
    const nextPaid = await confirmedPaidForDue(due._id, { session });
    due.amountPaid = nextPaid;
    due.remaining = moneyAmount(Math.max(0, due.originalAmount - nextPaid - moneyAmount(due.adjustmentTotal)));
    due.status = deriveDueStatus(due, nextPaid);
    if (due.status === 'SETTLED') due.settledAt = new Date();
    due.updatedBy = user._id;
    await due.save(sessionOpts(session));
    const payments = await PartnerDuePayment.find({ dueId: due._id, isDeleted: false }).session(session || null).sort({ paymentDate: 1 }).lean();
    return { payment, due: presentDue(due.toObject(), payments, nextPaid) };
  });
}

export async function settlePartnerDue(id, body, user) {
  return withCrmTransaction(async (session) => {
    const due = await PartnerDue.findOne({ _id: id, isDeleted: false }).session(session || null);
    if (!due) throw new AppError('Due not found', 404);
    if (due.status === 'CANCELLED') throw new AppError('Cancelled dues cannot be settled', 400);
    const paid = await confirmedPaidForDue(due._id, { session });
    let remaining = moneyAmount(Math.max(0, due.originalAmount - paid - moneyAmount(due.adjustmentTotal)));
    if (remaining > 0) {
      if (!body.writeOff) {
        throw new AppError(`Outstanding balance is ${remaining}. Record the remaining payment or an authorized write-off.`, 400);
      }
      const writeOff = moneyAmount(body.adjustmentAmount == null ? remaining : body.adjustmentAmount);
      if (writeOff <= 0) throw new AppError('Write-off amount must be greater than zero', 400);
      if (writeOff > remaining) throw new AppError('Write-off cannot exceed the remaining balance', 400);
      due.adjustmentTotal = moneyAmount(due.adjustmentTotal + writeOff);
      due.adjustmentNotes = body.notes || body.adjustmentNotes || 'Authorized settlement adjustment';
      remaining = moneyAmount(Math.max(0, due.originalAmount - paid - due.adjustmentTotal));
    }
    if (remaining > 0) throw new AppError('Due still has an outstanding balance', 400);
    due.amountPaid = paid;
    due.remaining = 0;
    due.status = 'SETTLED';
    due.settledAt = new Date();
    due.settledBy = user._id;
    due.updatedBy = user._id;
    await due.save(sessionOpts(session));
    const payments = await PartnerDuePayment.find({ dueId: due._id, isDeleted: false }).session(session || null).sort({ paymentDate: 1 }).lean();
    return presentDue(due.toObject(), payments, paid);
  });
}

export async function reopenPartnerDue(id, body, user) {
  const due = await PartnerDue.findOne({ _id: id, isDeleted: false });
  if (!due) throw new AppError('Due not found', 404);
  if (due.status !== 'SETTLED' && due.status !== 'CANCELLED') {
    throw new AppError('Only settled or cancelled dues can be reopened', 400);
  }
  const paid = await confirmedPaidForDue(due._id);
  due.reopenReason = body.reason || body.notes || 'Reopened';
  due.reopenedAt = new Date();
  due.reopenedBy = user._id;
  due.settledAt = null;
  due.settledBy = null;
  due.status = 'PENDING';
  due.amountPaid = paid;
  due.remaining = moneyAmount(Math.max(0, due.originalAmount - paid - moneyAmount(due.adjustmentTotal)));
  due.status = deriveDueStatus(due, paid);
  due.updatedBy = user._id;
  await due.save();
  const payments = await PartnerDuePayment.find({ dueId: due._id, isDeleted: false }).sort({ paymentDate: 1 }).lean();
  return presentDue(due.toObject(), payments, paid);
}

export async function summarizePartnerDues(filter = {}) {
  const rows = await PartnerDue.find({ ...filter, isDeleted: false, status: { $ne: 'CANCELLED' } }).lean();
  const now = startOfDay();
  const summary = {
    payableTotal: 0,
    receivableTotal: 0,
    paid: 0,
    received: 0,
    remainingPayable: 0,
    remainingReceivable: 0,
    overdue: 0,
    upcoming: 0
  };
  for (const row of rows) {
    const presented = presentDue(row, [], moneyAmount(row.amountPaid));
    if (row.direction === 'PAYABLE') {
      summary.payableTotal += presented.originalAmount;
      summary.paid += presented.amountPaid;
      summary.remainingPayable += presented.remaining;
    } else {
      summary.receivableTotal += presented.originalAmount;
      summary.received += presented.amountPaid;
      summary.remainingReceivable += presented.remaining;
    }
    if (presented.status === 'OVERDUE') summary.overdue += presented.remaining;
    else if (presented.remaining > 0 && row.dueDate) {
      const due = new Date(row.dueDate);
      const soon = new Date(now.getTime() + 7 * 86_400_000);
      if (due >= now && due <= soon) summary.upcoming += presented.remaining;
    }
  }
  Object.keys(summary).forEach((key) => { summary[key] = moneyAmount(summary[key]); });
  return summary;
}

export function dueListFilter(query = {}) {
  const filter = { isDeleted: false };
  if (query.status === 'OVERDUE') {
    filter.status = { $in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] };
    filter.remaining = { $gt: 0 };
    filter.dueDate = { $lt: startOfDay() };
  } else if (DUE_STATUSES.includes(query.status)) {
    filter.status = query.status;
  }
  if (query.direction === 'PAYABLE' || query.direction === 'RECEIVABLE') filter.direction = query.direction;
  if (query.projectId) filter.projectId = query.projectId;
  if (query.clientId) filter.clientId = query.clientId;
  if (query.partnerId) filter.partnerId = query.partnerId;
  if (query.assignedTo || query.salesperson) filter.assignedTo = query.assignedTo || query.salesperson;
  if (query.from || query.to) {
    filter.dueDate = { ...(filter.dueDate || {}) };
    if (query.from) filter.dueDate.$gte = new Date(query.from);
    if (query.to) filter.dueDate.$lte = new Date(query.to);
  }
  if (query.q) {
    const q = String(query.q).trim();
    filter.$or = [
      { dueId: { $regex: q, $options: 'i' } },
      { title: { $regex: q, $options: 'i' } },
      { partnerName: { $regex: q, $options: 'i' } },
      { partnerCompany: { $regex: q, $options: 'i' } }
    ];
  }
  return filter;
}

export { DUE_STATUSES };
