import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { CURRENCIES, TECH_STACK, labelize, money } from '../../constants/crm';

const empty = {
  sourceLeadId: '',
  clientName: '',
  companyName: '',
  companyEmail: '',
  companyPhone: '',
  country: '',
  address: '',
  city: '',
  industry: '',
  businessDescription: '',
  technologies: [],
  assignedTo: '',
  gstVatNumber: '',
  paymentTerms: '',
  currency: 'INR',
  notes: ''
};

function leadLabel(lead) {
  if (!lead) return '';
  return [lead.leadId, lead.companyName || lead.leadName, lead.contactPersonName].filter(Boolean).join(' · ');
}

function applyLead(lead) {
  if (!lead) return { ...empty };
  return {
    ...empty,
    sourceLeadId: lead._id,
    clientName: lead.leadName || lead.companyName || '',
    companyName: lead.companyName || '',
    companyEmail: lead.email || '',
    companyPhone: lead.phone || '',
    country: lead.country || '',
    address: lead.address || '',
    city: lead.city || '',
    industry: lead.industry || '',
    businessDescription: lead.businessRequirements || lead.requirementDescription || lead.projectDescription || '',
    technologies: lead.requiredTechnologies || [],
    assignedTo: lead.assignedTo?._id || lead.assignedTo || '',
    currency: lead.currency || 'INR',
    notes: lead.notes || ''
  };
}

export default function CrmClients() {
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [form, setForm] = useState(empty);
  const readOnly = isViewAdmin || !can('crm:clients:write');

  const list = useQuery({
    queryKey: ['crm-clients', search],
    queryFn: () => api.get('/crm/clients', { params: { q: search || undefined, limit: 100 } }).then((r) => r.data)
  });
  const leads = useQuery({
    queryKey: ['crm-leads-unconverted', leadSearch],
    queryFn: () => api.get('/crm/leads', {
      params: { converted: false, convertible: true, q: leadSearch || undefined, limit: 50 }
    }).then((r) => r.data.data),
    enabled: open && can('crm:leads:read')
  });
  const sales = useQuery({
    queryKey: ['crm-directory', 'sales'],
    queryFn: () => api.get('/crm/directory', { params: { kind: 'sales' } }).then((r) => r.data.data),
    enabled: open
  });
  const create = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (!payload.sourceLeadId) delete payload.sourceLeadId;
      if (!payload.assignedTo) delete payload.assignedTo;
      return api.post('/crm/clients', payload);
    },
    onSuccess: (response) => {
      client.invalidateQueries({ queryKey: ['crm-clients'] });
      client.invalidateQueries({ queryKey: ['crm-leads'] });
      setOpen(false);
      setForm(empty);
      setSelectedLead(null);
      navigate(`/crm/clients/${response.data.data._id}`);
    }
  });
  const rows = list.data?.data || [];

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4">Clients</Typography>
          <Typography color="text.secondary" sx={{ mt: .5 }}>Converted customers and their project portfolio.</Typography>
        </Box>
        {!readOnly && <Button size="small" variant="contained" onClick={() => { setForm(empty); setSelectedLead(null); setOpen(true); }}>Add client</Button>}
      </Box>
      <Card>
        <CardContent>
          <TextField size="small" placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 2, maxWidth: 420 }} fullWidth />
          {list.isLoading ? <Typography>Loading…</Typography>
            : list.isError ? <Alert severity="error">Could not load clients.</Alert>
              : rows.length === 0 ? <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No clients yet.</Typography>
                : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Client</TableCell>
                        <TableCell>Linked lead</TableCell>
                        <TableCell>Projects</TableCell>
                        <TableCell>Outstanding</TableCell>
                        <TableCell>Owner</TableCell>
                        <TableCell align="right">Open</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow hover key={row._id}>
                          <TableCell>
                            <Typography fontWeight={650}>{row.clientName}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.clientId} · {row.companyName || 'No company'}</Typography>
                          </TableCell>
                          <TableCell>
                            {row.sourceLeadCode || row.sourceLeadId?.leadId
                              ? (
                                <Stack spacing={0.3}>
                                  <Chip size="small" color="success" label="Converted" />
                                  <Typography variant="caption">{row.sourceLeadCode || row.sourceLeadId?.leadId}</Typography>
                                  {row.convertedDate && (
                                    <Typography variant="caption" color="text.secondary">{new Date(row.convertedDate).toLocaleDateString()}</Typography>
                                  )}
                                </Stack>
                              )
                              : <Chip size="small" label="Manual" />}
                          </TableCell>
                          <TableCell>{row.projectCount ?? 0}</TableCell>
                          <TableCell>{money(row.ledgerSummary?.outstanding, row.currency)}</TableCell>
                          <TableCell>{row.assignedTo?.name || '—'}</TableCell>
                          <TableCell align="right"><Button size="small" onClick={() => navigate(`/crm/clients/${row._id}`)}>View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Add client</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {can('crm:leads:read') && (
              <Autocomplete
                options={leads.data || []}
                value={selectedLead}
                getOptionLabel={leadLabel}
                isOptionEqualToValue={(option, value) => option._id === value._id}
                onInputChange={(_e, value) => setLeadSearch(value)}
                onChange={(_e, lead) => {
                  setSelectedLead(lead);
                  setForm(applyLead(lead));
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select existing lead"
                    placeholder="Search by Lead ID, company, or contact"
                    helperText="Selecting a lead fills the form. Each lead can be converted only once."
                  />
                )}
              />
            )}
            {selectedLead && (
              <Alert severity="info">
                Converting {selectedLead.leadId} · {labelize(selectedLead.status)}. Original Lead ID is preserved and a unique Client ID is generated.
              </Alert>
            )}
            <TextField label="Client name" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} fullWidth required />
            <TextField label="Company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} fullWidth />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Email" value={form.companyEmail} onChange={(e) => setForm({ ...form, companyEmail: e.target.value })} fullWidth />
              <TextField label="Phone" value={form.companyPhone} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} fullWidth />
              <TextField label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} fullWidth />
              <TextField label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} fullWidth />
            </Stack>
            <TextField label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} fullWidth />
            <TextField label="Requirements / description" value={form.businessDescription} onChange={(e) => setForm({ ...form, businessDescription: e.target.value })} fullWidth multiline minRows={3} />
            <Autocomplete
              multiple
              freeSolo
              options={TECH_STACK}
              value={form.technologies}
              onChange={(_e, value) => setForm({ ...form, technologies: value })}
              renderInput={(params) => <TextField {...params} label="Technologies" />}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} fullWidth>
                {CURRENCIES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </TextField>
              <TextField
                select
                label="Assigned salesperson"
                value={form.assignedTo}
                onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                fullWidth
              >
                <MenuItem value="">Unassigned</MenuItem>
                {(sales.data || []).map((user) => (
                  <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField label="GST / tax ID" value={form.gstVatNumber} onChange={(e) => setForm({ ...form, gstVatNumber: e.target.value })} fullWidth />
            <TextField label="Payment terms" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} fullWidth />
            <TextField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} fullWidth multiline minRows={2} />
            {!selectedLead && <Alert severity="warning">No lead selected — this creates a manual client without a Lead ID link.</Alert>}
            {create.isError && <Alert severity="error">{apiErrorMessage(create.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.clientName.trim() || create.isPending} onClick={() => create.mutate()}>
            {selectedLead ? 'Convert & save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
