import cron from 'node-cron';
import { finalizePendingDays, runDailyReminders } from '../modules/tasks/services/workLog.service.js';
import { runDeadlineNotifications } from '../modules/tasks/services/taskDeadline.service.js';

const running = new Set();

function guarded(name, task) {
  return async () => {
    if (running.has(name)) return;
    running.add(name);
    try {
      await task(new Date());
    } catch (error) {
      process.stderr.write(`[tasks job:${name}] ${error.message}\n`);
    } finally {
      running.delete(name);
    }
  };
}

/** All schedules evaluate business dates on the server clock in the configured company timezone. */
export function startTaskJobs() {
  const reminders = guarded('reminders', runDailyReminders);
  const finalize = guarded('finalize', (now) => finalizePendingDays(now, 7));
  const deadlines = guarded('deadlines', runDeadlineNotifications);
  cron.schedule('* * * * *', reminders);
  cron.schedule('*/5 * * * *', finalize);
  cron.schedule('10 * * * *', deadlines);
  finalize();
}
