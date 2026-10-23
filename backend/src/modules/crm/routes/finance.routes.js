import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import { ALLOCATION_TARGETS, CREDIT_TYPES, DUE_DIRECTIONS, DUE_PRIORITIES, DUE_STATUSES, INVOICE_SCOPES, INVOICE_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '../constants.js';
import { CrmClient, CrmInvoice, CrmPayment, CrmProject, PartnerDue, PartnerDuePayment, PartnerSettlement } from '../crm.models.js';
import {
  buildInvoicePdfBuffer, calculateInvoiceTotals, dueAlertFromLedger,
  recordProjectCredit, recordProjectPayment, updateProjectPayment
} from '../crm.finance.js';
import {
  allocateNextInvoiceNumber, inspectInvoiceSequence, reserveManualInvoiceNumber, saveInvoiceSettings
} from '../crm.invoices.js';
import { computePartnershipSettlement, recordPartnerSettlement } from '../crm.partnership.js';
import {
  cancelOrDeleteDue, createPartnerDue, dueListFilter, getPartnerDue, presentDue, recordDuePayment,
  reopenPartnerDue, settlePartnerDue, summarizePartnerDues, updatePartnerDue
} from '../crm.dues.js';
import {
  computeProjectLedger, moneyAmount, pageParams, syncInvoiceStatus, withCrmTransaction, writeCrmAudit
} from '../crm.helpers.js';
import { crmUpload, storeCrmFile } from '../crm.files.js';
import { rejectViewAdminMutations, requireSuperAdminFinance } from '../middleware/crmAccess.js';

const router = express.Router();
const objectId = Joi.string().hex().length(24);

const lineItemSchema = Joi.object({
  description: Joi.string().trim().min(1).max(500).required(),
  quantity: Joi.number().min(0).default(1),
  rate: Joi.number().min(0).required(),
  discount: Joi.number().min(0).default(0),
  taxRate: Joi.number().min(0).max(100).default(0),
  amount: Joi.number().min(0)
});

const invoiceBody = Joi.object({
  invoiceDate: Joi.date().iso().required(),
  dueDate: Joi.date().iso().allow(null, '').empty(''),
  projectId: objectId.required(),
  clientId: objectId.required(),
  partnerId: objectId.allow(null, ''),
  invoiceNumber: Joi.string().trim().max(80).allow(''),
  issuerName: Joi.string().trim().max(200).allow(''),
  recipientName: Joi.string().trim().max(200).allow(''),
  invoiceScope: Joi.string().valid(...INVOICE_SCOPES),
  sharePercent: Joi.number().min(0).max(100).allow(null),
  isImported: Joi.boolean(),
  description: Joi.string().trim().max(4000).allow(''),
  lineItems: Joi.array().items(lineItemSchema).default([]),
  subtotal: Joi.number().min(0),
  tax: Joi.number().min(0),
  taxRate: Joi.number().min(0).max(100).default(0),
  discount: Joi.number().min(0).default(0),
  totalAmount: Joi.number().min(0),
  currency: Joi.string().trim().max(8).default('INR'),
  status: Joi.string().valid(...INVOICE_STATUSES),
  notes: Joi.string().trim().max(4000).allow(''),
  paymentTerms: Joi.string().trim().max(1000).allow('')
});

const paymentBody = Joi.object({
  invoiceId: objectId.allow(null, ''),
  projectId: objectId,
  clientId: objectId.allow(null, ''),
  installmentNumber: Joi.number().integer().min(1),
  paymentDate: Joi.date().iso().required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().trim().max(8).default('INR'),
  status: Joi.string().valid(...PAYMENT_STATUSES),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
  transactionId: Joi.string().trim().max(120).allow(''),
  referenceNumber: Joi.string().trim().max(120).allow(''),
  upiTransactionId: Joi.string().trim().max(120).allow(''),
  utr: Joi.string().trim().max(120).allow(''),
  chequeNumber: Joi.string().trim().max(80).allow(''),
  payerName: Joi.string().trim().max(160).allow(''),
  bankName: Joi.string().trim().max(160).allow(''),
  accountHolder: Joi.string().trim().max(160).allow(''),
  maskedAccountNumber: Joi.string().trim().max(40).allow(''),
  accountNumber: Joi.string().trim().max(40).allow(''),
  invoiceNumber: Joi.string().trim().max(80).allow(''),
  receiptNumber: Joi.string().trim().max(80).allow(''),
  invoiceDate: Joi.date().iso().allow(null),
  dueDate: Joi.date().iso().allow(null),
  paymentTerms: Joi.string().trim().max(1000).allow(''),
  notes: Joi.string().trim().max(2000).allow(''),
  receivedBy: objectId.allow(null, ''),
  allocationTarget: Joi.string().valid(...ALLOCATION_TARGETS),
  partnerId: objectId.allow(null, ''),
  allowOverpayment: Joi.boolean()
}).or('invoiceId', 'projectId');

router.use(authenticate, rejectViewAdminMutations, requireSuperAdminFinance);

router.get('/dashboard', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [projects, invoices, payments] = await Promise.all([
    CrmProject.find({ isDeleted: false }).select('contractValue finalAmount status').lean(),
    CrmInvoice.find({ isDeleted: false }).lean(),
    CrmPayment.find({ isDeleted: false }).lean()
  ]);
  const totalContractValue = projects.reduce((sum, p) => sum + Number(p.finalAmount || p.contractValue || 0), 0);
  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
  const totalReceived = payments
    .filter((pay) => !pay.status || pay.status === 'CONFIRMED')
    .reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
  const outstanding = invoices
    .filter((inv) => !['PAID', 'CANCELLED', 'DRAFT'].includes(inv.status))
    .reduce((sum, inv) => sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.amountPaid || 0)), 0);
  const overdue = invoices
    .filter((inv) => inv.status === 'OVERDUE' || (inv.dueDate && new Date(inv.dueDate) < now && !['PAID', 'CANCELLED', 'DRAFT'].includes(inv.status)))
    .reduce((sum, inv) => sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.amountPaid || 0)), 0);
  const confirmed = (pay) => !pay.status || pay.status === 'CONFIRMED';
  const thisMonthRevenue = payments
    .filter((pay) => confirmed(pay) && new Date(pay.paymentDate) >= monthStart)
    .reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
  const thisYearRevenue = payments
    .filter((pay) => confirmed(pay) && new Date(pay.paymentDate) >= yearStart)
    .reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
  const projectOutstanding = projects.reduce((sum, p) => sum + Math.max(0, Number(p.outstanding ?? ((p.finalAmount || p.contractValue || 0) - (p.confirmedReceived || 0) - (p.creditsTotal || 0)))), 0);
  const fullProjects = await CrmProject.find({ isDeleted: false }).lean();
  const partnership = {
    companyEntitlement: 0, companyInvoiced: 0, companyReceived: 0, companyRemaining: 0,
    partnerOutstanding: 0, referralDue: 0, expenses: 0, profit: 0
  };
  for (const project of fullProjects) {
    const row = await computePartnershipSettlement(project);
    partnership.companyEntitlement += row.company.entitlement;
    partnership.companyInvoiced += row.company.invoiced;
    partnership.companyReceived += row.company.received;
    partnership.companyRemaining += row.company.remaining;
    partnership.partnerOutstanding += row.partners.reduce((sum, partner) => sum + partner.outstanding, 0);
    partnership.referralDue += row.referral.outstanding;
    partnership.expenses += row.expenses;
    partnership.profit += row.profit;
  }
  Object.keys(partnership).forEach((key) => { partnership[key] = moneyAmount(partnership[key]); });
  return sendSuccess(res, {
    totalProjects: projects.length,
    totalContractValue,
    totalInvoiced,
    totalReceived,
    outstanding,
    overdue,
    thisMonthRevenue,
    thisYearRevenue,
    projectOutstanding,
    partnership,
    partnerDues: await summarizePartnerDues()
  }, 'Finance dashboard fetched');
}));

