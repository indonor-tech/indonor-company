import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Grid, IconButton, Link, List, ListItemButton, ListItemText, MenuItem, Stack, Tab,
  Table, TableBody, TableCell, TableHead, TablePagination, TableRow, Tabs, TextField, Tooltip, Typography
} from '@mui/material';
import { ChevronLeft, ChevronRight, LockOutlined, RateReview, Today } from '@mui/icons-material';
import { apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatDateTime, humanize, taskApi, workLogApi } from '../../services/tasks';
import { DayStatusChip, DayTypeChip, LockCountdown, StatusChip } from '../../components/tasks/TaskChips';
import { useMentionableUsers } from '../../components/tasks/MentionField';
import AttachmentsPanel from '../../components/tasks/AttachmentsPanel';
import CommentsPanel from '../../components/tasks/CommentsPanel';
import CorrectionDialog from '../../components/tasks/CorrectionDialog';

const shiftDate = (dateKey, days) => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const TASK_GROUPS = [
  { key: 'completedTasks', label: 'Completed tasks', suggestion: 'completed' },
  { key: 'inProgressTasks', label: 'In-progress tasks', suggestion: 'inProgress' },
  { key: 'pendingTasks', label: 'Pending tasks', suggestion: 'pending' }
];
const emptyForm = { summary: '', blockers: '', nextDayPlan: '', hoursWorked: '', completedTasks: [], inProgressTasks: [], pendingTasks: [] };

function Snapshot({ tasks = [] }) {
  if (!tasks.length) return <Typography variant="body2" color="text.secondary">—</Typography>;
  return (
    <Stack spacing={0.5}>
      {tasks.map((item, index) => (
        <Stack key={`${item.task || index}`} direction="row" spacing={1} alignItems="center">
          {item.task ? <Link component={RouterLink} to={`/tasks/${item.task}`} underline="hover" sx={{ fontSize: 14 }}>{item.taskKey} · {item.title}</Link> : <Typography variant="body2">{item.title}</Typography>}
          {item.status && <StatusChip status={item.status} />}
        </Stack>
      ))}
    </Stack>
  );
}

function TextBlock({ label, value, original }) {
  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.3 }}>{value || '—'}</Typography>
      {original !== undefined && <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', display: 'block', mt: 0.5 }}>Original: <span style={{ textDecoration: 'line-through' }}>{String(original || '—')}</span></Typography>}
    </Box>
  );
}

