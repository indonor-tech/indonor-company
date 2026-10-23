import PDFDocument from 'pdfkit';
import { AppError } from '../../utils/errors.js';
import { countsTowardReceived } from './constants.js';
import {
  CrmClient, CrmInvoice, CrmPayment, CrmProject, PaymentCredit
} from './crm.models.js';
import {
  computeProjectLedger, contractValueOf, maskAccountNumber, moneyAmount,
  nextCrmId, sessionOpts, stripCredentialFields, syncInvoiceStatus,
  syncProjectLedger, withCrmTransaction
} from './crm.helpers.js';

const BANK_METHODS = new Set(['BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'NET_BANKING']);

export function paymentMethodFields(method) {
  if (method === 'UPI') return ['upiTransactionId', 'transactionId'];
  if (BANK_METHODS.has(method)) return ['utr', 'transactionId', 'bankName', 'accountHolder', 'maskedAccountNumber'];
  if (method === 'CHEQUE') return ['chequeNumber', 'bankName', 'payerName'];
  if (method === 'CARD' || method === 'CREDIT_CARD' || method === 'DEBIT_CARD') return ['transactionId', 'referenceNumber', 'payerName'];
  return ['transactionId', 'referenceNumber'];
}

function sanitizePaymentInput(body) {
  const payload = stripCredentialFields(body);
  if (payload.accountNumber) {
    payload.maskedAccountNumber = maskAccountNumber(payload.accountNumber);
    delete payload.accountNumber;
  }
  if (payload.maskedAccountNumber) {
    payload.maskedAccountNumber = maskAccountNumber(payload.maskedAccountNumber);
  }
  delete payload.password;
  delete payload.otp;
  delete payload.pin;
  delete payload.cvv;
  return payload;
}

async function nextInstallmentNumber(projectId, session) {
  const last = await CrmPayment.findOne({ projectId, isDeleted: false })
    .sort({ installmentNumber: -1 })
    .select('installmentNumber')
    .session(session || null)
    .lean();
  return Number(last?.installmentNumber || 0) + 1;
}

async function refreshInvoiceFromPayments(invoice, session) {
  if (!invoice) return null;
  const payments = await CrmPayment.find({ invoiceId: invoice._id, isDeleted: false }).session(session || null).lean();
  const paid = moneyAmount(
    payments.filter((row) => countsTowardReceived(row.status)).reduce((sum, row) => sum + moneyAmount(row.amount), 0)
  );
  invoice.amountPaid = paid;
  invoice.balanceDue = moneyAmount(Math.max(0, moneyAmount(invoice.totalAmount) - paid));
  invoice.status = syncInvoiceStatus(invoice);
  await invoice.save(sessionOpts(session));
  return invoice;
}

export async function recordProjectPayment(body, user, { allowOverpayment = false } = {}) {
  const payload = sanitizePaymentInput(body);
  return withCrmTransaction(async (session) => {
    const project = await CrmProject.findOne({ _id: payload.projectId, isDeleted: false }).session(session || null);
    if (!project) throw new AppError('Project not found', 404);
    const clientId = payload.clientId || project.clientId;
    if (String(project.clientId) !== String(clientId)) {
      throw new AppError('Project does not belong to the selected client', 400);
    }
    const client = await CrmClient.findOne({ _id: clientId, isDeleted: false }).session(session || null);
    if (!client) throw new AppError('Client not found', 404);

    let invoice = null;
    if (payload.invoiceId) {
      invoice = await CrmInvoice.findOne({ _id: payload.invoiceId, isDeleted: false }).session(session || null);
      if (!invoice) throw new AppError('Invoice not found', 404);
      if (String(invoice.projectId) !== String(project._id) || String(invoice.clientId) !== String(client._id)) {
        throw new AppError('Invoice does not match the selected client and project', 400);
      }
    }

    const amount = moneyAmount(payload.amount);
    if (amount <= 0) throw new AppError('Payment amount must be greater than zero', 400);

    const status = payload.status || 'CONFIRMED';
    const ledger = await computeProjectLedger(project, { session });
    if (status === 'CONFIRMED' && !allowOverpayment && amount - ledger.outstanding > 0.009) {
      throw new AppError('Payment exceeds outstanding balance', 400, [{
        field: 'amount',
        message: `Outstanding balance is ${ledger.outstanding}`
      }]);
    }

    const installmentNumber = payload.installmentNumber || await nextInstallmentNumber(project._id, session);
    const paymentId = await nextCrmId('crm_payment', 'PAY', session);
    const confirmed = status === 'CONFIRMED';
    const [payment] = await CrmPayment.create([{
      paymentId,
      invoiceId: invoice?._id || null,
      clientId: client._id,
      projectId: project._id,
      installmentNumber,
      paymentDate: payload.paymentDate,
      recordedDate: new Date(),
      amount,
      currency: payload.currency || project.currency || 'INR',
      status,
      confirmedAt: confirmed ? new Date() : undefined,
      confirmedBy: confirmed ? user._id : undefined,
      paymentMethod: payload.paymentMethod || 'BANK_TRANSFER',
      transactionId: payload.transactionId || '',
      referenceNumber: payload.referenceNumber || '',
      upiTransactionId: payload.upiTransactionId || '',
      utr: payload.utr || '',
      chequeNumber: payload.chequeNumber || '',
      payerName: payload.payerName || '',
      bankName: payload.bankName || '',
      accountHolder: payload.accountHolder || '',
      maskedAccountNumber: payload.maskedAccountNumber || '',
      invoiceNumber: payload.invoiceNumber || invoice?.invoiceNumber || '',
      receiptNumber: payload.receiptNumber || '',
      invoiceDate: payload.invoiceDate || invoice?.invoiceDate,
      dueDate: payload.dueDate || invoice?.dueDate,
      paymentTerms: payload.paymentTerms || invoice?.paymentTerms || project.paymentTerms || '',
      notes: payload.notes || '',
      allocationTarget: payload.allocationTarget || 'UNALLOCATED',
      partnerId: payload.partnerId || null,
      receivedBy: payload.receivedBy || user._id,
      createdBy: user._id
    }], session ? { session } : {});

    if (invoice) await refreshInvoiceFromPayments(invoice, session);
    const synced = await syncProjectLedger(project._id, { session });
    return { payment, invoice, ledger: synced.ledger };
  });
}

export async function updateProjectPayment(paymentId, body, user, { allowOverpayment = false } = {}) {
  const payload = sanitizePaymentInput(body);
  return withCrmTransaction(async (session) => {
    const payment = await CrmPayment.findOne({ _id: paymentId, isDeleted: false }).session(session || null);
    if (!payment) throw new AppError('Payment not found', 404);
    const previousStatus = payment.status || 'CONFIRMED';
    const nextStatus = payload.status || previousStatus;
    const nextAmount = payload.amount != null ? moneyAmount(payload.amount) : moneyAmount(payment.amount);

    if (nextStatus === 'CONFIRMED') {
      const ledger = await computeProjectLedger(payment.projectId, { session });
      const previousCounts = countsTowardReceived(previousStatus);
      const available = ledger.outstanding + (previousCounts ? moneyAmount(payment.amount) : 0);
      if (!allowOverpayment && nextAmount - available > 0.009) {
        throw new AppError('Payment exceeds outstanding balance', 400, [{
          field: 'amount',
          message: `Outstanding balance is ${moneyAmount(available)}`
        }]);
      }
      if (!countsTowardReceived(previousStatus)) {
        payment.confirmedAt = new Date();
        payment.confirmedBy = user._id;
      }
    }
    if (['FAILED', 'CANCELLED', 'REFUNDED', 'PENDING'].includes(nextStatus) && countsTowardReceived(previousStatus)) {
      payment.confirmedAt = undefined;
    }

    const assignable = [
      'paymentDate', 'amount', 'currency', 'paymentMethod', 'transactionId', 'referenceNumber',
      'upiTransactionId', 'utr', 'chequeNumber', 'payerName', 'bankName', 'accountHolder',
      'maskedAccountNumber', 'invoiceNumber', 'receiptNumber', 'invoiceDate', 'dueDate',
      'paymentTerms', 'notes', 'installmentNumber', 'status', 'allocationTarget', 'partnerId'
    ];
    for (const key of assignable) {
      if (payload[key] !== undefined) payment[key] = key === 'amount' ? nextAmount : payload[key];
    }
    await payment.save(sessionOpts(session));
    if (payment.invoiceId) {
      const invoice = await CrmInvoice.findById(payment.invoiceId).session(session || null);
      if (invoice) await refreshInvoiceFromPayments(invoice, session);
    }
    const synced = await syncProjectLedger(payment.projectId, { session });
    return { payment, ledger: synced.ledger };
  });
}

export async function recordProjectCredit(body, user) {
  const payload = stripCredentialFields(body);
  return withCrmTransaction(async (session) => {
    const project = await CrmProject.findOne({ _id: payload.projectId, isDeleted: false }).session(session || null);
    if (!project) throw new AppError('Project not found', 404);
    const amount = moneyAmount(payload.amount);
    if (amount <= 0) throw new AppError('Credit amount must be greater than zero', 400);
    const [credit] = await PaymentCredit.create([{
      creditId: await nextCrmId('crm_credit', 'CRD', session),
      clientId: project.clientId,
      projectId: project._id,
      amount,
      currency: payload.currency || project.currency || 'INR',
      type: payload.type || 'CREDIT',
      reason: payload.reason || '',
      createdBy: user._id
    }], session ? { session } : {});
    const synced = await syncProjectLedger(project._id, { session });
    return { credit, ledger: synced.ledger };
  });
}

export function dueAlertFromLedger(project, client, ledger, now = new Date()) {
  const dueDate = ledger.nextPaymentDueDate || project.nextPaymentDueDate;
  if (!dueDate || ledger.outstanding <= 0) return null;
  const due = new Date(dueDate);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const reminderDays = project.paymentReminderDays ?? 3;
  const upcomingUntil = new Date(start.getTime() + reminderDays * 86_400_000);
  const overdue = due < start;
  const upcoming = !overdue && due <= upcomingUntil;
  if (!overdue && !upcoming) return null;
  return {
    kind: overdue ? 'OVERDUE' : 'UPCOMING',
    clientId: client?.clientId,
    clientName: client?.clientName || client?.companyName,
    clientMongoId: client?._id || project.clientId,
    projectId: project.projectId,
    projectMongoId: project._id,
    projectName: project.projectName,
    dueDate,
    outstanding: ledger.outstanding,
    overdueAmount: overdue ? ledger.outstanding : 0,
    assignedTo: client?.assignedTo || project.projectManager,
    currency: ledger.currency
  };
}


export function calculateInvoiceTotals({ lineItems = [], subtotal, tax, taxRate = 0, discount = 0, amountPaid = 0 }) {
  let computedSubtotal = Number(subtotal);
  let computedTax = Number(tax);
  if (Array.isArray(lineItems) && lineItems.length) {
    computedSubtotal = lineItems.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);
      const itemDiscount = Number(item.discount || 0);
      const line = Math.max(0, qty * rate - itemDiscount);
      return sum + line;
    }, 0);
    const itemTax = lineItems.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);
      const itemDiscount = Number(item.discount || 0);
      const line = Math.max(0, qty * rate - itemDiscount);
      return sum + (line * Number(item.taxRate || 0)) / 100;
    }, 0);
    if (!Number.isFinite(computedTax) || tax == null) computedTax = itemTax;
  }
  if (!Number.isFinite(computedSubtotal)) computedSubtotal = 0;
  if (!Number.isFinite(computedTax) || tax == null) {
    computedTax = (computedSubtotal * Number(taxRate || 0)) / 100;
  }
  const disc = Math.max(0, Number(discount || 0));
  const totalAmount = Math.max(0, computedSubtotal + computedTax - disc);
  const paid = Math.max(0, Number(amountPaid || 0));
  const balanceDue = Math.max(0, totalAmount - paid);
  const normalizedItems = (lineItems || []).map((item) => {
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const itemDiscount = Number(item.discount || 0);
    const amount = Math.max(0, quantity * rate - itemDiscount);
    return {
      description: String(item.description || '').trim(),
      quantity,
      rate,
      discount: itemDiscount,
      taxRate: Number(item.taxRate || 0),
      amount
    };
  });
  return {
    lineItems: normalizedItems,
    subtotal: computedSubtotal,
    tax: computedTax,
    taxRate: Number(taxRate || 0),
    discount: disc,
    totalAmount,
    amountPaid: paid,
    balanceDue
  };
}

