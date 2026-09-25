import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import User from '../../auth/user.model.js';
import Employee from '../../employees/employee.model.js';
import { hasPermission } from '../../auth/roles.js';
import { Notification } from '../../common/support.model.js';
import { AppError } from '../../../utils/errors.js';
import { DailyWorkLog, Task, TaskMention } from '../task.models.js';
import { CLOSED_TASK_STATUSES, OPEN_TASK_STATUSES, TASK_STATUSES } from '../task.constants.js';
import { taskScopeFilter, teamUserIds } from './taskAccess.service.js';
import { buildTaskFilter, subtaskProgress } from './task.service.js';
import { requiredUsers } from './workLog.service.js';
import { addDays, eachDateKey, getDayInfos, isDateKey, isDateLocked, lockInstant, todayContext, zonedTimeToUtc } from './workCalendar.service.js';

export const REPORT_TYPES = ['daily', 'weekly', 'monthly', 'employee', 'project', 'pending', 'completed', 'overdue', 'blocked', 'missing'];
const EXPORT_ROW_LIMIT = 10000;
const effectiveStatus = { $ifNull: ['$corrected.status', '$status'] };
function statusBuckets(rows) {
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0]));
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

async function range(query, today, defaultDays = 30) {
  const to = isDateKey(query.to) ? query.to : today.today;
  const from = isDateKey(query.from) ? query.from : addDays(to, -(defaultDays - 1));
  if (from > to) throw new AppError('"from" must be on or before "to".', 422);
  if (eachDateKey(from, to).length > 400) throw new AppError('Choose a date range of at most 400 days.', 422);
  return { from, to, start: zonedTimeToUtc(from, 0, 0, today.timezone), end: lockInstant(to, today.timezone) };
}

/** Users whose submissions the viewer may see (all required users, or the Team Lead's reports). */
async function scopedRequiredUsers(user, settings, dateKey) {
  const users = await requiredUsers(settings, dateKey);
  if (hasPermission(user, 'worklog:read:all')) return users;
  const team = await teamUserIds(user);
  return users.filter((item) => team.includes(String(item._id)));
}

function periodKey(dateKey, grain) {
  if (grain === 'monthly') return dateKey.slice(0, 7);
  if (grain === 'weekly') {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - weekday + 1);
    return `Week of ${date.toISOString().slice(0, 10)}`;
  }
  return dateKey;
}

async function submissionStats(user, settings, from, to, now) {
  const days = (await getDayInfos(from, to, settings)).filter((day) => day.isWorkingDay && isDateLocked(day.date, settings.timezone, now));
  if (!days.length) return { byDate: new Map(), required: 0, submitted: 0 };
  const users = await scopedRequiredUsers(user, settings, to);
  const logs = await DailyWorkLog.aggregate([
    { $match: { workDate: { $in: days.map((day) => day.date) }, status: 'SUBMITTED', user: { $in: users.map((item) => item._id) } } },
    { $group: { _id: '$workDate', count: { $sum: 1 } } }
  ]);
  const submittedByDate = new Map(logs.map((row) => [row._id, row.count]));
  const byDate = new Map();
  let required = 0;
  let submitted = 0;
  for (const day of days) {
    const cutoff = lockInstant(day.date, settings.timezone);
    const requiredCount = users.filter((item) => new Date(item.createdAt) < cutoff).length;
    const submittedCount = submittedByDate.get(day.date) || 0;
    byDate.set(day.date, { required: requiredCount, submitted: submittedCount });
    required += requiredCount;
    submitted += submittedCount;
  }
  return { byDate, required, submitted };
}