router.get('/dues', authorize('crm:finance:read'), asyncHandler(async (_req, res) => {
  const projects = await CrmProject.find({ isDeleted: false, outstanding: { $gt: 0 } })
    .populate('clientId', 'clientId clientName companyName assignedTo')
    .populate('projectManager', 'name email')
    .lean();
  const now = new Date();
  const alerts = [];
  for (const project of projects) {
    const ledger = {
      outstanding: moneyAmount(project.outstanding),
      nextPaymentDueDate: project.nextPaymentDueDate,
      currency: project.currency || 'INR'
    };
    const alert = dueAlertFromLedger(project, project.clientId, ledger, now);
    if (alert) {
      alerts.push({
        ...alert,
        assignedSalesperson: project.clientId?.assignedTo || project.projectManager
      });
    }
  }
  alerts.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  return sendSuccess(res, {
    upcoming: alerts.filter((item) => item.kind === 'UPCOMING'),
    overdue: alerts.filter((item) => item.kind === 'OVERDUE'),
    partnerSummary: await summarizePartnerDues()
  }, 'Payment dues fetched');
}));

router.get('/ledger/:projectId', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.projectId, isDeleted: false })
    .populate('clientId', 'clientId clientName companyName assignedTo')
    .lean();
  if (!project) throw new AppError('Project not found', 404);
  const ledger = await computeProjectLedger(project);
  return sendSuccess(res, { project, ...ledger }, 'Project ledger fetched');
}));

