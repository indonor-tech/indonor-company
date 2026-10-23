import Counter from '../modules/common/counter.model.js';
import { CrmClient, CrmInvoice, CrmLead, CrmPayment, CrmProject, InvoiceSettings, PartnerDue } from '../modules/crm/crm.models.js';
import { countsTowardReceived } from '../modules/crm/constants.js';
import { moneyAmount } from '../modules/crm/crm.helpers.js';
import { detectInvoiceFormat, getInvoiceSettings } from '../modules/crm/crm.invoices.js';

/** Additive CRM schema upgrades — never deletes existing records. */
export async function migrateCrmSchema() {
  await CrmLead.updateMany(
    { quotedAmount: { $exists: false }, expectedDealValue: { $exists: true, $ne: null } },
    [{ $set: { quotedAmount: '$expectedDealValue' } }]
  ).catch(async () => {
    const leads = await CrmLead.find({ quotedAmount: { $exists: false }, expectedDealValue: { $ne: null } }).select('expectedDealValue').lean();
    for (const lead of leads) {
      await CrmLead.updateOne({ _id: lead._id }, { $set: { quotedAmount: lead.expectedDealValue } });
    }
  });

  await CrmLead.updateMany(
    { $or: [{ businessRequirements: { $in: [null, ''] } }, { businessRequirements: { $exists: false } }], requirementDescription: { $exists: true, $nin: [null, ''] } },
    [{ $set: { businessRequirements: '$requirementDescription' } }]
  ).catch(async () => {
    const leads = await CrmLead.find({
      $or: [{ businessRequirements: { $in: [null, ''] } }, { businessRequirements: { $exists: false } }],
      requirementDescription: { $nin: [null, ''] }
    }).select('requirementDescription').lean();
    for (const lead of leads) {
      await CrmLead.updateOne({ _id: lead._id }, { $set: { businessRequirements: lead.requirementDescription } });
    }
  });

  await CrmProject.updateMany({ status: 'DRAFT' }, { $set: { status: 'NOT_STARTED' } });
  await CrmProject.updateMany({ status: 'PLANNED' }, { $set: { status: 'NOT_STARTED' } });
  await CrmProject.updateMany({ status: 'ACTIVE' }, { $set: { status: 'IN_PROGRESS' } });

  const projects = await CrmProject.find({ isDeleted: false }).select('_id contractValue finalAmount confirmedReceived creditsTotal').lean();
  for (const project of projects) {
    const payments = await CrmPayment.find({ projectId: project._id, isDeleted: false }).select('amount status').lean();
    const confirmed = moneyAmount(
      payments.filter((row) => countsTowardReceived(row.status || 'CONFIRMED')).reduce((sum, row) => sum + moneyAmount(row.amount), 0)
    );
    const contract = moneyAmount(project.finalAmount ?? project.contractValue ?? 0);
    const credits = moneyAmount(project.creditsTotal || 0);
    await CrmProject.updateOne({ _id: project._id }, {
      $set: {
        confirmedReceived: confirmed,
        outstanding: Math.max(0, moneyAmount(contract - confirmed - credits))
      }
    });
  }

  await CrmPayment.updateMany(
    { $or: [{ status: { $exists: false } }, { status: null }] },
    { $set: { status: 'CONFIRMED' } }
  );
  await CrmPayment.updateMany(
    { recordedDate: { $exists: false } },
    [{ $set: { recordedDate: '$createdAt' } }]
  ).catch(async () => {
    const payments = await CrmPayment.find({ recordedDate: { $exists: false } }).select('createdAt').lean();
    for (const payment of payments) {
      await CrmPayment.updateOne({ _id: payment._id }, { $set: { recordedDate: payment.createdAt || new Date() } });
    }
  });

  const clients = await CrmClient.find({ sourceLeadId: { $ne: null }, $or: [{ sourceLeadCode: { $exists: false } }, { sourceLeadCode: '' }] })
    .populate('sourceLeadId', 'leadId')
    .select('sourceLeadId sourceLeadCode')
    .lean();
  for (const client of clients) {
    const code = client.sourceLeadId?.leadId;
    if (code) await CrmClient.updateOne({ _id: client._id }, { $set: { sourceLeadCode: code } });
  }

  await CrmProject.updateMany(
    { estimatedDuration: { $exists: false } },
    { $set: { estimatedDuration: '' } }
  );

  const orphanPayments = await CrmPayment.find({
    isDeleted: false,
    $or: [{ clientId: null }, { projectId: null }]
  }).select('_id clientId projectId').lean();
  for (const payment of orphanPayments) {
    if (!payment.projectId) continue;
    const project = await CrmProject.findById(payment.projectId).select('clientId').lean();
    if (project?.clientId && !payment.clientId) {
      await CrmPayment.updateOne({ _id: payment._id }, { $set: { clientId: project.clientId } });
    }
  }

  await CrmProject.updateMany(
    { $or: [{ engagementType: { $exists: false } }, { engagementType: '' }] },
    { $set: { engagementType: 'CLIENT' } }
  );
  await CrmProject.updateMany(
    { companySharePercent: { $exists: false } },
    { $set: { companySharePercent: 100, shareBasis: 'GROSS_CONTRACT', partnershipStatus: 'NONE' } }
  );

  const invoiceNumbers = await CrmInvoice.find({ invoiceNumber: { $exists: true, $ne: '' } }).select('invoiceNumber').lean();
  const detected = detectInvoiceFormat(invoiceNumbers.map((row) => row.invoiceNumber));
  const existingSettings = await InvoiceSettings.findOne({ key: 'default' }).lean();
  if (!existingSettings) {
    await getInvoiceSettings();
  } else if (!existingSettings.updatedBy && detected.maxSerial > 0) {
    await InvoiceSettings.updateOne(
      { key: 'default' },
      { $set: { prefix: detected.prefix, padWidth: detected.pad } }
    );
  }
  if (detected.maxSerial > 0) {
    await Counter.findOneAndUpdate(
      { name: 'crm_invoice' },
      { $max: { value: detected.maxSerial } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  const dues = await PartnerDue.find({}).select('lineItems originalAmount amountPaid adjustmentTotal remaining').lean();
  for (const due of dues) {
    let changed = false;
    const lineItems = (due.lineItems || []).map((item) => {
      const fromParts = moneyAmount((item.quantity == null ? 1 : item.quantity) * (item.unitPrice || 0));
      const amount = item.amount != null && item.amount !== '' ? moneyAmount(item.amount) : fromParts;
      if (amount !== moneyAmount(item.amount)) changed = true;
      return { description: item.description, amount, _id: item._id };
    });
    if (!changed) continue;
    const originalAmount = moneyAmount(lineItems.reduce((sum, item) => sum + moneyAmount(item.amount), 0));
    await PartnerDue.updateOne({ _id: due._id }, {
      $set: {
        lineItems,
        originalAmount,
        remaining: Math.max(0, moneyAmount(originalAmount - moneyAmount(due.amountPaid) - moneyAmount(due.adjustmentTotal)))
      }
    });
  }
}
