import { api } from './api';

export const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending', color: 'default' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'info' },
  { value: 'COMPLETED', label: 'Completed', color: 'success' },
  { value: 'ON_HOLD', label: 'On Hold', color: 'warning' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'default' },
  { value: 'BLOCKED', label: 'Blocked', color: 'error' }
];

export const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low', color: '#64748b' },
  { value: 'MEDIUM', label: 'Medium', color: '#2563eb' },
  { value: 'HIGH', label: 'High', color: '#f59e0b' },
  { value: 'URGENT', label: 'Urgent', color: '#dc2626' }
];

export const DAY_STATUS = {
  SUBMITTED: { label: 'Submitted', color: '#16a34a', bg: '#dcfce7' },
  NOT_SUBMITTED: { label: 'Not Submitted', color: '#dc2626', bg: '#fee2e2' },
  DRAFT: { label: 'Draft', color: '#b45309', bg: '#fef3c7' },
  PENDING: { label: 'Pending', color: '#b45309', bg: '#fef3c7' },
  NOTE: { label: 'Note', color: '#6d28d9', bg: '#ede9fe' },
  UPCOMING: { label: 'Upcoming', color: '#64748b', bg: '#f1f5f9' }
};

export const DAY_TYPE = {
  WORKING: { label: 'Working day', color: '#0f766e', bg: '#ffffff' },
  WEEKEND: { label: 'Weekend / Non-Working Day', color: '#64748b', bg: '#f1f5f9' },
  HOLIDAY: { label: 'Holiday', color: '#7c3aed', bg: '#f5f3ff' },
  SPECIAL_WORKING: { label: 'Special working day', color: '#0369a1', bg: '#e0f2fe' }
};

export const CALENDAR_DAY_TYPES = [
  { value: 'COMPANY_HOLIDAY', label: 'Company holiday' },
  { value: 'PUBLIC_HOLIDAY', label: 'Public holiday' },
  { value: 'SPECIAL_WORKING_DAY', label: 'Special working day' }
];

export const WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 7, label: 'Sun' }
];

export const ACTION_LABELS = {
  TASK_CREATED: 'Task created', TASK_UPDATED: 'Task updated', TASK_ASSIGNED: 'Task assigned', TASK_REASSIGNED: 'Task reassigned',
  TASK_ARCHIVED: 'Task removed', TASK_REOPENED: 'Task reopened', SUBTASK_CREATED: 'Subtask added', SUBTASK_UPDATED: 'Subtask updated',
  COLLABORATORS_CHANGED: 'Collaborators changed', EMPLOYEE_MENTIONED: 'Employee mentioned', COMMENT_ADDED: 'Comment added',
  COMMENT_EDITED: 'Comment edited', FILE_UPLOADED: 'File uploaded', FILE_REMOVED: 'File removed', URL_ADDED: 'URL added',
  URL_REMOVED: 'URL removed', STATUS_CHANGED: 'Status changed', PRIORITY_CHANGED: 'Priority changed', DEADLINE_CHANGED: 'Deadline changed',
  TIME_LOGGED: 'Time logged', WORKLOG_SAVED: 'Work log saved', WORKLOG_SUBMITTED: 'Work log submitted', WORKLOG_NOTE_SAVED: 'Non-working day note saved',
  WORKLOG_COMMENT_ADDED: 'Work log comment', WORKLOG_NOT_SUBMITTED: 'Marked Not Submitted', DAILY_RECORD_LOCKED: 'Daily record locked',
  CORRECTION_REQUESTED: 'Correction requested', CORRECTION_APPROVED: 'Correction approved', CORRECTION_REJECTED: 'Correction rejected',
  PROJECT_CREATED: 'Project created', PROJECT_UPDATED: 'Project updated', CALENDAR_DAY_CREATED: 'Calendar day added',
  CALENDAR_DAY_UPDATED: 'Calendar day updated', CALENDAR_DAY_REMOVED: 'Calendar day removed', TASK_SETTINGS_UPDATED: 'Settings updated',
  REPORT_EXPORTED: 'Report exported'
};

export const statusLabel = (value) => STATUS_OPTIONS.find((item) => item.value === value)?.label || value || '—';
export const priorityOf = (value) => PRIORITY_OPTIONS.find((item) => item.value === value) || PRIORITY_OPTIONS[1];
export const humanize = (value) => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());

export function formatDate(value, timeZone) {
  if (!value) return '—';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : timeZone });
}

export function formatDateTime(value, timeZone) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone });
}