function Editor({ record, onSaved }) {
  const client = useQueryClient();
  const { data: suggestions } = useQuery({ queryKey: ['worklog-suggestions'], queryFn: workLogApi.suggestions });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const log = record.log;
  useEffect(() => {
    setForm({
      summary: log?.summary || '', blockers: log?.blockers || '', nextDayPlan: log?.nextDayPlan || '', hoursWorked: log?.hoursWorked ?? '',
      completedTasks: (log?.completedTasks || []).map((item) => item.task).filter(Boolean),
      inProgressTasks: (log?.inProgressTasks || []).map((item) => item.task).filter(Boolean),
      pendingTasks: (log?.pendingTasks || []).map((item) => item.task).filter(Boolean)
    });
  }, [log?._id, log?.revision]);
  const allTasks = useMemo(() => {
    const map = new Map();
    for (const group of ['completed', 'inProgress', 'pending']) for (const task of suggestions?.[group] || []) map.set(String(task._id), task);
    for (const group of TASK_GROUPS) for (const item of log?.[group.key] || []) if (item.task && !map.has(String(item.task))) map.set(String(item.task), { _id: item.task, taskKey: item.taskKey, title: item.title, status: item.status });
    return map;
  }, [suggestions, log]);
  const nonWorking = !record.day.isWorkingDay;
  const autofill = () => setForm((current) => ({
    ...current,
    completedTasks: [...new Set([...current.completedTasks, ...(suggestions?.completed || []).map((task) => String(task._id))])],
    inProgressTasks: [...new Set([...current.inProgressTasks, ...(suggestions?.inProgress || []).map((task) => String(task._id))])],
    pendingTasks: [...new Set([...current.pendingTasks, ...(suggestions?.pending || []).map((task) => String(task._id))])]
  }));
  const save = async (submit) => {
    setBusy(submit ? 'submit' : 'save');
    setMessage(null);
    const payload = { ...form, hoursWorked: form.hoursWorked === '' ? null : Number(form.hoursWorked) };
    try {
      if (submit) await workLogApi.submit(record.date, payload); else await workLogApi.save(record.date, payload);
      setMessage({ severity: 'success', text: nonWorking ? 'Note saved. Non-working day notes do not count as submissions.' : submit ? 'Daily work log submitted. You can keep updating it until 23:59:59 today.' : 'Draft saved. Remember to submit before 23:59:59.' });
      client.invalidateQueries({ queryKey: ['task-dashboard'] });
      onSaved();
    } catch (reason) {
      setMessage({ severity: 'error', text: apiErrorMessage(reason, 'Could not save the work log') });
    } finally {
      setBusy('');
    }
  };
  return (
    <Stack spacing={2.2}>
      {nonWorking && <Alert severity="info">Weekend / Non-Working Day. Submission is not required. Anything you save here is stored as an optional note and does not count as a daily submission.</Alert>}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1" fontWeight={700}>Tasks</Typography>
        <Button size="small" onClick={autofill}>Fill from my current tasks</Button>
      </Stack>
      {TASK_GROUPS.map((group) => (
        <Autocomplete
          key={group.key} multiple options={[...allTasks.keys()]} value={form[group.key].map(String)}
          getOptionLabel={(id) => { const task = allTasks.get(id); return task ? `${task.taskKey} · ${task.title}` : id; }}
          renderOption={(props, id) => { const task = allTasks.get(id); return <li {...props} key={id}><Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}><Typography variant="body2" sx={{ flex: 1 }} noWrap>{task?.taskKey} · {task?.title}</Typography>{task?.status && <StatusChip status={task.status} />}</Stack></li>; }}
          onChange={(_event, value) => setForm((current) => ({ ...current, [group.key]: value }))}
          renderInput={(params) => <TextField {...params} label={group.label} placeholder="Pick tasks" />}
        />
      ))}
      <TextField label={nonWorking ? 'Note' : 'Work summary'} required={!nonWorking} multiline minRows={4} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} inputProps={{ maxLength: 10000 }} helperText={nonWorking ? '' : 'Required to submit.'} />
      <TextField label="Blockers / issues" multiline minRows={2} value={form.blockers} onChange={(event) => setForm({ ...form, blockers: event.target.value })} inputProps={{ maxLength: 5000 }} />
      <TextField label="Plan for next working day" multiline minRows={2} value={form.nextDayPlan} onChange={(event) => setForm({ ...form, nextDayPlan: event.target.value })} inputProps={{ maxLength: 5000 }} />
      <TextField label="Hours worked (optional)" type="number" value={form.hoursWorked} onChange={(event) => setForm({ ...form, hoursWorked: event.target.value })} inputProps={{ min: 0, max: 24, step: 0.25 }} sx={{ maxWidth: 220 }} />
      {message && <Alert severity={message.severity}>{message.text}</Alert>}
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        {nonWorking ? (
          <Button variant="contained" onClick={() => save(false)} disabled={Boolean(busy)}>{busy ? 'Saving…' : 'Save note'}</Button>
        ) : (
          <>
            <Button variant="outlined" onClick={() => save(false)} disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save draft'}</Button>
            <Button variant="contained" onClick={() => save(true)} disabled={Boolean(busy) || !form.summary.trim()}>{busy === 'submit' ? 'Submitting…' : record.log?.status === 'SUBMITTED' ? 'Update submission' : 'Submit daily log'}</Button>
          </>
        )}
      </Stack>
    </Stack>
  );
}

