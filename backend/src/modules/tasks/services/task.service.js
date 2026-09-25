import mongoose from 'mongoose';
import Counter from '../../common/counter.model.js';
import User from '../../auth/user.model.js';
import { Department } from '../../common/catalog.model.js';
import { AppError } from '../../../utils/errors.js';
import { Project, Task, TaskAssignment, TaskMention } from '../task.models.js';
import { CLOSED_TASK_STATUSES, NOTIFICATION_TYPES, TASK_CONTENT_FIELDS, TASK_PRIORITIES, TASK_STATUSES } from '../task.constants.js';
import { idOf, LockedError, sameId, uniqueIds } from './context.js';
import { canAssignTo, canViewTask, taskPermissions, taskScopeFilter } from './taskAccess.service.js';
import { diffFields, recordAudit } from './taskAudit.service.js';
import { notify, taskLabel, taskLink } from './taskNotify.service.js';
import { resolveMentions } from './mentions.js';
import { richTextToPlain, sanitizeRichText } from './richText.js';
import { getTaskSettings, lockInstant, todayContext, zonedTimeToUtc } from './workCalendar.service.js';

export const USER_FIELDS = 'name email role employeeId';

export async function nextTaskKey() {
  const counter = await Counter.findOneAndUpdate({ name: 'task' }, { $inc: { value: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  return `TSK-${String(counter.value).padStart(6, '0')}`;
}

export function effectiveTask(task) {
  if (!task?.corrected || !Object.keys(task.corrected).length) return { ...task, hasCorrections: Boolean(task?.correctionCount) };
  const original = Object.fromEntries(Object.keys(task.corrected).map((key) => [key, task[key]]));
  return { ...task, ...task.corrected, original, hasCorrections: true };
}

async function activeUsers(ids, label) {
  const unique = uniqueIds(ids);
  if (!unique.length) return [];
  if (unique.some((id) => !mongoose.isValidObjectId(id))) throw new AppError(`Invalid ${label}`, 422);
  const users = await User.find({ _id: { $in: unique }, isActive: true }, USER_FIELDS).lean();
  if (users.length !== unique.length) throw new AppError(`One or more ${label} are not active CRM users.`, 422);
  return users;
}

async function assertReferences(input) {
  if (input.project) {
    const project = await Project.findById(input.project).lean();
    if (!project) throw new AppError('Project not found', 422);
    if (project.status === 'ARCHIVED') throw new AppError('Archived projects cannot receive new tasks.', 422);
  }
  if (input.department && !(await Department.exists({ _id: input.department, isDeleted: false }))) throw new AppError('Department not found', 422);
}

function assertDeadline(deadline, ctxToday) {
  if (!deadline) return;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) throw new AppError('Deadline is not a valid date.', 422);
  const startOfToday = zonedTimeToUtc(ctxToday.today, 0, 0, ctxToday.timezone);
  if (date < startOfToday) throw new AppError('Deadline cannot be before today.', 422);
}

function participants(task) {
  return uniqueIds([task.owner, task.assignee, task.assignedBy, task.createdBy, ...(task.collaborators || [])]);
}

export async function recordMentions(ctx, task, userIds, { context = 'TASK', comment, excerpt, workDate }) {
  const fresh = userIds.filter((id) => !sameId(id, ctx.user));
  if (!fresh.length) return [];
  await TaskMention.insertMany(fresh.map((id) => ({ task: task._id, comment, mentionedUser: id, mentionedBy: ctx.user._id, context, excerpt: excerpt?.slice(0, 300), workDate })));
  await Task.updateOne({ _id: task._id }, { $addToSet: { mentions: { $each: fresh.map((id) => new mongoose.Types.ObjectId(id)) } } });
  const users = await User.find({ _id: { $in: fresh } }, 'name').lean();
  await recordAudit(ctx, {
    action: 'EMPLOYEE_MENTIONED', recordType: comment ? 'TaskComment' : 'Task', recordId: comment || task._id, task: task._id, workDate,
    newValue: { mentioned: users.map((user) => ({ id: user._id, name: user.name })) }, meta: { context, excerpt: excerpt?.slice(0, 300) }
  });
  await notify(fresh, {
    type: NOTIFICATION_TYPES.TASK_MENTION,
    title: `${ctx.user.name} mentioned you`,
    message: `${taskLabel(task)}${excerpt ? ` — "${excerpt.slice(0, 140)}"` : ''}`,
    entityType: 'Task', entityId: task._id, link: taskLink(task)
  }, ctx.user);
  return fresh;
}

export async function loadTaskForUser(ctx, id, { requireView = true } = {}) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Task not found', 404);
  const task = await Task.findById(id);
  if (!task) throw new AppError('Task not found', 404);
  const settings = await getTaskSettings();
  const perms = await taskPermissions(ctx.user, task, settings, ctx.now);
  if (requireView && !perms.view) throw new AppError('Task not found', 404);
  return { task, perms, settings };
}

function denyOrLock(perms, message = 'You do not have permission for this action') {
  if (perms.locked && perms.view) throw new LockedError();
  throw new AppError(message, 403);
}

export async function createTask(ctx, input, { parentId } = {}) {
  const today = await todayContext(ctx.now);
  const { settings } = today;
  let parent = null;
  if (parentId) {
    const loaded = await loadTaskForUser(ctx, parentId);
    parent = loaded.task;
    if (!loaded.perms.createSubtask) {
      if ((parent.depth || 0) + 1 > settings.maxSubtaskDepth) throw new AppError(`Subtasks can be nested at most ${settings.maxSubtaskDepth} levels deep.`, 422);
      denyOrLock(loaded.perms, 'You cannot add subtasks to this task.');
    }
  }
  const data = {
    project: input.project || parent?.project || undefined,
    client: input.client ?? parent?.client,
    department: input.department || parent?.department || undefined,
    technology: input.technology ?? parent?.technology,
    module: input.module ?? parent?.module
  };
  await assertReferences(data);
  assertDeadline(input.deadline, today);
  const assigneeId = input.assignee || ctx.user._id;
  const ownerId = input.owner || assigneeId;
  if (!(await canAssignTo(ctx.user, assigneeId))) throw new AppError('You can only assign tasks to yourself or to employees you manage.', 403);
  if (!(await canAssignTo(ctx.user, ownerId))) throw new AppError('You cannot make that employee the task owner.', 403);
  const [assignee] = await activeUsers([assigneeId], 'assignee');
  const [owner] = await activeUsers([ownerId], 'owner');
  const collaborators = await activeUsers(input.collaborators || [], 'collaborators');
  const status = input.status || 'PENDING';
  const content = sanitizeRichText(input.content);
  const task = await Task.create({
    taskKey: await nextTaskKey(),
    title: input.title,
    description: input.description || '',
    content,
    ...data,
    priority: input.priority || 'MEDIUM',
    status,
    deadline: input.deadline || undefined,
    estimatedHours: settings.timeTrackingEnabled ? input.estimatedHours : undefined,
    actualHours: settings.timeTrackingEnabled ? input.actualHours : undefined,
    owner: owner._id,
    assignee: assignee._id,
    assignedBy: sameId(assignee, ctx.user) ? undefined : ctx.user._id,
    collaborators: collaborators.map((user) => user._id),
    createdBy: ctx.user._id,
    employee: owner.employeeId || undefined,
    parent: parent?._id || null,
    root: parent ? (parent.root || parent._id) : null,
    ancestors: parent ? [...parent.ancestors, parent._id] : [],
    depth: parent ? (parent.depth || 0) + 1 : 0,
    workDate: today.today,
    dayType: today.day.dayType,
    startedAt: status === 'IN_PROGRESS' ? ctx.now : undefined,
    completedAt: status === 'COMPLETED' ? ctx.now : undefined,
    lastActivityAt: ctx.now
  });
  const snapshot = {
    taskKey: task.taskKey, title: task.title, status: task.status, priority: task.priority, deadline: task.deadline,
    owner: owner.name, assignee: assignee.name, project: task.project, parent: parent?.taskKey
  };
  await recordAudit(ctx, {
    action: parent ? 'SUBTASK_CREATED' : 'TASK_CREATED', recordType: parent ? 'Subtask' : 'Task', recordId: task._id, task: task._id,
    subjectUser: assignee._id, newValue: snapshot, workDate: today.today,
    meta: parent ? { parentTask: String(parent._id), rootTask: String(task.root) } : undefined
  });
  if (parent) await Task.updateOne({ _id: parent._id }, { lastActivityAt: ctx.now });
  if (!sameId(assignee, ctx.user)) {
    await TaskAssignment.create({ task: task._id, kind: 'ASSIGNED', assignee: assignee._id, assignedBy: ctx.user._id, workDate: today.today });
    await recordAudit(ctx, {
      action: 'TASK_ASSIGNED', recordType: parent ? 'Subtask' : 'Task', recordId: task._id, task: task._id, subjectUser: assignee._id,
      newValue: { assignee: assignee._id, assigneeName: assignee.name }, workDate: today.today
    });
    await notify([assignee._id], {
      type: parent ? NOTIFICATION_TYPES.SUBTASK_ASSIGNED : NOTIFICATION_TYPES.TASK_ASSIGNED,
      title: parent ? 'Subtask assigned to you' : 'Task assigned to you',
      message: `${ctx.user.name} assigned ${taskLabel(task)}${task.deadline ? ` (due ${task.deadline.toISOString().slice(0, 10)})` : ''}`,
      entityType: 'Task', entityId: task._id, link: taskLink(task), dueDate: task.deadline
    }, ctx.user);
  }
  if (collaborators.length) {
    await notify(collaborators.map((user) => user._id), {
      type: NOTIFICATION_TYPES.TASK_ASSIGNED, title: 'Added as collaborator',
      message: `${ctx.user.name} added you to ${taskLabel(task)}`, entityType: 'Task', entityId: task._id, link: taskLink(task)
    }, ctx.user);
  }
  const mentionText = `${task.description}\n${richTextToPlain(content)}`;
  const mentioned = await resolveMentions(mentionText, input.mentions || []);
  if (mentioned.length) await recordMentions(ctx, task, mentioned, { excerpt: task.description || task.title, workDate: today.today });
  return task;
}

async function applyStatus(ctx, task, perms, status, today) {
  if (!TASK_STATUSES.includes(status)) throw new AppError('Invalid status', 422);
  const current = task.corrected?.status || task.status;
  if (current === status) return null;
  if (!perms.changeStatus) denyOrLock(perms, 'You cannot change the status of this task.');
  const reopening = CLOSED_TASK_STATUSES.includes(current) && !CLOSED_TASK_STATUSES.includes(status);
  task.status = status;
  if (task.corrected?.status) {
    const next = { ...task.corrected };
    delete next.status;
    task.corrected = Object.keys(next).length ? next : undefined;
    task.markModified('corrected');
  }
  if (status === 'IN_PROGRESS' && !task.startedAt) task.startedAt = ctx.now;
  if (status === 'COMPLETED') task.completedAt = ctx.now;
  if (reopening) {
    task.reopenCount = (task.reopenCount || 0) + 1;
    task.completedAt = undefined;
  }
  const events = [{ action: 'STATUS_CHANGED', oldValue: { status: current }, newValue: { status } }];
  if (reopening) events.push({ action: 'TASK_REOPENED', oldValue: { status: current }, newValue: { status, reopenCount: task.reopenCount } });
  return {
    events,
    notification: {
      type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
      title: 'Task status changed',
      message: `${ctx.user.name} changed ${taskLabel(task)} from ${current.replace('_', ' ')} to ${status.replace('_', ' ')}`,
      workDate: today.today
    }
  };
}

function applyPriority(ctx, task, perms, priority) {
  if (!TASK_PRIORITIES.includes(priority)) throw new AppError('Invalid priority', 422);
  const current = task.corrected?.priority || task.priority;
  if (current === priority) return null;
  if (!perms.changePriority) denyOrLock(perms, 'You cannot change the priority of this task.');
  task.priority = priority;
  return {
    events: [{ action: 'PRIORITY_CHANGED', oldValue: { priority: current }, newValue: { priority } }],
    notification: { type: NOTIFICATION_TYPES.TASK_PRIORITY_CHANGED, title: 'Task priority changed', message: `${ctx.user.name} changed ${taskLabel(task)} priority to ${priority}` }
  };
}

function applyDeadline(ctx, task, perms, deadline, today) {
  const next = deadline ? new Date(deadline) : null;
  const current = task.deadline || null;
  if ((current?.getTime() || null) === (next?.getTime() || null)) return null;
  if (!perms.changeDeadline) denyOrLock(perms, 'You cannot change the deadline of this task.');
  assertDeadline(deadline, today);
  task.deadline = next || undefined;
  return {
    events: [{ action: 'DEADLINE_CHANGED', oldValue: { deadline: current }, newValue: { deadline: next } }],
    notification: { type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED, title: 'Task deadline changed', message: `${ctx.user.name} set the deadline of ${taskLabel(task)} to ${next ? next.toISOString().slice(0, 10) : 'none'}` }
  };
}

function applyActualHours(ctx, task, perms, hours) {
  const current = task.actualHours ?? null;
  if (current === (hours ?? null)) return null;
  if (!perms.logTime) denyOrLock(perms, 'You cannot log time on this task.');
  task.actualHours = hours ?? undefined;
  return { events: [{ action: 'TIME_LOGGED', oldValue: { actualHours: current }, newValue: { actualHours: hours ?? null } }] };
}

async function applyCollaborators(ctx, task, perms, ids) {
  const next = uniqueIds(ids);
  const current = uniqueIds(task.collaborators);
  if (next.length === current.length && next.every((id) => current.includes(id))) return null;
  if (!perms.manageCollaborators) denyOrLock(perms, 'You cannot change collaborators on this task.');
  const users = await activeUsers(next, 'collaborators');
  task.collaborators = users.map((user) => user._id);
  const added = next.filter((id) => !current.includes(id));
  return {
    events: [{ action: 'COLLABORATORS_CHANGED', oldValue: { collaborators: current }, newValue: { collaborators: next, names: users.map((user) => user.name) } }],
    extraNotify: added.length ? { recipients: added, payload: { type: NOTIFICATION_TYPES.TASK_ASSIGNED, title: 'Added as collaborator', message: `${ctx.user.name} added you to ${taskLabel(task)}` } } : null
  };
}

/** Applies an edit request. Every field group is authorised separately and audited with old/new values. */
export async function updateTask(ctx, id, input) {
  const { task, perms, settings } = await loadTaskForUser(ctx, id);
  const today = await todayContext(ctx.now);
  const before = task.toObject();
  const contentInput = Object.fromEntries(TASK_CONTENT_FIELDS.filter((field) => field in input).map((field) => [field, input[field]]));
  if ('content' in contentInput) contentInput.content = sanitizeRichText(contentInput.content);
  if (!settings.timeTrackingEnabled) delete contentInput.estimatedHours;
  for (const key of ['project', 'department']) if (key in contentInput && !contentInput[key]) contentInput[key] = undefined;
  const contentDiff = diffFields(before, contentInput, Object.keys(contentInput));
  const changes = [];
  if (contentDiff) {
    if (!perms.editContent) denyOrLock(perms, 'You cannot edit this task.');
    await assertReferences(contentInput);
    Object.assign(task, contentInput);
    changes.push({ events: [{ action: task.parent ? 'SUBTASK_UPDATED' : 'TASK_UPDATED', ...contentDiff }] });
  }
  if (input.status) changes.push(await applyStatus(ctx, task, perms, input.status, today));
  if (input.priority) changes.push(applyPriority(ctx, task, perms, input.priority));
  if ('deadline' in input) changes.push(applyDeadline(ctx, task, perms, input.deadline, today));
  if ('actualHours' in input && settings.timeTrackingEnabled) changes.push(applyActualHours(ctx, task, perms, input.actualHours));
  if (Array.isArray(input.collaborators)) changes.push(await applyCollaborators(ctx, task, perms, input.collaborators));
  const applied = changes.filter(Boolean);
  if (input.assignee && !sameId(input.assignee, task.assignee)) {
    if (applied.length) {
      task.lastActivityAt = ctx.now;
      await task.save();
      await flushChanges(ctx, task, applied, today);
    }
    await assignTask(ctx, id, { assignee: input.assignee, note: input.assignmentNote });
    return Task.findById(id);
  }
  if (!applied.length) return task;
  task.lastActivityAt = ctx.now;
  await task.save();
  await flushChanges(ctx, task, applied, today);
  if (contentDiff && ('description' in contentDiff.newValue || 'content' in contentDiff.newValue)) {
    const text = `${task.description}\n${richTextToPlain(task.content)}`;
    const mentioned = (await resolveMentions(text, input.mentions || [])).filter((userId) => !uniqueIds(before.mentions).includes(userId));
    if (mentioned.length) await recordMentions(ctx, task, mentioned, { excerpt: task.description || task.title, workDate: today.today });
  }
  return task;
}

async function flushChanges(ctx, task, applied, today) {
  for (const change of applied) {
    for (const event of change.events) {
      await recordAudit(ctx, {
        ...event, recordType: task.parent ? 'Subtask' : 'Task', recordId: task._id, task: task._id,
        subjectUser: task.assignee, workDate: today.today
      });
    }
    if (change.notification) {
      await notify(participants(task), {
        type: change.notification.type, title: change.notification.title, message: change.notification.message,
        entityType: 'Task', entityId: task._id, link: taskLink(task)
      }, ctx.user);
    }
    if (change.extraNotify) {
      await notify(change.extraNotify.recipients, { ...change.extraNotify.payload, entityType: 'Task', entityId: task._id, link: taskLink(task) }, ctx.user);
    }
  }
}

export async function changeStatus(ctx, id, status) {
  return updateTask(ctx, id, { status });
}

export async function changePriority(ctx, id, priority) {
  return updateTask(ctx, id, { priority });
}

export async function assignTask(ctx, id, { assignee, note }) {
  const { task, perms } = await loadTaskForUser(ctx, id);
  const today = await todayContext(ctx.now);
  if (!perms.assign) denyOrLock(perms, 'You do not have permission to assign this task.');
  if (!(await canAssignTo(ctx.user, assignee))) throw new AppError('You can only assign tasks to employees you manage.', 403);
  const [user] = await activeUsers([assignee], 'assignee');
  if (sameId(task.assignee, user)) return task;
  const previous = task.assignee;
  const previousUser = previous ? await User.findById(previous, 'name').lean() : null;
  const kind = previous ? 'REASSIGNED' : 'ASSIGNED';
  task.assignee = user._id;
  task.assignedBy = ctx.user._id;
  task.lastActivityAt = ctx.now;
  await task.save();
  await TaskAssignment.create({ task: task._id, kind, assignee: user._id, previousAssignee: previous, assignedBy: ctx.user._id, note, workDate: today.today });
  await recordAudit(ctx, {
    action: kind === 'REASSIGNED' ? 'TASK_REASSIGNED' : 'TASK_ASSIGNED', recordType: task.parent ? 'Subtask' : 'Task', recordId: task._id, task: task._id,
    subjectUser: user._id, oldValue: previous ? { assignee: previous, assigneeName: previousUser?.name } : null,
    newValue: { assignee: user._id, assigneeName: user.name }, workDate: today.today, meta: note ? { note } : undefined
  });
  const type = task.parent ? NOTIFICATION_TYPES.SUBTASK_ASSIGNED : kind === 'REASSIGNED' ? NOTIFICATION_TYPES.TASK_REASSIGNED : NOTIFICATION_TYPES.TASK_ASSIGNED;
  await notify([user._id], {
    type, title: task.parent ? 'Subtask assigned to you' : kind === 'REASSIGNED' ? 'Task reassigned to you' : 'Task assigned to you',
    message: `${ctx.user.name} assigned ${taskLabel(task)} to you${note ? ` — ${note}` : ''}`,
    entityType: 'Task', entityId: task._id, link: taskLink(task), dueDate: task.deadline
  }, ctx.user);
  if (previous) {
    await notify([previous], {
      type: NOTIFICATION_TYPES.TASK_REASSIGNED, title: 'Task reassigned',
      message: `${ctx.user.name} reassigned ${taskLabel(task)} to ${user.name}`, entityType: 'Task', entityId: task._id, link: taskLink(task)
    }, ctx.user);
  }
  return task;
}

export async function addMentions(ctx, id, { userIds = [], note = '' }) {
  const { task, perms } = await loadTaskForUser(ctx, id);
  if (!perms.comment) denyOrLock(perms);
  const today = await todayContext(ctx.now);
  const resolved = await resolveMentions(note, userIds);
  if (!resolved.length) throw new AppError('Select at least one active employee to mention.', 422);
  return recordMentions(ctx, task, resolved, { excerpt: note || task.title, workDate: today.today });
}

export async function archiveTask(ctx, id) {
  const { task, perms } = await loadTaskForUser(ctx, id);
  if (!perms.archive) denyOrLock(perms, 'Only the task creator can remove a task, and only on the day it was created.');
  const today = await todayContext(ctx.now);
  task.isArchived = true;
  task.archivedAt = ctx.now;
  task.archivedBy = ctx.user._id;
  await task.save();
  await recordAudit(ctx, { action: 'TASK_ARCHIVED', recordType: task.parent ? 'Subtask' : 'Task', recordId: task._id, task: task._id, oldValue: { isArchived: false }, newValue: { isArchived: true }, workDate: today.today });
  return task;
}

/** Subtask progress over all descendants: completed / total (cancelled subtasks are excluded from the total). */
export async function subtaskProgress(taskIds) {
  const ids = uniqueIds(taskIds).map((id) => new mongoose.Types.ObjectId(id));
  if (!ids.length) return new Map();
  const rows = await Task.aggregate([
    { $match: { ancestors: { $in: ids }, isArchived: false } },
    { $project: { ancestors: 1, status: { $ifNull: ['$corrected.status', '$status'] } } },
    { $match: { status: { $ne: 'CANCELLED' } } },
    { $unwind: '$ancestors' },
    { $match: { ancestors: { $in: ids } } },
    { $group: { _id: '$ancestors', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } } } }
  ]);
  return new Map(rows.map((row) => [String(row._id), { total: row.total, completed: row.completed, percent: row.total ? Math.round((row.completed / row.total) * 100) : 0 }]));
}