router.get('/invoices', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = { isDeleted: false };
  if (INVOICE_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.clientId) filter.clientId = req.query.clientId;
  if (req.query.projectId) filter.projectId = req.query.projectId;
  const [data, total] = await Promise.all([
    CrmInvoice.find(filter)
      .populate('clientId', 'clientId clientName companyName')
      .populate('projectId', 'projectId projectName')
      .sort({ invoiceDate: -1 }).skip(skip).limit(limit).lean(),
    CrmInvoice.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Invoices fetched', pagination(page, limit, total));
}));

router.get('/invoices/next-number', authorize('crm:finance:read'), asyncHandler(async (_req, res) => {
  const sequence = await inspectInvoiceSequence();
  return sendSuccess(res, sequence, 'Next invoice number inspected from existing records');
}));

router.get('/invoices/sequence', authorize('crm:finance:read'), asyncHandler(async (_req, res) => {
  const sequence = await inspectInvoiceSequence();
  return sendSuccess(res, sequence, 'Invoice sequence inspected');
}));

router.get('/invoices/settings', authorize('crm:finance:read'), asyncHandler(async (_req, res) => {
  const sequence = await inspectInvoiceSequence();
  return sendSuccess(res, sequence, 'Invoice settings fetched');
}));

router.patch('/invoices/settings', authorize('crm:finance:write'), validate(Joi.object({
  prefix: Joi.string().trim().max(12).allow(''),
  padWidth: Joi.number().integer().min(1).max(10)
})), asyncHandler(async (req, res) => {
  const settings = await saveInvoiceSettings(req.body, req.user);
  await writeCrmAudit(req, 'INVOICE_SETTINGS_UPDATED', 'InvoiceSettings', settings._id, req.body);
  const sequence = await inspectInvoiceSequence();
  return sendSuccess(res, { settings, sequence }, 'Invoice numbering settings saved');
}));