async function periodReport(ctx, query, grain, today) {
  const { from, to, start, end } = await range(query, today, grain === 'monthly' ? 365 : grain === 'weekly' ? 84 : 30);
  const scope = await taskScopeFilter(ctx.user);
  const base = { $and: [scope, { isArchived: false }] };
  const [created, completed, submissions] = await Promise.all([
    Task.aggregate([{ $match: { ...base, workDate: { $gte: from, $lte: to } } }, { $group: { _id: '$workDate', count: { $sum: 1 }, blocked: { $sum: { $cond: [{ $eq: [effectiveStatus, 'BLOCKED'] }, 1, 0] } } } }]),
    Task.aggregate([{ $match: { ...base, completedAt: { $gte: start, $lt: end } } }, { $project: { day: { $dateToString: { date: '$completedAt', format: '%Y-%m-%d', timezone: today.timezone } }, hours: { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 3600000] } } }, { $group: { _id: '$day', count: { $sum: 1 }, hours: { $sum: '$hours' } } }]),
    submissionStats(ctx.user, today.settings, from, to, ctx.now)
  ]);
  const periods = new Map();
  const bucket = (key) => {
    if (!periods.has(key)) periods.set(key, { period: key, created: 0, completed: 0, blockedCreated: 0, completionHours: 0, required: 0, submitted: 0 });
    return periods.get(key);
  };
  for (const key of eachDateKey(from, to)) bucket(periodKey(key, grain));
  for (const row of created) { const item = bucket(periodKey(row._id, grain)); item.created += row.count; item.blockedCreated += row.blocked; }
  for (const row of completed) { const item = bucket(periodKey(row._id, grain)); item.completed += row.count; item.completionHours += row.hours; }
  for (const [date, stats] of submissions.byDate) { const item = bucket(periodKey(date, grain)); item.required += stats.required; item.submitted += stats.submitted; }
  const rows = [...periods.values()].map((item) => ({
    period: item.period, created: item.created, completed: item.completed, blockedCreated: item.blockedCreated,
    avgCompletionHours: item.completed ? Number((item.completionHours / item.completed).toFixed(1)) : null,
    submitted: item.submitted, missing: Math.max(item.required - item.submitted, 0),
    submissionRate: item.required ? `${Math.round((item.submitted / item.required) * 100)}%` : '—'
  }));
  return {
    columns: [
      ['period', grain === 'daily' ? 'Date' : grain === 'weekly' ? 'Week' : 'Month'], ['created', 'Tasks created'], ['completed', 'Tasks completed'],
      ['blockedCreated', 'Created & blocked'], ['avgCompletionHours', 'Avg completion (h)'], ['submitted', 'Logs submitted'], ['missing', 'Logs missing'], ['submissionRate', 'Submission rate']
    ],
    rows, range: { from, to }
  };
}

async function groupedReport(ctx, query, today, by) {
  const { from, to } = await range(query, today, 30);
  const filter = await buildTaskFilter(ctx.user, { ...query, dateFrom: from, dateTo: to }, ctx.now);
  const groupField = by === 'employee' ? { $ifNull: ['$assignee', '$owner'] } : '$project';
  const rows = await Task.aggregate([
    { $match: filter },
    { $project: { key: groupField, status: effectiveStatus, deadline: 1, completedAt: 1, createdAt: 1, reopenCount: 1, estimatedHours: 1, actualHours: 1 } },
    {
      $group: {
        _id: '$key', total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $in: ['$status', ['PENDING', 'ON_HOLD']] }, 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ['$status', 'BLOCKED'] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$deadline', ctx.now] }, { $gt: ['$deadline', null] }, { $not: [{ $in: ['$status', CLOSED_TASK_STATUSES] }] }] }, 1, 0] } },
        reopened: { $sum: { $cond: [{ $gt: ['$reopenCount', 0] }, 1, 0] } },
        estimated: { $sum: { $ifNull: ['$estimatedHours', 0] } },
        actual: { $sum: { $ifNull: ['$actualHours', 0] } }
      }
    },
    { $sort: { total: -1 } }
  ]);
  const ids = rows.map((row) => row._id).filter(Boolean);
  const names = by === 'employee'
    ? new Map((await User.find({ _id: { $in: ids } }, 'name').lean()).map((user) => [String(user._id), user.name]))
    : new Map((await mongoose.model('Project').find({ _id: { $in: ids } }, 'name').lean()).map((project) => [String(project._id), project.name]));
  return {
    columns: [
      ['name', by === 'employee' ? 'Employee' : 'Project'], ['total', 'Total'], ['completed', 'Completed'], ['inProgress', 'In progress'],
      ['pending', 'Pending'], ['blocked', 'Blocked'], ['overdue', 'Overdue'], ['reopened', 'Reopened'], ['estimated', 'Estimated (h)'], ['actual', 'Actual (h)']
    ],
    rows: rows.map((row) => ({ ...row, name: names.get(String(row._id)) || (by === 'employee' ? 'Unassigned' : 'No project'), estimated: Number(row.estimated.toFixed(1)), actual: Number(row.actual.toFixed(1)) })),
    range: { from, to }
  };
}