export function buildInvoicePdfBuffer({ invoice, client, project }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('INVOICE', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#444');
    doc.text(`Invoice #: ${invoice.invoiceNumber}`);
    doc.text(`Date: ${invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN') : '—'}`);
    if (invoice.dueDate) doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString('en-IN')}`);
    doc.text(`Status: ${invoice.status}`);
    doc.moveDown();
    doc.fillColor('#111').fontSize(12).text('Bill To', { underline: true });
    doc.fontSize(10).fillColor('#333');
    doc.text(client?.clientName || client?.companyName || 'Client');
    if (client?.companyEmail) doc.text(client.companyEmail);
    if (client?.billingAddress || client?.address) doc.text(client.billingAddress || client.address);
    if (client?.gstVatNumber) doc.text(`GST/VAT: ${client.gstVatNumber}`);
    doc.moveDown();
    if (project) {
      doc.fillColor('#111').fontSize(12).text('Project', { underline: true });
      doc.fontSize(10).fillColor('#333').text(`${project.projectName || ''} (${project.projectId || ''})`);
      doc.moveDown();
    }

    const startY = doc.y;
    doc.fillColor('#111').fontSize(10);
    doc.text('Description', 48, startY, { width: 220 });
    doc.text('Qty', 280, startY, { width: 40 });
    doc.text('Rate', 330, startY, { width: 70 });
    doc.text('Amount', 420, startY, { width: 80, align: 'right' });
    doc.moveTo(48, startY + 14).lineTo(547, startY + 14).stroke('#ccc');
    let y = startY + 22;
    const items = invoice.lineItems?.length
      ? invoice.lineItems
      : [{ description: invoice.description || 'Services', quantity: 1, rate: invoice.subtotal, amount: invoice.subtotal }];
    for (const item of items) {
      doc.fillColor('#333').text(item.description || '—', 48, y, { width: 220 });
      doc.text(String(item.quantity ?? 1), 280, y, { width: 40 });
      doc.text(String(item.rate ?? 0), 330, y, { width: 70 });
      doc.text(String(item.amount ?? 0), 420, y, { width: 80, align: 'right' });
      y += 18;
      if (y > 700) { doc.addPage(); y = 48; }
    }
    doc.y = y + 10;
    doc.moveDown();
    const currency = invoice.currency || 'INR';
    doc.fillColor('#111').fontSize(10);
    doc.text(`Subtotal: ${currency} ${Number(invoice.subtotal || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.text(`Tax: ${currency} ${Number(invoice.tax || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.text(`Discount: ${currency} ${Number(invoice.discount || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.fontSize(12).text(`Total: ${currency} ${Number(invoice.totalAmount || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.fontSize(10).text(`Paid: ${currency} ${Number(invoice.amountPaid || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.text(`Balance due: ${currency} ${Number(invoice.balanceDue ?? Math.max(0, invoice.totalAmount - invoice.amountPaid)).toLocaleString('en-IN')}`, { align: 'right' });
    if (invoice.notes) {
      doc.moveDown();
      doc.fillColor('#555').text(`Notes: ${invoice.notes}`);
    }
    doc.end();
  });
}
