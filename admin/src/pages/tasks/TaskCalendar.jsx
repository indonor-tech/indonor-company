import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, Drawer, IconButton, List, ListItemButton, ListItemText, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, Close, LockOutlined, Settings } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { DAY_STATUS, DAY_TYPE, formatDate, taskApi, workLogApi } from '../../services/tasks';
import { DayStatusChip, DayTypeChip, StatusChip } from '../../components/tasks/TaskChips';
import { useMentionableUsers } from '../../components/tasks/MentionField';

const WEEK_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthShift = (month, delta) => {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
};
const monthLabel = (month) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function personColors(day) {
  if (day.dayType === 'HOLIDAY') return DAY_TYPE.HOLIDAY;
  if (!day.isWorkingDay) return day.status === 'NOTE' ? { ...DAY_TYPE.WEEKEND, color: DAY_STATUS.NOTE.color } : DAY_TYPE.WEEKEND;
  if (day.isFuture) return DAY_STATUS.UPCOMING;
  if (day.status && DAY_STATUS[day.status]) return DAY_STATUS[day.status];
  if (day.isToday) return DAY_STATUS.PENDING;
  return DAY_STATUS.UPCOMING;
}

function teamColors(day) {
  if (day.dayType === 'HOLIDAY') return DAY_TYPE.HOLIDAY;
  if (!day.isWorkingDay) return DAY_TYPE.WEEKEND;
  if (day.isFuture) return DAY_STATUS.UPCOMING;
  if (day.missing > 0) return DAY_STATUS.NOT_SUBMITTED;
  if (day.required && day.submitted >= day.required) return DAY_STATUS.SUBMITTED;
  return DAY_STATUS.PENDING;
}

function Legend() {
  const items = [
    ['Submitted', DAY_STATUS.SUBMITTED], ['Not submitted', DAY_STATUS.NOT_SUBMITTED], ['Pending / draft', DAY_STATUS.PENDING],
    ['Non-working note', DAY_STATUS.NOTE], ['Weekend / Non-Working Day', DAY_TYPE.WEEKEND], ['Holiday', DAY_TYPE.HOLIDAY], ['Special working day', DAY_TYPE.SPECIAL_WORKING], ['Upcoming', DAY_STATUS.UPCOMING]
  ];
  return (
    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
      {items.map(([label, colors]) => <Stack key={label} direction="row" spacing={0.6} alignItems="center"><Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: colors.bg, border: `2px solid ${colors.color}` }} /><Typography variant="caption">{label}</Typography></Stack>)}
    </Stack>
  );
}

function DayDrawer({ day, team, subjectId, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const taskQuery = team ? { dateFrom: day?.date, dateTo: day?.date, limit: 50 } : subjectId && subjectId !== user?.id ? { assignee: subjectId, dateFrom: day?.date, dateTo: day?.date, limit: 50 } : { scope: 'mine', dateFrom: day?.date, dateTo: day?.date, limit: 50 };
  const { data: tasks, isLoading } = useQuery({ queryKey: ['tasks', 'calendar-day', taskQuery], queryFn: () => taskApi.list({ ...taskQuery, rootOnly: 'false' }), enabled: Boolean(day) });
  return (
    <Drawer anchor="right" open={Boolean(day)} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}>
      {day && (
        <Box sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">{formatDate(day.date)}</Typography><IconButton onClick={onClose}><Close /></IconButton></Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ my: 1.5 }}>
            <DayTypeChip dayType={day.dayType} name={day.calendarDay?.name} />
            {!team && <DayStatusChip status={day.status || (day.isWorkingDay && day.isToday ? 'PENDING' : null)} />}
            {day.locked && <Chip size="small" icon={<LockOutlined />} label="Locked" />}
            {day.hasCorrections && <Chip size="small" color="secondary" variant="outlined" label="Corrected" />}
          </Stack>
          {day.calendarDay?.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{day.calendarDay.description}</Typography>}
          {team ? (
            <Stack spacing={0.5} sx={{ mb: 2 }}>
              {day.isWorkingDay && <Typography variant="body2">{day.submitted} of {day.required} required employees submitted.</Typography>}
              {day.missing > 0 && <Typography variant="body2" color="error">{day.missing} not submitted.</Typography>}
              {day.notes > 0 && <Typography variant="body2">{day.notes} non-working-day note(s).</Typography>}
              <Button variant="contained" sx={{ alignSelf: 'flex-start', mt: 1 }} onClick={() => navigate(`/tasks/work-logs?view=team&date=${day.date}`)}>Open team logs</Button>
            </Stack>
          ) : (
            !day.isFuture && <Button variant="contained" sx={{ mb: 2 }} onClick={() => navigate(`/tasks/work-logs?date=${day.date}${subjectId ? `&user=${subjectId}` : ''}`)}>Open work log</Button>
          )}
          <Typography variant="subtitle2" color="text.secondary">Tasks recorded this day</Typography>
          {isLoading ? <CircularProgress size={22} /> : tasks?.rows?.length ? (
            <List dense disablePadding>
              {tasks.rows.map((task) => (
                <ListItemButton key={task._id} onClick={() => navigate(`/tasks/${task._id}`)} sx={{ borderRadius: 1, px: 1 }}>
                  <ListItemText primary={`${task.taskKey} · ${task.title}`} secondary={task.assignee?.name || task.owner?.name} primaryTypographyProps={{ noWrap: true, fontSize: 14 }} />
                  <StatusChip status={task.status} />
                </ListItemButton>
              ))}
            </List>
          ) : <Typography variant="body2" color="text.secondary">No tasks.</Typography>}
        </Box>
      )}
    </Drawer>
  );
}

