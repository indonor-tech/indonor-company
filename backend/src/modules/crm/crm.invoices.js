import Counter from '../common/counter.model.js';
import { AppError } from '../../utils/errors.js';
import { DEFAULT_INVOICE_PAD, DEFAULT_INVOICE_PREFIX } from './constants.js';
import { CrmInvoice, InvoiceSettings } from './crm.models.js';
import { sessionOpts, withCrmTransaction } from './crm.helpers.js';

const COUNTER_NAME = 'crm_invoice';

export function parseInvoiceSerial(number, prefix = DEFAULT_INVOICE_PREFIX) {
  const escaped = String(prefix || DEFAULT_INVOICE_PREFIX).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(number || '').trim().toUpperCase().match(new RegExp(`^${escaped}-(\\d+)$`));
  return match ? Number(match[1]) : null;
}

export function formatInvoiceNumber(serial, prefix = DEFAULT_INVOICE_PREFIX, pad = DEFAULT_INVOICE_PAD) {
  return `${prefix}-${String(serial).padStart(Number(pad) || DEFAULT_INVOICE_PAD, '0')}`;
}

export function detectInvoiceFormat(numbers) {
  const parsed = [];
  for (const value of numbers) {
    const match = String(value || '').trim().match(/^([A-Za-z]+)-(\d+)$/);
    if (match) {
      parsed.push({
        prefix: match[1].toUpperCase(),
        serial: Number(match[2]),
        width: match[2].length
      });
    }
  }
  if (!parsed.length) {
    return { prefix: DEFAULT_INVOICE_PREFIX, pad: DEFAULT_INVOICE_PAD, maxSerial: 0 };
  }
  const counts = {};
  for (const row of parsed) counts[row.prefix] = (counts[row.prefix] || 0) + 1;
  const prefix = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const ofPrefix = parsed.filter((row) => row.prefix === prefix);
  return {
    prefix,
    pad: Math.max(...ofPrefix.map((row) => row.width)),
    maxSerial: Math.max(0, ...ofPrefix.map((row) => row.serial))
  };
}

export async function getInvoiceSettings() {
  let settings = await InvoiceSettings.findOne({ key: 'default' }).lean();
  if (!settings) {
    const invoices = await CrmInvoice.find({ invoiceNumber: { $exists: true, $ne: '' } }).select('invoiceNumber').lean();
    const detected = detectInvoiceFormat(invoices.map((row) => row.invoiceNumber));
    const created = await InvoiceSettings.findOneAndUpdate(
      { key: 'default' },
      { $setOnInsert: { prefix: detected.prefix, padWidth: detected.pad } },
      { new: true, upsert: true }
    );
    settings = created.toObject();
  }
  return {
    prefix: String(settings.prefix || DEFAULT_INVOICE_PREFIX).toUpperCase(),
    pad: Number(settings.padWidth || DEFAULT_INVOICE_PAD)
  };
}

export async function inspectInvoiceSequence(session) {
  const settings = await getInvoiceSettings();
  const invoices = await CrmInvoice.find({ invoiceNumber: { $exists: true, $ne: '' } })
    .select('invoiceNumber')
    .session(session || null)
    .lean();
  let maxSerial = 0;
  for (const invoice of invoices) {
    const serial = parseInvoiceSerial(invoice.invoiceNumber, settings.prefix);
    if (serial != null && serial > maxSerial) maxSerial = serial;
  }
  return {
    prefix: settings.prefix,
    pad: settings.pad,
    maxSerial,
    nextSerial: maxSerial + 1,
    nextNumber: formatInvoiceNumber(maxSerial + 1, settings.prefix, settings.pad),
    inspected: invoices.length
  };
}

async function bumpCounterToAtLeast(maxSerial, session) {
  await Counter.findOneAndUpdate(
    { name: COUNTER_NAME },
    { $max: { value: maxSerial } },
    { upsert: true, setDefaultsOnInsert: true, session: session || undefined }
  );
}

async function allocateWithSession(session) {
  const inspected = await inspectInvoiceSequence(session);
  await bumpCounterToAtLeast(inspected.maxSerial, session);
  const counter = await Counter.findOneAndUpdate(
    { name: COUNTER_NAME },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session: session || undefined }
  );
  return formatInvoiceNumber(counter.value, inspected.prefix, inspected.pad);
}

export async function allocateNextInvoiceNumber(session) {
  if (session) return allocateWithSession(session);
  return withCrmTransaction(allocateWithSession);
}

export async function reserveManualInvoiceNumber(manualNumber, session) {
  const number = String(manualNumber || '').trim().toUpperCase();
  if (!number) throw new AppError('Invoice number is required', 422);
  const existing = await CrmInvoice.findOne({ invoiceNumber: number }).session(session || null).lean();
  if (existing) throw new AppError('Invoice number already exists', 409, [{ field: 'invoiceNumber', message: `${number} is already in use` }]);
  const settings = await getInvoiceSettings();
  const serial = parseInvoiceSerial(number, settings.prefix);
  if (serial != null) await bumpCounterToAtLeast(serial, session);
  return number;
}

export async function saveInvoiceSettings(body, user) {
  const prefix = String(body.prefix || DEFAULT_INVOICE_PREFIX).trim().toUpperCase().replace(/[^A-Z]/g, '') || DEFAULT_INVOICE_PREFIX;
  const padWidth = Math.min(10, Math.max(1, Number(body.padWidth) || DEFAULT_INVOICE_PAD));
  return InvoiceSettings.findOneAndUpdate(
    { key: 'default' },
    { $set: { prefix, padWidth, updatedBy: user?._id } },
    { new: true, upsert: true }
  );
}

export { sessionOpts, withCrmTransaction };
