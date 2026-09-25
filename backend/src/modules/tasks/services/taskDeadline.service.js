import { Task } from '../task.models.js';
import { CLOSED_TASK_STATUSES, NOTIFICATION_TYPES } from '../task.constants.js';
import { uniqueIds } from './context.js';
import { notify, taskLabel, taskLink } from './taskNotify.service.js';
import { getTaskSettings } from './workCalendar.service.js';

/** Idempotent deadline alerts: one "approaching" and one "overdue" notification per task deadline value. */
export async function runDeadlineNotifications(now = new Date()) {
  const settings = await getTaskSettings();
  const horizon = new Date(now.getTime() + settings.deadlineReminderHours * 3600000);
  const open = { isArchived: false, status: { $nin: CLOSED_TASK_STATUSES } };
  const [approaching, overdue] = await Promise.all([
    Task.find({ ...open, deadline: { $gte: now, $lte: horizon } }, 'taskKey title deadline owner assignee').limit(5000).lean(),
    Task.find({ ...open, deadline: { $lt: now } }, 'taskKey title deadline owner assignee assignedBy').limit(5000).lean()
  ]);
  let sent = 0;
  for (const task of approaching) {
    sent += await notify(uniqueIds([task.assignee || task.owner]), {
      type: NOTIFICATION_TYPES.TASK_DEADLINE_APPROACHING, title: 'Deadline approaching',
      message: `${taskLabel(task)} is due ${task.deadline.toISOString().replace('T', ' ').slice(0, 16)} UTC.`,
      entityType: 'Task', entityId: task._id, link: taskLink(task), dueDate: task.deadline,
      dedupeKey: `task-deadline:${task._id}:${task.deadline.toISOString()}`
    });
  }
  for (const task of overdue) {
    sent += await notify(uniqueIds([task.assignee || task.owner, task.assignedBy]), {
      type: NOTIFICATION_TYPES.TASK_OVERDUE, title: 'Task overdue',
      message: `${taskLabel(task)} passed its deadline (${task.deadline.toISOString().slice(0, 10)}).`,
      entityType: 'Task', entityId: task._id, link: taskLink(task), dueDate: task.deadline,
      dedupeKey: `task-overdue:${task._id}:${task.deadline.toISOString()}`
    });
  }
  return { approaching: approaching.length, overdue: overdue.length, sent };
}