async function taskListReport(ctx, query, today, type) {
  const presets = {
    pending: { status: OPEN_TASK_STATUSES.join(',') },
    completed: { status: 'COMPLETED' },
    overdue: { overdue: 'true' },
    blocked: { status: 'BLOCKED' }
  };
  const params = { ...query, ...presets[type] };
  if (type === 'completed' && (query.from || query.to)) {
    const { start, end } = await range(query, today, 30);
    params.completedStart = start;
    params.completedEnd = end;
  } else if (type !== 'overdue' && (query.from || query.to)) {
    params.dateFrom = query.from;
    params.dateTo = query.to;
  }
  const filter = await buildTaskFilter(ctx.user, params, ctx.now);
  if (params.completedStart) filter.$and.push({ completedAt: { $gte: params.completedStart, $lt: params.completedEnd } });
  const limit = query.export ? EXPORT_ROW_LIMIT : Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const page = query.export ? 1 : Math.max(Number(query.page) || 1, 1);
  const [tasks, total] = await Promise.all([
    Task.find(filter, '-content').populate('owner assignee assignedBy', 'name').populate('project', 'name').populate('department', 'name')
      .sort(type === 'overdue' ? { deadline: 1 } : { createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Task.countDocuments(filter)
  ]);
  const progress = await subtaskProgress(tasks.map((task) => task._id));
  return {
    columns: [
      ['taskKey', 'Task'], ['title', 'Title'], ['status', 'Status'], ['priority', 'Priority'], ['assignee', 'Assignee'], ['assignedBy', 'Assigned by'],
      ['project', 'Project'], ['client', 'Client'], ['department', 'Department'], ['technology', 'Technology'], ['workDate', 'Date'],
      ['deadline', 'Deadline'], ['completedAt', 'Completed'], ['progress', 'Subtasks'], ['estimatedHours', 'Est. (h)'], ['actualHours', 'Actual (h)']
    ],
    rows: tasks.map((task) => {
      const effective = { ...task, ...(task.corrected || {}) };
      const item = progress.get(String(task._id));
      return {
        _id: task._id, taskKey: task.taskKey, title: effective.title, status: effective.status, priority: effective.priority,
        assignee: task.assignee?.name || task.owner?.name || '', assignedBy: task.assignedBy?.name || '', project: task.project?.name || '',
        client: task.client || '', department: task.department?.name || '', technology: task.technology || '', workDate: task.workDate,
        deadline: effective.deadline ? new Date(effective.deadline).toISOString().slice(0, 10) : '',
        completedAt: task.completedAt ? new Date(task.completedAt).toISOString().slice(0, 16).replace('T', ' ') : '',
        progress: item ? `${item.completed}/${item.total}` : '', estimatedHours: task.estimatedHours ?? '', actualHours: task.actualHours ?? ''
      };
    }),
    total, page, limit
  };
}

async function missingReport(ctx, query, today) {
  const { from, to } = await range(query, today, 30);
  const days = (await getDayInfos(from, to, today.settings)).filter((day) => day.isWorkingDay && isDateLocked(day.date, today.timezone, ctx.now));
  const users = await scopedRequiredUsers(ctx.user, today.settings, to);
  const filteredUsers = query.employee ? users.filter((user) => String(user._id) === String(query.employee)) : users;
  const logs = await DailyWorkLog.find({ workDate: { $in: days.map((day) => day.date) }, user: { $in: filteredUsers.map((user) => user._id) } }, 'user workDate status correctionCount notSubmittedMarkedAt').lean();
  const byKey = new Map(logs.map((log) => [`${log.user}:${log.workDate}`, log]));
  const rows = [];
  for (const day of days) {
    const cutoff = lockInstant(day.date, today.timezone);
    for (const user of filteredUsers) {
      if (new Date(user.createdAt) >= cutoff) continue;
      const log = byKey.get(`${user._id}:${day.date}`);
      if (log?.status === 'SUBMITTED') continue;
      rows.push({ date: day.date, employee: user.name, email: user.email, status: 'NOT_SUBMITTED', corrected: log?.correctionCount ? 'Correction approved' : '', markedAt: log?.notSubmittedMarkedAt ? new Date(log.notSubmittedMarkedAt).toISOString().slice(0, 16).replace('T', ' ') : '' });
    }
  }
  rows.sort((a, b) => (a.date === b.date ? a.employee.localeCompare(b.employee) : b.date.localeCompare(a.date)));
  return { columns: [['date', 'Date'], ['employee', 'Employee'], ['email', 'Email'], ['status', 'Status'], ['corrected', 'Correction'], ['markedAt', 'Marked at (UTC)']], rows, range: { from, to } };
}

export async function buildReport(ctx, type, query = {}) {
  if (!REPORT_TYPES.includes(type)) throw new AppError('Unknown report type', 404);
  const today = await todayContext(ctx.now);
  let report;
  if (['daily', 'weekly', 'monthly'].includes(type)) report = await periodReport(ctx, query, type, today);
  else if (type === 'employee' || type === 'project') report = await groupedReport(ctx, query, today, type);
  else if (type === 'missing') report = await missingReport(ctx, query, today);
  else report = await taskListReport(ctx, query, today, type);
  return { type, generatedAt: ctx.now, timezone: today.timezone, ...report, columns: report.columns.map(([key, label]) => ({ key, label })) };
}

const cell = (value) => (value === null || value === undefined ? '' : value);

export function reportToCsv(report) {
  const escape = (value) => {
    let text = String(cell(value));
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [report.columns.map((column) => escape(column.label)).join(','), ...report.rows.map((row) => report.columns.map((column) => escape(row[column.key])).join(','))].join('\r\n');
}

export async function reportToXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Indonor CRM';
  workbook.created = new Date(report.generatedAt);
  const sheet = workbook.addWorksheet(`${report.type} report`.slice(0, 31));
  sheet.columns = report.columns.map((column) => ({ header: column.label, key: column.key, width: Math.min(Math.max(column.label.length + 4, 12), 40) }));
  sheet.getRow(1).font = { bold: true };
  for (const row of report.rows) {
    sheet.addRow(Object.fromEntries(report.columns.map((column) => {
      const value = cell(row[column.key]);
      return [column.key, typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : value];
    })));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function reportToPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).text(`${report.type[0].toUpperCase()}${report.type.slice(1)} report`, { continued: false });
    doc.fontSize(9).fillColor('#667085').text(`Generated ${new Date(report.generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC · Timezone ${report.timezone}${report.range ? ` · ${report.range.from} to ${report.range.to}` : ''}`);
    doc.moveDown(0.8).fillColor('#000');
    const columns = report.columns.slice(0, 12);
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const width = usable / columns.length;
    const drawRow = (values, bold) => {
      const y = doc.y;
      const heights = values.map((value) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).heightOfString(String(cell(value)).slice(0, 200), { width: width - 4 }));
      const height = Math.max(...heights, 10) + 4;
      if (y + height > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        return drawRow(values, bold);
      }
      values.forEach((value, index) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).text(String(cell(value)).slice(0, 200), doc.page.margins.left + index * width + 2, y + 2, { width: width - 4 });
      });
      doc.moveTo(doc.page.margins.left, y + height).lineTo(doc.page.margins.left + usable, y + height).strokeColor('#e5e7eb').stroke();
      doc.y = y + height;
      return undefined;
    };
    drawRow(columns.map((column) => column.label), true);
    for (const row of report.rows.slice(0, 2000)) drawRow(columns.map((column) => row[column.key]), false);
    if (!report.rows.length) doc.moveDown().font('Helvetica').fontSize(10).text('No records for the selected filters.');
    doc.end();
  });
}

