import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ActionButtons, ConfirmDialog, dateInput, idOf } from './RecordActions';
import { ConvertEmployeeDialog, candidateIdOf } from './ConvertEmployeeDialog';
import { OfferLetterDialog } from './OfferLetterDialog';
import { formatApplyingRole } from './GeoFields';

export const ROUNDS = ['HR', 'TECHNICAL', 'MANAGERIAL', 'FINAL', 'CLIENT', 'SCREENING'];
export const MODES = ['ONLINE', 'OFFLINE', 'PHONE', 'VIDEO'];
export const INTERVIEW_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'];

export const interviewResult = (interview) => interview?.result || 'PENDING';
export const resultColor = (result) => (result === 'PASS' ? 'success' : result === 'FAIL' ? 'error' : 'default');
export const candidateName = (candidate) => candidate ? `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() : '—';
const userId = (user) => user?._id || user?.id || '';
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (overrides = {}) => ({
  candidate: '', round: 'TECHNICAL', interviewer: '', interviewDate: today(), startTime: '', endTime: '',
  mode: 'ONLINE', technology: '', position: '', status: 'SCHEDULED', result: 'PASS', resultNotes: '', ...overrides
});

export function invalidateInterviewQueries(client) {
  ['interviews', 'candidates', 'employees', 'pipeline', 'dashboard', 'reports'].forEach((key) => client.invalidateQueries({ queryKey: [key] }));
}

export function MeetLinks({ interview }) {
  if (!interview?.meetUrl && !interview?.calendarHtmlLink) return null;
  return <Stack direction="row" gap={1} flexWrap="wrap">
    {interview.meetUrl && <Button size="small" variant="contained" href={interview.meetUrl} target="_blank" rel="noreferrer">Join Meet</Button>}
    {interview.calendarHtmlLink && <Button size="small" href={interview.calendarHtmlLink} target="_blank" rel="noreferrer">Open calendar</Button>}
  </Stack>;
}

const addMinutes = (time, minutes) => {
  const match = String(time || '').match(/^(\d{2}):(\d{2})/);
  if (!match) return '';
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const hours = Math.floor(((total % (24 * 60)) + (24 * 60)) % (24 * 60) / 60);
  const mins = ((total % 60) + 60) % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export function ResultChip({ result }) {
  const value = result || 'PENDING';
  return <Chip size="small" color={resultColor(value)} label={value === 'PENDING' ? 'Pending' : value === 'PASS' ? 'Pass' : 'Fail'} />;
}

export function InterviewTable({ rows, onView, onEdit, onDelete, onRecordResult, onConvert, onOpenEmployee, canUpdate, canDelete, hideCandidate }) {
  return <Box sx={{ overflowX: 'auto' }}><Table><TableHead><TableRow><TableCell>Date</TableCell>{!hideCandidate && <TableCell>Candidate</TableCell>}<TableCell>Round</TableCell><TableCell>Interviewer</TableCell><TableCell>Status</TableCell><TableCell>Result</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{rows.map((interview) => <TableRow key={interview._id}>
    <TableCell>{interview.interviewDate ? new Date(interview.interviewDate).toLocaleDateString() : '—'}</TableCell>
    {!hideCandidate && <TableCell>{candidateName(interview.candidate)}</TableCell>}
    <TableCell>{interview.round}</TableCell>
    <TableCell>{interview.interviewer?.name || '—'}</TableCell>
    <TableCell><Chip size="small" label={(interview.status || '').replaceAll('_', ' ')} /></TableCell>
    <TableCell><ResultChip result={interviewResult(interview)} /></TableCell>
    <TableCell align="right"><ActionButtons
      onView={onView ? () => onView(interview) : undefined}
      onEdit={canUpdate && onEdit ? () => onEdit(interview) : undefined}
      onDelete={canDelete && onDelete ? () => onDelete(interview) : undefined}
      extra={<>
        {canUpdate && onRecordResult && interviewResult(interview) === 'PENDING' ? <Button size="small" onClick={() => onRecordResult(interview)}>Record result</Button> : null}
        {onConvert && interviewResult(interview) === 'PASS' && !interview.candidate?.convertedEmployeeId ? <Button size="small" variant="contained" onClick={() => onConvert(interview)}>Convert</Button> : null}
        {interview.candidate?.convertedEmployeeId && onOpenEmployee ? <Button size="small" onClick={() => onOpenEmployee(interview.candidate.convertedEmployeeId)}>Employee</Button> : null}
        {interview.meetUrl ? <Button size="small" href={interview.meetUrl} target="_blank" rel="noreferrer">Join Meet</Button> : null}
      </>}
    /></TableCell>
  </TableRow>)}</TableBody></Table></Box>;
}

export function InterviewDialog({ open, mode, onClose, candidateId, candidateLabel, interview, onSaved }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const editing = Boolean(interview);
  const taken = mode === 'taken' || (editing && ['PASS', 'FAIL'].includes(interviewResult(interview)));
  const [form, setForm] = useState(emptyForm());
  const candidates = useQuery({ queryKey: ['candidates', 'picker'], queryFn: () => api.get('/candidates', { params: { limit: 100 } }).then((response) => response.data.data), enabled: open && !candidateId && !editing });
  const users = useQuery({ queryKey: ['users', 'picker'], queryFn: () => api.get('/users', { params: { limit: 100 } }).then((response) => response.data.data), enabled: open, retry: false });
  useEffect(() => {
    if (!open) return;
    if (interview) {
      setForm(emptyForm({
        candidate: idOf(interview.candidate) || candidateId || '',
        round: interview.round || 'TECHNICAL',
        interviewer: idOf(interview.interviewer) || userId(user),
        interviewDate: dateInput(interview.interviewDate) || today(),
        startTime: interview.startTime || '',
        endTime: interview.endTime || '',
        mode: interview.mode || 'ONLINE',
        technology: interview.technology || '',
        position: interview.position || '',
        status: interview.status || 'SCHEDULED',
        result: interviewResult(interview),
        resultNotes: interview.resultNotes || ''
      }));
      return;
    }
    setForm(emptyForm({ candidate: candidateId || '', interviewer: userId(user), result: taken ? 'PASS' : 'PENDING', status: taken ? 'COMPLETED' : 'SCHEDULED', interviewDate: today() }));
  }, [open, candidateId, taken, user, interview]);
  const set = (name) => (event) => setForm((current) => {
    const value = event.target.value;
    if (name === 'startTime') return { ...current, startTime: value, endTime: current.endTime || addMinutes(value, 45) };
    return { ...current, [name]: value };
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        candidate: form.candidate || candidateId || idOf(interview?.candidate),
        round: form.round,
        interviewer: form.interviewer || userId(user),
        interviewDate: form.interviewDate,
        startTime: form.startTime,
        endTime: form.endTime,
        mode: form.mode || undefined,
        technology: form.technology,
        position: form.position,
        status: form.status
      };
      if (taken || editing) { body.result = form.result; body.resultNotes = form.resultNotes; }
      if (taken && !editing) body.status = 'COMPLETED';
      return editing ? api.patch(`/interviews/${interview._id}`, body) : api.post('/interviews', body);
    },
    onSuccess: ({ data }) => {
      invalidateInterviewQueries(client);
      onClose();
      onSaved?.(data.data, data.data?.result || form.result, form.candidate || candidateId || idOf(interview?.candidate));
    }
  });
  const interviewers = users.data?.length ? users.data : (user ? [{ _id: userId(user), name: user.name }] : []);
  const lockedCandidate = candidateId || editing;
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>{editing ? 'Edit interview' : taken ? 'Record taken interview' : 'Schedule interview'}</DialogTitle>
    <Box component="form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {lockedCandidate ? <TextField label="Candidate" value={candidateLabel || candidateName(interview?.candidate) || 'Selected candidate'} disabled fullWidth /> : <TextField select required label="Candidate" value={form.candidate} onChange={set('candidate')} fullWidth>{(candidates.data || []).map((candidate) => <MenuItem key={candidate._id} value={candidate._id}>{candidateName(candidate)} · {formatApplyingRole(candidate.applyingPosition, candidate.applyingTrack)}</MenuItem>)}</TextField>}
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
          <TextField select required label="Round" value={form.round} onChange={set('round')} fullWidth>{ROUNDS.map((round) => <MenuItem key={round} value={round}>{round}</MenuItem>)}</TextField>
          <TextField select required label="Interviewer" value={form.interviewer} onChange={set('interviewer')} fullWidth>{interviewers.map((person) => <MenuItem key={userId(person)} value={userId(person)}>{person.name}</MenuItem>)}</TextField>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
          <TextField required type="date" label="Interview date" value={form.interviewDate} onChange={set('interviewDate')} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField select label="Mode" value={form.mode} onChange={set('mode')} fullWidth>{MODES.map((modeOption) => <MenuItem key={modeOption} value={modeOption}>{modeOption}</MenuItem>)}</TextField>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
          <TextField type="time" label="Start" value={form.startTime} onChange={set('startTime')} InputLabelProps={{ shrink: true }} helperText={!taken ? 'Creates Google Meet and adds it to ghulam.shubhani9909@gmail.com' : undefined} fullWidth />
          <TextField type="time" label="End" value={form.endTime} onChange={set('endTime')} InputLabelProps={{ shrink: true }} helperText={!taken && form.startTime && !form.endTime ? 'Defaults to 45 minutes after start' : undefined} fullWidth />
        </Stack>
        {Boolean(interview?.meetUrl || interview?.calendarHtmlLink) && <MeetLinks interview={interview} />}
        {Boolean(interview?.meetError) && !interview?.meetUrl && <Alert severity="warning">{interview.meetError}</Alert>}
        {editing && <TextField select label="Status" value={form.status} onChange={set('status')} fullWidth>{INTERVIEW_STATUSES.map((status) => <MenuItem key={status} value={status}>{status.replaceAll('_', ' ')}</MenuItem>)}</TextField>}
        <TextField label="Position / technology" value={form.technology} onChange={set('technology')} fullWidth />
        {(taken || editing) && <>
          <TextField select required label="Result" value={form.result} onChange={set('result')} fullWidth>
            {editing && <MenuItem value="PENDING">Pending</MenuItem>}
            <MenuItem value="PASS">Pass</MenuItem>
            <MenuItem value="FAIL">Fail</MenuItem>
          </TextField>
          <TextField label="Notes" value={form.resultNotes} onChange={set('resultNotes')} fullWidth multiline minRows={3} placeholder="What was asked, strengths, gaps…" />
        </>}
        {save.isError && <Alert severity="error">{save.error.response?.data?.message || 'Could not save this interview.'}</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={save.isPending || !(form.candidate || candidateId || interview) || !form.interviewer}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : taken ? 'Save interview' : 'Schedule'}</Button></DialogActions>
    </Box>
  </Dialog>;
}

export function ResultDialog({ interview, onClose, onSaved }) {
  const client = useQueryClient();
  const [form, setForm] = useState({ result: 'PASS', notes: '', overallScore: '' });
  useEffect(() => { if (interview) setForm({ result: 'PASS', notes: interview.resultNotes || '', overallScore: '' }); }, [interview]);
  const save = useMutation({
    mutationFn: () => api.post(`/interviews/${interview._id}/result`, { result: form.result, notes: form.notes, ...(form.overallScore !== '' ? { overallScore: Number(form.overallScore) } : {}) }),
    onSuccess: ({ data }) => {
      invalidateInterviewQueries(client);
      onClose();
      onSaved?.(data.data, form.result, idOf(interview.candidate));
    }
  });
  if (!interview) return null;
  return <Dialog open={Boolean(interview)} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>Record pass or fail</DialogTitle>
    <Box component="form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>{candidateName(interview.candidate)} · {interview.round}</Typography>
        <TextField select required label="Result" value={form.result} onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))} fullWidth>
          <MenuItem value="PASS">Pass</MenuItem>
          <MenuItem value="FAIL">Fail</MenuItem>
        </TextField>
        <TextField type="number" label="Overall score (optional)" inputProps={{ min: 0, max: 10, step: 0.5 }} value={form.overallScore} onChange={(event) => setForm((current) => ({ ...current, overallScore: event.target.value }))} fullWidth />
        <TextField label="Notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} fullWidth multiline minRows={3} />
        {save.isError && <Alert severity="error">{save.error.response?.data?.message || 'Could not save the result.'}</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save result'}</Button></DialogActions>
    </Box>
  </Dialog>;
}

export function DeleteInterviewDialog({ interview, onClose, onDeleted }) {
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.delete(`/interviews/${interview._id}`),
    onSuccess: () => { invalidateInterviewQueries(client); onClose(); onDeleted?.(); }
  });
  return <ConfirmDialog
    open={Boolean(interview)}
    title="Delete interview"
    message={`Delete the ${interview?.round || ''} interview for ${candidateName(interview?.candidate)}? This archives the record.`}
    onClose={onClose}
    onConfirm={() => remove.mutate()}
    loading={remove.isPending}
    error={remove.isError ? (remove.error.response?.data?.message || 'Could not delete this interview.') : ''}
  />;
}

export function InterviewHistory({ candidateId, candidateLabel, onView }) {
  const { can } = useAuth();
  const [dialog, setDialog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [convertId, setConvertId] = useState(null);
  const [offerId, setOfferId] = useState(null);
  const afterResult = (_interview, result, id) => {
    if (result !== 'PASS' || !id) return;
    if (can('candidate:update')) setOfferId(id);
    else if (can('employee:create')) setConvertId(id);
  };
  const { data, isLoading, error } = useQuery({
    queryKey: ['interviews', candidateId],
    queryFn: () => api.get('/interviews', { params: { candidate: candidateId, limit: 100 } }).then((response) => response.data.data),
    enabled: Boolean(candidateId)
  });
  if (!candidateId) return <Typography color="text.secondary">No linked candidate interview history.</Typography>;
  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
      <Typography variant="h6">Taken interviews</Typography>
      {can('interview:create') && <Stack direction="row" gap={1}><Button variant="outlined" onClick={() => setDialog('schedule')}>Schedule</Button><Button variant="contained" onClick={() => setDialog('taken')}>Record taken interview</Button></Stack>}
    </Stack>
    {isLoading ? <CircularProgress size={24} /> : error ? <Alert severity="error">Could not load interviews.</Alert> : data?.length ? <InterviewTable rows={data} canUpdate={can('interview:update')} canDelete={can('interview:delete')} onView={onView} onEdit={setEditing} onDelete={setRemoving} onRecordResult={setSelected} onConvert={(interview) => setConvertId(candidateIdOf(interview) || candidateId)} hideCandidate /> : <Typography color="text.secondary">No interviews recorded yet. Save each round with pass or fail so the full history is kept.</Typography>}
    <InterviewDialog open={Boolean(dialog)} mode={dialog || 'taken'} onClose={() => setDialog(null)} candidateId={candidateId} candidateLabel={candidateLabel} onSaved={afterResult} />
    <InterviewDialog open={Boolean(editing)} mode="edit" interview={editing} onClose={() => setEditing(null)} candidateId={candidateId} candidateLabel={candidateLabel} onSaved={afterResult} />
    <ResultDialog interview={selected} onClose={() => setSelected(null)} onSaved={afterResult} />
    <DeleteInterviewDialog interview={removing} onClose={() => setRemoving(null)} />
    <ConvertEmployeeDialog open={Boolean(convertId)} candidateId={convertId} onClose={() => setConvertId(null)} />
    <OfferLetterDialog open={Boolean(offerId)} candidateId={offerId} onClose={() => setOfferId(null)} />
  </Stack>;
}
