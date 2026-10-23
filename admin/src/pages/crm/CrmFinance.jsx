import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, MenuItem, Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { ALLOCATION_TARGETS, INVOICE_SCOPES, INVOICE_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, labelize, money } from '../../constants/crm';
import CrmDuePayments from './CrmDuePayments';

function Stat({ label, value }) {
  return <Card sx={{ height: '100%' }}><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ mt: .5 }}>{value}</Typography></CardContent></Card>;
}

function downloadBlob(data, filename) {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const emptyInvoice = {
  invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '', projectId: '', clientId: '',
  description: '', subtotal: '', tax: 0, discount: 0, totalAmount: '', currency: 'INR', status: 'SENT',
  invoiceNumber: '', isImported: false, invoiceScope: 'FULL_PROJECT', sharePercent: '', partnerId: '',
  issuerName: '', recipientName: ''
};

const emptyPayment = (params) => ({
  invoiceId: '', projectId: params.get('projectId') || '', clientId: params.get('clientId') || '',
  paymentDate: new Date().toISOString().slice(0, 10), amount: '',
  paymentMethod: 'BANK_TRANSFER', status: 'CONFIRMED', transactionId: '', upiTransactionId: '',
  utr: '', chequeNumber: '', payerName: '', bankName: '', accountHolder: '', maskedAccountNumber: '', notes: '',
  allocationTarget: 'COMPANY', partnerId: ''
});

export default function CrmFinance() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('dues') ? 2 : 0);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice);
  const [paymentForm, setPaymentForm] = useState(emptyPayment(params));
  const [settlementForm, setSettlementForm] = useState({
    projectId: params.get('projectId') || '', partnerId: '', paymentDate: new Date().toISOString().slice(0, 10),
    amount: '', paymentMethod: 'BANK_TRANSFER', status: 'CONFIRMED', transactionId: '', notes: ''
  });
  const [settlementFilter, setSettlementFilter] = useState({
    projectId: params.get('projectId') || '', partnerId: '', status: '', from: '', to: ''
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ prefix: 'INV', padWidth: 6 });

  const dashboard = useQuery({
    queryKey: ['crm-finance-dashboard'],
    queryFn: () => api.get('/crm/finance/dashboard').then((r) => r.data.data)
  });
  const sequence = useQuery({
    queryKey: ['crm-invoice-sequence'],
    queryFn: () => api.get('/crm/finance/invoices/next-number').then((r) => r.data.data)
  });
  const invoices = useQuery({
    queryKey: ['crm-invoices', params.get('clientId'), params.get('projectId')],
    queryFn: () => api.get('/crm/finance/invoices', {
      params: {
        limit: 100,
        clientId: params.get('clientId') || undefined,
        projectId: params.get('projectId') || undefined
      }
    }).then((r) => r.data.data)
  });
  const payments = useQuery({
    queryKey: ['crm-payments', params.get('clientId'), params.get('projectId')],
    queryFn: () => api.get('/crm/finance/payments', {
      params: {
        limit: 100,
        clientId: params.get('clientId') || undefined,
        projectId: params.get('projectId') || undefined
      }
    }).then((r) => r.data.data)
  });
  const settlements = useQuery({
    queryKey: ['crm-settlements', settlementFilter],
    queryFn: () => api.get('/crm/finance/settlements', {
      params: {
        limit: 100,
        projectId: settlementFilter.projectId || undefined,
        partnerId: settlementFilter.partnerId || undefined,
        status: settlementFilter.status || undefined,
        from: settlementFilter.from || undefined,
        to: settlementFilter.to || undefined
      }
    }).then((r) => r.data.data)
  });
  const projects = useQuery({
    queryKey: ['crm-projects', 'finance'],
    queryFn: () => api.get('/crm/projects', { params: { limit: 100 } }).then((r) => r.data.data),
    enabled: invoiceOpen || paymentOpen || settlementOpen || Boolean(params.get('projectId'))
  });
  const selectedProjectId = invoiceForm.projectId || settlementForm.projectId || paymentForm.projectId;
  const selectedProject = useQuery({
    queryKey: ['crm-project', selectedProjectId],
    queryFn: () => api.get(`/crm/projects/${selectedProjectId}`).then((r) => r.data.data),
    enabled: Boolean(selectedProjectId)
  });

  useEffect(() => {
    if (params.get('projectId') || params.get('openPayment') === '1') setPaymentOpen(true);
  }, [params]);

  const dues = useQuery({
    queryKey: ['crm-finance-dues'],
    queryFn: () => api.get('/crm/finance/dues').then((r) => r.data.data)
  });

  const createInvoice = useMutation({
    mutationFn: async () => {
      const payload = {
        ...invoiceForm,
        subtotal: Number(invoiceForm.subtotal || 0),
        tax: Number(invoiceForm.tax || 0),
        discount: Number(invoiceForm.discount || 0),
        totalAmount: Number(invoiceForm.totalAmount || invoiceForm.subtotal || 0),
        sharePercent: invoiceForm.sharePercent === '' ? undefined : Number(invoiceForm.sharePercent),
        partnerId: invoiceForm.partnerId || undefined
      };
      if (!payload.isImported) delete payload.invoiceNumber;
      if (!payload.partnerId) delete payload.partnerId;
      const created = await api.post('/crm/finance/invoices', payload);
      if (invoiceFile) {
        const data = new FormData();
        data.append('files', invoiceFile);
        data.append('documentType', 'INVOICE');
        await api.post(`/crm/finance/invoices/${created.data.data._id}/attachments`, data);
      }
      return created;
    },
    onSuccess: () => {
      setInvoiceOpen(false);
      setInvoiceFile(null);
      setInvoiceForm(emptyInvoice);
      client.invalidateQueries({ queryKey: ['crm-invoices'] });
      client.invalidateQueries({ queryKey: ['crm-finance-dashboard'] });
      client.invalidateQueries({ queryKey: ['crm-invoice-sequence'] });
    }
  });
  const createPayment = useMutation({
    mutationFn: () => {
      const payload = { ...paymentForm, amount: Number(paymentForm.amount || 0) };
      if (!payload.invoiceId) delete payload.invoiceId;
      if (!payload.projectId) delete payload.projectId;
      if (!payload.partnerId) delete payload.partnerId;
      return api.post('/crm/finance/payments', payload);
    },
    onSuccess: () => {
      setPaymentOpen(false);
      client.invalidateQueries({ queryKey: ['crm-payments'] });
      client.invalidateQueries({ queryKey: ['crm-invoices'] });
      client.invalidateQueries({ queryKey: ['crm-finance-dashboard'] });
      client.invalidateQueries({ queryKey: ['crm-finance-dues'] });
    }
  });
  const saveSettings = useMutation({
    mutationFn: () => api.patch('/crm/finance/invoices/settings', {
      prefix: settingsForm.prefix,
      padWidth: Number(settingsForm.padWidth || 6)
    }),
    onSuccess: () => {
      setSettingsOpen(false);
      client.invalidateQueries({ queryKey: ['crm-invoice-sequence'] });
    }
  });
  const createSettlement = useMutation({
    mutationFn: () => api.post('/crm/finance/settlements', {
      ...settlementForm,
      amount: Number(settlementForm.amount || 0)
    }),
    onSuccess: () => {
      setSettlementOpen(false);
      client.invalidateQueries({ queryKey: ['crm-settlements'] });
      client.invalidateQueries({ queryKey: ['crm-finance-dashboard'] });
    }
  });

  const stats = dashboard.data || {};
  const partnership = stats.partnership || {};
  const nextNumber = sequence.data?.nextNumber || 'Inspecting…';

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4">Finance</Typography>
          <Typography color="text.secondary" sx={{ mt: .5 }}>Invoices, partnership settlements, and confirmed receipts. Invoices are never treated as payments.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="outlined" onClick={() => {
            setSettingsForm({ prefix: sequence.data?.prefix || 'INV', padWidth: sequence.data?.pad || 6 });
            setSettingsOpen(true);
          }}>Numbering</Button>
          <Button variant="outlined" onClick={() => api.get('/crm/finance/invoices/export', { params: { format: 'xlsx' }, responseType: 'blob' }).then((r) => downloadBlob(r.data, 'invoices.xlsx'))}>Export invoices</Button>
          <Button variant="outlined" onClick={() => setInvoiceOpen(true)}>New / import invoice</Button>
          <Button variant="outlined" onClick={() => setSettlementOpen(true)}>Partner payment</Button>
          <Button variant="contained" onClick={() => setPaymentOpen(true)}>Record receipt</Button>
        </Stack>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Total projects" value={stats.totalProjects ?? 0} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Contract value" value={money(stats.totalContractValue)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="My share entitlement" value={money(partnership.companyEntitlement)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="My share invoiced" value={money(partnership.companyInvoiced)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="My share received" value={money(partnership.companyReceived)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="My share remaining" value={money(partnership.companyRemaining)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Partner settlements due" value={money(partnership.partnerOutstanding)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Referral commissions due" value={money(partnership.referralDue)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Total invoiced" value={money(stats.totalInvoiced)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Total received" value={money(stats.totalReceived)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Outstanding receivables" value={money(stats.outstanding)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Overdue invoices" value={money(stats.overdue)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Partner remaining payable" value={money(stats.partnerDues?.remainingPayable)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Partner remaining receivable" value={money(stats.partnerDues?.remainingReceivable)} /></Grid>
      </Grid>
      <Typography variant="body2" color="text.secondary">Next automatic invoice number (inspected from existing records): {nextNumber}</Typography>

      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ mb: 2 }} variant="scrollable">
            <Tab label="Invoices" />
            <Tab label="Payments" />
            <Tab label="Due payments" />
            <Tab label="Partner settlements" />
          </Tabs>
          {tab === 0 && (
            (invoices.data || []).length === 0 ? <Typography color="text.secondary">No invoices yet.</Typography>
              : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Invoice</TableCell>
                      <TableCell>Client</TableCell>
                      <TableCell>Project</TableCell>
                      <TableCell>Scope</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Paid</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">PDF</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(invoices.data || []).map((row) => (
                      <TableRow key={row._id}>
                        <TableCell>
                          {row.invoiceNumber}
                          {row.isImported ? <Chip size="small" label="Imported" sx={{ ml: 1 }} /> : null}
                        </TableCell>
                        <TableCell>{row.clientId?.clientName || '—'}</TableCell>
                        <TableCell>{row.projectId?.projectName || '—'}</TableCell>
                        <TableCell>{labelize(row.invoiceScope || 'FULL_PROJECT')}</TableCell>
                        <TableCell>{money(row.totalAmount, row.currency)}</TableCell>
                        <TableCell>{money(row.amountPaid, row.currency)}</TableCell>
                        <TableCell><Chip size="small" label={labelize(row.status)} /></TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => {
                            api.get(`/crm/finance/invoices/${row._id}/pdf`, { responseType: 'blob' }).then((response) => {
                              downloadBlob(response.data, `${row.invoiceNumber}.pdf`);
                            });
                          }}>PDF</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
          )}
          {tab === 1 && (
            (payments.data || []).length === 0 ? <Typography color="text.secondary">No payments yet.</Typography>
              : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Payment</TableCell>
                      <TableCell>Client</TableCell>
                      <TableCell>Project</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Allocated to</TableCell>
                      <TableCell>Method</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(payments.data || []).map((row) => (
                      <TableRow key={row._id}>
                        <TableCell>{row.paymentId}{row.installmentNumber ? ` · #${row.installmentNumber}` : ''}</TableCell>
                        <TableCell>
                          <Button size="small" onClick={() => row.clientId?._id && navigate(`/crm/clients/${row.clientId._id}`)}>
                            {row.clientId?.clientName || row.clientId?.clientId || '—'}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button size="small" onClick={() => row.projectId?._id && navigate(`/crm/projects/${row.projectId._id}`)}>
                            {row.projectId?.projectId || row.projectId?.projectName || '—'}
                          </Button>
                        </TableCell>
                        <TableCell>{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>{money(row.amount, row.currency)}</TableCell>
                        <TableCell>{labelize(row.allocationTarget || 'UNALLOCATED')}</TableCell>
                        <TableCell>{labelize(row.paymentMethod)}</TableCell>
                        <TableCell><Chip size="small" label={labelize(row.status || 'CONFIRMED')} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
          )}
          {tab === 2 && (
            <CrmDuePayments
              clientAlerts={dues.data}
              projectId={params.get('projectId') || ''}
              clientId={params.get('clientId') || ''}
            />
          )}
          {tab === 3 && (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField size="small" label="From" type="date" InputLabelProps={{ shrink: true }} value={settlementFilter.from} onChange={(e) => setSettlementFilter({ ...settlementFilter, from: e.target.value })} />
                <TextField size="small" label="To" type="date" InputLabelProps={{ shrink: true }} value={settlementFilter.to} onChange={(e) => setSettlementFilter({ ...settlementFilter, to: e.target.value })} />
                <TextField size="small" select label="Status" value={settlementFilter.status} onChange={(e) => setSettlementFilter({ ...settlementFilter, status: e.target.value })} sx={{ minWidth: 160 }}>
                  <MenuItem value="">All</MenuItem>
                  {PAYMENT_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
                </TextField>
              </Stack>
              {(settlements.data || []).length === 0 ? <Typography color="text.secondary">No partner settlements recorded.</Typography>
                : (
                  <Table size="small">
                    <TableHead><TableRow><TableCell>ID</TableCell><TableCell>Project</TableCell><TableCell>Partner</TableCell><TableCell>Date</TableCell><TableCell>Amount</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                    <TableBody>
                      {(settlements.data || []).map((row) => (
                        <TableRow key={row._id}>
                          <TableCell>{row.settlementId}</TableCell>
                          <TableCell>{row.projectId?.projectId || '—'}</TableCell>
                          <TableCell>{row.partnerId?.name || '—'}</TableCell>
                          <TableCell>{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : '—'}</TableCell>
                          <TableCell>{money(row.amount, row.currency)}</TableCell>
                          <TableCell><Chip size="small" label={labelize(row.status)} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Dialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{invoiceForm.isImported ? 'Import existing invoice' : 'Create invoice'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControlLabel
              control={<Checkbox checked={invoiceForm.isImported} onChange={(e) => setInvoiceForm({ ...invoiceForm, isImported: e.target.checked, invoiceNumber: e.target.checked ? invoiceForm.invoiceNumber : '' })} />}
              label="This is an existing invoice (keep its original number)"
            />
            {invoiceForm.isImported ? (
              <TextField label="Existing invoice number" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} fullWidth required helperText="Historical numbers are preserved exactly. Duplicates are rejected." />
            ) : (
              <TextField label="Next invoice number" value={nextNumber} InputProps={{ readOnly: true }} fullWidth helperText="Generated from the highest existing serial. It is assigned on save." />
            )}
            <TextField select label="Project" value={invoiceForm.projectId} onChange={(e) => {
              const project = (projects.data || []).find((item) => item._id === e.target.value);
              setInvoiceForm({
                ...invoiceForm,
                projectId: e.target.value,
                clientId: project?.clientId?._id || project?.clientId || ''
              });
            }} fullWidth>
              {(projects.data || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.projectName}</MenuItem>)}
            </TextField>
            <TextField select label="Invoice for" value={invoiceForm.invoiceScope} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceScope: e.target.value })} fullWidth>
              {INVOICE_SCOPES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            {invoiceForm.invoiceScope === 'PARTNER_SHARE' && (
              <TextField select label="Partner" value={invoiceForm.partnerId} onChange={(e) => setInvoiceForm({ ...invoiceForm, partnerId: e.target.value })} fullWidth>
                {(selectedProject.data?.partners || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}
              </TextField>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Invoice date" InputLabelProps={{ shrink: true }} value={invoiceForm.invoiceDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })} fullWidth />
              <TextField type="date" label="Due date" InputLabelProps={{ shrink: true }} value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Subtotal" type="number" value={invoiceForm.subtotal} onChange={(e) => setInvoiceForm({ ...invoiceForm, subtotal: e.target.value, totalAmount: e.target.value })} fullWidth />
              <TextField label="Total" type="number" value={invoiceForm.totalAmount} onChange={(e) => setInvoiceForm({ ...invoiceForm, totalAmount: e.target.value })} fullWidth />
            </Stack>
            <TextField select label="Status" value={invoiceForm.status} onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value })} fullWidth>
              {INVOICE_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            <TextField label="Description" value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} fullWidth multiline minRows={2} />
            <Button component="label" variant="outlined">
              {invoiceFile ? invoiceFile.name : 'Attach invoice PDF (optional)'}
              <input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.csv,.doc,.docx" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} />
            </Button>
            <Typography variant="caption" color="text.secondary">Uploading a PDF does not mark this invoice as paid.</Typography>
            {createInvoice.isError && <Alert severity="error">{apiErrorMessage(createInvoice.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!invoiceForm.projectId || !invoiceForm.clientId || (invoiceForm.isImported && !invoiceForm.invoiceNumber.trim()) || createInvoice.isPending} onClick={() => createInvoice.mutate()}>
            {invoiceForm.isImported ? 'Import' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={paymentOpen} onClose={() => setPaymentOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Record payment</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label="Project" value={paymentForm.projectId} onChange={(e) => {
              const project = (projects.data || []).find((item) => item._id === e.target.value);
              setPaymentForm({
                ...paymentForm,
                projectId: e.target.value,
                clientId: project?.clientId?._id || project?.clientId || ''
              });
            }} fullWidth>
              {(projects.data || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.projectName} ({item.projectId})</MenuItem>)}
            </TextField>
            <TextField select label="Invoice (optional)" value={paymentForm.invoiceId} onChange={(e) => setPaymentForm({ ...paymentForm, invoiceId: e.target.value })} fullWidth>
              <MenuItem value="">None — pay against contract</MenuItem>
              {(invoices.data || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.invoiceNumber} — {money(item.totalAmount, item.currency)}</MenuItem>)}
            </TextField>
            <TextField select label="Allocate toward" value={paymentForm.allocationTarget} onChange={(e) => setPaymentForm({ ...paymentForm, allocationTarget: e.target.value, partnerId: e.target.value === 'PARTNER' ? paymentForm.partnerId : '' })} fullWidth>
              {ALLOCATION_TARGETS.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            {paymentForm.allocationTarget === 'PARTNER' && (
              <TextField select label="Partner" value={paymentForm.partnerId} onChange={(e) => setPaymentForm({ ...paymentForm, partnerId: e.target.value })} fullWidth>
                {(selectedProject.data?.partners || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}
              </TextField>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Payment date" InputLabelProps={{ shrink: true }} value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} fullWidth />
              <TextField label="Amount" type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} fullWidth />
            </Stack>
            <TextField select label="Method" value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })} fullWidth>
              {PAYMENT_METHODS.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            <TextField select label="Status" value={paymentForm.status} onChange={(e) => setPaymentForm({ ...paymentForm, status: e.target.value })} fullWidth>
              {PAYMENT_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            {paymentForm.paymentMethod === 'UPI' && (
              <TextField label="UPI transaction / reference ID" value={paymentForm.upiTransactionId} onChange={(e) => setPaymentForm({ ...paymentForm, upiTransactionId: e.target.value })} fullWidth />
            )}
            {['BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'NET_BANKING'].includes(paymentForm.paymentMethod) && (
              <>
                <TextField label="UTR / bank transaction ID" value={paymentForm.utr} onChange={(e) => setPaymentForm({ ...paymentForm, utr: e.target.value })} fullWidth />
                <TextField label="Bank name" value={paymentForm.bankName} onChange={(e) => setPaymentForm({ ...paymentForm, bankName: e.target.value })} fullWidth />
                <TextField label="Account holder" value={paymentForm.accountHolder} onChange={(e) => setPaymentForm({ ...paymentForm, accountHolder: e.target.value })} fullWidth />
                <TextField label="Account number (stored masked)" value={paymentForm.maskedAccountNumber} onChange={(e) => setPaymentForm({ ...paymentForm, maskedAccountNumber: e.target.value, accountNumber: e.target.value })} fullWidth />
              </>
            )}
            {paymentForm.paymentMethod === 'CHEQUE' && (
              <TextField label="Cheque / reference number" value={paymentForm.chequeNumber} onChange={(e) => setPaymentForm({ ...paymentForm, chequeNumber: e.target.value })} fullWidth />
            )}
            <TextField label="Payer name" value={paymentForm.payerName} onChange={(e) => setPaymentForm({ ...paymentForm, payerName: e.target.value })} fullWidth />
            <TextField label="Transaction ID" value={paymentForm.transactionId} onChange={(e) => setPaymentForm({ ...paymentForm, transactionId: e.target.value })} fullWidth />
            <TextField label="Notes" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} fullWidth multiline minRows={2} />
            {createPayment.isError && <Alert severity="error">{apiErrorMessage(createPayment.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={(!paymentForm.projectId && !paymentForm.invoiceId) || !paymentForm.amount || createPayment.isPending} onClick={() => createPayment.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Invoice numbering</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">Existing invoice numbers are never changed. New automatic numbers continue from the highest inspected serial ({sequence.data?.maxSerial ?? 0}).</Alert>
            <TextField label="Prefix" value={settingsForm.prefix} onChange={(e) => setSettingsForm({ ...settingsForm, prefix: e.target.value })} fullWidth />
            <TextField type="number" label="Digit width" value={settingsForm.padWidth} onChange={(e) => setSettingsForm({ ...settingsForm, padWidth: e.target.value })} fullWidth />
            {saveSettings.isError && <Alert severity="error">{apiErrorMessage(saveSettings.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={settlementOpen} onClose={() => setSettlementOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Record partner settlement</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label="Project" value={settlementForm.projectId} onChange={(e) => setSettlementForm({ ...settlementForm, projectId: e.target.value, partnerId: '' })} fullWidth>
              {(projects.data || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.projectName}</MenuItem>)}
            </TextField>
            <TextField select label="Partner" value={settlementForm.partnerId} onChange={(e) => setSettlementForm({ ...settlementForm, partnerId: e.target.value })} fullWidth>
              {(selectedProject.data?.partners || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Date" InputLabelProps={{ shrink: true }} value={settlementForm.paymentDate} onChange={(e) => setSettlementForm({ ...settlementForm, paymentDate: e.target.value })} fullWidth />
              <TextField type="number" label="Amount" value={settlementForm.amount} onChange={(e) => setSettlementForm({ ...settlementForm, amount: e.target.value })} fullWidth />
            </Stack>
            <TextField select label="Method" value={settlementForm.paymentMethod} onChange={(e) => setSettlementForm({ ...settlementForm, paymentMethod: e.target.value })} fullWidth>
              {PAYMENT_METHODS.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            <TextField label="Transaction / reference ID" value={settlementForm.transactionId} onChange={(e) => setSettlementForm({ ...settlementForm, transactionId: e.target.value })} fullWidth />
            <TextField label="Notes" value={settlementForm.notes} onChange={(e) => setSettlementForm({ ...settlementForm, notes: e.target.value })} fullWidth />
            {createSettlement.isError && <Alert severity="error">{apiErrorMessage(createSettlement.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettlementOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!settlementForm.projectId || !settlementForm.partnerId || !settlementForm.amount || createSettlement.isPending} onClick={() => createSettlement.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