export default function TaskCalendar() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const canTeam = can('worklog:read:all') || can('task:read:team');
  const { data: meta } = useQuery({ queryKey: ['worklog-meta'], queryFn: workLogApi.meta });
  const { data: users = [] } = useMentionableUsers();
  const [month, setMonth] = useState(params.get('month') || '');
  const [selected, setSelected] = useState(null);
  const view = params.get('view') === 'team' && canTeam ? 'team' : 'person';
  const subjectId = params.get('user') || '';
  useEffect(() => { if (!month && meta?.today) setMonth(meta.today.slice(0, 7)); }, [meta, month]);
  const target = view === 'team' ? 'all' : subjectId || undefined;
  const { data: days = [], isLoading, error } = useQuery({ queryKey: ['worklog-calendar', month, target || 'me'], queryFn: () => workLogApi.calendar(month, target), enabled: Boolean(month) });
  const setParam = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    setParams(next, { replace: true });
  };
  const leading = days.length ? days[0].weekday - 1 : 0;
  const totals = days.reduce((sum, day) => {
    if (view === 'person') {
      if (day.status === 'SUBMITTED') sum.submitted += 1;
      if (day.status === 'NOT_SUBMITTED') sum.missing += 1;
      if (day.isWorkingDay) sum.working += 1;
    } else {
      sum.submitted += day.submitted || 0;
      sum.missing += day.missing || 0;
      if (day.isWorkingDay) sum.working += 1;
    }
    return sum;
  }, { submitted: 0, missing: 0, working: 0 });
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-end' }} spacing={2}>
        <Box>
          <Typography variant="h4">Work calendar</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.7 }}>Daily submission states, weekends, holidays and special working days.</Typography>
        </Box>
        {can('task:calendar:manage') && <Button variant="outlined" startIcon={<Settings />} onClick={() => navigate('/tasks/setup')}>Holidays &amp; settings</Button>}
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
        {canTeam && <Tabs value={view} onChange={(_event, value) => setParam({ view: value === 'team' ? 'team' : '' })}><Tab value="person" label="Individual" /><Tab value="team" label="Team" /></Tabs>}
        {canTeam && view === 'person' && (
          <Autocomplete size="small" sx={{ minWidth: 260 }} options={users} value={users.find((item) => String(item.id) === (subjectId || user?.id)) || null} getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id} onChange={(_event, value) => setParam({ user: value && value.id !== user?.id ? value.id : '' })} renderInput={(props) => <TextField {...props} label="Employee" />} />
        )}
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={() => setMonth(monthShift(month, -1))} disabled={!month}><ChevronLeft /></IconButton>
          <Typography variant="h6" sx={{ minWidth: 170, textAlign: 'center' }}>{month ? monthLabel(month) : '…'}</Typography>
          <IconButton onClick={() => setMonth(monthShift(month, 1))} disabled={!month}><ChevronRight /></IconButton>
          <Button size="small" onClick={() => meta && setMonth(meta.today.slice(0, 7))}>This month</Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error">Unable to load the calendar.</Alert>}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${totals.working} working days`} />
            <Chip size="small" color="success" variant="outlined" label={`${totals.submitted} submitted`} />
            <Chip size="small" color="error" variant="outlined" label={`${totals.missing} not submitted`} />
          </Stack>
          {isLoading ? <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><CircularProgress /></Box> : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1 }}>
              {WEEK_HEADER.map((label) => <Typography key={label} variant="caption" color="text.secondary" align="center" fontWeight={700}>{label}</Typography>)}
              {Array.from({ length: leading }).map((_item, index) => <Box key={`blank-${index}`} />)}
              {days.map((day) => {
                const colors = view === 'team' ? teamColors(day) : personColors(day);
                const label = view === 'team'
                  ? (day.isWorkingDay ? `${day.submitted}/${day.required}` : DAY_TYPE[day.dayType]?.label)
                  : day.status ? DAY_STATUS[day.status]?.label : !day.isWorkingDay ? (day.dayType === 'HOLIDAY' ? 'Holiday' : 'Weekend') : day.isToday ? 'Due today' : '';
                return (
                  <Tooltip key={day.date} title={day.calendarDay?.name || DAY_TYPE[day.dayType]?.label || ''}>
                    <Box
                      onClick={() => setSelected(day)}
                      sx={{
                        minHeight: { xs: 64, md: 92 }, p: 1, borderRadius: 1.5, cursor: 'pointer', bgcolor: colors.bg, border: '1px solid', borderColor: day.isToday ? 'primary.main' : `${colors.color}44`,
                        boxShadow: day.isToday ? '0 0 0 2px rgba(15,118,110,0.25)' : 'none', transition: 'transform .1s', '&:hover': { transform: 'translateY(-1px)', borderColor: colors.color }
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" fontWeight={day.isToday ? 800 : 600}>{Number(day.date.slice(8))}</Typography>
                        {day.locked && day.isWorkingDay && <LockOutlined sx={{ fontSize: 12, color: 'text.disabled' }} />}
                      </Stack>
                      <Typography variant="caption" sx={{ color: colors.color, fontWeight: 700, display: 'block', lineHeight: 1.2, mt: 0.5 }}>{label}</Typography>
                      {day.calendarDay?.name && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', md: 'block' } }}>{day.calendarDay.name}</Typography>}
                      {view === 'person' && day.taskCount > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>{day.taskCount} task{day.taskCount > 1 ? 's' : ''}</Typography>}
                      {view === 'team' && day.missing > 0 && <Typography variant="caption" color="error" sx={{ display: { xs: 'none', md: 'block' } }}>{day.missing} missing</Typography>}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          )}
          <Box sx={{ mt: 2 }}><Legend /></Box>
        </CardContent>
      </Card>
      <DayDrawer day={selected} team={view === 'team'} subjectId={subjectId} onClose={() => setSelected(null)} />
    </Stack>
  );
}