router.get('/invoices/export', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const filter = { isDeleted: false };
  if (req.query.clientId) filter.clientId = req.query.clientId;
  if (req.query.projectId) filter.projectId = req.query.projectId;
  const invoices = await CrmInvoice.find(filter)
    .populate('clientId', 'clientId clientName')
    .populate('projectId', 'projectId projectName')
    .sort({ invoiceDate: -1 }).lean();
  const format = String(req.query.format || 'csv').toLowerCase();
  if (format === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Invoices');
    sheet.addRow(['Invoice', 'Client', 'Project', 'Scope', 'Amount', 'Paid', 'Status', 'Date', 'Imported']);
    for (const row of invoices) {
      sheet.addRow([
        row.invoiceNumber,
        row.clientId?.clientName || '',
        row.projectId?.projectId || '',
        row.invoiceScope || 'FULL_PROJECT',
        row.totalAmount,
        row.amountPaid,
        row.status,
        row.invoiceDate ? new Date(row.invoiceDate).toISOString().slice(0, 10) : '',
        row.isImported ? 'yes' : 'no'
      ]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices.xlsx"');
    return res.send(Buffer.from(buffer));
  }
  const lines = ['Invoice,Client,Project,Scope,Amount,Paid,Status,Imported'];
  for (const row of invoices) {
    lines.push([
      row.invoiceNumber,
      `"${row.clientId?.clientName || ''}"`,
      row.projectId?.projectId || '',
      row.invoiceScope || '',
      row.totalAmount,
      row.amountPaid,
      row.status,
      row.isImported ? 'yes' : 'no'
    ].join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
  return res.send(lines.join('\n'));
}));

router.get('/invoices/:id', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const invoice = await CrmInvoice.findOne({ _id: req.params.id, isDeleted: false })
    .populate('clientId', 'clientId clientName companyName')
    .populate('projectId', 'projectId projectName')
    .lean();
  if (!invoice) throw new AppError('Invoice not found', 404);
  const payments = await CrmPayment.find({ invoiceId: invoice._id, isDeleted: false }).sort({ paymentDate: -1 }).lean();
  return sendSuccess(res, { ...invoice, payments }, 'Invoice details fetched');
}));

router.post('/invoices', authorize('crm:finance:write'), validate(invoiceBody), asyncHandler(async (req, res) => {
  const [client, project] = await Promise.all([
    CrmClient.findOne({ _id: req.body.clientId, isDeleted: false }),
    CrmProject.findOne({ _id: req.body.projectId, isDeleted: false })
  ]);
  if (!client) throw new AppError('Client not found', 404);
  if (!project) throw new AppError('Project not found', 404);
  if (String(project.clientId) !== String(client._id)) {
    throw new AppError('Project does not belong to the selected client', 400);
  }
  const totals = calculateInvoiceTotals(req.body);
  const manualNumber = String(req.body.invoiceNumber || '').trim();
  const isImported = Boolean(req.body.isImported || manualNumber);
  let invoiceNumber;
  try {
    const invoice = await withCrmTransaction(async (session) => {
      invoiceNumber = manualNumber
        ? await reserveManualInvoiceNumber(manualNumber, session)
        : await allocateNextInvoiceNumber(session);
      const [created] = await CrmInvoice.create([{
        ...req.body,
        ...totals,
        invoiceNumber,
        isImported,
        isManualNumber: Boolean(manualNumber),
        amountPaid: 0,
        partnerId: req.body.partnerId || null,
        createdBy: req.user._id,
        updatedBy: req.user._id
      }], session ? { session } : {});
      return created;
    });
    await writeCrmAudit(req, 'INVOICE_CREATED', 'CrmInvoice', invoice._id, {
      invoiceNumber: invoice.invoiceNumber, isImported, isManualNumber: Boolean(manualNumber)
    });
    res.status(201);
    return sendSuccess(res, invoice, isImported
      ? 'Existing invoice imported. It is not treated as a verified payment.'
      : 'Invoice created');
  } catch (error) {
    if (error?.code === 11000) throw new AppError('Invoice number already exists', 409, [{
      field: 'invoiceNumber', message: `${invoiceNumber || manualNumber} is already in use`
    }]);
    throw error;
  }
}));

router.patch('/invoices/:id', authorize('crm:finance:write'), validate(invoiceBody.fork(
  Object.keys(invoiceBody.describe().keys),
  (schema) => schema.optional()
)), asyncHandler(async (req, res) => {
  const invoice = await CrmInvoice.findOne({ _id: req.params.id, isDeleted: false });
  if (!invoice) throw new AppError('Invoice not found', 404);
  delete req.body.invoiceNumber;
  const merged = {
    lineItems: req.body.lineItems ?? invoice.lineItems,
    subtotal: req.body.subtotal ?? invoice.subtotal,
    tax: req.body.tax,
    taxRate: req.body.taxRate ?? invoice.taxRate,
    discount: req.body.discount ?? invoice.discount,
    amountPaid: invoice.amountPaid
  };
  const totals = calculateInvoiceTotals(merged);
  Object.assign(invoice, req.body, totals, { updatedBy: req.user._id });
  invoice.status = syncInvoiceStatus(invoice);
  await invoice.save();
  await writeCrmAudit(req, 'INVOICE_UPDATED', 'CrmInvoice', invoice._id, req.body);
  return sendSuccess(res, invoice, 'Invoice updated');
}));