async function statusCounts(filter) {
  return statusBuckets(await Task.aggregate([{ $match: filter }, { $group: { _id: effectiveStatus, count: { $sum: 1 } } }]));
}

export async function employeeDashboard(ctx) {
  const today = await todayContext(ctx.now);
  const uid = ctx.user._id;
  const mine = { isArchived: false, $or: [{ owner: uid }, { assignee: uid }] };
  const open = { status: { $nin: CLOSED_TASK_STATUSES } };
  const weekAhead = new Date(ctx.now.getTime() + 7 * 86400000);
  const from = addDays(today.today, -13);
  const listFields = 'taskKey title status priority deadline workDate parent assignedBy';
  const [counts, todayTasks, overdue, assigned, mentionedRows, upcoming, todayLog, recentLogs, notifications, completedDaily] = await Promise.all([
    statusCounts(mine),
    Task.find({ ...mine, $and: [{ $or: [{ workDate: today.today }, { deadline: { $gte: zonedTimeToUtc(today.today, 0, 0, today.timezone), $lt: today.lockAt } }, { status: 'IN_PROGRESS' }] }] }, listFields).sort({ priority: -1, deadline: 1 }).limit(20).lean(),
    Task.find({ ...mine, ...open, deadline: { $lt: ctx.now } }, listFields).sort({ deadline: 1 }).limit(20).lean(),
    Task.find({ assignee: uid, assignedBy: { $exists: true, $ne: uid }, isArchived: false, ...open }, listFields).populate('assignedBy', 'name').sort({ createdAt: -1 }).limit(20).lean(),
    TaskMention.find({ mentionedUser: uid }).sort({ createdAt: -1 }).limit(10).populate('task', 'taskKey title status').populate('mentionedBy', 'name').lean(),
    Task.find({ ...mine, ...open, deadline: { $gte: ctx.now, $lte: weekAhead } }, listFields).sort({ deadline: 1 }).limit(20).lean(),
    DailyWorkLog.findOne({ user: uid, workDate: today.today }).lean(),
    DailyWorkLog.find({ user: uid, workDate: { $lt: today.today } }, 'workDate status summary submittedAt correctionCount dayType').sort({ workDate: -1 }).limit(7).lean(),
    Notification.find({ recipient: uid }).sort({ createdAt: -1 }).limit(8).lean(),
    Task.aggregate([
      { $match: { ...mine, completedAt: { $gte: zonedTimeToUtc(from, 0, 0, today.timezone), $lt: today.lockAt } } },
      { $group: { _id: { $dateToString: { date: '$completedAt', format: '%Y-%m-%d', timezone: today.timezone } }, count: { $sum: 1 } } }
    ])
  ]);
  const completedByDay = new Map(completedDaily.map((row) => [row._id, row.count]));
  return {
    today: today.today, timezone: today.timezone, day: today.day, lockAt: today.lockAt, serverTime: ctx.now,
    counts: { ...counts, overdue: overdue.length, assigned: assigned.length, mentioned: mentionedRows.length, total: Object.values(counts).reduce((sum, value) => sum + value, 0) },
    todayTasks, overdue, assigned, upcoming,
    mentioned: mentionedRows.filter((row) => row.task),
    todayLog, recentLogs, notifications,
    completedTrend: eachDateKey(from, today.today).map((date) => ({ date: date.slice(5), completed: completedByDay.get(date) || 0 }))
  };
}

