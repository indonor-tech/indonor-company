import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { LEAD_SOURCES, SALES_PIPELINE_STATUSES, emptyLead, labelize, money } from '../../constants/crm';
import LeadFormFields, { leadPayload } from './LeadFormFields';

function Stat({ label, value, color = 'text.primary' }) {
  return <Card sx={{ height: '100%' }}><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h4" color={color} sx={{ mt: .5 }}>{value ?? 0}</Typography></CardContent></Card>;
}

export default function CrmLeads() {
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyLead());
  const readOnly = isViewAdmin || !can('crm:leads:write');
  const limit = 20;

  const dashboard = useQuery({
    queryKey: ['crm-lead-dashboard'],
    queryFn: () => api.get('/crm/leads/dashboard').then((r) => r.data.data)
  });
  const leads = useQuery({
    queryKey: ['crm-leads', search, status, source, page],
    queryFn: () => api.get('/crm/leads', {
      params: { q: search || undefined, status: status || undefined, source: source || undefined, page: page + 1, limit }
    }).then((r) => r.data)
  });
  const create = useMutation({
    mutationFn: () => api.post('/crm/leads', leadPayload(form)),
    onSuccess: (response) => {
      client.invalidateQueries({ queryKey: ['crm-leads'] });
      client.invalidateQueries({ queryKey: ['crm-lead-dashboard'] });
      setOpen(false);
      setForm(emptyLead());
      navigate(`/crm/leads/${response.data.data._id}`);
    }
  });

  const stats = dashboard.data || {};
  const rows = leads.data?.data || [];
  const total = leads.data?.meta?.total || 0;

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
          {!readOnly && <Button size="small" variant="contained" onClick={() => { setForm(emptyLead()); setOpen(true); }}>Add lead</Button>}
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

      {(stats.todayFollowUps?.length > 0 || stats.overdueFollowUps?.length > 0 || stats.duePayments?.length > 0) && (
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
              {(stats.duePayments || []).slice(0, 5).map((item) => (
                <Alert key={item._id} severity="error" action={<Button size="small" onClick={() => navigate(`/crm/clients/${item.clientId?._id || item.clientId}`)}>Open</Button>}>
                  Payment due — {item.clientId?.clientName || 'Client'} · {item.projectId} · {money(item.outstanding, item.currency)}
                </Alert>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField size="small" placeholder="Search leads…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} sx={{ flex: 1 }} />
            <TextField select size="small" label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} sx={{ minWidth: 180 }}>
              <MenuItem value="">All</MenuItem>
              {SALES_PIPELINE_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Source" value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }} sx={{ minWidth: 180 }}>
              <MenuItem value="">All sources</MenuItem>
              {LEAD_SOURCES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
          </Stack>
          {leads.isLoading ? <Typography>Loading…</Typography>
            : leads.isError ? <Alert severity="error">Could not load leads.</Alert>
              : rows.length === 0 ? <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No leads yet.</Typography>
                : (
                  <>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Lead</TableCell>
                          <TableCell>Company</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Conversion</TableCell>
                          <TableCell>Quoted</TableCell>
                          <TableCell>Owner</TableCell>
                          <TableCell>Next follow-up</TableCell>
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
                            <TableCell>
                              <Chip size="small" label={labelize(row.status)} color={row.overdueAlert ? 'error' : 'default'} />
                            </TableCell>
                            <TableCell>
                              {row.isConverted || row.clientId
                                ? (
                                  <Stack spacing={0.2}>
                                    <Chip size="small" color="success" label="Converted" />
                                    <Typography variant="caption" color="text.secondary">
                                      {row.convertedDate ? new Date(row.convertedDate).toLocaleDateString() : '—'}
                                    </Typography>
                                  </Stack>
                                )
                                : <Chip size="small" label="Unconverted" />}
                            </TableCell>
                            <TableCell>{money(row.quotedAmount, row.currency)}</TableCell>
                            <TableCell>{row.assignedTo?.name || '—'}</TableCell>
                            <TableCell>
                              {row.nextFollowUp?.nextFollowUpDate ? new Date(row.nextFollowUp.nextFollowUpDate).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell align="right"><Button size="small" onClick={() => navigate(`/crm/leads/${row._id}`)}>View</Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <TablePagination component="div" count={total} page={page} onPageChange={(_e, next) => setPage(next)} rowsPerPage={limit} rowsPerPageOptions={[limit]} />
                  </>
                )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Add lead</DialogTitle>
        <DialogContent dividers>
          <LeadFormFields form={form} setForm={setForm} />
          {create.isError && <Alert severity="error" sx={{ mt: 2 }}>{apiErrorMessage(create.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.leadName.trim() || create.isPending} onClick={() => create.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
