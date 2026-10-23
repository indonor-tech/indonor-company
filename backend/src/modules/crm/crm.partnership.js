import { AppError } from '../../utils/errors.js';
import { countsTowardReceived } from './constants.js';
import {
  CrmInvoice, CrmProject, CrmProjectPartner, PartnerSettlement, PartnershipAgreement,
  ProjectAdjustment
} from './crm.models.js';
import { computeProjectLedger, contractValueOf, moneyAmount, nextCrmId, sessionOpts, withCrmTransaction } from './crm.helpers.js';

export function validateSharePercents({ companySharePercent, partners = [], allowUnevenPercent = false }) {
  const percentPartners = (partners || []).filter((row) => !row.isDeleted && row.isActive !== false && !row.isCompany);
  const percentTotal = moneyAmount(companySharePercent || 0)
    + moneyAmount(percentPartners.reduce((sum, row) => sum + moneyAmount(row.sharePercent || 0), 0));
  if (allowUnevenPercent) return percentTotal;
  if (Math.abs(percentTotal - 100) > 0.009) {
    throw new AppError('Share percentages must total exactly 100%', 422, [{
      field: 'companySharePercent',
      message: `Percentages currently total ${percentTotal}%. Authorize an exception to save a different total.`
    }]);
  }
  return percentTotal;
}

function adjustmentBuckets(adjustments = []) {
  const buckets = { expenses: 0, deductions: 0, refunds: 0, taxes: 0, adjustments: 0 };
  for (const row of adjustments) {
    const amount = moneyAmount(row.amount);
    if (row.type === 'EXPENSE') buckets.expenses += amount;
    else if (row.type === 'DEDUCTION') buckets.deductions += amount;
    else if (row.type === 'REFUND') buckets.refunds += amount;
    else if (row.type === 'TAX') buckets.taxes += amount;
    else buckets.adjustments += amount;
  }
  return {
    expenses: moneyAmount(buckets.expenses),
    deductions: moneyAmount(buckets.deductions),
    refunds: moneyAmount(buckets.refunds),
    taxes: moneyAmount(buckets.taxes),
    adjustments: moneyAmount(buckets.adjustments)
  };
}

export function computeShareBasisAmount(project, ledger, adjustments = []) {
  const contract = contractValueOf(project);
  const received = moneyAmount(ledger?.confirmedPayments || 0);
  const buckets = adjustmentBuckets(adjustments);
  const basis = project.shareBasis || 'GROSS_CONTRACT';
  if (basis === 'NET_REVENUE') return moneyAmount(Math.max(0, received - buckets.refunds));
  if (basis === 'NET_PROFIT') {
    return moneyAmount(Math.max(0, received - buckets.expenses - buckets.deductions - buckets.taxes - buckets.refunds + buckets.adjustments));
  }
  return contract;
}

function confirmedSum(rows, predicate = () => true) {
  return moneyAmount(
    (rows || [])
      .filter((row) => countsTowardReceived(row.status) && predicate(row))
      .reduce((sum, row) => sum + moneyAmount(row.amount), 0)
  );
}

function invoiceSum(invoices, predicate = () => true) {
  return moneyAmount(
    (invoices || [])
      .filter((row) => row.status !== 'CANCELLED' && predicate(row))
      .reduce((sum, row) => sum + moneyAmount(row.totalAmount), 0)
  );
}

