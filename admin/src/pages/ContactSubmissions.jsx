import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api } from '../services/api';

const statuses = ['NEW', 'IN_PROGRESS', 'CONTACTED', 'CLOSED'];

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function statusColor(status) {
  return { NEW: 'info', IN_PROGRESS: 'warning', CONTACTED: 'success', CLOSED: 'default' }[status] || 'default';
}

export default function ContactSubmissions() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const queryClient = useQueryClient();
  const submissions = useQuery({
    queryKey: ['contact-submissions', search, status],
    queryFn: () => api.get('/contact-submissions', { params: { q: search || undefined, status: status || undefined, limit: 100 } }).then((response) => response.data)
  });
  const updateStatus = useMutation({
    mutationFn: ({ id, nextStatus }) => api.patch(`/contact-submissions/${id}/status`, { status: nextStatus }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['contact-submissions'] });
      setSelected(response.data.data);
    }
  });
  const rows = submissions.data?.data || [];

  return <Stack spacing={3}>
    <Box>
      <Typography variant="h4">Website enquiries</Typography>
      <Typography color="text.secondary" sx={{ mt: .7 }}>Read and manage every message submitted through the Indonor Tech website.</Typography>
    </Box>
    <Card>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search enquiries…" size="small" sx={{ flex: 1 }} />
          <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value)} size="small" sx={{ minWidth: 170 }}>
            <MenuItem value="">All statuses</MenuItem>
            {statuses.map((option) => <MenuItem key={option} value={option}>{option.replaceAll('_', ' ')}</MenuItem>)}
          </TextField>
        </Stack>
        {submissions.isLoading ? <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>
          : submissions.isError ? <Alert severity="error">Could not load website enquiries. Confirm your account has contact access.</Alert>
            : rows.length === 0 ? <Box sx={{ py: 8, textAlign: 'center' }}><Typography variant="h6">No website enquiries</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Submitted contact messages will appear here.</Typography></Box>
              : <Table><TableHead><TableRow><TableCell>Received</TableCell><TableCell>Contact</TableCell><TableCell>Subject</TableCell><TableCell>Status</TableCell><TableCell align="right">Details</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => { const rowStatus = row.status || 'NEW'; return <TableRow hover key={row._id}><TableCell>{formatDate(row.createdAt)}</TableCell><TableCell><Typography fontWeight={650}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.email}</Typography></TableCell><TableCell>{row.subject}</TableCell><TableCell><Chip size="small" color={statusColor(rowStatus)} label={rowStatus.replaceAll('_', ' ')} /></TableCell><TableCell align="right"><Button size="small" onClick={() => setSelected({ ...row, status: rowStatus })}>View</Button></TableCell></TableRow>; })}</TableBody></Table>}
      </CardContent>
    </Card>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md">
      <DialogTitle>Website enquiry</DialogTitle>
      {selected && <DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Name" value={selected.name} fullWidth InputProps={{ readOnly: true }} /><TextField label="Email" value={selected.email} fullWidth InputProps={{ readOnly: true }} /></Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Company" value={selected.company || '—'} fullWidth InputProps={{ readOnly: true }} /><TextField label="Received" value={formatDate(selected.createdAt)} fullWidth InputProps={{ readOnly: true }} /></Stack>
        <TextField label="Subject" value={selected.subject} fullWidth InputProps={{ readOnly: true }} />
        <TextField label="Message" value={selected.message} fullWidth multiline minRows={7} InputProps={{ readOnly: true }} />
        <TextField select label="Status" value={selected.status} onChange={(event) => updateStatus.mutate({ id: selected._id, nextStatus: event.target.value })} disabled={updateStatus.isPending} fullWidth>{statuses.map((option) => <MenuItem key={option} value={option}>{option.replaceAll('_', ' ')}</MenuItem>)}</TextField>
        {updateStatus.isError && <Alert severity="error">{updateStatus.error.response?.data?.message || 'Could not update status.'}</Alert>}
      </Stack></DialogContent>}
      <DialogActions><Button onClick={() => setSelected(null)}>Close</Button></DialogActions>
    </Dialog>
  </Stack>;
}
