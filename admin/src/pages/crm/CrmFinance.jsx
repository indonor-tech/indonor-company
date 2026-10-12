import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { INVOICE_STATUSES, PAYMENT_METHODS, labelize, money } from '../../constants/crm';

function Stat({ label, value }) {
  return <Card sx={{ height: '100%' }}><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ mt: .5 }}>{value}</Typography></CardContent></Card>;
}

export default function CrmFinance() {
  const { is, can } = useAuth();
  const client = useQueryClient();
  const [tab, setTab] = useState(0);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '', projectId: '', clientId: '',
    description: '', subtotal: '', tax: 0, discount: 0, totalAmount: '', currency: 'INR', status: 'SENT'
  });
  const [paymentForm, setPaymentForm] = useState({
    invoiceId: '', paymentDate: new Date().toISOString().slice(0, 10), amount: '', paymentMethod: 'BANK_TRANSFER', transactionId: '', notes: ''
  });

  if (!is('SUPER_ADMIN') && !can('crm:finance:read')) {
    return <Alert severity="error">Financial information is restricted to Super Admin.</Alert>;
  }

  const dashboard = useQuery({
    queryKey: ['crm-finance-dashboard'],
    queryFn: () => api.get('/crm/finance/dashboard').then((r) => r.data.data)
  });
  const invoices = useQuery({
    queryKey: ['crm-invoices'],
    queryFn: () => api.get('/crm/finance/invoices', { params: { limit: 100 } }).then((r) => r.data.data)
  });
  const payments = useQuery({
    queryKey: ['crm-payments'],
    queryFn: () => api.get('/crm/finance/payments', { params: { limit: 100 } }).then((r) => r.data.data)
  });
  const projects = useQuery({
    queryKey: ['crm-projects', 'finance'],
    queryFn: () => api.get('/crm/projects', { params: { limit: 100 } }).then((r) => r.data.data),
    enabled: invoiceOpen
  });

  const createInvoice = useMutation({
    mutationFn: () => api.post('/crm/finance/invoices', {
      ...invoiceForm,
      subtotal: Number(invoiceForm.subtotal || 0),
      tax: Number(invoiceForm.tax || 0),
      discount: Number(invoiceForm.discount || 0),
      totalAmount: Number(invoiceForm.totalAmount || invoiceForm.subtotal || 0)
    }),
    onSuccess: () => {
      setInvoiceOpen(false);
      client.invalidateQueries({ queryKey: ['crm-invoices'] });
      client.invalidateQueries({ queryKey: ['crm-finance-dashboard'] });
    }
  });
  const createPayment = useMutation({
    mutationFn: () => api.post('/crm/finance/payments', {
      ...paymentForm,
      amount: Number(paymentForm.amount || 0)
    }),
    onSuccess: () => {
      setPaymentOpen(false);
      client.invalidateQueries({ queryKey: ['crm-payments'] });
      client.invalidateQueries({ queryKey: ['crm-invoices'] });
      client.invalidateQueries({ queryKey: ['crm-finance-dashboard'] });
    }
  });

  const stats = dashboard.data || {};

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4">Finance</Typography>
          <Typography color="text.secondary" sx={{ mt: .5 }}>Super Admin only — invoices, payments, and revenue.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setInvoiceOpen(true)}>New invoice</Button>
          <Button variant="contained" onClick={() => setPaymentOpen(true)}>Record payment</Button>
        </Stack>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Total projects" value={stats.totalProjects ?? 0} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Contract value" value={money(stats.totalContractValue)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Total invoiced" value={money(stats.totalInvoiced)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Total received" value={money(stats.totalReceived)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Outstanding" value={money(stats.outstanding)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Overdue" value={money(stats.overdue)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="This month" value={money(stats.thisMonthRevenue)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="This year" value={money(stats.thisYearRevenue)} /></Grid>
      </Grid>

      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ mb: 2 }}>
            <Tab label="Invoices" />
            <Tab label="Payments" />
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
                      <TableCell>Amount</TableCell>
                      <TableCell>Paid</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">PDF</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(invoices.data || []).map((row) => (
                      <TableRow key={row._id}>
                        <TableCell>{row.invoiceNumber}</TableCell>
                        <TableCell>{row.clientId?.clientName || '—'}</TableCell>
                        <TableCell>{row.projectId?.projectName || '—'}</TableCell>
                        <TableCell>{money(row.totalAmount, row.currency)}</TableCell>
                        <TableCell>{money(row.amountPaid, row.currency)}</TableCell>
                        <TableCell><Chip size="small" label={labelize(row.status)} /></TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => {
                            api.get(`/crm/finance/invoices/${row._id}/pdf`, { responseType: 'blob' }).then((response) => {
                              const url = URL.createObjectURL(response.data);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `${row.invoiceNumber}.pdf`;
                              link.click();
                              URL.revokeObjectURL(url);
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
                      <TableCell>Invoice</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Method</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(payments.data || []).map((row) => (
                      <TableRow key={row._id}>
                        <TableCell>{row.paymentId}</TableCell>
                        <TableCell>{row.invoiceId?.invoiceNumber || '—'}</TableCell>
                        <TableCell>{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>{money(row.amount, row.currency)}</TableCell>
                        <TableCell>{labelize(row.paymentMethod)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
          )}
        </CardContent>
      </Card>

      <Dialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create invoice</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
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
            {createInvoice.isError && <Alert severity="error">{apiErrorMessage(createInvoice.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!invoiceForm.projectId || !invoiceForm.clientId || createInvoice.isPending} onClick={() => createInvoice.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={paymentOpen} onClose={() => setPaymentOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Record payment</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label="Invoice" value={paymentForm.invoiceId} onChange={(e) => setPaymentForm({ ...paymentForm, invoiceId: e.target.value })} fullWidth>
              {(invoices.data || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.invoiceNumber} — {money(item.totalAmount, item.currency)}</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Payment date" InputLabelProps={{ shrink: true }} value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} fullWidth />
              <TextField label="Amount" type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} fullWidth />
            </Stack>
            <TextField select label="Method" value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })} fullWidth>
              {PAYMENT_METHODS.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            <TextField label="Transaction ID" value={paymentForm.transactionId} onChange={(e) => setPaymentForm({ ...paymentForm, transactionId: e.target.value })} fullWidth />
            <TextField label="Notes" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} fullWidth multiline minRows={2} />
            {createPayment.isError && <Alert severity="error">{apiErrorMessage(createPayment.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!paymentForm.invoiceId || !paymentForm.amount || createPayment.isPending} onClick={() => createPayment.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
