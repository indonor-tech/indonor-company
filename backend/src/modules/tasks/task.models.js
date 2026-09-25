import mongoose from 'mongoose';
import { appendOnlyPlugin } from '../../utils/appendOnly.js';
import {
  AUDIT_ACTIONS, CALENDAR_DAY_TYPES, CORRECTION_STATUSES, CORRECTION_TARGETS, DAY_TYPES,
  TASK_PRIORITIES, TASK_STATUSES, URL_KINDS, WORK_LOG_STATUSES
} from './task.constants.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;
const dateKey = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  code: { type: String, trim: true, uppercase: true, maxlength: 20 },
  client: { type: String, trim: true, maxlength: 160 },
  description: { type: String, maxlength: 4000 },
  department: { type: ObjectId, ref: 'Department' },
  technologies: [{ type: String, trim: true, maxlength: 80 }],
  status: { type: String, enum: ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'], default: 'ACTIVE', index: true },
  startDate: Date,
  endDate: Date,
  members: [{ type: ObjectId, ref: 'User' }],
  createdBy: { type: ObjectId, ref: 'User' },
  updatedBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });
projectSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
projectSchema.index({ code: 1 }, { unique: true, sparse: true });

const taskSchema = new mongoose.Schema({
  taskKey: { type: String, unique: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, maxlength: 5000, default: '' },
  content: { type: String, maxlength: 100000, default: '' },
  project: { type: ObjectId, ref: 'Project', index: true },
  client: { type: String, trim: true, maxlength: 160 },
  department: { type: ObjectId, ref: 'Department', index: true },
  technology: { type: String, trim: true, maxlength: 80, index: true },
  module: { type: String, trim: true, maxlength: 120 },
  priority: { type: String, enum: TASK_PRIORITIES, default: 'MEDIUM', index: true },
  status: { type: String, enum: TASK_STATUSES, default: 'PENDING', index: true },
  deadline: { type: Date, index: true },
  estimatedHours: { type: Number, min: 0, max: 2000 },
  actualHours: { type: Number, min: 0, max: 2000 },
  owner: { type: ObjectId, ref: 'User', required: true, index: true },
  assignee: { type: ObjectId, ref: 'User', index: true },
  assignedBy: { type: ObjectId, ref: 'User', index: true },
  collaborators: [{ type: ObjectId, ref: 'User', index: true }],
  mentions: [{ type: ObjectId, ref: 'User', index: true }],
  createdBy: { type: ObjectId, ref: 'User', required: true, index: true },
  employee: { type: ObjectId, ref: 'Employee', index: true },
  parent: { type: ObjectId, ref: 'Task', index: true, default: null },
  root: { type: ObjectId, ref: 'Task', index: true, default: null },
  ancestors: [{ type: ObjectId, ref: 'Task', index: true }],
  depth: { type: Number, default: 0 },
  workDate: { ...dateKey, required: true, index: true },
  dayType: { type: String, enum: DAY_TYPES, default: 'WORKING' },
  startedAt: Date,
  completedAt: Date,
  reopenCount: { type: Number, default: 0 },
  corrected: { type: Mixed, default: undefined },
  correctionCount: { type: Number, default: 0 },
  lastActivityAt: { type: Date, default: Date.now },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: Date,
  archivedBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });
taskSchema.index({ owner: 1, workDate: -1 });
taskSchema.index({ assignee: 1, status: 1, deadline: 1 });
taskSchema.index({ status: 1, deadline: 1 });
taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ updatedAt: -1 });
taskSchema.index({ title: 'text', description: 'text', taskKey: 'text' });

const urlSubSchema = new mongoose.Schema({
  url: { type: String, required: true, maxlength: 2048 },
  label: { type: String, maxlength: 160 },
  kind: { type: String, enum: URL_KINDS, default: 'OTHER' }
}, { _id: false });