router.get('/invoices/:id/pdf', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const invoice = await CrmInvoice.findOne({ _id: req.params.id, isDeleted: false }).lean();
  if (!invoice) throw new AppError('Invoice not found', 404);
  const [client, project] = await Promise.all([
    CrmClient.findById(invoice.clientId).lean(),
    CrmProject.findById(invoice.projectId).lean()
  ]);
  const pdf = await buildInvoicePdfBuffer({ invoice, client, project });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  return res.send(pdf);
}));

router.post('/invoices/:id/attachments', authorize('crm:finance:write'), crmUpload.array('files', 10), asyncHandler(async (req, res) => {
  const invoice = await CrmInvoice.findOne({ _id: req.params.id, isDeleted: false });
  if (!invoice) throw new AppError('Invoice not found', 404);
  const files = req.files || [];
  if (!files.length) throw new AppError('A file is required', 422);
  for (const file of files) {
    const meta = await storeCrmFile(file, 'CrmInvoice', invoice._id);
    meta.documentType = req.body.documentType || 'INVOICE';
    meta.uploadedBy = req.user._id;
    invoice.attachments.push(meta);
  }
  await invoice.save();
  await writeCrmAudit(req, 'INVOICE_ATTACHMENT', 'CrmInvoice', invoice._id, { count: files.length, imported: invoice.isImported });
  return sendSuccess(res, invoice.attachments, 'Invoice documents uploaded. Uploaded files are not recorded as payments.');
}));

router.delete('/invoices/:id', authorize('crm:finance:write'), asyncHandler(async (req, res) => {
  const invoice = await CrmInvoice.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: { isDeleted: true, status: 'CANCELLED', updatedBy: req.user._id } },
    { new: true }
  );
  if (!invoice) throw new AppError('Invoice not found', 404);
  await writeCrmAudit(req, 'INVOICE_UPDATED', 'CrmInvoice', invoice._id, { cancelled: true });
  return sendSuccess(res, invoice, 'Invoice cancelled');
}));

router.get('/payments', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = { isDeleted: false };
  if (req.query.invoiceId) filter.invoiceId = req.query.invoiceId;
  if (req.query.clientId) filter.clientId = req.query.clientId;
  if (req.query.projectId) filter.projectId = req.query.projectId;
  if (PAYMENT_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const [data, total] = await Promise.all([
    CrmPayment.find(filter)
      .populate('invoiceId', 'invoiceNumber totalAmount status')
      .populate('clientId', 'clientId clientName')
      .populate('projectId', 'projectId projectName')
      .sort({ paymentDate: -1 }).skip(skip).limit(limit).lean(),
    CrmPayment.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Payments fetched', pagination(page, limit, total));
}));

router.post('/payments', authorize('crm:finance:write'), validate(paymentBody), asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (!body.projectId && body.invoiceId) {
    const invoice = await CrmInvoice.findOne({ _id: body.invoiceId, isDeleted: false });
    if (!invoice) throw new AppError('Invoice not found', 404);
    body.projectId = invoice.projectId;
    body.clientId = invoice.clientId;
  }
  const result = await recordProjectPayment(body, req.user, { allowOverpayment: Boolean(body.allowOverpayment) });
  await writeCrmAudit(req, 'PAYMENT_ADDED', 'CrmPayment', result.payment._id, {
    projectId: result.payment.projectId, amount: result.payment.amount, status: result.payment.status
  });
  res.status(201);
  return sendSuccess(res, result, 'Payment recorded');
}));

