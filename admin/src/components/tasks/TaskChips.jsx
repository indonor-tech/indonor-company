import React, { useEffect, useState } from 'react';
import { Box, Chip, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { LockOutlined } from '@mui/icons-material';
import { DAY_STATUS, DAY_TYPE, priorityOf, STATUS_OPTIONS, serverOffset } from '../../services/tasks';

export function StatusChip({ status, size = 'small' }) {
  const option = STATUS_OPTIONS.find((item) => item.value === status);
  return <Chip size={size} label={option?.label || status || '—'} color={option?.color || 'default'} variant={status === 'CANCELLED' ? 'outlined' : 'filled'} />;
}

export function PriorityChip({ priority, size = 'small' }) {
  const option = priorityOf(priority);
  return <Chip size={size} label={option.label} variant="outlined" sx={{ borderColor: option.color, color: option.color }} />;
}

export function DayStatusChip({ status }) {
  const option = DAY_STATUS[status];
  if (!option) return null;
  return <Chip size="small" label={option.label} sx={{ bgcolor: option.bg, color: option.color }} />;
}

export function DayTypeChip({ dayType, name }) {
  const option = DAY_TYPE[dayType];
  if (!option || dayType === 'WORKING') return null;
  return <Chip size="small" label={name ? `${option.label}: ${name}` : option.label} sx={{ bgcolor: option.bg, color: option.color, border: `1px solid ${option.color}33` }} />;
}

export function LockedChip({ locked }) {
  if (!locked) return null;
  return <Tooltip title="This date passed its 23:59:59 deadline. Use Request correction to change it."><Chip size="small" icon={<LockOutlined />} label="Locked" /></Tooltip>;
}

export function ProgressBar({ progress }) {
  if (!progress?.total) return <Typography variant="caption" color="text.secondary">No subtasks</Typography>;
  return (
    <Box sx={{ minWidth: 110 }}>
      <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="text.secondary">{progress.completed}/{progress.total} subtasks</Typography><Typography variant="caption" fontWeight={700}>{progress.percent}%</Typography></Stack>
      <LinearProgress variant="determinate" value={progress.percent} sx={{ height: 6, borderRadius: 3, mt: 0.4 }} />
    </Box>
  );
}

/** Countdown to the lock instant, driven by server time (display only; the API enforces the lock). */
export function LockCountdown({ lockAt, serverTime, timezone }) {
  const [offset] = useState(() => serverOffset(serverTime));
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(timer);
  }, [offset]);
  if (!lockAt) return null;
  const remaining = new Date(lockAt).getTime() - now;
  if (remaining <= 0) return <Chip size="small" icon={<LockOutlined />} label="Locked" color="default" />;
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const urgent = remaining < 2 * 3600000;
  return (
    <Tooltip title={`Today's record locks at 23:59:59 (${timezone}). Server time is used.`}>
      <Chip size="small" color={urgent ? 'warning' : 'default'} label={`Locks in ${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`} />
    </Tooltip>
  );
}

export function Metric({ label, value, color = '#0f766e', hint, onClick }) {
  return (
    <Box onClick={onClick} sx={{ p: 2.2, borderRadius: 2, border: '1px solid #e7ecef', bgcolor: 'background.paper', height: '100%', cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { borderColor: color } : undefined }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h4" sx={{ mt: 0.8, color }}>{value ?? 0}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Box>
  );
}
