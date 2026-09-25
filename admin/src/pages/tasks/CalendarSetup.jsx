import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, Grid, IconButton,
  MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import { Add, DeleteOutline, Edit, LockOutlined } from '@mui/icons-material';
import { api, apiErrorMessage } from '../../services/api';
import { CALENDAR_DAY_TYPES, data, formatDate, WEEKDAYS } from '../../services/tasks';

const ROLES = [
  { value: 'EMPLOYEE', label: 'Employee' }, { value: 'TEAM_LEAD', label: 'Team Lead' }, { value: 'MANAGER', label: 'Manager' }, { value: 'ADMIN', label: 'Admin' }, { value: 'SUPER_ADMIN', label: 'Super Admin' }
];
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
const typeLabel = (value) => CALENDAR_DAY_TYPES.find((item) => item.value === value)?.label || value;

function DayDialog({ open, entry, onClose }) {
  const client = useQueryClient();
  const [form, setForm] = useState({ date: '', type: 'COMPANY_HOLIDAY', name: '', description: '' });
  useEffect(() => { if (open) setForm(entry ? { date: entry.date, type: entry.type, name: entry.name, description: entry.description || '' } : { date: '', type: 'COMPANY_HOLIDAY', name: '', description: '' }); }, [open, entry]);
  const save = useMutation({
    mutationFn: () => (entry ? data(api.patch(`/task-calendar/days/${entry._id}`, { type: form.type, name: form.name, description: form.description })) : data(api.post('/task-calendar/days', form))),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['task-calendar'] }); client.invalidateQueries({ queryKey: ['worklog-calendar'] }); onClose(); }
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{entry ? 'Edit calendar day' : 'Add calendar day'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField type="date" label="Date" InputLabelProps={{ shrink: true }} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} disabled={Boolean(entry)} />
          <TextField select label="Type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{CALENDAR_DAY_TYPES.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</TextField>
          <TextField label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Diwali" />
          <TextField label="Description" multiline minRows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          <Typography variant="caption" color="text.secondary">Past (locked) dates cannot be added or changed, so historical submissions are never reclassified.</Typography>
          {save.isError && <Alert severity="error">{apiErrorMessage(save.error, 'Could not save')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={() => save.mutate()} disabled={!form.date || form.name.trim().length < 2 || save.isPending}>Save</Button></DialogActions>
    </Dialog>
  );
}

function SettingsCard() {
  const client = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['task-settings'], queryFn: () => data(api.get('/task-calendar/settings')) });
  const [form, setForm] = useState(null);
  const [newTime, setNewTime] = useState('');
  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  const save = useMutation({
    mutationFn: () => data(api.put('/task-calendar/settings', {
      timezone: form.timezone, workingDays: form.workingDays, reminderTimes: form.reminderTimes, timeTrackingEnabled: form.timeTrackingEnabled,
      maxSubtaskDepth: Number(form.maxSubtaskDepth), requiredRoles: form.requiredRoles, deadlineReminderHours: Number(form.deadlineReminderHours), notifyManagersOnMissed: form.notifyManagersOnMissed
    })),
    onSuccess: (saved) => { setForm(saved); client.invalidateQueries(); }
  });
  if (isLoading || !form) return <Card><CardContent><CircularProgress size={24} /></CardContent></Card>;
  const toggle = (key, value) => setForm({ ...form, [key]: form[key].includes(value) ? form[key].filter((item) => item !== value) : [...form[key], value].sort() });
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Work log settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>These rules are enforced on the server. Changing the timezone or working days affects today and future dates only; locked history is not recalculated.</Typography>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField select fullWidth label="Company timezone" value={TIMEZONES.includes(form.timezone) ? form.timezone : 'custom'} onChange={(event) => event.target.value !== 'custom' && setForm({ ...form, timezone: event.target.value })}>
              {TIMEZONES.map((zone) => <MenuItem key={zone} value={zone}>{zone}</MenuItem>)}
              {!TIMEZONES.includes(form.timezone) && <MenuItem value="custom">{form.timezone}</MenuItem>}
            </TextField>
            <TextField fullWidth size="small" sx={{ mt: 1 }} label="Or enter an IANA timezone" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <Typography variant="subtitle2">Working days</Typography>
            <FormGroup row>{WEEKDAYS.map((day) => <FormControlLabel key={day.value} control={<Checkbox checked={form.workingDays.includes(day.value)} onChange={() => toggle('workingDays', day.value)} />} label={day.label} />)}</FormGroup>
            <Typography variant="caption" color="text.secondary">Other days are Weekend / Non-Working Days. Use calendar entries for holidays and special working days.</Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2">Daily reminder times</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ my: 1 }}>
              {form.reminderTimes.map((time) => <Chip key={time} label={time} onDelete={() => setForm({ ...form, reminderTimes: form.reminderTimes.filter((item) => item !== time) })} />)}
              {!form.reminderTimes.length && <Typography variant="body2" color="text.secondary">No reminders.</Typography>}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField size="small" type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} />
              <Button size="small" onClick={() => { if (newTime && !form.reminderTimes.includes(newTime)) setForm({ ...form, reminderTimes: [...form.reminderTimes, newTime].sort() }); setNewTime(''); }} disabled={!newTime}>Add</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">Reminders are skipped for employees who already submitted.</Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2">Roles that must submit daily logs</Typography>
            <FormGroup row>{ROLES.map((role) => <FormControlLabel key={role.value} control={<Checkbox checked={form.requiredRoles.includes(role.value)} onChange={() => toggle('requiredRoles', role.value)} />} label={role.label} />)}</FormGroup>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth type="number" label="Max subtask depth" value={form.maxSubtaskDepth} onChange={(event) => setForm({ ...form, maxSubtaskDepth: event.target.value })} inputProps={{ min: 1, max: 50 }} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth type="number" label="Deadline reminder (hours before)" value={form.deadlineReminderHours} onChange={(event) => setForm({ ...form, deadlineReminderHours: event.target.value })} inputProps={{ min: 1, max: 168 }} /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><FormControlLabel control={<Switch checked={form.timeTrackingEnabled} onChange={(event) => setForm({ ...form, timeTrackingEnabled: event.target.checked })} />} label="Time tracking" /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><FormControlLabel control={<Switch checked={form.notifyManagersOnMissed} onChange={(event) => setForm({ ...form, notifyManagersOnMissed: event.target.checked })} />} label="Notify managers of missed logs" /></Grid>
        </Grid>
        {save.isError && <Alert severity="error" sx={{ mt: 2 }}>{apiErrorMessage(save.error, 'Could not save settings')}</Alert>}
        {save.isSuccess && <Alert severity="success" sx={{ mt: 2 }}>Settings saved and recorded in the audit history.</Alert>}
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}><Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending || !form.workingDays.length}>Save settings</Button></Stack>
      </CardContent>
    </Card>
  );
}