function csvList(value) {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : String(value).split(',')).map((item) => String(item).trim()).filter(Boolean);
}

const objectIdOrNull = (value) => (mongoose.isValidObjectId(value) && String(value).length === 24 ? new mongoose.Types.ObjectId(String(value)) : null);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function buildTaskFilter(user, query, now = new Date()) {
  const settings = await getTaskSettings();
  const and = [await taskScopeFilter(user)];
  if (query.includeArchived !== 'true') and.push({ isArchived: false });
  const me = new mongoose.Types.ObjectId(String(user._id));
  const scopes = {
    mine: { $or: [{ owner: me }, { assignee: me }] },
    assigned: { assignee: me, assignedBy: { $exists: true, $ne: me } },
    created: { createdBy: me },
    mentioned: { mentions: me },
    collaborating: { collaborators: me }
  };
  if (scopes[query.scope]) and.push(scopes[query.scope]);
  if (query.rootOnly === 'true') and.push({ parent: null });
  const statuses = csvList(query.status).filter((status) => TASK_STATUSES.includes(status));
  if (statuses.length) and.push({ status: { $in: statuses } });
  const priorities = csvList(query.priority).filter((priority) => TASK_PRIORITIES.includes(priority));
  if (priorities.length) and.push({ priority: { $in: priorities } });
  for (const [param, field] of [['project', 'project'], ['department', 'department'], ['assignedBy', 'assignedBy'], ['mentioned', 'mentions'], ['parent', 'parent'], ['assignee', 'assignee'], ['owner', 'owner']]) {
    const value = objectIdOrNull(query[param]);
    if (value) and.push({ [field]: value });
  }
  const employee = objectIdOrNull(query.employee);
  if (employee) and.push({ $or: [{ owner: employee }, { assignee: employee }] });
  for (const field of ['client', 'technology', 'module']) {
    if (query[field]) and.push({ [field]: new RegExp(escapeRegExp(String(query[field]).slice(0, 80)), 'i') });
  }
  if (query.q) {
    const pattern = new RegExp(escapeRegExp(String(query.q).trim().slice(0, 120)), 'i');
    and.push({ $or: [{ title: pattern }, { taskKey: pattern }, { description: pattern }, { client: pattern }, { module: pattern }] });
  }
  if (query.dateFrom || query.dateTo) {
    const range = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.dateFrom || '')) range.$gte = query.dateFrom;
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.dateTo || '')) range.$lte = query.dateTo;
    if (Object.keys(range).length) and.push({ workDate: range });
  }
  if (query.deadlineFrom || query.deadlineTo) {
    const range = {};
    if (query.deadlineFrom && !Number.isNaN(Date.parse(query.deadlineFrom))) range.$gte = zonedTimeToUtc(String(query.deadlineFrom).slice(0, 10), 0, 0, settings.timezone);
    if (query.deadlineTo && !Number.isNaN(Date.parse(query.deadlineTo))) range.$lt = lockInstant(String(query.deadlineTo).slice(0, 10), settings.timezone);
    if (Object.keys(range).length) and.push({ deadline: range });
  }
  if (query.overdue === 'true') and.push({ deadline: { $lt: now }, status: { $nin: CLOSED_TASK_STATUSES } });
  return { $and: and };
}