export async function adminDashboard(ctx, query = {}) {
  const today = await todayContext(ctx.now);
  const scope = await taskScopeFilter(ctx.user);
  const base = { $and: [scope, { isArchived: false }] };
  const days = Math.min(Math.max(Number(query.days) || 30, 7), 180);
  const from = addDays(today.today, -(days - 1));
  const start = zonedTimeToUtc(from, 0, 0, today.timezone);
  const [counts, overdue, byEmployee, byProject, byDepartment, createdDaily, completedDaily, reopened, avgCompletion, required, todayLogs, totalEmployees, submissions] = await Promise.all([
    statusCounts(base),
    Task.countDocuments({ ...base, deadline: { $lt: ctx.now }, status: { $nin: CLOSED_TASK_STATUSES } }),
    Task.aggregate([{ $match: base }, { $group: { _id: { user: { $ifNull: ['$assignee', '$owner'] }, status: effectiveStatus }, count: { $sum: 1 } } }]),
    Task.aggregate([{ $match: base }, { $group: { _id: { project: '$project', status: effectiveStatus }, count: { $sum: 1 } } }]),
    Task.aggregate([{ $match: base }, { $group: { _id: '$department', count: { $sum: 1 }, open: { $sum: { $cond: [{ $in: [effectiveStatus, OPEN_TASK_STATUSES] }, 1, 0] } } } }]),
    Task.aggregate([{ $match: { ...base, workDate: { $gte: from } } }, { $group: { _id: '$workDate', count: { $sum: 1 } } }]),
    Task.aggregate([{ $match: { ...base, completedAt: { $gte: start } } }, { $group: { _id: { $dateToString: { date: '$completedAt', format: '%Y-%m-%d', timezone: today.timezone } }, count: { $sum: 1 } } }]),
    Task.countDocuments({ ...base, reopenCount: { $gt: 0 } }),
    Task.aggregate([{ $match: { ...base, completedAt: { $gte: start } } }, { $group: { _id: null, hours: { $avg: { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 3600000] } } } }]),
    scopedRequiredUsers(ctx.user, today.settings, today.today),
    DailyWorkLog.find({ workDate: today.today, status: 'SUBMITTED' }, 'user').lean(),
    Employee.countDocuments({ isDeleted: false, employmentStatus: { $in: ['ACTIVE', 'ON_PROBATION', 'ON_LEAVE'] } }),
    submissionStats(ctx.user, today.settings, from, today.today, ctx.now)
  ]);
  const requiredIds = new Set(required.map((user) => String(user._id)));
  const submittedToday = todayLogs.filter((log) => requiredIds.has(String(log.user))).map((log) => String(log.user));
  const missingToday = today.day.isWorkingDay ? required.filter((user) => !submittedToday.includes(String(user._id))) : [];
  const userNames = new Map((await User.find({ _id: { $in: byEmployee.map((row) => row._id.user).filter(Boolean) } }, 'name').lean()).map((user) => [String(user._id), user.name]));
  const projectNames = new Map((await mongoose.model('Project').find({ _id: { $in: byProject.map((row) => row._id.project).filter(Boolean) } }, 'name').lean()).map((project) => [String(project._id), project.name]));
  const departmentNames = new Map((await mongoose.model('Department').find({ _id: { $in: byDepartment.map((row) => row._id).filter(Boolean) } }, 'name').lean()).map((department) => [String(department._id), department.name]));
  const pivot = (rows, keyOf, nameOf) => {
    const map = new Map();
    for (const row of rows) {
      const key = String(keyOf(row) || 'none');
      if (!map.has(key)) map.set(key, { id: key, name: nameOf(key), total: 0, ...Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) });
      const item = map.get(key);
      item[row._id.status] += row.count;
      item.total += row.count;
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 15);
  };
  const createdMap = new Map(createdDaily.map((row) => [row._id, row.count]));
  const completedMap = new Map(completedDaily.map((row) => [row._id, row.count]));
  const daily = eachDateKey(from, today.today).map((date) => ({
    date, created: createdMap.get(date) || 0, completed: completedMap.get(date) || 0,
    submitted: submissions.byDate.get(date)?.submitted ?? null, missing: submissions.byDate.has(date) ? submissions.byDate.get(date).required - submissions.byDate.get(date).submitted : null
  }));
  const rollup = (grain) => {
    const map = new Map();
    for (const row of daily) {
      const key = periodKey(row.date, grain);
      if (!map.has(key)) map.set(key, { period: key, created: 0, completed: 0 });
      map.get(key).created += row.created;
      map.get(key).completed += row.completed;
    }
    return [...map.values()];
  };
  const totalTasks = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    today: today.today, timezone: today.timezone, day: today.day, lockAt: today.lockAt, serverTime: ctx.now, range: { from, to: today.today },
    totals: {
      employees: totalEmployees, requiredSubmitters: required.length, submittedToday: submittedToday.length, missingToday: missingToday.length,
      tasks: totalTasks, completed: counts.COMPLETED, pending: counts.PENDING + counts.ON_HOLD, inProgress: counts.IN_PROGRESS,
      blocked: counts.BLOCKED, cancelled: counts.CANCELLED, overdue
    },
    analytics: {
      tasksCreated: createdDaily.reduce((sum, row) => sum + row.count, 0),
      tasksCompleted: completedDaily.reduce((sum, row) => sum + row.count, 0),
      tasksPending: counts.PENDING + counts.ON_HOLD + counts.IN_PROGRESS,
      tasksOverdue: overdue,
      averageCompletionHours: avgCompletion[0]?.hours ? Number(avgCompletion[0].hours.toFixed(1)) : null,
      dailySubmissionRate: submissions.required ? Math.round((submissions.submitted / submissions.required) * 100) : null,
      reopenedTasks: reopened,
      blockedTasks: counts.BLOCKED
    },
    missingToday: missingToday.map((user) => ({ id: user._id, name: user.name, email: user.email })),
    statusCounts: counts,
    byEmployee: pivot(byEmployee, (row) => row._id.user, (key) => userNames.get(key) || 'Unassigned'),
    byProject: pivot(byProject, (row) => row._id.project, (key) => projectNames.get(key) || 'No project'),
    byDepartment: byDepartment.map((row) => ({ id: row._id, name: departmentNames.get(String(row._id)) || 'No department', total: row.count, open: row.open })).sort((a, b) => b.total - a.total),
    daily, weekly: rollup('weekly'), monthly: rollup('monthly')
  };
}