router.patch('/payments/:id', authorize('crm:finance:write'), validate(Joi.object({
  paymentDate: Joi.date().iso(),
  amount: Joi.number().min(0),
  currency: Joi.string().trim().max(8),
  status: Joi.string().valid(...PAYMENT_STATUSES),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
  transactionId: Joi.string().trim().max(120).allow(''),
  referenceNumber: Joi.string().trim().max(120).allow(''),
  upiTransactionId: Joi.string().trim().max(120).allow(''),
  utr: Joi.string().trim().max(120).allow(''),
  chequeNumber: Joi.string().trim().max(80).allow(''),
  payerName: Joi.string().trim().max(160).allow(''),
  bankName: Joi.string().trim().max(160).allow(''),
  accountHolder: Joi.string().trim().max(160).allow(''),
  maskedAccountNumber: Joi.string().trim().max(40).allow(''),
  accountNumber: Joi.string().trim().max(40).allow(''),
  invoiceNumber: Joi.string().trim().max(80).allow(''),
  receiptNumber: Joi.string().trim().max(80).allow(''),
  notes: Joi.string().trim().max(2000).allow(''),
  allocationTarget: Joi.string().valid(...ALLOCATION_TARGETS),
  partnerId: objectId.allow(null, ''),
  allowOverpayment: Joi.boolean()
})), asyncHandler(async (req, res) => {
  const result = await updateProjectPayment(req.params.id, req.body, req.user, {
    allowOverpayment: Boolean(req.body.allowOverpayment)
  });
  await writeCrmAudit(req, 'PAYMENT_UPDATED', 'CrmPayment', req.params.id, req.body);
  return sendSuccess(res, result, 'Payment updated');
}));

router.post('/payments/:id/attachments', authorize('crm:finance:write'), crmUpload.array('files', 10), asyncHandler(async (req, res) => {
  const payment = await CrmPayment.findOne({ _id: req.params.id, isDeleted: false });
  if (!payment) throw new AppError('Payment not found', 404);
  const files = req.files || [];
  if (!files.length) throw new AppError('A file is required', 422);
  for (const file of files) {
    const meta = await storeCrmFile(file, 'CrmPayment', payment._id);
    meta.documentType = req.body.documentType || 'RECEIPT';
    meta.uploadedBy = req.user._id;
    payment.attachments.push(meta);
  }
  await payment.save();
  await writeCrmAudit(req, 'PAYMENT_ATTACHMENT', 'CrmPayment', payment._id, { count: files.length });
  return sendSuccess(res, payment.attachments, 'Payment attachments uploaded');
}));

router.post('/credits', authorize('crm:finance:write'), validate(Joi.object({
  projectId: objectId.required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().trim().max(8),
  type: Joi.string().valid(...CREDIT_TYPES),
  reason: Joi.string().trim().max(2000).allow('')
})), asyncHandler(async (req, res) => {
  const result = await recordProjectCredit(req.body, req.user);
  await writeCrmAudit(req, 'CREDIT_ADDED', 'PaymentCredit', result.credit._id, req.body);
  res.status(201);
  return sendSuccess(res, result, 'Credit applied');
}));

router.get('/settlements', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = { isDeleted: false };
  if (req.query.projectId) filter.projectId = req.query.projectId;
  if (req.query.partnerId) filter.partnerId = req.query.partnerId;
  if (PAYMENT_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.from) filter.paymentDate = { ...(filter.paymentDate || {}), $gte: new Date(req.query.from) };
  if (req.query.to) filter.paymentDate = { ...(filter.paymentDate || {}), $lte: new Date(req.query.to) };
  const [data, total] = await Promise.all([
    PartnerSettlement.find(filter)
      .populate('projectId', 'projectId projectName')
      .populate('partnerId', 'name companyName role')
      .sort({ paymentDate: -1 }).skip(skip).limit(limit).lean(),
    PartnerSettlement.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Settlements fetched', pagination(page, limit, total));
}));

router.post('/settlements', authorize('crm:finance:write'), validate(Joi.object({
  projectId: objectId.required(),
  partnerId: objectId.required(),
  paymentDate: Joi.date().iso().required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().trim().max(8),
  status: Joi.string().valid(...PAYMENT_STATUSES),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
  transactionId: Joi.string().trim().max(120).allow(''),
  referenceNumber: Joi.string().trim().max(120).allow(''),
  notes: Joi.string().trim().max(2000).allow(''),
  dueDate: Joi.date().iso().allow(null)
})), asyncHandler(async (req, res) => {
  const result = await recordPartnerSettlement(req.body, req.user);
  await writeCrmAudit(req, 'SETTLEMENT_ADDED', 'PartnerSettlement', result.settlement._id, req.body);
  res.status(201);
  return sendSuccess(res, result, 'Partner settlement recorded');
}));