const commentSchema = new mongoose.Schema({
  task: { type: ObjectId, ref: 'Task', index: true },
  workLog: { type: ObjectId, ref: 'DailyWorkLog', index: true },
  author: { type: ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true, maxlength: 5000 },
  mentions: [{ type: ObjectId, ref: 'User' }],
  urls: [urlSubSchema],
  attachments: [{ type: ObjectId, ref: 'TaskAttachment' }],
  workDate: { ...dateKey, required: true, index: true },
  editedAt: Date,
  revisions: [{ text: String, editedAt: Date, editedBy: { type: ObjectId, ref: 'User' }, _id: false }],
  corrected: { type: Mixed, default: undefined },
  correctionCount: { type: Number, default: 0 }
}, { timestamps: true });
commentSchema.index({ task: 1, createdAt: 1 });
commentSchema.index({ workLog: 1, createdAt: 1 });

const attachmentSchema = new mongoose.Schema({
  task: { type: ObjectId, ref: 'Task', index: true },
  workLog: { type: ObjectId, ref: 'DailyWorkLog', index: true },
  parentType: { type: String, enum: ['Task', 'TaskComment', 'DailyWorkLog', 'CorrectionRequest'], required: true },
  parentId: { type: ObjectId, required: true, index: true },
  name: { type: String, required: true, maxlength: 255 },
  storageProvider: { type: String, enum: ['local', 'cloudinary'], required: true },
  storageKey: { type: String, required: true },
  resourceType: String,
  extension: String,
  mimeType: String,
  size: Number,
  uploadedBy: { type: ObjectId, ref: 'User', required: true, index: true },
  workDate: { ...dateKey, required: true },
  isRemoved: { type: Boolean, default: false },
  removedAt: Date,
  removedBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });

const taskUrlSchema = new mongoose.Schema({
  task: { type: ObjectId, ref: 'Task', index: true },
  workLog: { type: ObjectId, ref: 'DailyWorkLog', index: true },
  parentType: { type: String, enum: ['Task', 'DailyWorkLog'], required: true },
  url: { type: String, required: true, maxlength: 2048 },
  label: { type: String, maxlength: 160 },
  kind: { type: String, enum: URL_KINDS, default: 'OTHER' },
  addedBy: { type: ObjectId, ref: 'User', required: true },
  workDate: { ...dateKey, required: true },
  isRemoved: { type: Boolean, default: false },
  removedAt: Date,
  removedBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });

const mentionSchema = new mongoose.Schema({
  task: { type: ObjectId, ref: 'Task', index: true },
  comment: { type: ObjectId, ref: 'TaskComment' },
  workLog: { type: ObjectId, ref: 'DailyWorkLog' },
  mentionedUser: { type: ObjectId, ref: 'User', required: true, index: true },
  mentionedBy: { type: ObjectId, ref: 'User', required: true },
  context: { type: String, enum: ['TASK', 'COMMENT', 'WORKLOG'], default: 'TASK' },
  excerpt: { type: String, maxlength: 300 },
  workDate: dateKey
}, { timestamps: true });
mentionSchema.index({ mentionedUser: 1, createdAt: -1 });

const assignmentSchema = new mongoose.Schema({
  task: { type: ObjectId, ref: 'Task', required: true, index: true },
  kind: { type: String, enum: ['ASSIGNED', 'REASSIGNED', 'UNASSIGNED'], required: true },
  assignee: { type: ObjectId, ref: 'User', index: true },
  previousAssignee: { type: ObjectId, ref: 'User' },
  assignedBy: { type: ObjectId, ref: 'User', required: true, index: true },
  note: { type: String, maxlength: 1000 },
  workDate: dateKey
}, { timestamps: true });

const taskSnapshotSchema = new mongoose.Schema({
  task: { type: ObjectId, ref: 'Task' },
  taskKey: String,
  title: String,
  status: String
}, { _id: false });

const workLogSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  employee: { type: ObjectId, ref: 'Employee', index: true },
  workDate: { ...dateKey, required: true, index: true },
  dayType: { type: String, enum: DAY_TYPES, required: true },
  status: { type: String, enum: WORK_LOG_STATUSES, default: 'DRAFT', index: true },
  completedTasks: [taskSnapshotSchema],
  inProgressTasks: [taskSnapshotSchema],
  pendingTasks: [taskSnapshotSchema],
  blockers: { type: String, maxlength: 5000, default: '' },
  summary: { type: String, maxlength: 10000, default: '' },
  nextDayPlan: { type: String, maxlength: 5000, default: '' },
  hoursWorked: { type: Number, min: 0, max: 24 },
  firstSubmittedAt: Date,
  submittedAt: Date,
  lastSavedAt: Date,
  revision: { type: Number, default: 0 },
  lockedAt: Date,
  notSubmittedMarkedAt: Date,
  corrected: { type: Mixed, default: undefined },
  correctionCount: { type: Number, default: 0 }
}, { timestamps: true });
workLogSchema.index({ user: 1, workDate: -1 }, { unique: true });
workLogSchema.index({ workDate: 1, status: 1 });

