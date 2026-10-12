import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { LEAD_SOURCES, LEAD_STATUSES, labelize } from '../../constants/crm';

const emptyLead = {
  leadName: '', companyName: '', contactPersonName: '', email: '', phone: '',
  source: 'OTHER', status: 'NEW', priority: 'MEDIUM', requirementDescription: ''
};

function Stat({ label, value, color = 'text.primary' }) {
  return <Card sx={{ height: '100%' }}><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h4" color={color} sx={{ mt: .5 }}>{value ?? 0}</Typography></CardContent></Card>;
}

export default function CrmLeads() {
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyLead);
  const readOnly = isViewAdmin || !can('crm:leads:write');

  const dashboard = useQuery({
    queryKey: ['crm-lead-dashboard'],
    queryFn: () => api.get('/crm/leads/dashboard').then((r) => r.data.data)
  });
  const leads = useQuery({
    queryKey: ['crm-leads', search, status],
    queryFn: () => api.get('/crm/leads', { params: { q: search || undefined, status: status || undefined, limit: 100 } }).then((r) => r.data)
  });
  const create = useMutation({
    mutationFn: () => api.post('/crm/leads', form),
    onSuccess: (response) => {
      client.invalidateQueries({ queryKey: ['crm-leads'] });
      client.invalidateQueries({ queryKey: ['crm-lead-dashboard'] });
      setOpen(false);
      setForm(emptyLead);
      navigate(`/crm/leads/${response.data.data._id}`);
    }
  });

  const stats = dashboard.data || {};
  const rows = leads.data?.data || [];

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4">Sales / Leads</Typography>
          <Typography color="text.secondary" sx={{ mt: .5 }}>Track opportunities, follow-ups, and conversions.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={() => navigate('/crm/pipeline')}>Pipeline</Button>
          <Button size="small" variant="outlined" onClick={() => {
            api.get('/crm/leads/export', { responseType: 'blob' }).then((response) => {
              const url = URL.createObjectURL(response.data);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'leads-export.csv';
              link.click();
              URL.revokeObjectURL(url);
            });
          }}>Export CSV</Button>
          {!readOnly && <Button size="small" variant="contained" onClick={() => setOpen(true)}>Add lead</Button>}
        </Stack>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Total leads" value={stats.totalLeads} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="New" value={stats.newLeads} color="info.main" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Today's follow-ups" value={stats.todayFollowUpCount} color="warning.main" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Overdue" value={stats.overdueFollowUpCount} color="error.main" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Qualified" value={stats.qualifiedLeads} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Proposal sent" value={stats.proposalSent} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Converted" value={stats.converted} color="success.main" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Lost" value={stats.lost} /></Grid>
      </Grid>

      {(stats.todayFollowUps?.length > 0 || stats.overdueFollowUps?.length > 0) && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Follow-up focus</Typography>
            <Stack spacing={1}>
              {(stats.overdueFollowUps || []).slice(0, 5).map((item) => (
                <Alert key={item._id} severity="error" action={<Button size="small" onClick={() => item.leadId?._id && navigate(`/crm/leads/${item.leadId._id}`)}>Open</Button>}>
                  Overdue — {item.leadId?.leadName || item.leadId?.companyName || 'Lead'} ({new Date(item.nextFollowUpDate).toLocaleDateString()})
                </Alert>
              ))}
              {(stats.todayFollowUps || []).map((item) => (
                <Alert key={item._id} severity="warning" action={<Button size="small" onClick={() => item.leadId?._id && navigate(`/crm/leads/${item.leadId._id}`)}>Open</Button>}>
                  {item.nextFollowUpTime || 'Today'} — {item.leadId?.leadName || item.leadId?.companyName || 'Lead'}
                </Alert>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField size="small" placeholder="Search leads…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }} />
            <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">All</MenuItem>
              {LEAD_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
          </Stack>
          {leads.isLoading ? <Typography>Loading…</Typography>
            : leads.isError ? <Alert severity="error">Could not load leads.</Alert>
              : rows.length === 0 ? <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No leads yet.</Typography>
                : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Lead</TableCell>
                        <TableCell>Company</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Source</TableCell>
                        <TableCell>Owner</TableCell>
                        <TableCell align="right">Open</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow hover key={row._id}>
                          <TableCell>
                            <Typography fontWeight={650}>{row.leadName}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.leadId}</Typography>
                          </TableCell>
                          <TableCell>{row.companyName || '—'}</TableCell>
                          <TableCell><Chip size="small" label={labelize(row.status)} /></TableCell>
                          <TableCell>{labelize(row.source)}</TableCell>
                          <TableCell>{row.assignedTo?.name || '—'}</TableCell>
                          <TableCell align="right"><Button size="small" onClick={() => navigate(`/crm/leads/${row._id}`)}>View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Add lead</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Lead name" value={form.leadName} onChange={(e) => setForm({ ...form, leadName: e.target.value })} fullWidth required />
              <TextField label="Company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Contact person" value={form.contactPersonName} onChange={(e) => setForm({ ...form, contactPersonName: e.target.value })} fullWidth />
              <TextField label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} fullWidth />
              <TextField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} fullWidth>
                {LEAD_SOURCES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
              </TextField>
              <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} fullWidth>
                {LEAD_STATUSES.filter((s) => s !== 'CONVERTED').map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField label="Requirement" value={form.requirementDescription} onChange={(e) => setForm({ ...form, requirementDescription: e.target.value })} fullWidth multiline minRows={3} />
            {create.isError && <Alert severity="error">{apiErrorMessage(create.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.leadName.trim() || create.isPending} onClick={() => create.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
