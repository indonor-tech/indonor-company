import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PROJECT_STATUSES, PROJECT_TYPES, TECH_STACK, labelize } from '../../constants/crm';

export default function CrmProjects() {
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(Boolean(params.get('clientId')));
  const [form, setForm] = useState({
    projectName: '', clientId: params.get('clientId') || '', projectType: 'WEBSITE', status: 'NOT_STARTED',
    projectDescription: '', scope: '', technologyStack: [], estimatedStartDate: '', expectedEndDate: '',
    estimatedDuration: '', contractValue: '', currency: 'INR'
  });
  const readOnly = isViewAdmin || !can('crm:projects:write');

  const clients = useQuery({
    queryKey: ['crm-clients', 'for-project'],
    queryFn: () => api.get('/crm/clients', { params: { limit: 100 } }).then((r) => r.data.data),
    enabled: open
  });
  const list = useQuery({
    queryKey: ['crm-projects', search, status],
    queryFn: () => api.get('/crm/projects', { params: { q: search || undefined, status: status || undefined, limit: 100 } }).then((r) => r.data)
  });
  const create = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        contractValue: form.contractValue === '' ? undefined : Number(form.contractValue),
        finalAmount: form.contractValue === '' ? undefined : Number(form.contractValue)
      };
      if (!payload.estimatedStartDate) delete payload.estimatedStartDate;
      if (!payload.expectedEndDate) delete payload.expectedEndDate;
      return api.post('/crm/projects', payload);
    },
    onSuccess: (response) => {
      client.invalidateQueries({ queryKey: ['crm-projects'] });
      setOpen(false);
      navigate(`/crm/projects/${response.data.data._id}`);
    }
  });
  const rows = useMemo(() => {
    const data = list.data?.data || [];
    if (!params.get('clientId')) return data;
    return data.filter((row) => String(row.clientId?._id || row.clientId) === String(params.get('clientId')));
  }, [list.data, params]);

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4">Projects</Typography>
          <Typography color="text.secondary" sx={{ mt: .5 }}>Multiple delivery projects linked to clients.</Typography>
        </Box>
        {!readOnly && <Button size="small" variant="contained" onClick={() => setOpen(true)}>Add project</Button>}
      </Box>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField size="small" placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }} />
            <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">All</MenuItem>
              {PROJECT_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
          </Stack>
          {list.isLoading ? <Typography>Loading…</Typography>
            : list.isError ? <Alert severity="error">Could not load projects.</Alert>
              : rows.length === 0 ? <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No projects yet.</Typography>
                : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Project</TableCell>
                        <TableCell>Client</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Progress</TableCell>
                        <TableCell align="right">Open</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow hover key={row._id}>
                          <TableCell>
                            <Typography fontWeight={650}>{row.projectName}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.projectId}</Typography>
                          </TableCell>
                          <TableCell>{row.clientId?.clientName || row.clientId?.companyName || '—'}</TableCell>
                          <TableCell>{labelize(row.projectType) || '—'}</TableCell>
                          <TableCell>
                            <Chip size="small" color={row.isOverdue ? 'error' : 'default'} label={row.isOverdue ? `${labelize(row.status)} · overdue` : labelize(row.status)} />
                          </TableCell>
                          <TableCell>{row.progressPercent ?? 0}%</TableCell>
                          <TableCell align="right"><Button size="small" onClick={() => navigate(`/crm/projects/${row._id}`)}>View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add project</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Project name" value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} fullWidth required />
            <TextField select label="Client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} fullWidth required>
              {(clients.data || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.clientName} ({item.clientId})</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Type" value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value })} fullWidth>
                {PROJECT_TYPES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
              </TextField>
              <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} fullWidth>
                {PROJECT_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField label="Description" value={form.projectDescription} onChange={(e) => setForm({ ...form, projectDescription: e.target.value })} fullWidth multiline minRows={3} />
            <TextField label="Scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} fullWidth multiline minRows={2} />
            <Autocomplete multiple freeSolo options={TECH_STACK} value={form.technologyStack} onChange={(_e, value) => setForm({ ...form, technologyStack: value })} renderInput={(params) => <TextField {...params} label="Technologies" />} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Start date" InputLabelProps={{ shrink: true }} value={form.estimatedStartDate} onChange={(e) => setForm({ ...form, estimatedStartDate: e.target.value })} fullWidth />
              <TextField type="date" label="Deadline" InputLabelProps={{ shrink: true }} value={form.expectedEndDate} onChange={(e) => setForm({ ...form, expectedEndDate: e.target.value })} fullWidth />
              <TextField label="Duration" value={form.estimatedDuration} onChange={(e) => setForm({ ...form, estimatedDuration: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Contract / bid amount" type="number" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} fullWidth />
              <TextField label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} fullWidth />
            </Stack>
            {create.isError && <Alert severity="error">{apiErrorMessage(create.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.projectName.trim() || !form.clientId || create.isPending} onClick={() => create.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
