import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.TASK_UPLOAD_MAX_MB = '1';
process.env.FILE_STORAGE_PROVIDER = 'local';

const { app } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { default: User } = await import('../src/modules/auth/user.model.js');
const { default: Employee } = await import('../src/modules/employees/employee.model.js');
const { AuditLog, Notification } = await import('../src/modules/common/support.model.js');
const models = await import('../src/modules/tasks/task.models.js');
const calendar = await import('../src/modules/tasks/services/workCalendar.service.js');
const workLogs = await import('../src/modules/tasks/services/workLog.service.js');
const { matchMentions } = await import('../src/modules/tasks/services/mentions.js');
const { normalizeTaskUrl, validateTaskUpload } = await import('../src/modules/tasks/services/taskFiles.js');
const { sanitizeRichText } = await import('../src/modules/tasks/services/richText.js');

const { Task, TaskAuditLog, TaskAssignment, TaskMention, DailyWorkLog, CorrectionRequest, CalendarDay, TaskAttachment, TaskSettings, DayFinalization } = models;
const TZ = 'Asia/Kolkata';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 32)]);

let mongo;
const users = {};
const tokens = {};
const createdFiles = [];

const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}`, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36' });
const api = (method, url, who) => request(app)[method](`/api/v1${url}`).set(auth(who));
const today = () => calendar.dateKeyInZone(new Date(), TZ);
const istInstant = (dateKey, time) => calendar.zonedTimeToUtc(dateKey, Number(time.slice(0, 2)), Number(time.slice(3, 5)), TZ);
const ctxFor = (who, now = new Date()) => ({ user: users[who], ipAddress: '127.0.0.1', userAgent: 'test-suite', now });

function nextWeekday(from, weekday) {
  let key = calendar.addDays(from, 1);
  while (calendar.weekdayOf(key) !== weekday) key = calendar.addDays(key, 1);
  return key;
}

function previousWeekday(from, weekday, minDaysBack = 1) {
  let key = calendar.addDays(from, -minDaysBack);
  while (calendar.weekdayOf(key) !== weekday) key = calendar.addDays(key, -1);
  return key;
}

async function makeLockedTask(overrides = {}) {
  const workDate = calendar.addDays(today(), -2);
  return Task.create({
    taskKey: `TSK-L${Math.random().toString(36).slice(2, 8)}`, title: 'Historical task', description: 'Done earlier',
    owner: users.emp1._id, assignee: users.emp1._id, createdBy: users.emp1._id, workDate, status: 'IN_PROGRESS', ...overrides
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(models).map((model) => model.init?.()));
  const lead = await Employee.create({ firstName: 'Lena', lastName: 'Lead', employeeType: 'FULL_TIME' });
  const e1 = await Employee.create({ firstName: 'Esha', lastName: 'Employee', employeeType: 'FULL_TIME', reportingManager: lead._id });
  const e2 = await Employee.create({ firstName: 'Rahul', lastName: 'Sharma', employeeType: 'FULL_TIME' });
  const definitions = {
    superAdmin: { name: 'Super Admin', role: 'SUPER_ADMIN' },
    admin: { name: 'Anita Admin', role: 'ADMIN' },
    manager: { name: 'Manoj Manager', role: 'MANAGER' },
    lead: { name: 'Lena Lead', role: 'TEAM_LEAD', employeeId: lead._id },
    emp1: { name: 'Esha Employee', role: 'EMPLOYEE', employeeId: e1._id },
    rahul: { name: 'Rahul Sharma', role: 'EMPLOYEE', employeeId: e2._id },
    outsider: { name: 'Omar Outsider', role: 'EMPLOYEE' }
  };
  for (const [key, definition] of Object.entries(definitions)) {
    users[key] = await User.create({ ...definition, email: `${key}@test.local`, passwordHash: 'x' });
    tokens[key] = jwt.sign({ sub: String(users[key]._id), role: definition.role }, env.accessSecret, { expiresIn: '1h' });
  }
  await User.collection.updateMany({}, { $set: { createdAt: new Date('2025-01-01T00:00:00Z') } });
  for (const key of Object.keys(users)) users[key] = await User.findById(users[key]._id);
  const day = await calendar.getDayInfo(today());
  if (!day.isWorkingDay) await CalendarDay.create({ date: today(), type: 'SPECIAL_WORKING_DAY', name: 'Test working day' });
});

after(async () => {
  const attachments = await TaskAttachment.find({ storageProvider: 'local' }, 'storageKey').lean();
  for (const item of [...attachments.map((row) => row.storageKey), ...createdFiles]) {
    await fs.rm(path.resolve('private-files', item), { force: true });
  }
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('pure helpers', () => {
  test('lock instant is 00:00 IST of the next day (18:30 UTC)', () => {
    assert.equal(calendar.lockInstant('2026-03-10', TZ).toISOString(), '2026-03-10T18:30:00.000Z');
    assert.equal(calendar.isDateLocked('2026-03-10', TZ, new Date('2026-03-10T18:29:59.999Z')), false);
    assert.equal(calendar.isDateLocked('2026-03-10', TZ, new Date('2026-03-10T18:30:00.000Z')), true);
  });

  test('mentions resolve full names and unique first names', () => {
    const people = [{ _id: 'a', name: 'Rahul Sharma' }, { _id: 'b', name: 'Priya Singh' }, { _id: 'c', name: 'Priya Kapoor' }];
    assert.deepEqual(matchMentions('@Rahul please review the API implementation.', people), ['a']);
    assert.deepEqual(matchMentions('ping @Priya Kapoor', people), ['c']);
    assert.deepEqual(matchMentions('ping @Priya about it', people), []);
    assert.deepEqual(matchMentions('email rahul@example.com', people), []);
  });

  test('rich text is sanitized', () => {
    const html = sanitizeRichText('<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">x</a><strong>ok</strong></p>');
    assert.equal(html.includes('script'), false);
    assert.equal(html.includes('onclick'), false);
    assert.equal(html.includes('javascript:'), false);
    assert.match(html, /<strong>ok<\/strong>/);
  });

  test('URL validation accepts http(s) only', () => {
    assert.equal(normalizeTaskUrl('https://github.com/org/repo'), 'https://github.com/org/repo');
    for (const bad of ['javascript:alert(1)', 'ftp://files.example.com/x', 'https://user:pass@example.com', 'not a url', 'http://intranet']) {
      assert.throws(() => normalizeTaskUrl(bad), /URL|link|allowed|host/i);
    }
  });

  test('file validation checks extension, MIME and magic bytes', () => {
    assert.equal(validateTaskUpload({ originalname: 'shot.png', mimetype: 'image/png', buffer: PNG, size: PNG.length }).mimeType, 'image/png');
    assert.throws(() => validateTaskUpload({ originalname: 'run.exe', mimetype: 'application/octet-stream', buffer: PNG }), /not allowed/);
    assert.throws(() => validateTaskUpload({ originalname: 'fake.pdf', mimetype: 'application/pdf', buffer: PNG }), /does not look like/);
    assert.throws(() => validateTaskUpload({ originalname: 'shot.png', mimetype: 'application/pdf', buffer: PNG }), /does not match/);
  });
});

describe('tasks API', () => {
  let taskId;

  test('employee creates today\'s task', async () => {
    const response = await api('post', '/tasks', 'emp1').send({
      title: 'Implement Task Management Dashboard', description: 'Admin CRM work', content: '<p>Rich <strong>content</strong></p>',
      technology: 'React.js', module: 'Admin CRM', priority: 'HIGH', estimatedHours: 3
    });
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    taskId = response.body.data._id;
    assert.equal(response.body.data.workDate, today());
    assert.match(response.body.data.taskKey, /^TSK-\d{6}$/);
    assert.equal(String(response.body.data.owner), String(users.emp1._id));
    const audit = await TaskAuditLog.findOne({ task: taskId, action: 'TASK_CREATED' }).lean();
    assert.ok(audit);
    assert.equal(audit.ipAddress.length > 0, true);
    assert.equal(audit.device.browser, 'Chrome');
  });

  test('employee edits today\'s task before 23:59 and the change is audited', async () => {
    const response = await api('patch', `/tasks/${taskId}`, 'emp1').send({ title: 'Implement Task Management Dashboard v2', actualHours: 4.5 });
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.title, 'Implement Task Management Dashboard v2');
    const audit = await TaskAuditLog.findOne({ task: taskId, action: 'TASK_UPDATED' }).lean();
    assert.equal(audit.oldValue.title, 'Implement Task Management Dashboard');
    assert.equal(audit.newValue.title, 'Implement Task Management Dashboard v2');
    assert.ok(await TaskAuditLog.exists({ task: taskId, action: 'TIME_LOGGED' }));
  });

  test('status, priority and deadline changes are audited', async () => {
    assert.equal((await api('patch', `/tasks/${taskId}/status`, 'emp1').send({ status: 'IN_PROGRESS' })).statusCode, 200);
    assert.equal((await api('patch', `/tasks/${taskId}/priority`, 'emp1').send({ priority: 'URGENT' })).statusCode, 200);
    const deadline = calendar.addDays(today(), 3);
    assert.equal((await api('patch', `/tasks/${taskId}`, 'emp1').send({ deadline })).statusCode, 200);
    for (const action of ['STATUS_CHANGED', 'PRIORITY_CHANGED', 'DEADLINE_CHANGED']) assert.ok(await TaskAuditLog.exists({ task: taskId, action }), action);
  });

  test('employee cannot assign a task to someone else', async () => {
    const create = await api('post', '/tasks', 'emp1').send({ title: 'Sneaky', assignee: String(users.rahul._id) });
    assert.equal(create.statusCode, 403);
    const assign = await api('post', `/tasks/${taskId}/assign`, 'emp1').send({ assignee: String(users.rahul._id) });
    assert.equal(assign.statusCode, 403);
  });

  test('admin can assign a task and the employee is notified', async () => {
    const response = await api('post', `/tasks/${taskId}/assign`, 'admin').send({ assignee: String(users.rahul._id), note: 'Please pick this up' });
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(String(response.body.data.assignee), String(users.rahul._id));
    assert.ok(await TaskAssignment.exists({ task: taskId, kind: 'REASSIGNED', assignee: users.rahul._id }));
    assert.ok(await TaskAuditLog.exists({ task: taskId, action: 'TASK_REASSIGNED' }));
    const notification = await Notification.findOne({ recipient: users.rahul._id, type: 'TASK_REASSIGNED', entityId: taskId }).lean();
    assert.ok(notification);
    assert.equal(notification.link, `/tasks/${taskId}`);
    const list = await api('get', '/notifications?unread=true', 'rahul');
    assert.ok(list.body.meta.unread >= 1);
  });

  test('manager assigns a new task and the assignee gets TASK_ASSIGNED', async () => {
    const response = await api('post', '/tasks', 'manager').send({ title: 'Review API', assignee: String(users.emp1._id) });
    assert.equal(response.statusCode, 200);
    assert.ok(await Notification.exists({ recipient: users.emp1._id, type: 'TASK_ASSIGNED', entityId: response.body.data._id }));
  });

  test('employee mentions another employee in a comment and they are notified', async () => {
    const response = await api('post', `/tasks/${taskId}/comments`, 'emp1')
      .field('text', '@Rahul please review the API implementation.')
      .field('urls', JSON.stringify(['https://github.com/org/repo/pull/1']));
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.ok(await TaskMention.exists({ task: taskId, mentionedUser: users.rahul._id, context: 'COMMENT' }));
    assert.ok(await TaskAuditLog.exists({ task: taskId, action: 'EMPLOYEE_MENTIONED' }));
    assert.ok(await TaskAuditLog.exists({ task: taskId, action: 'COMMENT_ADDED' }));
    assert.ok(await Notification.exists({ recipient: users.rahul._id, type: 'TASK_MENTION', entityId: taskId }));
  });

  test('comments keep revisions and cannot be deleted', async () => {
    const created = await api('post', `/tasks/${taskId}/comments`, 'emp1').field('text', 'First version');
    const commentId = created.body.data._id;
    const edited = await api('patch', `/tasks/${taskId}/comments/${commentId}`, 'emp1').send({ text: 'Second version' });
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.body.data.revisions[0].text, 'First version');
    const audit = await TaskAuditLog.findOne({ recordId: commentId, action: 'COMMENT_EDITED' }).lean();
    assert.equal(audit.oldValue.text, 'First version');
    assert.equal((await api('delete', `/tasks/${taskId}/comments/${commentId}`, 'emp1')).statusCode, 405);
    assert.equal((await api('patch', `/tasks/${taskId}/comments/${commentId}`, 'rahul').send({ text: 'hijack' })).statusCode, 403);
  });

  test('nested subtasks work and parent shows progress', async () => {
    const level1 = await api('post', `/tasks/${taskId}/subtasks`, 'emp1').send({ title: 'Subtask' });
    assert.equal(level1.statusCode, 200, JSON.stringify(level1.body));
    const level2 = await api('post', `/tasks/${level1.body.data._id}/subtasks`, 'emp1').send({ title: 'Sub-subtask' });
    const level3 = await api('post', `/tasks/${level2.body.data._id}/subtasks`, 'emp1').send({ title: 'Further subtask' });
    const sibling = await api('post', `/tasks/${taskId}/subtasks`, 'emp1').send({ title: 'Second subtask' });
    assert.equal(level3.body.data.depth, 3);
    assert.equal(level3.body.data.ancestors.length, 3);
    await api('patch', `/tasks/${level3.body.data._id}/status`, 'emp1').send({ status: 'COMPLETED' });
    await api('patch', `/tasks/${sibling.body.data._id}/status`, 'emp1').send({ status: 'COMPLETED' });
    const detail = await api('get', `/tasks/${taskId}`, 'emp1');
    assert.deepEqual(detail.body.data.progress, { total: 4, completed: 2, percent: 50 });
    assert.equal(detail.body.data.subtasks[0].children[0].children[0].title, 'Further subtask');
    assert.ok(await TaskAuditLog.exists({ action: 'SUBTASK_CREATED', 'meta.parentTask': taskId }));
    const timeline = await api('get', `/tasks/${taskId}/audit`, 'emp1');
    assert.ok(timeline.body.data.some((event) => event.action === 'SUBTASK_CREATED'));
  });

  test('subtask depth limit is configurable', async () => {
    assert.equal((await api('put', '/task-calendar/settings', 'admin').send({ maxSubtaskDepth: 1 })).statusCode, 200);
    const level1 = await Task.findOne({ parent: taskId, title: 'Subtask' }).lean();
    const tooDeep = await api('post', `/tasks/${level1._id}/subtasks`, 'emp1').send({ title: 'Too deep' });
    assert.equal(tooDeep.statusCode, 422);
    assert.equal((await api('put', '/task-calendar/settings', 'admin').send({ maxSubtaskDepth: 10 })).statusCode, 200);
  });

  test('file upload validation, secure storage and access-controlled download', async () => {
    const ok = await api('post', `/tasks/${taskId}/attachments`, 'emp1').attach('files', PNG, { filename: 'screen.png', contentType: 'image/png' });
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    const attachmentId = ok.body.data[0]._id;
    assert.equal(ok.body.data[0].mimeType, 'image/png');
    const exe = await api('post', `/tasks/${taskId}/attachments`, 'emp1').attach('files', PNG, { filename: 'virus.exe', contentType: 'application/octet-stream' });
    assert.equal(exe.statusCode, 422);
    const spoofed = await api('post', `/tasks/${taskId}/attachments`, 'emp1').attach('files', PNG, { filename: 'report.pdf', contentType: 'application/pdf' });
    assert.equal(spoofed.statusCode, 422);
    const large = await api('post', `/tasks/${taskId}/attachments`, 'emp1').attach('files', Buffer.concat([PDF, Buffer.alloc(1.5 * 1024 * 1024)]), { filename: 'big.pdf', contentType: 'application/pdf' });
    assert.equal(large.statusCode, 422);
    const download = await api('get', `/tasks/attachments/${attachmentId}/download`, 'emp1');
    assert.equal(download.statusCode, 200);
    assert.match(download.headers['content-disposition'], /^attachment;/);
    assert.equal(download.headers['x-content-type-options'], 'nosniff');
    assert.equal((await api('get', `/tasks/attachments/${attachmentId}/download`, 'outsider')).statusCode, 404);
    assert.ok(await TaskAuditLog.exists({ task: taskId, action: 'FILE_UPLOADED' }));
  });

  test('URL attachments are validated', async () => {
    const good = await api('post', `/tasks/${taskId}/urls`, 'emp1').send({ url: 'https://github.com/org/repo', label: 'Repo' });
    assert.equal(good.statusCode, 200);
    assert.equal(good.body.data.kind, 'GITHUB');
    for (const url of ['javascript:alert(1)', 'ftp://example.com/file', 'https://user:secret@example.com']) {
      assert.equal((await api('post', `/tasks/${taskId}/urls`, 'emp1').send({ url })).statusCode, 422, url);
    }
    assert.ok(await TaskAuditLog.exists({ task: taskId, action: 'URL_ADDED' }));
  });

  test('outsiders cannot see tasks they are not involved in', async () => {
    assert.equal((await api('get', `/tasks/${taskId}`, 'outsider')).statusCode, 404);
    const list = await api('get', '/tasks', 'outsider');
    assert.equal(list.body.data.length, 0);
    assert.equal((await api('get', `/tasks/${taskId}`, 'rahul')).statusCode, 200);
  });

  test('employees can load task form lookups without catalog permissions', async () => {
    const response = await api('get', '/tasks/lookups', 'emp1');
    assert.equal(response.statusCode, 200);
    assert.ok(Array.isArray(response.body.data.departments));
    assert.ok(Array.isArray(response.body.data.technologies));
    assert.ok(Array.isArray(response.body.data.projects));
  });
});

describe('date locking', () => {
  test('employee cannot edit a locked task (content)', async () => {
    const task = await makeLockedTask();
    const response = await api('patch', `/tasks/${task._id}`, 'emp1').send({ title: 'Rewrite history' });
    assert.equal(response.statusCode, 423);
    assert.equal((await Task.findById(task._id).lean()).title, 'Historical task');
  });

  test('admin cannot silently overwrite locked content either', async () => {
    const task = await makeLockedTask();
    assert.equal((await api('patch', `/tasks/${task._id}`, 'admin').send({ description: 'Overwrite' })).statusCode, 423);
  });

  test('employee cannot delete a historical task', async () => {
    const task = await makeLockedTask();
    assert.equal((await api('delete', `/tasks/${task._id}`, 'emp1')).statusCode, 423);
    assert.equal((await Task.findById(task._id).lean()).isArchived, false);
  });

  test('closed locked tasks cannot change status without correction', async () => {
    const task = await makeLockedTask({ status: 'COMPLETED', completedAt: new Date() });
    assert.equal((await api('patch', `/tasks/${task._id}/status`, 'emp1').send({ status: 'PENDING' })).statusCode, 423);
  });

  test('API cannot bypass the work log lock for past or future dates', async () => {
    const past = calendar.addDays(today(), -1);
    assert.equal((await api('put', `/work-logs/${past}`, 'emp1').send({ summary: 'late' })).statusCode, 423);
    assert.equal((await api('post', `/work-logs/${past}/submit`, 'emp1').send({ summary: 'late' })).statusCode, 423);
    assert.equal((await api('post', `/work-logs/${past}/urls`, 'emp1').send({ url: 'https://example.com' })).statusCode, 423);
    assert.equal((await api('put', `/work-logs/${calendar.addDays(today(), 1)}`, 'emp1').send({ summary: 'future' })).statusCode, 422);
    assert.equal((await api('delete', `/work-logs/${today()}`, 'emp1')).statusCode, 405);
  });

  test('server clock decides: a save at 00:00:00 IST for the previous date is rejected', async () => {
    const date = nextWeekday(today(), 2);
    await assert.rejects(workLogs.saveWorkLog(ctxFor('emp1', calendar.lockInstant(date, TZ)), date, { summary: 'too late' }), (error) => error.statusCode === 423);
    const saved = await workLogs.saveWorkLog(ctxFor('emp1', new Date(calendar.lockInstant(date, TZ).getTime() - 1000)), date, { summary: 'just in time' }, { submit: true });
    assert.equal(saved.status, 'SUBMITTED');
  });

  test('employee submits today\'s work log via API', async () => {
    const response = await api('post', `/work-logs/${today()}/submit`, 'emp1').send({ summary: 'Built the dashboard', blockers: 'None', nextDayPlan: 'Reports' });
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.log.status, 'SUBMITTED');
    assert.equal(response.body.data.editable, true);
    assert.ok(await TaskAuditLog.exists({ action: 'WORKLOG_SUBMITTED', subjectUser: users.emp1._id }));
  });
});

describe('calendar, weekends, holidays and reminders', () => {
  test('weekend note can be created and is marked non-working', async () => {
    const saturday = nextWeekday(today(), 6);
    const log = await workLogs.saveWorkLog(ctxFor('emp1', istInstant(saturday, '11:00')), saturday, { summary: 'Optional weekend note' }, { submit: true });
    assert.equal(log.status, 'NOTE');
    assert.equal(log.dayType, 'WEEKEND');
    const view = await workLogs.getWorkLog(ctxFor('emp1', istInstant(saturday, '12:00')), saturday);
    assert.equal(view.day.isWorkingDay, false);
    assert.equal(view.displayStatus, 'NOTE');
    const result = await workLogs.finalizeDay(saturday, calendar.lockInstant(saturday, TZ));
    assert.equal(result.missing, 0);
    assert.equal(await DailyWorkLog.countDocuments({ workDate: saturday, status: 'NOT_SUBMITTED' }), 0);
  });

  test('holidays are respected and special working days count', async () => {
    const monday = nextWeekday(calendar.addDays(today(), 14), 1);
    await CalendarDay.create({ date: monday, type: 'COMPANY_HOLIDAY', name: 'Company Holiday' });
    assert.equal((await calendar.getDayInfo(monday)).dayType, 'HOLIDAY');
    const note = await workLogs.saveWorkLog(ctxFor('rahul', istInstant(monday, '10:00')), monday, { summary: 'Holiday note' }, { submit: true });
    assert.equal(note.status, 'NOTE');
    assert.equal((await workLogs.finalizeDay(monday, calendar.lockInstant(monday, TZ))).missing, 0);
    const saturday = nextWeekday(monday, 6);
    await CalendarDay.create({ date: saturday, type: 'SPECIAL_WORKING_DAY', name: 'Release day' });
    const info = await calendar.getDayInfo(saturday);
    assert.equal(info.isWorkingDay, true);
    assert.equal(info.dayType, 'SPECIAL_WORKING');
    const month = await api('get', `/work-logs/calendar?month=${monday.slice(0, 7)}`, 'rahul');
    assert.equal(month.statusCode, 200);
    assert.equal(month.body.data.find((day) => day.date === monday).dayType, 'HOLIDAY');
  });

  test('calendar entries for locked dates cannot be created', async () => {
    const response = await api('post', '/task-calendar/days', 'admin').send({ date: calendar.addDays(today(), -3), type: 'PUBLIC_HOLIDAY', name: 'Backdated' });
    assert.equal(response.statusCode, 423);
    assert.equal((await api('post', '/task-calendar/days', 'emp1').send({ date: calendar.addDays(today(), 30), type: 'PUBLIC_HOLIDAY', name: 'X' })).statusCode, 403);
  });

  test('daily reminder skips employees who already submitted and is idempotent', async () => {
    const wednesday = nextWeekday(calendar.addDays(today(), 21), 3);
    await DailyWorkLog.create({ user: users.emp1._id, workDate: wednesday, dayType: 'WORKING', status: 'SUBMITTED', summary: 'done', submittedAt: new Date() });
    assert.equal((await workLogs.runDailyReminders(istInstant(wednesday, '19:59'))).sent, 0);
    const first = await workLogs.runDailyReminders(istInstant(wednesday, '20:05'));
    assert.equal(first.time, '20:00');
    assert.ok(first.sent > 0);
    const keyFor = (user) => `worklog-reminder:${wednesday}:20:00:${users[user]._id}`;
    assert.ok(await Notification.exists({ dedupeKey: keyFor('rahul') }));
    assert.equal(await Notification.exists({ dedupeKey: keyFor('emp1') }), null);
    assert.equal((await workLogs.runDailyReminders(istInstant(wednesday, '20:30'))).sent, 0);
    const later = await workLogs.runDailyReminders(istInstant(wednesday, '22:01'));
    assert.equal(later.time, '22:00');
    assert.ok(later.sent > 0);
    const saturday = nextWeekday(wednesday, 6);
    const weekend = await CalendarDay.exists({ date: saturday, type: 'SPECIAL_WORKING_DAY' });
    if (!weekend) assert.equal((await workLogs.runDailyReminders(istInstant(saturday, '20:05'))).sent, 0);
  });

  test('missing submission is detected, stored permanently and notified', async () => {
    const monday = previousWeekday(today(), 1, 7);
    await CalendarDay.deleteMany({ date: monday });
    await DayFinalization.deleteMany({ date: monday });
    await DailyWorkLog.deleteMany({ workDate: monday });
    await DailyWorkLog.create({ user: users.lead._id, workDate: monday, dayType: 'WORKING', status: 'SUBMITTED', summary: 'ok', submittedAt: new Date() });
    await DailyWorkLog.create({ user: users.emp1._id, workDate: monday, dayType: 'WORKING', status: 'DRAFT', summary: 'forgot to submit' });
    const result = await workLogs.finalizeDay(monday, new Date());
    assert.ok(result.missing >= 2);
    const emp1Log = await DailyWorkLog.findOne({ user: users.emp1._id, workDate: monday }).lean();
    assert.equal(emp1Log.status, 'NOT_SUBMITTED');
    assert.equal(emp1Log.summary, 'forgot to submit');
    assert.ok(emp1Log.lockedAt);
    assert.equal((await DailyWorkLog.findOne({ user: users.lead._id, workDate: monday }).lean()).status, 'SUBMITTED');
    assert.ok(await DailyWorkLog.exists({ user: users.rahul._id, workDate: monday, status: 'NOT_SUBMITTED' }));
    assert.ok(await Notification.exists({ recipient: users.emp1._id, type: 'WORKLOG_NOT_SUBMITTED' }));
    assert.ok(await Notification.exists({ recipient: users.lead._id, type: 'WORKLOG_MISSING_DIGEST' }));
    assert.ok(await Notification.exists({ recipient: users.admin._id, type: 'WORKLOG_MISSING_DIGEST' }));
    assert.ok(await TaskAuditLog.exists({ action: 'WORKLOG_NOT_SUBMITTED', subjectUser: users.emp1._id, workDate: monday }));
    assert.equal((await workLogs.finalizeDay(monday, new Date())).alreadyFinalized, true);
    assert.equal((await api('put', `/work-logs/${monday}`, 'emp1').send({ summary: 'change it' })).statusCode, 423);
    const view = await api('get', `/work-logs/${monday}`, 'emp1');
    assert.equal(view.body.data.displayStatus, 'NOT_SUBMITTED');
    assert.equal(view.body.data.canRequestCorrection, true);
  });
});

describe('corrections', () => {
  let lockedTask;
  let requestId;

  test('correction request works on locked records only', async () => {
    lockedTask = await makeLockedTask({ title: 'Original title' });
    const unlocked = await api('post', '/tasks', 'emp1').send({ title: 'Fresh task' });
    const refused = await api('post', `/tasks/${unlocked.body.data._id}/corrections`, 'emp1').field('reason', 'Typo in title').field('requestedChanges', JSON.stringify({ title: 'x' }));
    assert.equal(refused.statusCode, 422);
    const response = await api('post', `/tasks/${lockedTask._id}/corrections`, 'emp1')
      .field('reason', 'Typo in the task title')
      .field('requestedChanges', JSON.stringify({ title: 'Corrected title' }))
      .attach('files', PDF, { filename: 'evidence.pdf', contentType: 'application/pdf' });
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    requestId = response.body.data._id;
    assert.equal(response.body.data.originalValues.title, 'Original title');
    assert.equal(response.body.data.attachments.length, 1);
    assert.ok(await Notification.exists({ recipient: users.manager._id, type: 'CORRECTION_SUBMITTED' }));
    assert.ok(await TaskAuditLog.exists({ recordId: requestId, action: 'CORRECTION_REQUESTED' }));
  });

  test('employees and requesters cannot approve', async () => {
    assert.equal((await api('post', `/task-corrections/${requestId}/approve`, 'emp1').send({})).statusCode, 403);
    assert.equal((await api('post', `/task-corrections/${requestId}/approve`, 'lead').send({})).statusCode, 403);
  });

  test('correction approval preserves the original data', async () => {
    const response = await api('post', `/task-corrections/${requestId}/approve`, 'manager').send({ note: 'Looks right' });
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    const raw = await Task.findById(lockedTask._id).lean();
    assert.equal(raw.title, 'Original title');
    assert.equal(raw.corrected.title, 'Corrected title');
    assert.equal(raw.correctionCount, 1);
    const saved = await CorrectionRequest.findById(requestId).lean();
    assert.equal(saved.status, 'APPROVED');
    assert.equal(saved.originalValues.title, 'Original title');
    assert.equal(saved.correctedValues.title, 'Corrected title');
    assert.equal(String(saved.reviewedBy), String(users.manager._id));
    assert.ok(saved.reviewedAt && saved.createdAt && saved.reason);
    const detail = await api('get', `/tasks/${lockedTask._id}`, 'emp1');
    assert.equal(detail.body.data.title, 'Corrected title');
    assert.equal(detail.body.data.original.title, 'Original title');
    const audit = await TaskAuditLog.findOne({ recordId: requestId, action: 'CORRECTION_APPROVED' }).lean();
    assert.equal(audit.oldValue.title, 'Original title');
    assert.equal(audit.newValue.title, 'Corrected title');
    assert.equal(audit.meta.requestedBy, String(users.emp1._id));
    assert.ok(await Notification.exists({ recipient: users.emp1._id, type: 'CORRECTION_APPROVED' }));
    assert.equal((await api('post', `/task-corrections/${requestId}/approve`, 'manager').send({})).statusCode, 409);
  });

  test('correction rejection preserves the original data', async () => {
    const task = await makeLockedTask({ description: 'Keep me' });
    const created = await api('post', `/tasks/${task._id}/corrections`, 'emp1').field('reason', 'Wrong description text').field('requestedChanges', JSON.stringify({ description: 'Changed' }));
    assert.equal((await api('post', `/task-corrections/${created.body.data._id}/reject`, 'manager').send({})).statusCode, 422);
    const rejected = await api('post', `/task-corrections/${created.body.data._id}/reject`, 'manager').send({ note: 'Not accurate' });
    assert.equal(rejected.statusCode, 200);
    const raw = await Task.findById(task._id).lean();
    assert.equal(raw.description, 'Keep me');
    assert.equal(raw.corrected, undefined);
    assert.ok(await Notification.exists({ recipient: users.emp1._id, type: 'CORRECTION_REJECTED' }));
    assert.ok(await TaskAuditLog.exists({ recordId: created.body.data._id, action: 'CORRECTION_REJECTED' }));
  });

  test('backdated work log correction keeps NOT_SUBMITTED as the original status', async () => {
    const monday = previousWeekday(today(), 1, 7);
    const created = await api('post', `/work-logs/${monday}/corrections`, 'rahul').field('reason', 'I was working but forgot to submit').field('requestedChanges', JSON.stringify({ summary: 'Fixed payment bug' }));
    assert.equal(created.statusCode, 200, JSON.stringify(created.body));
    assert.equal((await api('post', `/task-corrections/${created.body.data._id}/approve`, 'admin').send({})).statusCode, 200);
    const log = await DailyWorkLog.findOne({ user: users.rahul._id, workDate: monday }).lean();
    assert.equal(log.status, 'NOT_SUBMITTED');
    assert.equal(log.summary, '');
    assert.equal(log.corrected.summary, 'Fixed payment bug');
  });
});

describe('audit immutability and coverage', () => {
  test('audit log is created for every action type exercised', async () => {
    const actions = new Set(await TaskAuditLog.distinct('action'));
    for (const action of ['TASK_CREATED', 'TASK_UPDATED', 'TASK_ASSIGNED', 'TASK_REASSIGNED', 'SUBTASK_CREATED', 'EMPLOYEE_MENTIONED', 'COMMENT_ADDED', 'COMMENT_EDITED',
      'FILE_UPLOADED', 'URL_ADDED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'DEADLINE_CHANGED', 'WORKLOG_SUBMITTED', 'WORKLOG_NOTE_SAVED', 'WORKLOG_NOT_SUBMITTED',
      'DAILY_RECORD_LOCKED', 'CORRECTION_REQUESTED', 'CORRECTION_APPROVED', 'CORRECTION_REJECTED', 'TASK_SETTINGS_UPDATED']) {
      assert.ok(actions.has(action), `missing audit action ${action}`);
    }
    const sample = await TaskAuditLog.findOne({ action: 'TASK_UPDATED' }).lean();
    for (const field of ['recordId', 'task', 'actor', 'action', 'occurredAt', 'oldValue', 'newValue', 'ipAddress', 'userAgent']) assert.ok(sample[field] !== undefined, field);
  });

  test('audit records cannot be deleted or modified through the API', async () => {
    const record = await TaskAuditLog.findOne().lean();
    assert.equal((await api('delete', `/task-audit/${record._id}`, 'superAdmin')).statusCode, 405);
    assert.equal((await api('patch', `/task-audit/${record._id}`, 'superAdmin').send({ action: 'X' })).statusCode, 405);
    assert.equal((await api('delete', '/task-audit', 'superAdmin')).statusCode, 405);
    assert.equal((await api('delete', `/audit-logs/${record._id}`, 'superAdmin')).statusCode, 404);
    assert.ok(await TaskAuditLog.exists({ _id: record._id }));
  });

  test('audit models reject updates and deletes at the data layer', async () => {
    const record = await TaskAuditLog.findOne();
    await assert.rejects(TaskAuditLog.deleteOne({ _id: record._id }), /append-only/);
    await assert.rejects(TaskAuditLog.updateOne({ _id: record._id }, { action: 'TASK_UPDATED' }), /append-only/);
    await assert.rejects(TaskAuditLog.findOneAndDelete({ _id: record._id }), /append-only/);
    record.action = 'TASK_UPDATED';
    await assert.rejects(record.save(), /append-only/);
    await AuditLog.create({ action: 'TEST', entityType: 'Test' });
    await assert.rejects(AuditLog.deleteMany({}), /append-only/);
  });
});

describe('role-based access control', () => {
  test('employees cannot read audit history, reports or manage configuration', async () => {
    assert.equal((await api('get', '/task-audit', 'emp1')).statusCode, 403);
    assert.equal((await api('get', '/task-reports/daily', 'emp1')).statusCode, 403);
    assert.equal((await api('get', '/task-dashboard/admin', 'emp1')).statusCode, 403);
    assert.equal((await api('post', '/task-projects', 'emp1').send({ name: 'Nope' })).statusCode, 403);
    assert.equal((await api('put', '/task-calendar/settings', 'emp1').send({ timeTrackingEnabled: false })).statusCode, 403);
    assert.equal((await api('post', `/work-logs/lock/${calendar.addDays(today(), -1)}`, 'emp1')).statusCode, 403);
    assert.equal((await api('get', `/work-logs/${today()}?user=${users.rahul._id}`, 'emp1')).statusCode, 403);
  });

  test('team lead sees and assigns only within the team', async () => {
    const task = await api('post', '/tasks', 'emp1').send({ title: 'Team work' });
    assert.equal((await api('get', `/tasks/${task.body.data._id}`, 'lead')).statusCode, 200);
    const assignTeam = await api('post', '/tasks', 'lead').send({ title: 'For Esha', assignee: String(users.emp1._id) });
    assert.equal(assignTeam.statusCode, 200);
    const assignOther = await api('post', '/tasks', 'lead').send({ title: 'For Rahul', assignee: String(users.rahul._id) });
    assert.equal(assignOther.statusCode, 403);
    assert.equal((await api('get', `/work-logs/${today()}?user=${users.emp1._id}`, 'lead')).statusCode, 200);
    assert.equal((await api('get', `/work-logs/${today()}?user=${users.rahul._id}`, 'lead')).statusCode, 403);
    assert.equal((await api('get', '/task-reports/employee', 'lead')).statusCode, 200);
    assert.equal((await api('get', '/task-reports/employee/export?format=csv', 'lead')).statusCode, 403);
  });

  test('managers manage projects, view reports and export all formats', async () => {
    const project = await api('post', '/task-projects', 'manager').send({ name: 'Animal Marketplace', client: 'Acme', technologies: ['React.js'] });
    assert.equal(project.statusCode, 200);
    assert.equal((await api('delete', `/task-projects/${project.body.data._id}`, 'manager')).statusCode, 405);
    const created = await api('post', '/tasks', 'emp1').send({ title: 'Marketplace listing page', project: project.body.data._id });
    assert.equal(created.statusCode, 200);
    const filtered = await api('get', `/tasks?project=${project.body.data._id}&page=1&limit=5`, 'manager');
    assert.equal(filtered.body.data.length, 1);
    assert.equal(filtered.body.meta.total, 1);
    for (const type of ['daily', 'weekly', 'monthly', 'employee', 'project', 'pending', 'completed', 'overdue', 'blocked', 'missing']) {
      const report = await api('get', `/task-reports/${type}`, 'manager');
      assert.equal(report.statusCode, 200, `${type}: ${JSON.stringify(report.body)}`);
      assert.ok(Array.isArray(report.body.data.rows));
    }
    const csv = await api('get', '/task-reports/pending/export?format=csv', 'manager');
    assert.equal(csv.statusCode, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    const xlsx = await api('get', '/task-reports/employee/export?format=xlsx', 'manager').buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    assert.equal(xlsx.statusCode, 200);
    assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK');
    const pdf = await api('get', '/task-reports/daily/export?format=pdf', 'manager').buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    assert.equal(pdf.statusCode, 200);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    assert.ok(await TaskAuditLog.exists({ action: 'REPORT_EXPORTED' }));
  });

  test('dashboards return role-appropriate data', async () => {
    const mine = await api('get', '/task-dashboard/me', 'emp1');
    assert.equal(mine.statusCode, 200);
    assert.equal(mine.body.data.completedTrend.length, 14);
    const admin = await api('get', '/task-dashboard/admin', 'admin');
    assert.equal(admin.statusCode, 200);
    assert.ok(admin.body.data.totals.tasks > 0);
    assert.ok('dailySubmissionRate' in admin.body.data.analytics);
  });

  test('unauthenticated requests are rejected', async () => {
    for (const url of ['/tasks', '/work-logs/meta', '/task-audit', '/task-reports/daily', '/task-corrections', '/task-dashboard/me']) {
      assert.equal((await request(app).get(`/api/v1${url}`)).statusCode, 401, url);
    }
  });
});

test('settings persist and TaskSettings stores overrides', async () => {
  const response = await api('put', '/task-calendar/settings', 'admin').send({ reminderTimes: ['20:00', '22:00', '23:30'], timezone: 'Asia/Kolkata' });
  assert.equal(response.statusCode, 200);
  assert.ok(await TaskSettings.exists({ key: 'default' }));
  assert.equal((await api('put', '/task-calendar/settings', 'admin').send({ timezone: 'Mars/Olympus' })).statusCode, 422);
});
