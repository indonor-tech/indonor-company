import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, List, ListItemButton, ListItemText, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { data, formatDate, formatDateTime, STATUS_OPTIONS } from '../../services/tasks';
import { DayStatusChip, DayTypeChip, LockCountdown, Metric, PriorityChip, StatusChip } from '../../components/tasks/TaskChips';
import TaskFormDialog from '../../components/tasks/TaskFormDialog';

const STATUS_COLORS = { PENDING: '#94a3b8', IN_PROGRESS: '#0ea5e9', COMPLETED: '#16a34a', ON_HOLD: '#f59e0b', CANCELLED: '#cbd5e1', BLOCKED: '#dc2626' };

function TaskMiniList({ tasks = [], empty, showDeadline = true }) {
  const navigate = useNavigate();
  if (!tasks.length) return <Typography variant="body2" color="text.secondary">{empty}</Typography>;
  return (
    <List dense disablePadding>
      {tasks.map((task) => (
        <ListItemButton key={task._id} onClick={() => navigate(`/tasks/${task._id}`)} sx={{ borderRadius: 1, px: 1 }}>
          <ListItemText
            primary={`${task.taskKey} · ${task.title}`}
            secondary={[task.assignedBy?.name && `from ${task.assignedBy.name}`, showDeadline && task.deadline && `due ${formatDateTime(task.deadline)}`].filter(Boolean).join(' · ') || task.workDate}
            primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
          />
          <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}><PriorityChip priority={task.priority} /><StatusChip status={task.status} /></Stack>
        </ListItemButton>
      ))}
    </List>
  );
}