router.post('/settlements/:id/attachments', authorize('crm:finance:write'), crmUpload.array('files', 10), asyncHandler(async (req, res) => {
  const settlement = await PartnerSettlement.findOne({ _id: req.params.id, isDeleted: false });
  if (!settlement) throw new AppError('Settlement not found', 404);
  const files = req.files || [];
  if (!files.length) throw new AppError('A file is required', 422);
  for (const file of files) {
    const meta = await storeCrmFile(file, 'PartnerSettlement', settlement._id);
    meta.documentType = req.body.documentType || 'PAYMENT_RECEIPT';
    meta.uploadedBy = req.user._id;
    settlement.attachments.push(meta);
  }
  await settlement.save();
  return sendSuccess(res, settlement.attachments, 'Settlement receipt uploaded');
}));

const dueLineItem = Joi.object({
  _id: objectId,
  description: Joi.string().trim().min(1).max(500).required(),
  amount: Joi.number().min(0).required()
});

const dueBody = Joi.object({
  direction: Joi.string().valid(...DUE_DIRECTIONS).required(),
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(4000).allow(''),
  notes: Joi.string().trim().max(4000).allow(''),
  priority: Joi.string().valid(...DUE_PRIORITIES),
  dueDate: Joi.date().iso().allow(null, '').empty(''),
  currency: Joi.string().trim().max(8),
  projectId: objectId.required(),
  clientId: objectId.allow(null, ''),
  partnerId: objectId.allow(null, ''),
  partnerName: Joi.string().trim().max(160).allow(''),
  partnerCompany: Joi.string().trim().max(160).allow(''),
  partnerEmail: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow(''),
  partnerPhone: Joi.string().trim().max(40).allow(''),
  assignedTo: objectId.allow(null, ''),
  lineItems: Joi.array().items(dueLineItem).min(1).required()
});

router.get('/partner-dues/summary', authorize('crm:finance:read'), asyncHandler(async (_req, res) => {
  return sendSuccess(res, await summarizePartnerDues(), 'Partner due summary fetched');
}));

router.get('/partner-dues', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = dueListFilter(req.query);
  const [data, total, summary] = await Promise.all([
    PartnerDue.find(filter)
      .populate('projectId', 'projectId projectName')
      .populate('clientId', 'clientId clientName companyName')
      .populate('partnerId', 'name companyName')
      .populate('assignedTo', 'name email')
      .sort({ dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PartnerDue.countDocuments(filter),
    summarizePartnerDues()
  ]);
  return sendSuccess(res, data.map((row) => presentDue(row)), 'Partner dues fetched', { ...pagination(page, limit, total), summary });
}));

router.post('/partner-dues', authorize('crm:finance:write'), validate(dueBody), asyncHandler(async (req, res) => {
  const due = await createPartnerDue(req.body, req.user);
  await writeCrmAudit(req, 'DUE_CREATED', 'PartnerDue', due._id, {
    dueId: due.dueId, direction: due.direction, originalAmount: due.originalAmount
  });
  res.status(201);
  return sendSuccess(res, due, 'Due created');
}));

router.get('/partner-dues/:id', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  return sendSuccess(res, await getPartnerDue(req.params.id), 'Due details fetched');
}));

router.patch('/partner-dues/:id', authorize('crm:finance:write'), validate(dueBody.fork(
  Object.keys(dueBody.describe().keys),
  (schema) => schema.optional()
).fork(['lineItems'], (schema) => schema.optional())), asyncHandler(async (req, res) => {
  const due = await updatePartnerDue(req.params.id, req.body, req.user);
  await writeCrmAudit(req, 'DUE_UPDATED', 'PartnerDue', due._id, req.body);
  return sendSuccess(res, due, 'Due updated');
}));

