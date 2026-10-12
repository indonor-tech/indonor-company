import cron from 'node-cron';
import { FollowUp, ProjectMilestone } from '../modules/crm/crm.models.js';
import { notifyUser } from '../modules/crm/crm.helpers.js';

export function startCrmReminderJobs() {
  // Spec: check pending reminders frequently and notify assigned sales users.
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const due = await FollowUp.find({
      isDeleted: false,
      status: 'PENDING',
      reminderDateTime: { $lte: now },
      reminderSentAt: null
    }).populate('leadId', 'leadName companyName').limit(100).lean();

    for (const followUp of due) {
      const leadName = followUp.leadId?.leadName || followUp.leadId?.companyName || 'a lead';
      const timeLabel = followUp.nextFollowUpTime || '';
      await notifyUser({
        recipient: followUp.assignedSalesPerson,
        type: 'FOLLOW_UP_REMINDER',
        title: 'Follow-up reminder',
        message: `You have a follow-up scheduled with ${leadName}${timeLabel ? ` at ${timeLabel}` : ''}.`,
        entityType: 'CrmLead',
        entityId: followUp.leadId?._id || followUp.leadId,
        link: followUp.leadId?._id ? `/crm/leads/${followUp.leadId._id}` : '/crm/leads',
        dedupeKey: `crm-followup-reminder:${followUp._id}:${String(followUp.reminderDateTime)}`
      });
      await FollowUp.updateOne({ _id: followUp._id }, { $set: { reminderSentAt: now } });
    }

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const overdueFollowUps = await FollowUp.find({
      isDeleted: false,
      status: 'PENDING',
      nextFollowUpDate: { $lt: start }
    }).populate('leadId', 'leadName').limit(50).lean();

    for (const followUp of overdueFollowUps) {
      await notifyUser({
        recipient: followUp.assignedSalesPerson,
        type: 'OVERDUE_FOLLOW_UP',
        title: 'Overdue follow-up',
        message: `Follow-up with ${followUp.leadId?.leadName || 'a lead'} is overdue.`,
        entityType: 'CrmLead',
        entityId: followUp.leadId?._id || followUp.leadId,
        link: followUp.leadId?._id ? `/crm/leads/${followUp.leadId._id}` : '/crm/leads',
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
  });
}
