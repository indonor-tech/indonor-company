import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { DUE_DIRECTIONS, DUE_PRIORITIES, DUE_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, labelize, money } from '../../constants/crm';

function Stat({ label, value }) {
  return <Card sx={{ height: '100%' }}><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ mt: .5 }}>{value}</Typography></CardContent></Card>;
}

const emptyItem = () => ({ description: '', amount: '' });
const emptyDue = (projectId = '', clientId = '') => ({
  direction: 'PAYABLE',
  title: '',
  description: '',
  notes: '',
  priority: 'MEDIUM',
  dueDate: '',
  projectId,
  clientId,
  partnerId: '',
  partnerName: '',
  partnerCompany: '',
  partnerEmail: '',
  partnerPhone: '',
  assignedTo: '',
  lineItems: [emptyItem()]
});

function itemAmount(item) {
  const value = Number(item.amount);
  return Number.isFinite(value) ? value : 0;
}

export default function CrmDuePayments({ clientAlerts, projectId: presetProjectId, clientId: presetClientId }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    q: '', direction: '', status: '', projectId: presetProjectId || '', partnerId: '', salesperson: '', from: '', to: ''
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyDue(presetProjectId, presetClientId));
  const [payOpen, setPayOpen] = useState(false);
  const [payDue, setPayDue] = useState(null);
  const [payForm, setPayForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10), amount: '', paymentMethod: 'BANK_TRANSFER',
    status: 'CONFIRMED', transactionId: '', notes: ''
  });
  const [detailId, setDetailId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [paidOnForm, setPaidOnForm] = useState(0);

  const dues = useQuery({
    queryKey: ['crm-partner-dues', filters],
    queryFn: () => api.get('/crm/finance/partner-dues', {
      params: {
        limit: 100,
        q: filters.q || undefined,
        direction: filters.direction || undefined,
        status: filters.status || undefined,
        projectId: filters.projectId || undefined,
        partnerId: filters.partnerId || undefined,
        salesperson: filters.salesperson || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined
      }
    }).then((r) => r.data)
  });
  const projects = useQuery({
    queryKey: ['crm-projects', 'finance'],
    queryFn: () => api.get('/crm/projects', { params: { limit: 100 } }).then((r) => r.data.data)
  });
  const salespeople = useQuery({
    queryKey: ['crm-directory', 'sales'],
    queryFn: () => api.get('/crm/directory', { params: { kind: 'sales' } }).then((r) => r.data.data)
  });
  const selectedProject = useQuery({
    queryKey: ['crm-project', form.projectId],
    queryFn: () => api.get(`/crm/projects/${form.projectId}`).then((r) => r.data.data),
    enabled: Boolean(form.projectId)
  });
  const detail = useQuery({
    queryKey: ['crm-partner-due', detailId],
    queryFn: () => api.get(`/crm/finance/partner-dues/${detailId}`).then((r) => r.data.data),
    enabled: Boolean(detailId)
  });

  const rows = dues.data?.data || [];
  const summary = dues.data?.meta?.summary || {};
  const grandTotal = useMemo(() => form.lineItems.reduce((sum, item) => sum + itemAmount(item), 0), [form.lineItems]);
  const remainingPreview = Math.max(0, grandTotal - Number(paidOnForm || 0));
  const invalidAmount = form.lineItems.some((item) => item.amount !== '' && Number(item.amount) < 0);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-partner-dues'] });
    queryClient.invalidateQueries({ queryKey: ['crm-finance-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['crm-finance-dues'] });
    if (detailId) queryClient.invalidateQueries({ queryKey: ['crm-partner-due', detailId] });
  };

  const saveDue = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        assignedTo: form.assignedTo || undefined,
        partnerId: form.partnerId || undefined,
        clientId: form.clientId || selectedProject.data?.clientId?._id || selectedProject.data?.clientId,
        lineItems: form.lineItems.filter((item) => item.description.trim()).map((item) => ({
          description: item.description.trim(),
          amount: Number(item.amount || 0)
        }))
      };
      return editing
        ? api.patch(`/crm/finance/partner-dues/${editing}`, payload)
        : api.post('/crm/finance/partner-dues', payload);
    },
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
      invalidate();
    }
  });
  const savePay = useMutation({
    mutationFn: () => api.post(`/crm/finance/partner-dues/${payDue._id}/payments`, {
      ...payForm, amount: Number(payForm.amount || 0)
    }),
    onSuccess: () => {
      setPayOpen(false);
      invalidate();
    }
  });
  const settle = useMutation({
    mutationFn: (row) => api.post(`/crm/finance/partner-dues/${row._id}/settle`, row.remaining > 0 ? { writeOff: true, notes: 'Authorized settlement adjustment' } : {}),
    onSuccess: () => {
      setConfirm(null);
      invalidate();
    }
  });
  const reopen = useMutation({
    mutationFn: (id) => api.post(`/crm/finance/partner-dues/${id}/reopen`, { reason: 'Incorrectly settled' }),
    onSuccess: invalidate
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/crm/finance/partner-dues/${id}`),
    onSuccess: () => {
      setConfirm(null);
      invalidate();
    }
  });

  const openCreate = () => {
    setEditing(null);
    setPaidOnForm(0);
    setForm(emptyDue(presetProjectId, presetClientId));
    setFormOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row._id);
    setPaidOnForm(Number(row.amountPaid || 0));
    setForm({
      direction: row.direction,
      title: row.title || '',
      description: row.description || '',
      notes: row.notes || '',
      priority: row.priority || 'MEDIUM',
      dueDate: row.dueDate ? String(row.dueDate).slice(0, 10) : '',
      projectId: row.projectId?._id || row.projectId || '',
      clientId: row.clientId?._id || row.clientId || '',
      partnerId: row.partnerId?._id || row.partnerId || '',
      partnerName: row.partnerName || '',
      partnerCompany: row.partnerCompany || '',
      partnerEmail: row.partnerEmail || '',
      partnerPhone: row.partnerPhone || '',
      assignedTo: row.assignedTo?._id || row.assignedTo || '',
      lineItems: (row.lineItems || []).length ? row.lineItems.map((item) => ({
        description: item.description,
        amount: item.amount ?? ''
      })) : [emptyItem()]
    });
    setFormOpen(true);
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6">Partner dues</Typography>
        <Button variant="contained" onClick={openCreate}>Add Due</Button>
      </Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Payable to partners" value={money(summary.payableTotal)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Receivable from partners" value={money(summary.receivableTotal)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Paid to partners" value={money(summary.paid)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Received from partners" value={money(summary.received)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Remaining payable" value={money(summary.remainingPayable)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Remaining receivable" value={money(summary.remainingReceivable)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Overdue remaining" value={money(summary.overdue)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Upcoming (7 days)" value={money(summary.upcoming)} /></Grid>
      </Grid>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap">
        <TextField size="small" label="Search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <TextField size="small" select label="Direction" value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value })} sx={{ minWidth: 150 }}>
          <MenuItem value="">All</MenuItem>
          {DUE_DIRECTIONS.map((item) => <MenuItem key={item} value={item}>{item === 'PAYABLE' ? 'Payable (we owe)' : 'Receivable (they owe)'}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} sx={{ minWidth: 150 }}>
          <MenuItem value="">All</MenuItem>
          {DUE_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Project" value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })} sx={{ minWidth: 180 }}>
          <MenuItem value="">All projects</MenuItem>
          {(projects.data || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.projectName}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <TextField size="small" select label="Salesperson" value={filters.salesperson} onChange={(e) => setFilters({ ...filters, salesperson: e.target.value })} sx={{ minWidth: 160 }}>
          <MenuItem value="">All</MenuItem>
          {(salespeople.data || []).map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
        </TextField>
      </Stack>
      {rows.length === 0 ? <Typography color="text.secondary">No partner dues yet. Add a payable or receivable due to start tracking.</Typography>
        : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Due ID</TableCell>
                <TableCell>Direction</TableCell>
                <TableCell>Partner</TableCell>
                <TableCell>Project</TableCell>
                <TableCell>Total</TableCell>
                <TableCell>Paid</TableCell>
                <TableCell>Remaining</TableCell>
                <TableCell>Due date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id}>
                  <TableCell><Button size="small" onClick={() => setDetailId(row._id)}>{row.dueId}</Button></TableCell>
                  <TableCell>{row.direction === 'PAYABLE' ? 'Payable' : 'Receivable'}</TableCell>
                  <TableCell>{row.partnerName}{row.partnerCompany ? ` · ${row.partnerCompany}` : ''}</TableCell>
                  <TableCell>
                    <Button size="small" onClick={() => row.projectId?._id && navigate(`/crm/projects/${row.projectId._id}`)}>
                      {row.projectId?.projectId || row.projectId?.projectName || '—'}
                    </Button>
                  </TableCell>
                  <TableCell>{money(row.originalAmount, row.currency)}</TableCell>
                  <TableCell>{money(row.amountPaid, row.currency)}</TableCell>
                  <TableCell>{money(row.remaining, row.currency)}</TableCell>
                  <TableCell>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}</TableCell>
                  <TableCell><Chip size="small" color={row.status === 'OVERDUE' ? 'error' : row.status === 'SETTLED' ? 'success' : 'default'} label={labelize(row.status)} /></TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap">
                      {row.status !== 'SETTLED' && row.status !== 'CANCELLED' && (
                        <Button size="small" onClick={() => { setPayDue(row); setPayForm({ ...payForm, amount: row.remaining }); setPayOpen(true); }}>Pay</Button>
                      )}
                      {row.status !== 'SETTLED' && row.status !== 'CANCELLED' && (
                        <Button size="small" onClick={() => setConfirm({ ...row, action: 'settle' })}>Settle</Button>
                      )}
                      {row.status === 'SETTLED' && <Button size="small" onClick={() => reopen.mutate(row._id)}>Reopen</Button>}
                      {row.status !== 'SETTLED' && row.status !== 'CANCELLED' && <Button size="small" onClick={() => openEdit(row)}>Edit</Button>}
                      <Button size="small" color="error" onClick={() => setConfirm({ ...row, action: 'delete' })}>Delete</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      {(settle.isError || reopen.isError || remove.isError) && (
        <Alert severity="error">{apiErrorMessage(settle.error || reopen.error || remove.error)}</Alert>
      )}

      <Typography variant="subtitle1" sx={{ pt: 1 }}>Client contract dues</Typography>
      {(clientAlerts?.overdue || []).length === 0 && (clientAlerts?.upcoming || []).length === 0
        ? <Typography color="text.secondary">No upcoming or overdue client contract payments.</Typography>
        : (
          <Stack spacing={1.5}>
            {(clientAlerts?.overdue || []).map((row) => (
              <Alert key={`${row.projectMongoId}-overdue`} severity="error" action={(
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" onClick={() => navigate(`/crm/clients/${row.clientMongoId}`)}>Client</Button>
                  <Button size="small" onClick={() => navigate(`/crm/projects/${row.projectMongoId}`)}>Project</Button>
                </Stack>
              )}>
                Overdue · {row.clientName} ({row.clientId}) · {row.projectId} · due {new Date(row.dueDate).toLocaleDateString()} · {money(row.outstanding, row.currency)}
              </Alert>
            ))}
            {(clientAlerts?.upcoming || []).map((row) => (
              <Alert key={`${row.projectMongoId}-upcoming`} severity="warning" action={(
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" onClick={() => navigate(`/crm/clients/${row.clientMongoId}`)}>Client</Button>
                  <Button size="small" onClick={() => navigate(`/crm/projects/${row.projectMongoId}`)}>Project</Button>
                </Stack>
              )}>
                Upcoming · {row.clientName} ({row.clientId}) · {row.projectId} · due {new Date(row.dueDate).toLocaleDateString()} · {money(row.outstanding, row.currency)}
              </Alert>
            ))}
          </Stack>
        )}

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editing ? 'Edit due' : 'Add due'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Direction" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} fullWidth>
                {DUE_DIRECTIONS.map((item) => <MenuItem key={item} value={item}>{item === 'PAYABLE' ? 'Payable — we owe a partner' : 'Receivable — a partner owes us'}</MenuItem>)}
              </TextField>
              <TextField select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} fullWidth>
                {DUE_PRIORITIES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} fullWidth />
            <TextField select label="Project" value={form.projectId} onChange={(e) => {
              const project = (projects.data || []).find((item) => item._id === e.target.value);
              setForm({
                ...form,
                projectId: e.target.value,
                clientId: project?.clientId?._id || project?.clientId || '',
                partnerId: ''
              });
            }} fullWidth>
              {(projects.data || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.projectName} ({item.projectId})</MenuItem>)}
            </TextField>
            <TextField select label="Project partner (optional)" value={form.partnerId} onChange={(e) => {
              const partner = (selectedProject.data?.partners || []).find((item) => item._id === e.target.value);
              setForm({
                ...form,
                partnerId: e.target.value,
                partnerName: partner?.name || form.partnerName,
                partnerCompany: partner?.companyName || form.partnerCompany,
                partnerEmail: partner?.email || form.partnerEmail,
                partnerPhone: partner?.phone || form.partnerPhone
              });
            }} fullWidth>
              <MenuItem value="">Other person / company</MenuItem>
              {(selectedProject.data?.partners || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Partner / person name" value={form.partnerName} onChange={(e) => setForm({ ...form, partnerName: e.target.value })} fullWidth />
              <TextField label="Company" value={form.partnerCompany} onChange={(e) => setForm({ ...form, partnerCompany: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Email" value={form.partnerEmail} onChange={(e) => setForm({ ...form, partnerEmail: e.target.value })} fullWidth />
              <TextField label="Phone" value={form.partnerPhone} onChange={(e) => setForm({ ...form, partnerPhone: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Due date" InputLabelProps={{ shrink: true }} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} fullWidth />
              <TextField select label="Assigned salesperson" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} fullWidth>
                <MenuItem value="">Unassigned</MenuItem>
                {(salespeople.data || []).map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
              </TextField>
            </Stack>
            <Typography variant="subtitle2">Line items</Typography>
            {form.lineItems.map((item, index) => (
              <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField label="Description" placeholder="Development, Figma Design, Extra Work" value={item.description} onChange={(e) => {
                  const lineItems = [...form.lineItems];
                  lineItems[index] = { ...item, description: e.target.value };
                  setForm({ ...form, lineItems });
                }} fullWidth />
                <TextField
                  type="number"
                  label="Amount"
                  placeholder="70000"
                  value={item.amount}
                  inputProps={{ min: 0, step: '0.01' }}
                  onChange={(e) => {
                    const lineItems = [...form.lineItems];
                    lineItems[index] = { ...item, amount: e.target.value };
                    setForm({ ...form, lineItems });
                  }}
                  error={item.amount !== '' && Number(item.amount) < 0}
                  helperText={item.amount !== '' && Number(item.amount) < 0 ? 'Amount cannot be negative' : ' '}
                  sx={{ width: { xs: '100%', sm: 200 } }}
                />
                <Button size="small" color="error" disabled={form.lineItems.length === 1} onClick={() => setForm({ ...form, lineItems: form.lineItems.filter((_, i) => i !== index) })}>Remove</Button>
              </Stack>
            ))}
            <Button size="small" onClick={() => setForm({ ...form, lineItems: [...form.lineItems, emptyItem()] })}>Add Item</Button>
            <Alert severity="info">
              Grand total {money(grandTotal)} · Due balance {money(remainingPreview)}
              {paidOnForm > 0 ? ` (paid ${money(paidOnForm)})` : ''}
            </Alert>
            <TextField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} fullWidth multiline minRows={2} />
            {saveDue.isError && <Alert severity="error">{apiErrorMessage(saveDue.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.title.trim() || !form.projectId || !form.partnerName.trim() || invalidAmount || grandTotal <= 0 || saveDue.isPending} onClick={() => saveDue.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={payOpen} onClose={() => setPayOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Record {payDue?.direction === 'RECEIVABLE' ? 'receipt' : 'payment'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">Remaining {money(payDue?.remaining, payDue?.currency)}</Alert>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Date" InputLabelProps={{ shrink: true }} value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} fullWidth />
              <TextField type="number" label="Amount" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} fullWidth />
            </Stack>
            <TextField select label="Method" value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })} fullWidth>
              {PAYMENT_METHODS.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            <TextField select label="Status" value={payForm.status} onChange={(e) => setPayForm({ ...payForm, status: e.target.value })} fullWidth>
              {PAYMENT_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            <TextField label="Transaction / reference ID" value={payForm.transactionId} onChange={(e) => setPayForm({ ...payForm, transactionId: e.target.value })} fullWidth />
            <TextField label="Notes" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} fullWidth />
            {savePay.isError && <Alert severity="error">{apiErrorMessage(savePay.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!payForm.amount || savePay.isPending} onClick={() => savePay.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detailId)} onClose={() => setDetailId(null)} fullWidth maxWidth="sm">
        <DialogTitle>{detail.data?.dueId || 'Due'} · {detail.data?.title}</DialogTitle>
        <DialogContent dividers>
          {detail.data ? (
            <Stack spacing={1.5}>
              <Typography variant="body2">{detail.data.direction === 'PAYABLE' ? 'Payable' : 'Receivable'} · {detail.data.partnerName} · {labelize(detail.data.status)}</Typography>
              <Typography variant="body2">Original {money(detail.data.originalAmount, detail.data.currency)} · Paid {money(detail.data.amountPaid, detail.data.currency)} · Remaining {money(detail.data.remaining, detail.data.currency)}</Typography>
              {(detail.data.lineItems || []).map((item) => (
                <Typography key={item._id || item.description} variant="body2">{item.description}: {money(item.amount, detail.data.currency)}</Typography>
              ))}
              <Typography variant="subtitle2">Payments</Typography>
              {(detail.data.payments || []).length === 0 ? <Typography color="text.secondary">No installments yet.</Typography>
                : (detail.data.payments || []).map((row) => (
                  <Typography key={row._id} variant="body2">{row.paymentId} · {new Date(row.paymentDate).toLocaleDateString()} · {money(row.amount, row.currency)} · {labelize(row.status)} · {row.transactionId || 'no ref'}</Typography>
                ))}
            </Stack>
          ) : <Typography>Loading…</Typography>}
        </DialogContent>
        <DialogActions><Button onClick={() => setDetailId(null)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        <DialogTitle>{confirm?.action === 'settle' ? 'Settle this due?' : 'Delete this due?'}</DialogTitle>
        <DialogContent>
          {confirm?.action === 'settle'
            ? <Typography>{confirm.remaining > 0 ? `Remaining ${money(confirm.remaining, confirm.currency)} will be written off by an authorized adjustment.` : 'Outstanding balance is zero. Mark this due as settled.'}</Typography>
            : <Typography>If this due already has payments it will be cancelled, not removed, so the financial history stays intact.</Typography>}
          {(remove.isError || settle.isError) && <Alert severity="error" sx={{ mt: 2 }}>{apiErrorMessage(remove.error || settle.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Keep</Button>
          {confirm?.action === 'settle'
            ? <Button variant="contained" disabled={settle.isPending} onClick={() => settle.mutate(confirm)}>Settle</Button>
            : <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => remove.mutate(confirm._id)}>Delete / cancel</Button>}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