const SORTS = {
  newest: { createdAt: -1 }, oldest: { createdAt: 1 }, deadline: { deadline: 1, createdAt: -1 },
  priority: { priorityRank: -1, createdAt: -1 }, updated: { updatedAt: -1 }
};

export async function listTasks(ctx, query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = await buildTaskFilter(ctx.user, query, ctx.now);
  const sortKey = SORTS[query.sort] ? query.sort : 'newest';
  const pipeline = [{ $match: filter }];
  if (sortKey === 'priority') pipeline.push({ $addFields: { priorityRank: { $indexOfArray: [TASK_PRIORITIES, '$priority'] } } });
  pipeline.push({ $sort: SORTS[sortKey] }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { content: 0 } });
  const [rows, total] = await Promise.all([Task.aggregate(pipeline), Task.countDocuments(filter)]);
  await Task.populate(rows, [
    { path: 'owner', select: 'name email' }, { path: 'assignee', select: 'name email' }, { path: 'assignedBy', select: 'name' },
    { path: 'project', select: 'name code client' }, { path: 'department', select: 'name' }, { path: 'parent', select: 'taskKey title' }
  ]);
  const progress = await subtaskProgress(rows.map((row) => row._id));
  const settings = await getTaskSettings();
  const data = rows.map((row) => {
    const effective = effectiveTask(row);
    return {
      ...effective,
      progress: progress.get(String(row._id)) || { total: 0, completed: 0, percent: 0 },
      isOverdue: Boolean(effective.deadline && new Date(effective.deadline) < ctx.now && !CLOSED_TASK_STATUSES.includes(effective.status)),
      isLocked: ctx.now >= lockInstant(row.workDate, settings.timezone)
    };
  });
  return { data, page, limit, total };
}

function buildTree(rootId, nodes, progress) {
  const byParent = new Map();
  for (const node of nodes) {
    const key = String(node.parent);
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  }
  const attach = (parentId) => (byParent.get(String(parentId)) || [])
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((node) => ({ ...effectiveTask(node), progress: progress.get(String(node._id)) || { total: 0, completed: 0, percent: 0 }, children: attach(node._id) }));
  return attach(rootId);
}

export async function subtaskTree(taskId) {
  const nodes = await Task.find({ ancestors: taskId, isArchived: false }, '-content')
    .populate('assignee', 'name').populate('owner', 'name').lean();
  const progress = await subtaskProgress([taskId, ...nodes.map((node) => node._id)]);
  return { tree: buildTree(taskId, nodes, progress), progress: progress.get(String(taskId)) || { total: 0, completed: 0, percent: 0 } };
}

export async function taskAncestors(task) {
  if (!task.ancestors?.length) return [];
  const rows = await Task.find({ _id: { $in: task.ancestors } }, 'taskKey title depth').lean();
  return rows.sort((a, b) => a.depth - b.depth);
}

export { canViewTask };
