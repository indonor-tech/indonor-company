import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography
} from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { CURRENCIES, PROJECT_STATUSES, PROJECT_TYPES, TECH_STACK, labelize, money } from '../../constants/crm';

const emptyProject = {
  projectName: '',
  projectDescription: '',
  projectType: 'CUSTOM_SOFTWARE',
  technologyStack: [],
  contractValue: '',
  currency: 'INR',
  estimatedStartDate: '',
  expectedEndDate: '',
  estimatedDuration: '',
  status: 'NOT_STARTED',
  progressPercent: 0,
  projectManager: '',
  notes: '',
  nextPaymentDueDate: ''
};

function downloadBlob(path, name) {
  return api.get(path, { responseType: 'blob' }).then((response) => {
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = name || 'document';
    link.click();
    URL.revokeObjectURL(url);
  });
}

export default function CrmClientDetail() {
  const { id } = useParams();
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [contactOpen, setContactOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [contact, setContact] = useState({ contactName: '', designation: '', email: '', phone: '', isPrimary: true });
  const [followForm, setFollowForm] = useState({ nextFollowUpDate: '', followUpNote: '', followUpType: 'PAYMENT_DISCUSSION', projectId: '' });
  const [projectForm, setProjectForm] = useState(emptyProject);
  const readOnly = isViewAdmin || !can('crm:clients:write');
  const canFinance = can('crm:finance:read');
  const canPay = can('crm:finance:write');

  const detail = useQuery({
    queryKey: ['crm-client', id],
    queryFn: () => api.get(`/crm/clients/${id}`).then((r) => r.data.data)
  });
  const team = useQuery({
    queryKey: ['crm-directory', 'team'],
    queryFn: () => api.get('/crm/directory', { params: { kind: 'team' } }).then((r) => r.data.data),
    enabled: projectOpen
  });
  const addFollow = useMutation({
    mutationFn: () => api.post(`/crm/clients/${id}/follow-ups`, followForm),
    onSuccess: () => {
      setFollowOpen(false);
      client.invalidateQueries({ queryKey: ['crm-client', id] });
    }
  });
  const addContact = useMutation({
    mutationFn: () => api.post(`/crm/clients/${id}/contacts`, contact),
    onSuccess: () => {
      setContactOpen(false);
      setContact({ contactName: '', designation: '', email: '', phone: '', isPrimary: true });
      client.invalidateQueries({ queryKey: ['crm-client', id] });
    }
  });
  const addNote = useMutation({
    mutationFn: () => api.post(`/crm/clients/${id}/activities`, { type: 'NOTE', title: 'Note added', description: note }),
    onSuccess: () => {
      setNote('');
      client.invalidateQueries({ queryKey: ['crm-client', id] });
    }
  });
  const addProject = useMutation({
    mutationFn: async () => {
      const payload = {
        ...projectForm,
        clientId: id,
        contractValue: projectForm.contractValue === '' ? undefined : Number(projectForm.contractValue),
        finalAmount: projectForm.contractValue === '' ? undefined : Number(projectForm.contractValue),
        progressPercent: Number(projectForm.progressPercent || 0),
        projectManager: projectForm.projectManager || null
      };
      if (!payload.estimatedStartDate) delete payload.estimatedStartDate;
      if (!payload.expectedEndDate) delete payload.expectedEndDate;
      if (!payload.nextPaymentDueDate) delete payload.nextPaymentDueDate;
      const created = await api.post('/crm/projects', payload);
      return created.data.data;
    },
    onSuccess: () => {
      setProjectOpen(false);
      setProjectForm(emptyProject);
      client.invalidateQueries({ queryKey: ['crm-client', id] });
      client.invalidateQueries({ queryKey: ['crm-projects'] });
    }
  });
  const uploadDoc = useMutation({
    mutationFn: (file) => {
      const data = new FormData();
      data.append('file', file);
      data.append('documentName', file.name);
      return api.post(`/crm/clients/${id}/documents`, data);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['crm-client', id] })
  });

  const data = detail.data;
  const lead = data?.sourceLead || data?.sourceLeadId;
  const payments = useMemo(() => {
    const rows = data?.payments || [];
    if (!projectFilter) return rows;
    return rows.filter((row) => String(row.projectId?._id || row.projectId) === String(projectFilter));
  }, [data, projectFilter]);
  const invoices = useMemo(() => {
    const rows = data?.invoices || [];
    if (!projectFilter) return rows;
    return rows.filter((row) => String(row.projectId?._id || row.projectId) === String(projectFilter));
  }, [data, projectFilter]);

  if (detail.isLoading) return <Typography>Loading client…</Typography>;
  if (detail.isError || !data) return <Alert severity="error">Client not found.</Alert>;

  const totals = data.ledger || data.totals || {};

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Button size="small" onClick={() => navigate('/crm/clients')}>← Back to clients</Button>
          <Typography variant="h4" sx={{ mt: 1 }}>{data.clientName}</Typography>
          <Typography color="text.secondary">{data.clientId} · {data.companyName || 'No company'}</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {!readOnly && <Button variant="outlined" onClick={() => setFollowOpen(true)}>Payment follow-up</Button>}
          {canPay && <Button variant="outlined" onClick={() => navigate(`/crm/finance?clientId=${data._id}`)}>Record payment</Button>}
          {can('crm:projects:write') && (
            <Button variant="contained" onClick={() => { setProjectForm({ ...emptyProject, currency: data.currency || 'INR' }); setProjectOpen(true); }}>Add project</Button>
          )}
        </Stack>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Client profile</Typography>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Email" value={data.companyEmail || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Phone" value={data.companyPhone || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Industry" value={data.industry || '—'} InputProps={{ readOnly: true }} fullWidth />
            </Stack>
            <TextField label="Address" value={[data.address, data.city, data.state, data.country].filter(Boolean).join(', ') || '—'} InputProps={{ readOnly: true }} fullWidth />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Technologies" value={(data.technologies || []).join(', ') || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Payment terms" value={data.paymentTerms || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Salesperson" value={data.assignedTo?.name || '—'} InputProps={{ readOnly: true }} fullWidth />
            </Stack>
            {data.businessDescription && <TextField label="Requirements" value={data.businessDescription} InputProps={{ readOnly: true }} fullWidth multiline minRows={2} />}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Linked lead</Typography>
          {lead?._id || lead?.leadId ? (
            <Stack spacing={1.5}>
              <Alert
                severity="success"
                action={<Button size="small" onClick={() => navigate(`/crm/leads/${lead._id || lead}`)}>Open lead</Button>}
              >
                Converted from {lead.leadId || data.sourceLeadCode} on {data.convertedDate ? new Date(data.convertedDate).toLocaleString() : '—'}
                {lead.convertedBy?.name ? ` by ${lead.convertedBy.name}` : ''}. Original Lead ID is preserved.
              </Alert>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField label="Lead ID" value={lead.leadId || data.sourceLeadCode || '—'} InputProps={{ readOnly: true }} fullWidth />
                <TextField label="Contact" value={lead.contactPersonName || '—'} InputProps={{ readOnly: true }} fullWidth />
                <TextField label="Source" value={labelize(lead.source) || '—'} InputProps={{ readOnly: true }} fullWidth />
              </Stack>
              <TextField label="Lead requirements" value={lead.businessRequirements || lead.projectDescription || '—'} InputProps={{ readOnly: true }} fullWidth multiline minRows={2} />
            </Stack>
          ) : (
            <Typography color="text.secondary">This client was created manually and is not linked to a lead.</Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="h6">Projects</Typography>
            {can('crm:projects:write') && <Button size="small" onClick={() => { setProjectForm({ ...emptyProject, currency: data.currency || 'INR' }); setProjectOpen(true); }}>Add project</Button>}
          </Box>
          {(data.projects || []).length === 0 ? <Typography color="text.secondary">No projects yet. Add a project without creating another client record.</Typography>
            : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Project</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Progress</TableCell>
                    <TableCell>Contract</TableCell>
                    <TableCell>Outstanding</TableCell>
                    <TableCell align="right">Open</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.projects || []).map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>
                        <Typography fontWeight={650}>{row.projectName}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.projectId}</Typography>
                      </TableCell>
                      <TableCell><Chip size="small" color={row.isOverdue ? 'error' : 'default'} label={row.isOverdue ? `${labelize(row.status)} · overdue` : labelize(row.status)} /></TableCell>
                      <TableCell>{row.progressPercent ?? 0}%</TableCell>
                      <TableCell>{money(row.ledger?.contractValue ?? row.contractValue, row.currency)}</TableCell>
                      <TableCell>{money(row.ledger?.outstanding, row.currency)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Button size="small" onClick={() => navigate(`/crm/projects/${row._id}`)}>View</Button>
                          {canPay && <Button size="small" onClick={() => navigate(`/crm/finance?clientId=${data._id}&projectId=${row._id}`)}>Payments</Button>}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="h6">Payments & invoices</Typography>
            <TextField select size="small" label="Filter by project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} sx={{ minWidth: 240 }}>
              <MenuItem value="">All projects</MenuItem>
              {(data.projects || []).map((row) => <MenuItem key={row._id} value={row._id}>{row.projectName} ({row.projectId})</MenuItem>)}
            </TextField>
          </Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            Client total: {money(totals.contractValue, totals.currency)} contract · {money(totals.confirmedPayments, totals.currency)} received · {money(totals.pendingPayments, totals.currency)} pending · {money(totals.outstanding, totals.currency)} outstanding
          </Alert>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Payments</Typography>
          {payments.length === 0 ? <Typography color="text.secondary" sx={{ mb: 2 }}>No payments for this filter.</Typography>
            : (
              <Table size="small" sx={{ mb: 3 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Payment</TableCell>
                    <TableCell>Project</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Status</TableCell>
                    {canFinance && <TableCell>Method</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payments.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>{row.paymentId}{row.installmentNumber ? ` · #${row.installmentNumber}` : ''}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => row.projectId?._id && navigate(`/crm/projects/${row.projectId._id}`)}>
                          {row.projectId?.projectId || row.projectId?.projectName || 'Project'}
                        </Button>
                      </TableCell>
                      <TableCell>{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{money(row.amount, row.currency)}</TableCell>
                      <TableCell><Chip size="small" label={labelize(row.status || 'CONFIRMED')} /></TableCell>
                      {canFinance && <TableCell>{labelize(row.paymentMethod)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Invoices</Typography>
          {invoices.length === 0 ? <Typography color="text.secondary">No invoices for this filter.</Typography>
            : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice</TableCell>
                    <TableCell>Project</TableCell>
                    <TableCell>Due</TableCell>
                    <TableCell>Total</TableCell>
                    <TableCell>Paid</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>{row.invoiceNumber}</TableCell>
                      <TableCell>{row.projectId?.projectId || row.projectId?.projectName || '—'}</TableCell>
                      <TableCell>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{money(row.totalAmount, row.currency)}</TableCell>
                      <TableCell>{money(row.amountPaid, row.currency)}</TableCell>
                      <TableCell><Chip size="small" label={labelize(row.status)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Outstanding dues</Typography>
          {(data.dues || []).length === 0 ? <Typography color="text.secondary">No upcoming or overdue payments.</Typography>
            : (
              <Stack spacing={1}>
                {(data.dues || []).map((row) => (
                  <Alert
                    key={`${row.projectMongoId}-${row.kind}`}
                    severity={row.kind === 'OVERDUE' ? 'error' : 'warning'}
                    action={(
                      <Stack direction="row" spacing={0.5}>
                        <Button size="small" onClick={() => navigate(`/crm/projects/${row.projectMongoId}`)}>Project</Button>
                        {canPay && <Button size="small" onClick={() => navigate(`/crm/finance?clientId=${data._id}&projectId=${row.projectMongoId}`)}>Pay</Button>}
                      </Stack>
                    )}
                  >
                    {row.kind === 'OVERDUE' ? 'Overdue' : 'Upcoming'} · {row.projectId} · due {new Date(row.dueDate).toLocaleDateString()} · {money(row.outstanding, row.currency)}
                  </Alert>
                ))}
              </Stack>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Contacts</Typography>
            {!readOnly && <Button size="small" onClick={() => setContactOpen(true)}>Add contact</Button>}
          </Box>
          {(data.contacts || []).length === 0 ? <Typography color="text.secondary">No contacts yet.</Typography>
            : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Role</TableCell><TableCell>Email</TableCell><TableCell>Phone</TableCell><TableCell>Flags</TableCell></TableRow></TableHead>
                <TableBody>
                  {(data.contacts || []).map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>{row.contactName}</TableCell>
                      <TableCell>{row.designation || '—'}</TableCell>
                      <TableCell>{row.email || '—'}</TableCell>
                      <TableCell>{row.phone || '—'}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {row.isPrimary && <Chip size="small" label="Primary" />}
                          {row.isBillingContact && <Chip size="small" label="Billing" />}
                          {row.isTechnicalContact && <Chip size="small" label="Technical" />}
                          {row.isDecisionMaker && <Chip size="small" label="Decision maker" />}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Documents</Typography>
            {!readOnly && (
              <Button size="small" component="label">
                Upload
                <input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => e.target.files?.[0] && uploadDoc.mutate(e.target.files[0])} />
              </Button>
            )}
          </Box>
          {(data.documents || []).length === 0 ? <Typography color="text.secondary">No documents yet.</Typography>
            : (
              <Stack spacing={1}>
                {(data.documents || []).map((doc) => (
                  <Button key={doc._id} size="small" sx={{ justifyContent: 'flex-start' }} onClick={() => downloadBlob(`/crm/files/client/${data._id}/${doc._id}`, doc.documentName)}>
                    {doc.documentName} · {labelize(doc.documentType)}
                  </Button>
                ))}
              </Stack>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Notes & activity</Typography>
          {!readOnly && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              <TextField size="small" placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
              <Button variant="outlined" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Add note</Button>
            </Stack>
          )}
          {(data.followUps || []).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Follow-ups</Typography>
              <Stack spacing={1}>
                {(data.followUps || []).map((item) => (
                  <Typography key={item._id} variant="body2">
                    {labelize(item.followUpType)} · {new Date(item.nextFollowUpDate).toLocaleDateString()} · {item.followUpNote || 'No note'}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
          <Stack spacing={1.5} divider={<Divider />}>
            {(data.activities || []).map((activity) => (
              <Box key={activity._id}>
                <Typography fontWeight={650}>{activity.title}</Typography>
                <Typography variant="body2" color="text.secondary">{new Date(activity.occurredAt).toLocaleString()} · {activity.actor?.name || 'System'}</Typography>
                {activity.description && <Typography sx={{ mt: .5 }}>{activity.description}</Typography>}
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={followOpen} onClose={() => setFollowOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Schedule payment follow-up</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label="Project" value={followForm.projectId} onChange={(e) => setFollowForm({ ...followForm, projectId: e.target.value })} fullWidth>
              <MenuItem value="">Client-level</MenuItem>
              {(data.projects || []).map((row) => <MenuItem key={row._id} value={row._id}>{row.projectName}</MenuItem>)}
            </TextField>
            <TextField type="date" label="Next follow-up" InputLabelProps={{ shrink: true }} value={followForm.nextFollowUpDate} onChange={(e) => setFollowForm({ ...followForm, nextFollowUpDate: e.target.value })} fullWidth />
            <TextField label="Notes" value={followForm.followUpNote} onChange={(e) => setFollowForm({ ...followForm, followUpNote: e.target.value })} fullWidth multiline minRows={3} />
            {addFollow.isError && <Alert severity="error">{apiErrorMessage(addFollow.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFollowOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!followForm.nextFollowUpDate || addFollow.isPending} onClick={() => addFollow.mutate()}>Schedule</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={contactOpen} onClose={() => setContactOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add contact</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Name" value={contact.contactName} onChange={(e) => setContact({ ...contact, contactName: e.target.value })} fullWidth required />
            <TextField label="Designation" value={contact.designation} onChange={(e) => setContact({ ...contact, designation: e.target.value })} fullWidth />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} fullWidth />
              <TextField label="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} fullWidth />
            </Stack>
            {addContact.isError && <Alert severity="error">{apiErrorMessage(addContact.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!contact.contactName.trim() || addContact.isPending} onClick={() => addContact.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={projectOpen} onClose={() => setProjectOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Add project for this client</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">A unique Project ID is generated. This does not create another client record.</Alert>
            <TextField label="Project name" value={projectForm.projectName} onChange={(e) => setProjectForm({ ...projectForm, projectName: e.target.value })} fullWidth required />
            <TextField label="Description / scope" value={projectForm.projectDescription} onChange={(e) => setProjectForm({ ...projectForm, projectDescription: e.target.value })} fullWidth multiline minRows={3} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Type" value={projectForm.projectType} onChange={(e) => setProjectForm({ ...projectForm, projectType: e.target.value })} fullWidth>
                {PROJECT_TYPES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
              </TextField>
              <TextField select label="Status" value={projectForm.status} onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })} fullWidth>
                {PROJECT_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
              </TextField>
            </Stack>
            <Autocomplete multiple freeSolo options={TECH_STACK} value={projectForm.technologyStack} onChange={(_e, value) => setProjectForm({ ...projectForm, technologyStack: value })} renderInput={(params) => <TextField {...params} label="Technologies" />} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Contract / bid amount" type="number" value={projectForm.contractValue} onChange={(e) => setProjectForm({ ...projectForm, contractValue: e.target.value })} fullWidth />
              <TextField select label="Currency" value={projectForm.currency} onChange={(e) => setProjectForm({ ...projectForm, currency: e.target.value })} fullWidth>
                {CURRENCIES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Start date" InputLabelProps={{ shrink: true }} value={projectForm.estimatedStartDate} onChange={(e) => setProjectForm({ ...projectForm, estimatedStartDate: e.target.value })} fullWidth />
              <TextField type="date" label="Deadline" InputLabelProps={{ shrink: true }} value={projectForm.expectedEndDate} onChange={(e) => setProjectForm({ ...projectForm, expectedEndDate: e.target.value })} fullWidth />
              <TextField label="Duration" value={projectForm.estimatedDuration} onChange={(e) => setProjectForm({ ...projectForm, estimatedDuration: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Progress %" type="number" value={projectForm.progressPercent} onChange={(e) => setProjectForm({ ...projectForm, progressPercent: e.target.value })} fullWidth inputProps={{ min: 0, max: 100 }} />
              <TextField type="date" label="Next payment due" InputLabelProps={{ shrink: true }} value={projectForm.nextPaymentDueDate} onChange={(e) => setProjectForm({ ...projectForm, nextPaymentDueDate: e.target.value })} fullWidth />
            </Stack>
            <Autocomplete
              options={team.data || []}
              getOptionLabel={(user) => user.name ? `${user.name} (${user.email})` : ''}
              onChange={(_e, value) => setProjectForm({ ...projectForm, projectManager: value?.id || '' })}
              renderInput={(params) => <TextField {...params} label="Project manager" />}
            />
            <TextField label="Notes" value={projectForm.notes} onChange={(e) => setProjectForm({ ...projectForm, notes: e.target.value })} fullWidth multiline minRows={2} />
            {addProject.isError && <Alert severity="error">{apiErrorMessage(addProject.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!projectForm.projectName.trim() || addProject.isPending} onClick={() => addProject.mutate()}>Create project</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