function ReadOnly({ record }) {
  const log = record.log;
  if (!log) {
    return <Typography color="text.secondary">{record.displayStatus === 'NOT_SUBMITTED' ? 'No daily work log was submitted for this date. This is permanently recorded as Not Submitted.' : record.displayStatus === 'UPCOMING' ? 'This date is in the future.' : 'No work log for this date.'}</Typography>;
  }
  const original = log.original || {};
  return (
    <Stack spacing={2}>
      {record.displayStatus === 'NOT_SUBMITTED' && <Alert severity="error">A draft was saved but never submitted before the lock. The day is permanently recorded as Not Submitted; the draft is kept below for reference.</Alert>}
      {TASK_GROUPS.map((group) => <Box key={group.key}><Typography variant="subtitle2" color="text.secondary">{group.label}</Typography><Snapshot tasks={log[group.key]} /></Box>)}
      <TextBlock label={record.day.isWorkingDay ? 'Work summary' : 'Note'} value={log.summary} original={original.summary} />
      <TextBlock label="Blockers / issues" value={log.blockers} original={original.blockers} />
      <TextBlock label="Plan for next working day" value={log.nextDayPlan} original={original.nextDayPlan} />
      {log.hoursWorked !== undefined && log.hoursWorked !== null && <TextBlock label="Hours worked" value={`${log.hoursWorked} h`} />}
      <Typography variant="caption" color="text.secondary">
        {log.firstSubmittedAt && `First submitted ${formatDateTime(log.firstSubmittedAt, record.timezone)} · `}
        {log.submittedAt && `Last submitted ${formatDateTime(log.submittedAt, record.timezone)} · `}
        {log.lastSavedAt && `Last saved ${formatDateTime(log.lastSavedAt, record.timezone)}`}
        {log.lockedAt && ` · Locked ${formatDateTime(log.lockedAt, record.timezone)}`}
      </Typography>
    </Stack>
  );
}