function Section({ title, action, children }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}><Typography variant="h6">{title}</Typography>{action}</Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function EmployeeView() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data: dash, isLoading, error } = useQuery({ queryKey: ['task-dashboard', 'me'], queryFn: () => data(api.get('/task-dashboard/me')), refetchInterval: 60_000 });
  if (isLoading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">Unable to load your task dashboard.</Alert>;
  const counts = dash.counts || {};
  const logStatus = dash.todayLog?.status || (dash.day?.isWorkingDay ? 'PENDING' : null);
  return (
    <Stack spacing={3}>
      <Card sx={{ bgcolor: '#f0fdfa', border: '1px solid #99f6e4' }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="h6">Today · {formatDate(dash.today)}</Typography>
                <DayTypeChip dayType={dash.day?.dayType} name={dash.day?.calendarDay?.name} />
                {logStatus && <DayStatusChip status={logStatus} />}
                <LockCountdown lockAt={dash.lockAt} serverTime={dash.serverTime} timezone={dash.timezone} />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {dash.day?.isWorkingDay
                  ? dash.todayLog?.status === 'SUBMITTED' ? 'Your daily work log is submitted. You can keep updating it until 23:59:59.' : 'Submit your daily work log before 23:59:59 server time, or the day will be marked Not Submitted.'
                  : 'Weekend / Non-Working Day. Submission is not required; you may add an optional note.'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<Add />} onClick={() => setCreating(true)}>New task</Button>
              <Button variant="contained" onClick={() => navigate('/tasks/work-logs')}>{dash.todayLog?.status === 'SUBMITTED' ? 'Update work log' : 'Open work log'}</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Grid container spacing={2}>
        {[
          ['Total tasks', counts.total, '#0f766e', ''], ['Pending', counts.PENDING, '#64748b', 'PENDING'], ['In progress', counts.IN_PROGRESS, '#0284c7', 'IN_PROGRESS'],
          ['Completed', counts.COMPLETED, '#16a34a', 'COMPLETED'], ['Blocked', counts.BLOCKED, '#dc2626', 'BLOCKED'], ['Overdue', counts.overdue, '#b91c1c', 'overdue']
        ].map(([label, value, color, filter]) => (
          <Grid key={label} size={{ xs: 6, sm: 4, lg: 2 }}>
            <Metric label={label} value={value} color={color} onClick={() => navigate(filter === 'overdue' ? '/tasks/my?overdue=true' : filter ? `/tasks/my?status=${filter}` : '/tasks/my')} />
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 6 }}><Section title="Today's tasks" action={<Button size="small" component={RouterLink} to="/tasks/my">All my tasks</Button>}><TaskMiniList tasks={dash.todayTasks} empty="No tasks for today yet." /></Section></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><Section title="Overdue"><TaskMiniList tasks={dash.overdue} empty="Nothing overdue." /></Section></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><Section title="Assigned to me"><TaskMiniList tasks={dash.assigned} empty="No open tasks assigned by others." /></Section></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><Section title="Upcoming deadlines (7 days)"><TaskMiniList tasks={dash.upcoming} empty="No deadlines in the next 7 days." /></Section></Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Section title="Mentions">
            {dash.mentioned?.length ? (
              <List dense disablePadding>
                {dash.mentioned.map((row) => (
                  <ListItemButton key={row._id} onClick={() => navigate(`/tasks/${row.task._id}`)} sx={{ borderRadius: 1, px: 1 }}>
                    <ListItemText primary={`${row.task.taskKey} · ${row.task.title}`} secondary={`${row.mentionedBy?.name || 'Someone'} · ${formatDateTime(row.createdAt)}${row.excerpt ? ` · "${row.excerpt}"` : ''}`} primaryTypographyProps={{ noWrap: true, fontSize: 14 }} secondaryTypographyProps={{ noWrap: true }} />
                  </ListItemButton>
                ))}
              </List>
            ) : <Typography variant="body2" color="text.secondary">No mentions yet.</Typography>}
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Section title="Recent daily logs" action={<Button size="small" component={RouterLink} to="/tasks/calendar">Calendar</Button>}>
            {dash.recentLogs?.length ? (
              <List dense disablePadding>
                {dash.recentLogs.map((log) => (
                  <ListItemButton key={log._id} onClick={() => navigate(`/tasks/work-logs?date=${log.workDate}`)} sx={{ borderRadius: 1, px: 1 }}>
                    <ListItemText primary={formatDate(log.workDate)} secondary={log.summary ? log.summary.slice(0, 90) : '—'} primaryTypographyProps={{ fontSize: 14 }} secondaryTypographyProps={{ noWrap: true }} />
                    <Stack direction="row" spacing={0.5}>{log.correctionCount > 0 && <Chip size="small" label="Corrected" variant="outlined" />}<DayStatusChip status={log.status} /></Stack>
                  </ListItemButton>
                ))}
              </List>
            ) : <Typography variant="body2" color="text.secondary">No previous logs.</Typography>}
          </Section>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Section title="Completed tasks · last 14 days">
            <Box sx={{ height: 220 }}>
              <ResponsiveContainer><BarChart data={dash.completedTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Bar dataKey="completed" fill="#0f766e" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </Box>
          </Section>
        </Grid>
      </Grid>
      <TaskFormDialog open={creating} onClose={() => setCreating(false)} onSaved={(task) => task?._id && navigate(`/tasks/${task._id}`)} />
    </Stack>
  );
}

function AdminView() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [grain, setGrain] = useState('daily');
  const { data: dash, isLoading, error } = useQuery({ queryKey: ['task-dashboard', 'admin', days], queryFn: () => data(api.get('/task-dashboard/admin', { params: { days } })), refetchInterval: 120_000 });
  if (isLoading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">Unable to load the team dashboard.</Alert>;
  const totals = dash.totals || {};
  const analytics = dash.analytics || {};
  const series = grain === 'daily' ? dash.daily.map((row) => ({ ...row, period: row.date.slice(5) })) : dash[grain];
  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" color="text.secondary">Server date {formatDate(dash.today)} ({dash.timezone})</Typography>
        <DayTypeChip dayType={dash.day?.dayType} name={dash.day?.calendarDay?.name} />
        <Box sx={{ flex: 1 }} />
        <TextField select size="small" label="Range" value={days} onChange={(event) => setDays(Number(event.target.value))} sx={{ width: 150 }}>
          {[7, 14, 30, 60, 90, 180].map((value) => <MenuItem key={value} value={value}>Last {value} days</MenuItem>)}
        </TextField>
      </Stack>
      <Grid container spacing={2}>
        {[
          ['Employees', totals.employees, '#0f766e'], ['Submitted today', `${totals.submittedToday}/${totals.requiredSubmitters}`, '#16a34a', '/tasks/work-logs?view=team'],
          ['Missing today', totals.missingToday, '#dc2626', '/tasks/reports?type=missing'], ['Total tasks', totals.tasks, '#0f766e', '/tasks/all'],
          ['Completed', totals.completed, '#16a34a', '/tasks/all?status=COMPLETED'], ['Pending', totals.pending, '#64748b', '/tasks/all?status=PENDING,ON_HOLD'],
          ['In progress', totals.inProgress, '#0284c7', '/tasks/all?status=IN_PROGRESS'], ['Blocked', totals.blocked, '#dc2626', '/tasks/all?status=BLOCKED'],
          ['Overdue', totals.overdue, '#b91c1c', '/tasks/all?overdue=true'], ['Cancelled', totals.cancelled, '#94a3b8', '/tasks/all?status=CANCELLED']
        ].map(([label, value, color, link]) => <Grid key={label} size={{ xs: 6, sm: 4, md: 2.4 }}><Metric label={label} value={value} color={color} onClick={link ? () => navigate(link) : undefined} /></Grid>)}
      </Grid>
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.5 }}>Factual metrics · last {days} days</Typography>
          <Grid container spacing={2}>
            {[
              ['Tasks created', analytics.tasksCreated], ['Tasks completed', analytics.tasksCompleted], ['Open tasks', analytics.tasksPending], ['Overdue tasks', analytics.tasksOverdue],
              ['Avg. completion time', analytics.averageCompletionHours === null ? '—' : `${analytics.averageCompletionHours} h`],
              ['Daily submission rate', analytics.dailySubmissionRate === null ? '—' : `${analytics.dailySubmissionRate}%`], ['Reopened tasks', analytics.reopenedTasks], ['Blocked tasks', analytics.blockedTasks]
            ].map(([label, value]) => <Grid key={label} size={{ xs: 6, sm: 3 }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h6">{value ?? 0}</Typography></Grid>)}
          </Grid>
        </CardContent>
      </Card>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Section title="Created vs completed" action={<Tabs value={grain} onChange={(_event, value) => setGrain(value)} sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0 } }}><Tab value="daily" label="Daily" /><Tab value="weekly" label="Weekly" /><Tab value="monthly" label="Monthly" /></Tabs>}>
            <Box sx={{ height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={series}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="created" stroke="#2563eb" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="completed" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Section title="Missing today" action={<Button size="small" component={RouterLink} to="/tasks/reports?type=missing">Report</Button>}>
            {!dash.day?.isWorkingDay ? <Typography variant="body2" color="text.secondary">Today is not a working day.</Typography>
              : dash.missingToday.length ? (
                <List dense disablePadding sx={{ maxHeight: 260, overflow: 'auto' }}>
                  {dash.missingToday.map((person) => <ListItemButton key={person.id} onClick={() => navigate(`/tasks/work-logs?date=${dash.today}&user=${person.id}`)} sx={{ borderRadius: 1, px: 1 }}><ListItemText primary={person.name} secondary={person.email} primaryTypographyProps={{ fontSize: 14 }} /></ListItemButton>)}
                </List>
              ) : <Typography variant="body2" color="success.main">Everyone required has submitted today.</Typography>}
          </Section>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Section title="Daily submissions">
            <Box sx={{ height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={dash.daily.filter((row) => row.submitted !== null).map((row) => ({ ...row, date: row.date.slice(5) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Legend />
                  <Bar dataKey="submitted" stackId="s" fill="#16a34a" name="Submitted" /><Bar dataKey="missing" stackId="s" fill="#dc2626" name="Not submitted" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Section title="Tasks by employee">
            <Box sx={{ height: Math.max(240, dash.byEmployee.length * 30) }}>
              <ResponsiveContainer>
                <BarChart data={dash.byEmployee} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} fontSize={12} /><YAxis type="category" dataKey="name" width={120} fontSize={12} /><Tooltip /><Legend />
                  {STATUS_OPTIONS.map((status) => <Bar key={status.value} dataKey={status.value} name={status.label} stackId="a" fill={STATUS_COLORS[status.value]} />)}
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Section title="Tasks by project">
            <Box sx={{ height: Math.max(240, dash.byProject.length * 30) }}>
              <ResponsiveContainer>
                <BarChart data={dash.byProject} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} fontSize={12} /><YAxis type="category" dataKey="name" width={120} fontSize={12} /><Tooltip /><Legend />
                  {STATUS_OPTIONS.map((status) => <Bar key={status.value} dataKey={status.value} name={status.label} stackId="a" fill={STATUS_COLORS[status.value]} />)}
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Section>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Section title="Tasks by department">
            <Box sx={{ height: 240 }}>
              <ResponsiveContainer><BarChart data={dash.byDepartment}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Legend /><Bar dataKey="total" name="Total" fill="#0f766e" /><Bar dataKey="open" name="Open" fill="#f59e0b" /></BarChart></ResponsiveContainer>
            </Box>
          </Section>
        </Grid>
      </Grid>
    </Stack>
  );
}

export default function TaskDashboard() {
  const { can } = useAuth();
  const isReviewer = can('task:reports:read');
  const [view, setView] = useState(isReviewer ? 'team' : 'me');
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Task dashboard</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.7 }}>Tasks, deadlines and daily work logs. Dates and locks follow the server clock.</Typography>
      </Box>
      {isReviewer && <Tabs value={view} onChange={(_event, value) => setView(value)}><Tab value="team" label="Team overview" /><Tab value="me" label="My work" /></Tabs>}
      {view === 'team' && isReviewer ? <AdminView /> : <EmployeeView />}
    </Stack>
  );
}