export async function computePartnershipSettlement(project, { session } = {}) {
  const projectId = project._id || project;
  const doc = project.contractValue != null || project.finalAmount != null
    ? project
    : await CrmProject.findById(projectId).session(session || null).lean();
  const [partners, adjustments, invoices, settlements, ledger] = await Promise.all([
    CrmProjectPartner.find({ projectId: doc._id, isDeleted: false, isActive: true }).session(session || null).lean(),
    ProjectAdjustment.find({ projectId: doc._id, isDeleted: false }).session(session || null).lean(),
    CrmInvoice.find({ projectId: doc._id, isDeleted: false }).session(session || null).lean(),
    PartnerSettlement.find({ projectId: doc._id, isDeleted: false }).session(session || null).lean(),
    computeProjectLedger(doc, { session })
  ]);
  const buckets = adjustmentBuckets(adjustments);
  const basisAmount = computeShareBasisAmount(doc, ledger, adjustments);
  const companyPercent = moneyAmount(doc.companySharePercent ?? 100);
  const companyEntitlement = moneyAmount((basisAmount * companyPercent) / 100);
  const companyInvoiced = invoiceSum(invoices, (row) => row.invoiceScope === 'COMPANY_SHARE');
  const companyReceived = confirmedSum(ledger.payments, (row) => row.allocationTarget === 'COMPANY');
  const companyRemaining = moneyAmount(Math.max(0, companyEntitlement - companyReceived));

  const partnerRows = partners.filter((row) => !row.isCompany).map((partner) => {
    const percentShare = moneyAmount((basisAmount * moneyAmount(partner.sharePercent || 0)) / 100);
    const entitlement = moneyAmount(percentShare + moneyAmount(partner.fixedCommission || 0));
    const invoiced = invoiceSum(invoices, (row) => row.invoiceScope === 'PARTNER_SHARE' && String(row.partnerId) === String(partner._id));
    const receivedFromClient = confirmedSum(ledger.payments, (row) => row.allocationTarget === 'PARTNER' && String(row.partnerId) === String(partner._id));
    const paid = confirmedSum(settlements, (row) => String(row.partnerId) === String(partner._id));
    return {
      partnerId: partner._id,
      name: partner.name,
      companyName: partner.companyName,
      role: partner.role,
      sharePercent: moneyAmount(partner.sharePercent || 0),
      fixedCommission: moneyAmount(partner.fixedCommission || 0),
      entitlement,
      invoiced,
      receivedFromClient,
      paid,
      outstanding: moneyAmount(Math.max(0, entitlement - paid))
    };
  });

  const referralEntitlement = moneyAmount(
    moneyAmount(doc.referralCommission || 0) + ((basisAmount * moneyAmount(doc.referralPercent || 0)) / 100)
  );
  const referrerPartners = partnerRows.filter((row) => row.role === 'REFERRER');
  const referralPaid = moneyAmount(referrerPartners.reduce((sum, row) => sum + row.paid, 0));
  const partnerPaidTotal = moneyAmount(partnerRows.reduce((sum, row) => sum + row.paid, 0));
  const profit = moneyAmount(ledger.confirmedPayments - buckets.expenses - buckets.taxes - buckets.deductions - buckets.refunds - partnerPaidTotal + buckets.adjustments);

  return {
    projectId: doc.projectId,
    mongoId: doc._id,
    currency: doc.currency || 'INR',
    shareBasis: doc.shareBasis || 'GROSS_CONTRACT',
    contractValue: contractValueOf(doc),
    confirmedReceived: ledger.confirmedPayments,
    pendingReceived: ledger.pendingPayments,
    invoicedTotal: invoiceSum(invoices),
    invoiceIsNotPayment: true,
    basisAmount,
    expenses: buckets.expenses,
    deductions: buckets.deductions,
    refunds: buckets.refunds,
    taxes: buckets.taxes,
    adjustments: buckets.adjustments,
    profit,
    company: {
      sharePercent: companyPercent,
      entitlement: companyEntitlement,
      invoiced: companyInvoiced,
      received: companyReceived,
      remaining: companyRemaining
    },
    partners: partnerRows,
    partnerPaidTotal,
    referral: {
      name: doc.referrerName || '',
      company: doc.referrerCompany || '',
      entitlement: referralEntitlement,
      paid: referralPaid,
      outstanding: moneyAmount(Math.max(0, referralEntitlement - referralPaid))
    },
    adjustmentsList: adjustments,
    settlements,
    invoices: invoices.map((row) => ({
      _id: row._id,
      invoiceNumber: row.invoiceNumber,
      invoiceScope: row.invoiceScope,
      partnerId: row.partnerId,
      totalAmount: row.totalAmount,
      amountPaid: row.amountPaid,
      status: row.status,
      dueDate: row.dueDate,
      isImported: row.isImported
    }))
  };
}