export function formatTime(value, timeZone) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone });
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const data = (request) => request.then((response) => response.data.data);
export const withMeta = (request) => request.then((response) => ({ rows: response.data.data, meta: response.data.meta }));

export const taskApi = {
  meta: () => data(api.get('/tasks/meta')),
  users: () => data(api.get('/tasks/mentionable-users', { params: { limit: 500 } })),
  lookups: () => data(api.get('/tasks/lookups')),
  list: (params) => withMeta(api.get('/tasks', { params })),
  get: (id) => data(api.get(`/tasks/${id}`)),
  create: (payload) => data(api.post('/tasks', payload)),
  createSubtask: (id, payload) => data(api.post(`/tasks/${id}/subtasks`, payload)),
  update: (id, payload) => data(api.patch(`/tasks/${id}`, payload)),
  status: (id, status) => data(api.patch(`/tasks/${id}/status`, { status })),
  priority: (id, priority) => data(api.patch(`/tasks/${id}/priority`, { priority })),
  assign: (id, assignee, note) => data(api.post(`/tasks/${id}/assign`, { assignee, note })),
  archive: (id) => data(api.delete(`/tasks/${id}`)),
  timeline: (id) => data(api.get(`/tasks/${id}/audit`)),
  comment: (id, form) => data(api.post(`/tasks/${id}/comments`, form)),
  editComment: (id, commentId, text) => data(api.patch(`/tasks/${id}/comments/${commentId}`, { text })),
  upload: (id, form) => data(api.post(`/tasks/${id}/attachments`, form)),
  removeAttachment: (id, attachmentId) => data(api.delete(`/tasks/${id}/attachments/${attachmentId}`)),
  addUrl: (id, payload) => data(api.post(`/tasks/${id}/urls`, payload)),
  removeUrl: (id, urlId) => data(api.delete(`/tasks/${id}/urls/${urlId}`)),
  mention: (id, userIds, note) => data(api.post(`/tasks/${id}/mentions`, { userIds, note })),
  requestCorrection: (id, form) => data(api.post(`/tasks/${id}/corrections`, form))
};

export const workLogApi = {
  meta: () => data(api.get('/work-logs/meta')),
  get: (date, user) => data(api.get(`/work-logs/${date}`, { params: user ? { user } : {} })),
  list: (params) => withMeta(api.get('/work-logs', { params })),
  suggestions: () => data(api.get('/work-logs/suggestions')),
  save: (date, payload) => data(api.put(`/work-logs/${date}`, payload)),
  submit: (date, payload) => data(api.post(`/work-logs/${date}/submit`, payload)),
  upload: (date, form) => data(api.post(`/work-logs/${date}/attachments`, form)),
  addUrl: (date, payload) => data(api.post(`/work-logs/${date}/urls`, payload)),
  comment: (logId, form) => data(api.post(`/work-logs/entries/${logId}/comments`, form)),
  calendar: (month, user) => data(api.get('/work-logs/calendar', { params: { month, ...(user ? { user } : {}) } })),
  requestCorrection: (date, form) => data(api.post(`/work-logs/${date}/corrections`, form)),
  lock: (date) => data(api.post(`/work-logs/lock/${date}`))
};

export const correctionApi = {
  list: (params) => withMeta(api.get('/task-corrections', { params })),
  create: (form) => data(api.post('/task-corrections', form)),
  approve: (id, note) => data(api.post(`/task-corrections/${id}/approve`, { note })),
  reject: (id, note) => data(api.post(`/task-corrections/${id}/reject`, { note }))
};

export async function downloadAttachment(attachment, { inline = false } = {}) {
  const response = await api.get(`/tasks/attachments/${attachment._id}/download`, { responseType: 'blob', params: inline ? { inline: 1 } : {} });
  const url = URL.createObjectURL(new Blob([response.data], { type: attachment.mimeType || response.data.type }));
  if (inline) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.name || 'file';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadReport(type, format, params) {
  const response = await api.get(`/task-reports/${type}/export`, { params: { ...params, format }, responseType: 'blob' });
  const header = response.headers['content-disposition'] || '';
  const name = /filename="?([^";]+)"?/i.exec(header)?.[1] || `${type}-report.${format}`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Returns the server clock minus the local clock, so countdowns track server time rather than the browser clock. */
export function serverOffset(serverTime) {
  return serverTime ? new Date(serverTime).getTime() - Date.now() : 0;
}

export function buildForm(fields = {}, files = []) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
  }
  for (const file of files) form.append('files', file);
  return form;
}
