import cron from 'node-cron';
import User from '../modules/auth/user.model.js';
import { CrmClient, CrmInvoice, CrmProject, FollowUp, PartnerDue, PartnerSettlement, ProjectMilestone } from '../modules/crm/crm.models.js';
import { dueAlertFromLedger } from '../modules/crm/crm.finance.js';
import { moneyAmount, notifyUser } from '../modules/crm/crm.helpers.js';

export async function processCrmReminders(now = new Date()) {
  const due = await FollowUp.find({
    isDeleted: false,
    status: 'PENDING',
    reminderDateTime: { $lte: now },
    reminderSentAt: null
  }).populate('leadId', 'leadName companyName').populate('clientId', 'clientName clientId').limit(100).lean();

  for (const followUp of due) {
    const leadName = followUp.leadId?.leadName || followUp.leadId?.companyName
      || followUp.clientId?.clientName || 'a record';
    const timeLabel = followUp.nextFollowUpTime || '';
    const isPayment = followUp.target === 'PAYMENT' || followUp.followUpType === 'PAYMENT_DISCUSSION';
    await notifyUser({
      recipient: followUp.assignedSalesPerson,
      type: isPayment ? 'PAYMENT_FOLLOW_UP_REMINDER' : 'FOLLOW_UP_REMINDER',
      title: isPayment ? 'Payment follow-up reminder' : 'Follow-up reminder',
      message: `You have a follow-up scheduled with ${leadName}${timeLabel ? ` at ${timeLabel}` : ''}.`,
      entityType: followUp.clientId ? 'CrmClient' : 'CrmLead',
      entityId: followUp.clientId?._id || followUp.leadId?._id || followUp.leadId,
      link: followUp.clientId?._id
        ? `/crm/clients/${followUp.clientId._id}`
        : (followUp.leadId?._id ? `/crm/leads/${followUp.leadId._id}` : '/crm/leads'),
      dueDate: followUp.nextFollowUpDate,
      dedupeKey: `crm-followup-reminder:${followUp._id}:${String(followUp.reminderDateTime)}`
    });
    await FollowUp.updateOne({ _id: followUp._id }, { $set: { reminderSentAt: now } });
  }

  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const overdueFollowUps = await FollowUp.find({
    isDeleted: false,
    status: 'PENDING',
    nextFollowUpDate: { $lt: start }
  }).populate('leadId', 'leadName').populate('clientId', 'clientName').limit(50).lean();

  for (const followUp of overdueFollowUps) {
    const isPayment = followUp.target === 'PAYMENT' || followUp.followUpType === 'PAYMENT_DISCUSSION';
    await notifyUser({
      recipient: followUp.assignedSalesPerson,
      type: isPayment ? 'OVERDUE_PAYMENT_FOLLOW_UP' : 'OVERDUE_FOLLOW_UP',
      title: isPayment ? 'Overdue payment follow-up' : 'Overdue follow-up',
      message: `Follow-up with ${followUp.leadId?.leadName || followUp.clientId?.clientName || 'a record'} is overdue.`,
      entityType: followUp.clientId ? 'CrmClient' : 'CrmLead',
      entityId: followUp.clientId?._id || followUp.leadId?._id || followUp.leadId,
      link: followUp.clientId?._id
        ? `/crm/clients/${followUp.clientId._id}`
        : (followUp.leadId?._id ? `/crm/leads/${followUp.leadId._id}` : '/crm/leads'),
      dueDate: followUp.nextFollowUpDate,
      dedupeKey: `crm-overdue-followup:${followUp._id}:${start.toISOString().slice(0, 10)}`
    });
  }

  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const milestones = await ProjectMilestone.find({
    isDeleted: false,
    status: { $in: ['PENDING', 'IN_PROGRESS'] },
    dueDate: { $gte: now, $lte: soon }
  }).limit(50).lean();

  for (const milestone of milestones) {
    for (const userId of milestone.assignedTeam || []) {
      await notifyUser({
        recipient: userId,
        type: 'PROJECT_MILESTONE_REMINDER',
        title: 'Milestone due soon',
        message: `${milestone.milestoneName} is due within 24 hours.`,
        entityType: 'CrmProject',
        entityId: milestone.projectId,
        link: `/crm/projects/${milestone.projectId}`,
        dedupeKey: `crm-milestone:${milestone._id}:${userId}:${String(milestone.dueDate)}`
      });
    }
  }

  const projects = await CrmProject.find({
    isDeleted: false,
    $or: [{ outstanding: { $gt: 0 } }, { nextPaymentDueDate: { $ne: null } }]
  }).select('projectId projectName clientId projectManager outstanding nextPaymentDueDate paymentReminderDays currency confirmedReceived contractValue finalAmount creditsTotal').lean();

  for (const project of projects) {
    const outstanding = moneyAmount(project.outstanding ?? 0);
    if (outstanding <= 0) continue;
    const client = await CrmClient.findById(project.clientId).select('clientId clientName companyName assignedTo').lean();
    const ledger = {
      outstanding,
      nextPaymentDueDate: project.nextPaymentDueDate,
      currency: project.currency || 'INR'
    };
    const alert = dueAlertFromLedger(project, client, ledger, now);
    if (!alert) continue;
    const recipients = [client?.assignedTo, project.projectManager].filter(Boolean);
    const unique = [...new Set(recipients.map((id) => String(id)))];
    const dayKey = start.toISOString().slice(0, 10);
    for (const recipient of unique) {
      await notifyUser({
        recipient,
        type: alert.kind === 'OVERDUE' ? 'PAYMENT_OVERDUE' : 'PAYMENT_DUE',
        title: alert.kind === 'OVERDUE' ? 'Overdue payment' : 'Upcoming payment',
        message: `${alert.clientName || 'Client'} (${alert.clientId || 'CLT'}) · ${alert.projectId} is ${alert.kind === 'OVERDUE' ? 'overdue' : 'due'} on ${new Date(alert.dueDate).toLocaleDateString('en-IN')}. Outstanding ${alert.currency} ${alert.outstanding}.`,
        entityType: 'CrmProject',
        entityId: project._id,
        link: `/crm/projects/${project._id}`,
        dueDate: alert.dueDate,
        dedupeKey: `crm-payment-${alert.kind.toLowerCase()}:${project._id}:${dayKey}`
      });
    }
  }

  const dayKey = start.toISOString().slice(0, 10);
  const financeUsers = await User.find({ role: { $in: ['SUPER_ADMIN', 'FINANCE'] }, isActive: { $ne: false } }).select('_id').lean();
  const overdueInvoices = await CrmInvoice.find({
    isDeleted: false,
    status: { $nin: ['PAID', 'CANCELLED', 'DRAFT'] },
    dueDate: { $lt: start }
  }).populate('clientId', 'clientId clientName assignedTo').populate('projectId', 'projectId projectName projectManager assignedSalesperson').limit(100).lean();
  for (const invoice of overdueInvoices) {
    const recipients = [
      invoice.clientId?.assignedTo,
      invoice.projectId?.projectManager,
      invoice.projectId?.assignedSalesperson,
      ...financeUsers.map((user) => user._id)
    ].filter(Boolean);
    const unique = [...new Set(recipients.map((id) => String(id)))];
    for (const recipient of unique) {
      await notifyUser({
        recipient,
        type: 'INVOICE_OVERDUE',
        title: 'Overdue invoice',
        message: `${invoice.invoiceNumber} for ${invoice.clientId?.clientName || 'client'} · ${invoice.projectId?.projectId || ''} is overdue. Balance ${invoice.currency || 'INR'} ${moneyAmount(invoice.balanceDue ?? (invoice.totalAmount - invoice.amountPaid))}.`,
        entityType: 'CrmInvoice',
        entityId: invoice._id,
        link: `/crm/finance?projectId=${invoice.projectId?._id || invoice.projectId}`,
        dueDate: invoice.dueDate,
        dedupeKey: `crm-invoice-overdue:${invoice._id}:${dayKey}`
      });
    }
  }

  const openDues = await PartnerDue.find({
    isDeleted: false,
    status: { $nin: ['SETTLED', 'CANCELLED'] },
    remaining: { $gt: 0 },
    dueDate: { $ne: null }
  }).populate('projectId', 'projectId projectName assignedSalesperson projectManager').limit(100).lean();
  for (const due of openDues) {
    const dueDate = new Date(due.dueDate);
    const upcomingUntil = new Date(start.getTime() + 3 * 86_400_000);
    const overdue = dueDate < start;
    const upcoming = !overdue && dueDate <= upcomingUntil;
    if (!overdue && !upcoming) continue;
    const recipients = [
      due.assignedTo,
      due.projectId?.projectManager,
      due.projectId?.assignedSalesperson,
      ...financeUsers.map((user) => user._id)
    ].filter(Boolean);
    const unique = [...new Set(recipients.map((id) => String(id)))];
    const kind = overdue ? 'OVERDUE' : 'UPCOMING';
    for (const recipient of unique) {
      await notifyUser({
        recipient,
        type: overdue ? 'DUE_OVERDUE' : 'DUE_UPCOMING',
        title: overdue ? 'Overdue partner due' : 'Upcoming partner due',
        message: `${due.dueId} · ${due.title} · ${due.partnerName} on ${due.projectId?.projectId || 'project'} is ${kind.toLowerCase()}. Remaining ${due.currency || 'INR'} ${moneyAmount(due.remaining)}.`,
        entityType: 'PartnerDue',
        entityId: due._id,
        link: `/crm/finance?dues=1&dueId=${due._id}`,
        dueDate: due.dueDate,
        dedupeKey: `crm-due-${kind.toLowerCase()}:${due._id}:${dayKey}`
      });
    }
  }

  const pendingSettlements = await PartnerSettlement.find({
    isDeleted: false,
    status: 'PENDING',
    dueDate: { $lt: start }
  }).populate('projectId', 'projectId projectName assignedSalesperson projectManager').populate('partnerId', 'name').limit(50).lean();
  for (const settlement of pendingSettlements) {
    const recipients = [
      settlement.projectId?.projectManager,
      settlement.projectId?.assignedSalesperson,
      ...financeUsers.map((user) => user._id)
    ].filter(Boolean);
    const unique = [...new Set(recipients.map((id) => String(id)))];
    for (const recipient of unique) {
      await notifyUser({
        recipient,
        type: 'SETTLEMENT_OVERDUE',
        title: 'Overdue partner settlement',
        message: `${settlement.settlementId} to ${settlement.partnerId?.name || 'partner'} on ${settlement.projectId?.projectId || 'project'} is overdue.`,
        entityType: 'PartnerSettlement',
        entityId: settlement._id,
        link: `/crm/projects/${settlement.projectId?._id || settlement.projectId}`,
        dueDate: settlement.dueDate,
        dedupeKey: `crm-settlement-overdue:${settlement._id}:${dayKey}`
      });
    }
  }
}

export function startCrmReminderJobs() {
  cron.schedule('* * * * *', async () => {
    try {
      await processCrmReminders();
    } catch (error) {
      process.stderr.write(`[CRM] Reminder job failed: ${error.message}\n`);
    }
  });
}