router.delete('/partner-dues/:id', authorize('crm:finance:write'), asyncHandler(async (req, res) => {
  const result = await cancelOrDeleteDue(req.params.id, req.user);
  await writeCrmAudit(req, result.deleted ? 'DUE_DELETED' : 'DUE_CANCELLED', 'PartnerDue', req.params.id, result);
  return sendSuccess(res, result, result.deleted
    ? 'Due deleted'
    : 'Due has payments, so it was cancelled instead of deleted');
}));

router.post('/partner-dues/:id/payments', authorize('crm:finance:write'), validate(Joi.object({
  paymentDate: Joi.date().iso().required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().trim().max(8),
  status: Joi.string().valid(...PAYMENT_STATUSES),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
  transactionId: Joi.string().trim().max(120).allow(''),
  referenceNumber: Joi.string().trim().max(120).allow(''),
  notes: Joi.string().trim().max(2000).allow(''),
  allowOverpayment: Joi.boolean()
})), asyncHandler(async (req, res) => {
  const result = await recordDuePayment(req.params.id, req.body, req.user);
  await writeCrmAudit(req, 'DUE_PAYMENT_ADDED', 'PartnerDuePayment', result.payment._id, {
    dueId: req.params.id, amount: result.payment.amount, status: result.payment.status
  });
  res.status(201);
  return sendSuccess(res, result, 'Due payment recorded');
}));

router.post('/partner-dues/:id/settle', authorize('crm:finance:write'), validate(Joi.object({
  writeOff: Joi.boolean(),
  adjustmentAmount: Joi.number().min(0),
  notes: Joi.string().trim().max(2000).allow(''),
  adjustmentNotes: Joi.string().trim().max(2000).allow('')
})), asyncHandler(async (req, res) => {
  const due = await settlePartnerDue(req.params.id, req.body, req.user);
  await writeCrmAudit(req, 'DUE_SETTLED', 'PartnerDue', due._id, req.body);
  return sendSuccess(res, due, 'Due settled');
}));

router.post('/partner-dues/:id/reopen', authorize('crm:finance:write'), validate(Joi.object({
  reason: Joi.string().trim().max(2000).allow(''),
  notes: Joi.string().trim().max(2000).allow('')
})), asyncHandler(async (req, res) => {
  const due = await reopenPartnerDue(req.params.id, req.body, req.user);
  await writeCrmAudit(req, 'DUE_REOPENED', 'PartnerDue', due._id, req.body);
  return sendSuccess(res, due, 'Due reopened');
}));

router.post('/partner-dues/:id/attachments', authorize('crm:finance:write'), crmUpload.array('files', 10), asyncHandler(async (req, res) => {
  const due = await PartnerDue.findOne({ _id: req.params.id, isDeleted: false });
  if (!due) throw new AppError('Due not found', 404);
  const files = req.files || [];
  if (!files.length) throw new AppError('A file is required', 422);
  for (const file of files) {
    const meta = await storeCrmFile(file, 'PartnerDue', due._id);
    meta.documentType = req.body.documentType || 'OTHER';
    meta.uploadedBy = req.user._id;
    due.attachments.push(meta);
  }
  await due.save();
  return sendSuccess(res, due.attachments, 'Due attachments uploaded');
}));

router.post('/partner-dues/:id/payments/:paymentId/attachments', authorize('crm:finance:write'), crmUpload.array('files', 10), asyncHandler(async (req, res) => {
  const payment = await PartnerDuePayment.findOne({
    _id: req.params.paymentId, dueId: req.params.id, isDeleted: false
  });
  if (!payment) throw new AppError('Due payment not found', 404);
  const files = req.files || [];
  if (!files.length) throw new AppError('A file is required', 422);
  for (const file of files) {
    const meta = await storeCrmFile(file, 'PartnerDuePayment', payment._id);
    meta.documentType = req.body.documentType || 'PAYMENT_RECEIPT';
    meta.uploadedBy = req.user._id;
    payment.attachments.push(meta);
  }
  await payment.save();
  return sendSuccess(res, payment.attachments, 'Receipt uploaded');
}));

export default router;