export default function CalendarSetup() {
  const client = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const { data: calendar, isLoading } = useQuery({ queryKey: ['task-calendar', year], queryFn: () => data(api.get('/task-calendar/days', { params: { from: `${year}-01-01`, to: `${year}-12-31` } })) });
  const remove = async (entry) => {
    if (!window.confirm(`Remove ${entry.name} (${entry.date})?`)) return;
    try {
      await api.delete(`/task-calendar/days/${entry._id}`);
      client.invalidateQueries({ queryKey: ['task-calendar'] });
      client.invalidateQueries({ queryKey: ['worklog-calendar'] });
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Could not remove entry'));
    }
  };
  const today = calendar?.today;
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Calendar &amp; work log settings</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.7 }}>Company holidays, public holidays, special working days, timezone, reminders and submission rules.</Typography>
      </Box>
      <SettingsCard />
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="h6">Calendar entries</Typography>
              <TextField select size="small" value={year} onChange={(event) => setYear(Number(event.target.value))}>{[year - 1, year, year + 1].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
            </Stack>
            <Button variant="contained" startIcon={<Add />} onClick={() => setEditing({})}>Add day</Button>
          </Stack>
          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
          {isLoading ? <CircularProgress size={24} /> : (
            <Table size="small">
              <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Type</TableCell><TableCell>Name</TableCell><TableCell>Description</TableCell><TableCell>Added by</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {!calendar?.entries?.length && <TableRow><TableCell colSpan={6} sx={{ color: 'text.secondary' }}>No holidays or special working days for {year}.</TableCell></TableRow>}
                {calendar?.entries?.map((entry) => {
                  const locked = today && entry.date < today;
                  return (
                    <TableRow key={entry._id}>
                      <TableCell>{formatDate(entry.date)}</TableCell>
                      <TableCell><Chip size="small" label={typeLabel(entry.type)} color={entry.type === 'SPECIAL_WORKING_DAY' ? 'info' : 'secondary'} variant="outlined" /></TableCell>
                      <TableCell>{entry.name}</TableCell>
                      <TableCell sx={{ maxWidth: 280 }}><Typography variant="body2" noWrap>{entry.description || '—'}</Typography></TableCell>
                      <TableCell>{entry.createdBy?.name || '—'}</TableCell>
                      <TableCell align="right">
                        {locked ? <Tooltip title="Past dates are locked"><LockOutlined fontSize="small" color="disabled" /></Tooltip> : (
                          <>
                            <IconButton size="small" onClick={() => setEditing(entry)}><Edit fontSize="small" /></IconButton>
                            <IconButton size="small" onClick={() => remove(entry)}><DeleteOutline fontSize="small" /></IconButton>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <DayDialog open={Boolean(editing)} entry={editing?._id ? editing : null} onClose={() => setEditing(null)} />
    </Stack>
  );
}