export async function saveProjectPartnership(projectId, body, user) {
  return withCrmTransaction(async (session) => {
    const project = await CrmProject.findOne({ _id: projectId, isDeleted: false }).session(session || null);
    if (!project) throw new AppError('Project not found', 404);
    const partners = body.partners || [];
    validateSharePercents({
      companySharePercent: body.companySharePercent ?? project.companySharePercent,
      partners,
      allowUnevenPercent: Boolean(body.allowUnevenPercent)
    });
    const assignable = [
      'engagementType', 'partnershipStatus', 'partnershipNotes', 'shareBasis',
      'companySharePercent', 'allowUnevenPercent', 'referrerName', 'referrerCompany',
      'referrerEmail', 'referrerPhone', 'referralCommission', 'referralPercent', 'referralNotes',
      'assignedSalesperson', 'projectOwner'
    ];
    for (const key of assignable) {
      if (body[key] !== undefined) project[key] = body[key] === '' ? (key.includes('Percent') || key.includes('Commission') ? 0 : null) : body[key];
    }
    if (body.assignedSalesperson === '') project.assignedSalesperson = null;
    if (body.projectOwner === '') project.projectOwner = null;
    if (!project.partnershipStatus || project.partnershipStatus === 'NONE') project.partnershipStatus = 'ACTIVE';
    project.updatedBy = user._id;
    await project.save(sessionOpts(session));

    const keptIds = [];
    const savedPartners = [];
    for (const row of partners) {
      const payload = {
        projectId: project._id,
        name: row.name,
        companyName: row.companyName || '',
        email: row.email || '',
        phone: row.phone || '',
        role: row.role || 'PARTNER',
        sharePercent: moneyAmount(row.sharePercent || 0),
        fixedCommission: moneyAmount(row.fixedCommission || 0),
        isCompany: Boolean(row.isCompany),
        notes: row.notes || '',
        isActive: row.isActive !== false,
        isDeleted: false,
        createdBy: user._id
      };
      let partner;
      if (row._id) {
        partner = await CrmProjectPartner.findOneAndUpdate(
          { _id: row._id, projectId: project._id },
          { $set: payload },
          { new: true, session: session || undefined }
        );
      } else {
        [partner] = await CrmProjectPartner.create([payload], session ? { session } : {});
      }
      if (partner) {
        keptIds.push(partner._id);
        savedPartners.push(partner);
      }
    }
    await CrmProjectPartner.updateMany(
      { projectId: project._id, _id: { $nin: keptIds }, isDeleted: false },
      { $set: { isDeleted: true, isActive: false } },
      sessionOpts(session)
    );

    const last = await PartnershipAgreement.findOne({ projectId: project._id }).sort({ version: -1 }).session(session || null).lean();
    const snapshot = {
      projectId: project._id,
      version: (last?.version || 0) + 1,
      shareBasis: project.shareBasis,
      companySharePercent: project.companySharePercent,
      allowUnevenPercent: project.allowUnevenPercent,
      partnershipStatus: project.partnershipStatus,
      notes: project.partnershipNotes,
      partners: savedPartners.map((row) => ({
        partnerId: row._id,
        name: row.name,
        companyName: row.companyName,
        role: row.role,
        sharePercent: row.sharePercent,
        fixedCommission: row.fixedCommission
      })),
      createdBy: user._id
    };
    await PartnershipAgreement.create([snapshot], session ? { session } : {});
    const settlement = await computePartnershipSettlement(project, { session });
    return { project, partners: savedPartners, settlement, agreementVersion: snapshot.version };
  });
}

export async function recordPartnerSettlement(body, user) {
  return withCrmTransaction(async (session) => {
    const project = await CrmProject.findOne({ _id: body.projectId, isDeleted: false }).session(session || null);
    if (!project) throw new AppError('Project not found', 404);
    const partner = await CrmProjectPartner.findOne({
      _id: body.partnerId, projectId: project._id, isDeleted: false
    }).session(session || null);
    if (!partner) throw new AppError('Partner not found', 404);
    const amount = moneyAmount(body.amount);
    if (amount <= 0) throw new AppError('Settlement amount must be greater than zero', 400);
    const [settlement] = await PartnerSettlement.create([{
      settlementId: await nextCrmId('crm_settlement', 'PST', session),
      projectId: project._id,
      partnerId: partner._id,
      paymentDate: body.paymentDate,
      amount,
      currency: body.currency || project.currency || 'INR',
      status: body.status || 'CONFIRMED',
      paymentMethod: body.paymentMethod || 'BANK_TRANSFER',
      transactionId: body.transactionId || '',
      referenceNumber: body.referenceNumber || '',
      notes: body.notes || '',
      dueDate: body.dueDate || null,
      createdBy: user._id
    }], session ? { session } : {});
    return { settlement, ledger: await computePartnershipSettlement(project, { session }) };
  });
}

export async function recordProjectAdjustment(body, user) {
  const project = await CrmProject.findOne({ _id: body.projectId, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  const amount = moneyAmount(body.amount);
  if (amount <= 0) throw new AppError('Amount must be greater than zero', 400);
  const adjustment = await ProjectAdjustment.create({
    projectId: project._id,
    type: body.type,
    amount,
    currency: body.currency || project.currency || 'INR',
    appliedAt: body.appliedAt || new Date(),
    notes: body.notes || '',
    createdBy: user._id
  });
  return { adjustment, ledger: await computePartnershipSettlement(project) };
}
