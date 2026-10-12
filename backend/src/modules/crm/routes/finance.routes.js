import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import { INVOICE_STATUSES, PAYMENT_METHODS } from '../constants.js';
import { CrmClient, CrmInvoice, CrmPayment, CrmProject } from '../crm.models.js';
import { buildInvoicePdfBuffer, calculateInvoiceTotals } from '../crm.finance.js';
import { nextCrmId, pageParams, syncInvoiceStatus, writeCrmAudit } from '../crm.helpers.js';
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
  dueDate: Joi.date().iso().allow(null),
  projectId: objectId.required(),
  clientId: objectId.required(),
  description: Joi.string().trim().max(4000).allow(''),
  lineItems: Joi.array().items(lineItemSchema).default([]),
  subtotal: Joi.number().min(0),
  tax: Joi.number().min(0),
  taxRate: Joi.number().min(0).max(100).default(0),
  discount: Joi.number().min(0).default(0),
  totalAmount: Joi.number().min(0),
  currency: Joi.string().trim().max(8).default('INR'),
  status: Joi.string().valid(...INVOICE_STATUSES),
  notes: Joi.string().trim().max(4000).allow('')
});

const paymentBody = Joi.object({
  invoiceId: objectId.required(),
  paymentDate: Joi.date().iso().required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().trim().max(8).default('INR'),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
  transactionId: Joi.string().trim().max(120).allow(''),
  referenceNumber: Joi.string().trim().max(120).allow(''),
  notes: Joi.string().trim().max(2000).allow(''),
  receivedBy: objectId.allow(null, '')
});

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
  const totalReceived = payments.reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
  const outstanding = invoices
    .filter((inv) => !['PAID', 'CANCELLED', 'DRAFT'].includes(inv.status))
    .reduce((sum, inv) => sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.amountPaid || 0)), 0);
  const overdue = invoices
    .filter((inv) => inv.status === 'OVERDUE' || (inv.dueDate && new Date(inv.dueDate) < now && !['PAID', 'CANCELLED', 'DRAFT'].includes(inv.status)))
    .reduce((sum, inv) => sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.amountPaid || 0)), 0);
  const thisMonthRevenue = payments
    .filter((pay) => new Date(pay.paymentDate) >= monthStart)
    .reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
  const thisYearRevenue = payments
    .filter((pay) => new Date(pay.paymentDate) >= yearStart)
    .reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
  return sendSuccess(res, {
    totalProjects: projects.length,
    totalContractValue,
    totalInvoiced,
    totalReceived,
    outstanding,
    overdue,
    thisMonthRevenue,
    thisYearRevenue
  }, 'Finance dashboard fetched');
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
  const invoice = await CrmInvoice.create({
    ...req.body,
    ...totals,
    invoiceNumber: await nextCrmId('crm_invoice', 'INV'),
    createdBy: req.user._id,
    updatedBy: req.user._id
  });
  await writeCrmAudit(req, 'INVOICE_CREATED', 'CrmInvoice', invoice._id, { invoiceNumber: invoice.invoiceNumber });
  res.status(201);
  return sendSuccess(res, invoice, 'Invoice created');
}));

router.patch('/invoices/:id', authorize('crm:finance:write'), validate(invoiceBody.fork(
  Object.keys(invoiceBody.describe().keys),
  (schema) => schema.optional()
)), asyncHandler(async (req, res) => {
  const invoice = await CrmInvoice.findOne({ _id: req.params.id, isDeleted: false });
  if (!invoice) throw new AppError('Invoice not found', 404);
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
  const invoice = await CrmInvoice.findOne({ _id: req.body.invoiceId, isDeleted: false });
  if (!invoice) throw new AppError('Invoice not found', 404);
  const payment = await CrmPayment.create({
    ...req.body,
    paymentId: await nextCrmId('crm_payment', 'PAY'),
    clientId: invoice.clientId,
    projectId: invoice.projectId,
    receivedBy: req.body.receivedBy || req.user._id,
    createdBy: req.user._id
  });
  invoice.amountPaid = Number(invoice.amountPaid || 0) + Number(payment.amount || 0);
  invoice.balanceDue = Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.amountPaid || 0));
  invoice.status = syncInvoiceStatus(invoice);
  invoice.updatedBy = req.user._id;
  await invoice.save();
  await writeCrmAudit(req, 'PAYMENT_ADDED', 'CrmPayment', payment._id, { invoiceId: invoice._id, amount: payment.amount });
  res.status(201);
  return sendSuccess(res, { payment, invoice }, 'Payment recorded');
}));

router.patch('/payments/:id', authorize('crm:finance:write'), validate(Joi.object({
  paymentDate: Joi.date().iso(),
  amount: Joi.number().min(0),
  currency: Joi.string().trim().max(8),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
  transactionId: Joi.string().trim().max(120).allow(''),
  referenceNumber: Joi.string().trim().max(120).allow(''),
  notes: Joi.string().trim().max(2000).allow('')
})), asyncHandler(async (req, res) => {
  const payment = await CrmPayment.findOne({ _id: req.params.id, isDeleted: false });
  if (!payment) throw new AppError('Payment not found', 404);
  const previousAmount = Number(payment.amount || 0);
  Object.assign(payment, req.body);
  await payment.save();
  if (req.body.amount !== undefined) {
    const invoice = await CrmInvoice.findById(payment.invoiceId);
    if (invoice) {
      invoice.amountPaid = Math.max(0, Number(invoice.amountPaid || 0) - previousAmount + Number(payment.amount || 0));
      invoice.status = syncInvoiceStatus(invoice);
      await invoice.save();
    }
  }
  await writeCrmAudit(req, 'PAYMENT_UPDATED', 'CrmPayment', payment._id, req.body);
  return sendSuccess(res, payment, 'Payment updated');
}));

export default router;
