import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { LockOutlined } from '@mui/icons-material';
import { ACTION_LABELS, formatDateTime, humanize } from '../../services/tasks';

const ACTION_COLORS = {
  CREATED: '#0f766e', ASSIGNED: '#2563eb', REASSIGNED: '#2563eb', STATUS: '#0891b2', PRIORITY: '#f59e0b', DEADLINE: '#7c3aed',
  CORRECTION: '#db2777', LOCKED: '#475569', NOT_SUBMITTED: '#dc2626', COMMENT: '#64748b', FILE: '#64748b', URL: '#64748b'
};

function colorFor(action = '') {
  const key = Object.keys(ACTION_COLORS).find((item) => action.includes(item));
  return key ? ACTION_COLORS[key] : '#94a3b8';
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const fieldLabel = (key) => humanize(String(key).replace(/([a-z])([A-Z])/g, '$1_$2'));
const visibleKeys = (keys, ...sources) => keys.filter((key) => !sources.some((source) => source && OBJECT_ID.test(String(source[key] ?? '')) && `${key}Name` in source));

function display(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(display).join(', ') || '—';
  if (typeof value === 'object') {
    if (value.name) return value.name;
    if (value.title && value.taskKey) return `${value.taskKey} ${value.title}`;
    return Object.entries(value).map(([key, item]) => `${fieldLabel(key)}: ${display(item)}`).join(' · ');
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) return formatDateTime(value);
  if (OBJECT_ID.test(String(value))) return `#${String(value).slice(-6)}`;
  const text = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

function Changes({ oldValue, newValue }) {
  const oldObject = oldValue && typeof oldValue === 'object' && !Array.isArray(oldValue) ? oldValue : null;
  const newObject = newValue && typeof newValue === 'object' && !Array.isArray(newValue) ? newValue : null;
  if (oldObject || newObject) {
    const keys = visibleKeys([...new Set([...Object.keys(oldObject || {}), ...Object.keys(newObject || {})])], oldObject, newObject);
    return (
      <Stack spacing={0.3} sx={{ mt: 0.5 }}>
        {keys.map((key) => (
          <Typography key={key} variant="caption" sx={{ display: 'block' }}>
            <strong>{fieldLabel(key)}:</strong>{' '}
            {oldObject && <span style={{ color: '#b91c1c', textDecoration: newObject ? 'line-through' : 'none' }}>{display(oldObject[key])}</span>}
            {oldObject && newObject && ' → '}
            {newObject && <span style={{ color: '#15803d' }}>{display(newObject[key])}</span>}
          </Typography>
        ))}
      </Stack>
    );
  }
  if (oldValue === undefined && newValue === undefined) return null;
  return <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>{oldValue !== undefined && <span style={{ color: '#b91c1c' }}>{display(oldValue)} → </span>}<span style={{ color: '#15803d' }}>{display(newValue)}</span></Typography>;
}

/** Read-only history. There is intentionally no delete or edit control: audit records are append-only on the server. */
export default function AuditTimeline({ events = [], timezone, showTask = false, pageSize = 50 }) {
  const [visible, setVisible] = useState(pageSize);
  if (!events.length) return <Typography variant="body2" color="text.secondary">No history recorded yet.</Typography>;
  return (
    <Box>
      {events.slice(0, visible).map((event, index) => {
        const color = colorFor(event.action);
        return (
          <Stack key={event._id || index} direction="row" spacing={1.5} sx={{ position: 'relative', pb: 2 }}>
            <Box sx={{ position: 'relative', width: 14, flexShrink: 0 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color, mt: 0.6, border: '2px solid #fff', boxShadow: `0 0 0 1px ${color}` }} />
              {index < Math.min(visible, events.length) - 1 && <Box sx={{ position: 'absolute', left: 5, top: 20, bottom: -8, width: 2, bgcolor: '#e2e8f0' }} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                {event.action === 'DAILY_RECORD_LOCKED' && <LockOutlined sx={{ fontSize: 16, color }} />}
                <Typography variant="body2" fontWeight={700}>{ACTION_LABELS[event.action] || humanize(event.action)}</Typography>
                {event.subtaskEvent && <Chip size="small" label="Subtask" variant="outlined" />}
                {event.workDate && <Chip size="small" label={event.workDate} variant="outlined" />}
                {showTask && event.task?.taskKey && <Chip size="small" component={RouterLink} to={`/tasks/${event.task._id}`} clickable label={event.task.taskKey} color="primary" variant="outlined" />}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {formatDateTime(event.occurredAt, timezone)} · {event.virtual ? 'System (server clock)' : event.actor?.name || 'System'}
                {event.subjectUser?.name && event.subjectUser?.name !== event.actor?.name ? ` · for ${event.subjectUser.name}` : ''}
                {event.ipAddress ? ` · IP ${event.ipAddress}` : ''}
                {event.device?.browser && event.device.browser !== 'Other' ? ` · ${event.device.browser}${event.device.os && event.device.os !== 'Other' ? ` on ${event.device.os}` : ''}` : ''}
              </Typography>
              <Changes oldValue={event.oldValue} newValue={event.newValue} />
            </Box>
          </Stack>
        );
      })}
      {events.length > visible && <Button size="small" onClick={() => setVisible(visible + pageSize)}>Show {Math.min(pageSize, events.length - visible)} more</Button>}
    </Box>
  );
}
