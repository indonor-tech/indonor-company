import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Link, MenuItem, Stack, Tab, TablePagination,
  Tabs, TextField, Typography
} from '@mui/material';
import { apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { correctionApi, formatDate, formatDateTime, humanize } from '../../services/tasks';
import { AttachmentList } from '../../components/tasks/AttachmentsPanel';

const STATUS_COLOR = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' };

function valueText(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map((item) => (item?.taskKey ? `${item.taskKey} ${item.title || ''}` : String(item))).join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) return formatDateTime(value);
  return String(value).replace(/<[^>]+>/g, ' ');
}

function targetLink(request) {
  if (request.targetType === 'DailyWorkLog') return `/tasks/work-logs?date=${request.workDate}${request.subjectUser?._id ? `&user=${request.subjectUser._id}` : ''}`;
  if (request.task?._id) return `/tasks/${request.task._id}`;
  return null;
}

function RequestCard({ request, canReview, onDecide }) {
  const link = targetLink(request);
  return (
    <Box sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip size="small" color={STATUS_COLOR[request.status]} label={humanize(request.status)} />
            <Typography variant="body2" fontWeight={700}>
              {request.targetType === 'DailyWorkLog' ? `Daily work log · ${formatDate(request.workDate)}` : request.targetType === 'TaskComment' ? `Comment on ${request.task?.taskKey || 'task'}` : `${request.task?.taskKey || 'Task'} · ${request.task?.title || ''}`}
            </Typography>
            {link && <Link component={RouterLink} to={link} variant="body2">Open</Link>}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Requested by {request.requestedBy?.name} on {formatDateTime(request.createdAt)}{request.subjectUser?.name && request.subjectUser.name !== request.requestedBy?.name ? ` · employee ${request.subjectUser.name}` : ''} · locked date {request.workDate}
          </Typography>
        </Box>
        {canReview && request.status === 'PENDING' && (
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Button size="small" variant="contained" color="success" onClick={() => onDecide(request, 'approve')}>Approve</Button>
            <Button size="small" variant="outlined" color="error" onClick={() => onDecide(request, 'reject')}>Reject</Button>
          </Stack>
        )}
      </Stack>
      <Typography variant="body2" sx={{ mt: 1 }}><strong>Reason:</strong> {request.reason}</Typography>
      <Box sx={{ mt: 1, p: 1.2, bgcolor: '#f8fafb', borderRadius: 1 }}>
        {Object.entries(request.requestedChanges || {}).map(([field, value]) => (
          <Typography key={field} variant="body2" sx={{ mb: 0.5 }}>
            <strong>{humanize(field.replace(/([a-z])([A-Z])/g, '$1_$2'))}:</strong>{' '}
            <span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{valueText(request.originalValues?.[field]).slice(0, 400)}</span>{' → '}
            <span style={{ color: '#15803d' }}>{valueText(value).slice(0, 400)}</span>
          </Typography>
        ))}
      </Box>
      {request.attachments?.length > 0 && <Box sx={{ mt: 1 }}><AttachmentList attachments={request.attachments} dense /></Box>}
      {request.reviewedBy && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          {humanize(request.status)} by {request.reviewedBy.name} on {formatDateTime(request.reviewedAt)}{request.reviewNote ? ` · "${request.reviewNote}"` : ''}. The original value is preserved; the correction is shown alongside it.
        </Typography>
      )}
    </Box>
  );
}

export default function Corrections() {
  const client = useQueryClient();
  const { can } = useAuth();
  const reviewer = can('task:correction:approve');
  const [scope, setScope] = useState(reviewer ? 'review' : 'mine');
  const [status, setStatus] = useState(reviewer ? 'PENDING' : '');
  const [page, setPage] = useState(0);
  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState('');
  const params = { scope: scope === 'mine' ? undefined : scope, status: status || undefined, page: page + 1, limit: 20 };
  const { data: result, isLoading, error } = useQuery({ queryKey: ['task-corrections', params], queryFn: () => correctionApi.list(params), placeholderData: keepPreviousData });
  const decide = useMutation({
    mutationFn: () => (decision.action === 'approve' ? correctionApi.approve(decision.request._id, note) : correctionApi.reject(decision.request._id, note)),
    onSuccess: () => { setDecision(null); setNote(''); client.invalidateQueries({ queryKey: ['task-corrections'] }); client.invalidateQueries({ queryKey: ['task'] }); client.invalidateQueries({ queryKey: ['work-log'] }); }
  });
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Correction requests</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.7 }}>Locked records are never overwritten. Approved corrections are stored separately with the original value, requester, approver, dates and reason.</Typography>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Tabs value={scope} onChange={(_event, value) => { setScope(value); setPage(0); }}>
          {reviewer && <Tab value="review" label="Review queue" />}
          <Tab value="mine" label="My requests" />
          {reviewer && <Tab value="all" label="All" />}
        </Tabs>
        <TextField select size="small" label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} sx={{ minWidth: 160 }}>
          <MenuItem value="">Any</MenuItem>{['PENDING', 'APPROVED', 'REJECTED'].map((value) => <MenuItem key={value} value={value}>{humanize(value)}</MenuItem>)}
        </TextField>
      </Stack>
      {error && <Alert severity="error">Unable to load correction requests.</Alert>}
      <Card>
        <CardContent>
          {isLoading ? <CircularProgress size={24} /> : result?.rows?.length ? (
            <Stack divider={<Divider flexItem />}>
              {result.rows.map((request) => <RequestCard key={request._id} request={request} canReview={reviewer && scope !== 'mine'} onDecide={(item, action) => { setDecision({ request: item, action }); setNote(''); decide.reset(); }} />)}
            </Stack>
          ) : <Typography color="text.secondary">No correction requests.</Typography>}
        </CardContent>
        <TablePagination component="div" count={result?.meta?.total || 0} page={page} rowsPerPage={20} rowsPerPageOptions={[20]} onPageChange={(_event, value) => setPage(value)} />
      </Card>
      <Dialog open={Boolean(decision)} onClose={() => setDecision(null)} fullWidth maxWidth="sm">
        <DialogTitle>{decision?.action === 'approve' ? 'Approve correction' : 'Reject correction'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2">{decision?.action === 'approve' ? 'The corrected values will be displayed alongside the original. The original record and its history stay unchanged.' : 'The requester will be notified with your note.'}</Typography>
            <TextField label={decision?.action === 'approve' ? 'Note (optional)' : 'Reason for rejection'} multiline minRows={2} value={note} onChange={(event) => setNote(event.target.value)} required={decision?.action === 'reject'} />
            {decide.isError && <Alert severity="error">{apiErrorMessage(decide.error, 'Could not record the decision')}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecision(null)}>Cancel</Button>
          <Button variant="contained" color={decision?.action === 'approve' ? 'success' : 'error'} onClick={() => decide.mutate()} disabled={decide.isPending || (decision?.action === 'reject' && note.trim().length < 3)}>{decision?.action === 'approve' ? 'Approve' : 'Reject'}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