const correctionSchema = new mongoose.Schema({
  targetType: { type: String, enum: CORRECTION_TARGETS, required: true },
  targetId: { type: ObjectId, required: true, index: true },
  task: { type: ObjectId, ref: 'Task', index: true },
  workLog: { type: ObjectId, ref: 'DailyWorkLog', index: true },
  workDate: { ...dateKey, index: true },
  subjectUser: { type: ObjectId, ref: 'User', index: true },
  requestedBy: { type: ObjectId, ref: 'User', required: true, index: true },
  reason: { type: String, required: true, maxlength: 2000 },
  requestedChanges: { type: Mixed, required: true },
  originalValues: Mixed,
  correctedValues: Mixed,
  attachments: [{ type: ObjectId, ref: 'TaskAttachment' }],
  status: { type: String, enum: CORRECTION_STATUSES, default: 'PENDING', index: true },
  reviewedBy: { type: ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: { type: String, maxlength: 2000 }
}, { timestamps: true });
correctionSchema.index({ status: 1, createdAt: -1 });

const auditSchema = new mongoose.Schema({
  task: { type: ObjectId, ref: 'Task', index: true },
  recordType: { type: String, required: true },
  recordId: { type: ObjectId, index: true },
  actor: { type: ObjectId, ref: 'User', index: true },
  actorEmployee: { type: ObjectId, ref: 'Employee', index: true },
  subjectUser: { type: ObjectId, ref: 'User', index: true },
  action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
  oldValue: Mixed,
  newValue: Mixed,
  workDate: { ...dateKey, index: true },
  ipAddress: String,
  userAgent: String,
  device: { browser: String, os: String, deviceType: String },
  meta: Mixed,
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
auditSchema.index({ task: 1, occurredAt: 1 });
auditSchema.index({ actor: 1, occurredAt: -1 });
auditSchema.plugin(appendOnlyPlugin, { modelName: 'TaskAuditLog' });

const calendarDaySchema = new mongoose.Schema({
  date: { ...dateKey, required: true, unique: true },
  type: { type: String, enum: CALENDAR_DAY_TYPES, required: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, maxlength: 1000 },
  createdBy: { type: ObjectId, ref: 'User' },
  updatedBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  timezone: String,
  workingDays: { type: [Number], default: undefined },
  reminderTimes: { type: [String], default: undefined },
  timeTrackingEnabled: Boolean,
  maxSubtaskDepth: Number,
  requiredRoles: { type: [String], default: undefined },
  deadlineReminderHours: Number,
  notifyManagersOnMissed: Boolean,
  updatedBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });

const dayFinalizationSchema = new mongoose.Schema({
  date: { ...dateKey, required: true, unique: true },
  finalizedAt: { type: Date, default: Date.now },
  requiredCount: Number,
  submittedCount: Number,
  missingCount: Number
}, { timestamps: true });

export const Project = mongoose.model('Project', projectSchema);
export const Task = mongoose.model('Task', taskSchema);
export const TaskComment = mongoose.model('TaskComment', commentSchema);
export const TaskAttachment = mongoose.model('TaskAttachment', attachmentSchema);
export const TaskUrl = mongoose.model('TaskUrl', taskUrlSchema);
export const TaskMention = mongoose.model('TaskMention', mentionSchema);
export const TaskAssignment = mongoose.model('TaskAssignment', assignmentSchema);
export const DailyWorkLog = mongoose.model('DailyWorkLog', workLogSchema);
export const CorrectionRequest = mongoose.model('CorrectionRequest', correctionSchema);
export const TaskAuditLog = mongoose.model('TaskAuditLog', auditSchema);
export const CalendarDay = mongoose.model('CalendarDay', calendarDaySchema);
export const TaskSettings = mongoose.model('TaskSettings', settingsSchema);
export const DayFinalization = mongoose.model('DayFinalization', dayFinalizationSchema);