function TeamView({ date, onOpen }) {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const { data: result, isLoading } = useQuery({
    queryKey: ['work-logs', 'team', date, status, page],
    queryFn: () => workLogApi.list({ user: 'all', from: date, to: date, status: status || undefined, page: page + 1, limit: 50 }),
    placeholderData: keepPreviousData
  });
  const { data: calendar = [] } = useQuery({ queryKey: ['worklog-calendar', date.slice(0, 7), 'all'], queryFn: () => workLogApi.calendar(date.slice(0, 7), 'all') });
  const day = calendar.find((item) => item.date === date);
  return (
    <Card>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h6">Team logs · {formatDate(date)}</Typography>
            {day && <DayTypeChip dayType={day.dayType} name={day.calendarDay?.name} />}
            {day?.isWorkingDay && <Chip size="small" label={`${day.submitted}/${day.required} submitted`} color="success" variant="outlined" />}
            {day?.missing > 0 && <Chip size="small" label={`${day.missing} not submitted`} color="error" variant="outlined" />}
          </Stack>
          <TextField select size="small" label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} sx={{ minWidth: 170 }}>
            <MenuItem value="">All</MenuItem>{['SUBMITTED', 'DRAFT', 'NOT_SUBMITTED', 'NOTE'].map((value) => <MenuItem key={value} value={value}>{humanize(value)}</MenuItem>)}
          </TextField>
        </Stack>
        {isLoading ? <CircularProgress size={24} /> : (
          <>
            <Table size="small">
              <TableHead><TableRow><TableCell>Employee</TableCell><TableCell>Status</TableCell><TableCell>Summary</TableCell><TableCell>Blockers</TableCell><TableCell>Submitted</TableCell></TableRow></TableHead>
              <TableBody>
                {!result?.rows?.length && <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>No logs for this date{day?.isWorkingDay && !day.locked ? ' yet' : ''}. See the Missing report for people who did not submit.</TableCell></TableRow>}
                {result?.rows?.map((log) => (
                  <TableRow key={log._id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(log.user?._id)}>
                    <TableCell>{log.user?.name}</TableCell>
                    <TableCell><DayStatusChip status={log.status} /></TableCell>
                    <TableCell sx={{ maxWidth: 380 }}><Typography variant="body2" noWrap>{log.summary || '—'}</Typography></TableCell>
                    <TableCell sx={{ maxWidth: 220 }}><Typography variant="body2" noWrap color={log.blockers ? 'error' : 'text.secondary'}>{log.blockers || '—'}</Typography></TableCell>
                    <TableCell>{log.submittedAt ? formatDateTime(log.submittedAt) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination component="div" count={result?.meta?.total || 0} page={page} rowsPerPage={50} rowsPerPageOptions={[50]} onPageChange={(_event, value) => setPage(value)} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function WorkLogs() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const canTeam = can('worklog:read:all') || can('task:read:team');
  const { data: meta } = useQuery({ queryKey: ['worklog-meta'], queryFn: workLogApi.meta, refetchInterval: 60_000 });
  const { data: taskMeta } = useQuery({ queryKey: ['task-meta'], queryFn: taskApi.meta, staleTime: 60_000 });
  const { data: users = [] } = useMentionableUsers();
  const date = params.get('date') || meta?.today;
  const subjectId = params.get('user') || '';
  const view = params.get('view') === 'team' && canTeam ? 'team' : 'person';
  const setParam = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    setParams(next, { replace: true });
  };
  const { data: record, isLoading, error, refetch } = useQuery({
    queryKey: ['work-log', date, subjectId],
    queryFn: () => workLogApi.get(date, subjectId || undefined),
    enabled: Boolean(date) && view === 'person'
  });
  const { data: history } = useQuery({
    queryKey: ['work-logs', 'history', subjectId],
    queryFn: () => workLogApi.list({ user: subjectId || user?.id, limit: 14 }),
    enabled: view === 'person' && Boolean(user?.id)
  });
  if (!date) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><CircularProgress /></Box>;
  const isFutureNav = meta && shiftDate(date, 1) > meta.today;
  const refresh = () => { refetch(); client.invalidateQueries({ queryKey: ['work-logs'] }); client.invalidateQueries({ queryKey: ['worklog-calendar'] }); };
  const viewingOther = subjectId && subjectId !== user?.id;
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-end' }} spacing={2}>
        <Box>
          <Typography variant="h4">Daily work logs</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.7 }}>One record per employee per day. Each day locks at 23:59:59 server time ({meta?.timezone || '…'}); after that, changes go through a correction request.</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <IconButton onClick={() => setParam({ date: shiftDate(date, -1) })}><ChevronLeft /></IconButton>
          <TextField size="small" type="date" value={date} onChange={(event) => event.target.value && setParam({ date: event.target.value })} inputProps={{ max: meta?.today }} />
          <IconButton onClick={() => setParam({ date: shiftDate(date, 1) })} disabled={isFutureNav}><ChevronRight /></IconButton>
          <Button size="small" startIcon={<Today />} onClick={() => setParam({ date: '' })}>Today</Button>
        </Stack>
      </Stack>
      {canTeam && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <Tabs value={view} onChange={(_event, value) => setParam({ view: value === 'team' ? 'team' : '' })}><Tab value="person" label="Individual" /><Tab value="team" label="Team" /></Tabs>
          {view === 'person' && (
            <Autocomplete
              size="small" sx={{ minWidth: 280 }} options={users} value={users.find((item) => String(item.id) === (subjectId || user?.id)) || null}
              getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_event, value) => setParam({ user: value && value.id !== user?.id ? value.id : '' })}
              renderInput={(props) => <TextField {...props} label="Employee" />}
            />
          )}
        </Stack>
      )}
      {view === 'team' ? <TeamView date={date} onOpen={(id) => setParam({ view: '', user: id })} /> : (
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, lg: 8 }}>
            {isLoading && <CircularProgress />}
            {error && <Alert severity="error">{apiErrorMessage(error, 'Unable to load this work log')}</Alert>}
            {record && (
              <Stack spacing={2.5}>
                <Card>
                  <CardContent>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 2 }}>
                      <Box>
                        <Typography variant="h6">{viewingOther ? `${record.user.name} · ` : ''}{formatDate(record.date)}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                          <DayTypeChip dayType={record.day.dayType} name={record.day.calendarDay?.name} />
                          <DayStatusChip status={record.displayStatus} />
                          {record.locked ? <Chip size="small" icon={<LockOutlined />} label="Locked" /> : record.date === record.today && <LockCountdown lockAt={record.lockAt} serverTime={record.serverTime} timezone={record.timezone} />}
                          {record.log?.correctionCount > 0 && <Chip size="small" color="secondary" variant="outlined" label="Corrected" />}
                        </Stack>
                      </Box>
                      {record.canRequestCorrection && <Button variant="outlined" color="secondary" startIcon={<RateReview />} onClick={() => setCorrectionOpen(true)}>Request correction</Button>}
                    </Stack>
                    {record.editable ? <Editor record={record} onSaved={refresh} /> : <ReadOnly record={record} />}
                    {!record.editable && !record.locked && record.date > record.today && <Alert severity="info" sx={{ mt: 2 }}>Future dates cannot be filled in advance.</Alert>}
                  </CardContent>
                </Card>
                {record.log && (
                  <Card>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 1 }}>Comments</Typography>
                      <CommentsPanel
                        comments={record.comments} canComment currentUserId={user?.id} today={record.today} timezone={record.timezone} limits={taskMeta?.upload}
                        onSubmit={async (form) => { await workLogApi.comment(record.log._id, form); refresh(); }}
                      />
                    </CardContent>
                  </Card>
                )}
              </Stack>
            )}
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Stack spacing={2.5}>
              {record && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1 }}>Recorded activity</Typography>
                    <Typography variant="subtitle2" color="text.secondary">Tasks created this day</Typography>
                    <Snapshot tasks={(record.summary?.tasksCreated || []).map((task) => ({ task: task._id, taskKey: task.taskKey, title: task.title, status: task.status }))} />
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1.5 }}>Tasks completed this day</Typography>
                    <Snapshot tasks={(record.summary?.tasksCompleted || []).map((task) => ({ task: task._id, taskKey: task.taskKey, title: task.title, status: task.status }))} />
                    {Object.keys(record.summary?.activity || {}).length > 0 && (
                      <>
                        <Divider sx={{ my: 1.5 }} />
                        <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>{Object.entries(record.summary.activity).map(([action, count]) => <Chip key={action} size="small" variant="outlined" label={`${humanize(action)}: ${count}`} />)}</Stack>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
              {record?.log && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1 }}>Files &amp; links</Typography>
                    <AttachmentsPanel
                      attachments={record.attachments} urls={record.urls} canAttach={record.editable} limits={taskMeta?.upload} timezone={record.timezone}
                      onUpload={async (files) => { const form = new FormData(); files.forEach((file) => form.append('files', file)); await workLogApi.upload(record.date, form); refresh(); }}
                      onAddUrl={async (payload) => { await workLogApi.addUrl(record.date, payload); refresh(); }}
                    />
                  </CardContent>
                </Card>
              )}
              {record?.editable && !record.log && <Alert severity="info">Save the log once to attach files and links.</Alert>}
              {record?.corrections?.length > 0 && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1 }}>Correction requests</Typography>
                    <Stack spacing={1} divider={<Divider flexItem />}>
                      {record.corrections.map((request) => (
                        <Box key={request._id}>
                          <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={humanize(request.status)} color={{ PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' }[request.status]} /><Typography variant="caption" color="text.secondary">{formatDateTime(request.createdAt, record.timezone)}</Typography></Stack>
                          <Typography variant="body2" sx={{ mt: 0.5 }}>{request.reason}</Typography>
                          {request.reviewNote && <Typography variant="caption" color="text.secondary">Reviewer: {request.reviewNote}</Typography>}
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">Recent logs</Typography><Button size="small" onClick={() => navigate('/tasks/calendar')}>Calendar</Button></Stack>
                  {history?.rows?.length ? (
                    <List dense disablePadding>
                      {history.rows.map((log) => (
                        <ListItemButton key={log._id} selected={log.workDate === date} onClick={() => setParam({ date: log.workDate })} sx={{ borderRadius: 1, px: 1 }}>
                          <ListItemText primary={formatDate(log.workDate)} secondary={log.summary?.slice(0, 60) || '—'} primaryTypographyProps={{ fontSize: 14 }} secondaryTypographyProps={{ noWrap: true }} />
                          <DayStatusChip status={log.status} />
                        </ListItemButton>
                      ))}
                    </List>
                  ) : <Typography variant="body2" color="text.secondary">No logs yet.</Typography>}
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      )}
      {record && (
        <CorrectionDialog
          open={correctionOpen} onClose={() => { setCorrectionOpen(false); refresh(); }} targetType="DailyWorkLog" record={record.log} title={formatDate(record.date)} limits={taskMeta?.upload}
          onSubmit={(form) => workLogApi.requestCorrection(record.date, form)}
        />
      )}
      {meta?.reminderTimes?.length > 0 && <Tooltip title="Reminders stop once you submit."><Typography variant="caption" color="text.secondary">Reminders on working days at {meta.reminderTimes.join(', ')} ({meta.timezone}).</Typography></Tooltip>}
    </Stack>
  );
}
