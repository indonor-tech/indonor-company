import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { apiErrorMessage } from '../../services/api';
import { buildForm, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../services/tasks';
import { FilePicker } from './AttachmentsPanel';

const TEXT = 'text';
const LONG = 'long';
export const CORRECTION_FIELDS = {
  Task: [
    { key: 'title', label: 'Title', type: TEXT }, { key: 'description', label: 'Description', type: LONG },
    { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS }, { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
    { key: 'client', label: 'Client', type: TEXT }, { key: 'technology', label: 'Technology', type: TEXT }, { key: 'module', label: 'Module', type: TEXT },
    { key: 'deadline', label: 'Deadline', type: 'datetime' }, { key: 'estimatedHours', label: 'Estimated hours', type: 'number' }, { key: 'actualHours', label: 'Actual hours', type: 'number' }
  ],
  DailyWorkLog: [
    { key: 'summary', label: 'Work summary', type: LONG }, { key: 'blockers', label: 'Blockers / issues', type: LONG }, { key: 'nextDayPlan', label: 'Plan for next working day', type: LONG }
  ],
  TaskComment: [{ key: 'text', label: 'Comment text', type: LONG }]
};

const toInput = (field, value) => {
  if (value === null || value === undefined) return '';
  if (field.type === 'datetime') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return String(value);
};

/**
 * Request a change to a locked record. The original is never overwritten: an approved request is stored as a
 * separate corrected value with requester, approver, dates and reason.
 */
export default function CorrectionDialog({ open, onClose, targetType, record, title, onSubmit, limits }) {
  const fields = CORRECTION_FIELDS[targetType] || [];
  const [selected, setSelected] = useState({});
  const [values, setValues] = useState({});
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!open) return;
    const single = fields.length === 1 ? { [fields[0].key]: true } : {};
    setSelected(single);
    setValues(Object.fromEntries(fields.map((field) => [field.key, toInput(field, record?.[field.key])])));
    setReason('');
    setFiles([]);
    setError('');
    setDone(false);
  }, [open, record, targetType]);
  const chosen = fields.filter((field) => selected[field.key]);
  const submit = async () => {
    const requestedChanges = Object.fromEntries(chosen.map((field) => {
      const value = values[field.key];
      if (field.type === 'datetime') return [field.key, value ? new Date(value).toISOString() : null];
      if (field.type === 'number') return [field.key, value === '' ? 0 : Number(value)];
      return [field.key, value];
    }));
    setBusy(true);
    setError('');
    try {
      await onSubmit(buildForm({ reason: reason.trim(), requestedChanges }, files));
      setDone(true);
    } catch (reason_) {
      setError(apiErrorMessage(reason_, 'Could not submit the correction request'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Request correction{title ? ` · ${title}` : ''}</DialogTitle>
      <DialogContent dividers>
        {done ? (
          <Alert severity="success">Your request was submitted for review. The original record stays unchanged; if approved, the corrected value is shown alongside the original with full history.</Alert>
        ) : (
          <Stack spacing={2}>
            <Alert severity="info">This record is locked because its date has passed. Nobody can edit it directly. Describe what should change and why.</Alert>
            {fields.length > 1 && (
              <Box>
                <Typography variant="subtitle2">Fields to correct</Typography>
                <Stack direction="row" flexWrap="wrap">
                  {fields.map((field) => <FormControlLabel key={field.key} control={<Checkbox size="small" checked={Boolean(selected[field.key])} onChange={(event) => setSelected({ ...selected, [field.key]: event.target.checked })} />} label={field.label} />)}
                </Stack>
              </Box>
            )}
            {chosen.map((field) => (
              <Box key={field.key}>
                <Typography variant="caption" color="text.secondary">Current: {String(toInput(field, record?.[field.key]) || '—').slice(0, 300)}</Typography>
                {field.type === 'select' ? (
                  <TextField select fullWidth size="small" label={`Corrected ${field.label.toLowerCase()}`} value={values[field.key]} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}>
                    {field.options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                  </TextField>
                ) : (
                  <TextField
                    fullWidth size="small" label={`Corrected ${field.label.toLowerCase()}`} value={values[field.key]} multiline={field.type === LONG} minRows={field.type === LONG ? 3 : undefined}
                    type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'} InputLabelProps={field.type === 'datetime' ? { shrink: true } : undefined}
                    onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                  />
                )}
              </Box>
            ))}
            <TextField label="Reason for correction" value={reason} onChange={(event) => setReason(event.target.value)} multiline minRows={2} required helperText="At least 5 characters. This is stored permanently with the request." />
            <FilePicker files={files} onChange={setFiles} limits={limits} label="Supporting file (optional)" />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{done ? 'Close' : 'Cancel'}</Button>
        {!done && <Button variant="contained" onClick={submit} disabled={busy || !chosen.length || reason.trim().length < 5}>{busy ? 'Submitting…' : 'Submit request'}</Button>}
      </DialogActions>
    </Dialog>
  );
}
