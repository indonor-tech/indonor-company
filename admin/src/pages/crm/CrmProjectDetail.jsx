import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Slider, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ADJUSTMENT_TYPES, DOCUMENT_TYPES, ENGAGEMENT_TYPES, PARTNER_ROLES, SHARE_BASES, PROJECT_MEMBER_ROLES, PROJECT_STATUSES, labelize, money } from '../../constants/crm';

export default function CrmProjectDetail() {
  const { id } = useParams();
  const { can, is, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [memberOpen, setMemberOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ userIds: [], role: 'DEVELOPER' });
  const [milestoneForm, setMilestoneForm] = useState({ milestoneName: '', dueDate: '', description: '' });
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [docType, setDocType] = useState('OTHER');
  const [adjustmentForm, setAdjustmentForm] = useState({ type: 'EXPENSE', amount: '', notes: '' });
  const [partnerForm, setPartnerForm] = useState({
    engagementType: 'CLIENT', shareBasis: 'GROSS_CONTRACT', companySharePercent: 100,
    allowUnevenPercent: false, referrerName: '', referrerCompany: '', referrerEmail: '', referrerPhone: '',
    referralCommission: '', referralPercent: '', referralNotes: '', partnershipNotes: '',
    partners: [{ name: '', companyName: '', email: '', phone: '', role: 'PARTNER', sharePercent: '', fixedCommission: '' }]
  });
  const superAdmin = is('SUPER_ADMIN') || can('crm:finance:read');
  const readOnly = isViewAdmin || !can('crm:projects:write');

  const detail = useQuery({
    queryKey: ['crm-project', id],
    queryFn: () => api.get(`/crm/projects/${id}`).then((r) => r.data.data)
  });
  const users = useQuery({
    queryKey: ['crm-directory', 'team'],
    queryFn: () => api.get('/crm/directory', { params: { kind: 'team' } }).then((r) => r.data.data),
    enabled: memberOpen
  });
  const payments = useQuery({
    queryKey: ['crm-payments', 'project', id],
    queryFn: () => api.get('/crm/finance/payments', { params: { projectId: id, limit: 100 } }).then((r) => r.data.data),
    enabled: superAdmin
  });
  const uploadDoc = useMutation({
    mutationFn: (file) => {
      const data = new FormData();
      data.append('file', file);
      data.append('documentName', file.name);
      data.append('documentType', docType);
      return api.post(`/crm/projects/${id}/documents`, data);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['crm-project', id] })
  });
  const deleteDoc = useMutation({
    mutationFn: (documentId) => api.delete(`/crm/projects/${id}/documents/${documentId}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['crm-project', id] })
  });
  const savePartnership = useMutation({
    mutationFn: () => api.put(`/crm/projects/${id}/partnership`, {
      ...partnerForm,
      companySharePercent: Number(partnerForm.companySharePercent || 0),
      referralCommission: Number(partnerForm.referralCommission || 0),
      referralPercent: Number(partnerForm.referralPercent || 0),
      partners: (partnerForm.partners || []).filter((row) => row.name.trim()).map((row) => ({
        ...row,
        sharePercent: Number(row.sharePercent || 0),
        fixedCommission: Number(row.fixedCommission || 0)
      }))
    }),
    onSuccess: () => {
      setPartnerOpen(false);
      client.invalidateQueries({ queryKey: ['crm-project', id] });
    }
  });
  const addAdjustment = useMutation({
    mutationFn: () => api.post(`/crm/projects/${id}/adjustments`, { ...adjustmentForm, amount: Number(adjustmentForm.amount || 0) }),
    onSuccess: () => {
      setAdjustmentForm({ type: 'EXPENSE', amount: '', notes: '' });
      client.invalidateQueries({ queryKey: ['crm-project', id] });
    }
  });
  const addMember = useMutation({
    mutationFn: () => api.post(`/crm/projects/${id}/members/bulk`, {
      members: (memberForm.userIds || []).map((userId) => ({ userId, role: memberForm.role }))
    }),
    onSuccess: () => {
      setMemberOpen(false);
      client.invalidateQueries({ queryKey: ['crm-project', id] });
    }
  });
  const addMilestone = useMutation({
    mutationFn: () => api.post(`/crm/projects/${id}/milestones`, milestoneForm),
    onSuccess: () => {
      setMilestoneOpen(false);
      setMilestoneForm({ milestoneName: '', dueDate: '', description: '' });
      client.invalidateQueries({ queryKey: ['crm-project', id] });
    }
  });
  const saveStatus = useMutation({
    mutationFn: (status) => api.patch(`/crm/projects/${id}`, { status }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['crm-project', id] })
  });
  const saveProgress = useMutation({
    mutationFn: (progressPercent) => api.patch(`/crm/projects/${id}`, { progressPercent }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['crm-project', id] })
  });

  const data = detail.data;
  if (detail.isLoading) return <Typography>Loading project…</Typography>;
  if (detail.isError || !data) return <Alert severity="error">Project not found.</Alert>;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Button size="small" onClick={() => navigate('/crm/projects')}>← Back to projects</Button>
          <Typography variant="h4" sx={{ mt: 1 }}>{data.projectName}</Typography>
          <Typography color="text.secondary">{data.projectId} · {data.clientId?.clientName || 'Client'}</Typography>
        </Box>
        <Chip label={data.isOverdue ? `${labelize(data.status)} · overdue` : labelize(data.status)} color={data.isOverdue ? 'error' : 'default'} />
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField label="Description" value={data.projectDescription || '—'} InputProps={{ readOnly: true }} fullWidth multiline minRows={2} />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Type" value={labelize(data.projectType) || '—'} InputProps={{ readOnly: true }} fullWidth />
              {!readOnly ? (
                <TextField select label="Status" value={data.status} onChange={(e) => saveStatus.mutate(e.target.value)} fullWidth>
                  {PROJECT_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
                </TextField>
              ) : <TextField label="Status" value={labelize(data.status)} InputProps={{ readOnly: true }} fullWidth />}
            </Stack>
            {!readOnly && (
              <Box>
                <Typography variant="body2" color="text.secondary">Progress ({data.progressPercent ?? 0}%)</Typography>
                <Slider value={data.progressPercent ?? 0} min={0} max={100} step={5} onChangeCommitted={(_e, value) => saveProgress.mutate(value)} />
              </Box>
            )}
            {superAdmin && data.ledger && (
              <Alert severity="info">
                Contract: {money(data.ledger.contractValue, data.currency)} · Received: {money(data.ledger.confirmedPayments, data.currency)} · Outstanding: {money(data.ledger.outstanding, data.currency)}
              </Alert>
            )}
            {superAdmin && !data.ledger && (
              <Alert severity="info">
                Contract value: {money(data.contractValue, data.currency)} · Final amount: {money(data.finalAmount, data.currency)}
              </Alert>
            )}
            {data.engagementType && <TextField label="Project source" value={labelize(data.engagementType)} InputProps={{ readOnly: true }} sx={{ maxWidth: 280 }} />}
            {data.isOverdue && <Alert severity="error">This project is past its deadline.</Alert>}
            {data.estimatedDuration && <TextField label="Duration" value={data.estimatedDuration} InputProps={{ readOnly: true }} fullWidth />}
            {data.clientId && (
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button size="small" onClick={() => navigate(`/crm/clients/${data.clientId._id || data.clientId}`)}>Open client profile</Button>
                {superAdmin && (
                  <Button size="small" onClick={() => navigate(`/crm/finance?clientId=${data.clientId._id || data.clientId}&projectId=${data._id}`)}>Payments for this project</Button>
                )}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Project team</Typography>
            {can('crm:projects:assign') && <Button size="small" onClick={() => setMemberOpen(true)}>Add member</Button>}
          </Box>
          {(data.members || []).length === 0 ? <Typography color="text.secondary">No team members assigned.</Typography>
            : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell></TableRow></TableHead>
                <TableBody>
                  {(data.members || []).map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>{row.userId?.name || '—'}</TableCell>
                      <TableCell>{row.userId?.email || '—'}</TableCell>
                      <TableCell>{labelize(row.role)}</TableCell>
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
            <Typography variant="h6">Milestones</Typography>
            {!readOnly && <Button size="small" onClick={() => setMilestoneOpen(true)}>Add milestone</Button>}
          </Box>
          {(data.milestones || []).length === 0 ? <Typography color="text.secondary">No milestones yet.</Typography>
            : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Due</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                <TableBody>
                  {(data.milestones || []).map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>{row.milestoneName}</TableCell>
                      <TableCell>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}</TableCell>
                      <TableCell><Chip size="small" label={labelize(row.status)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      {superAdmin && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h6">Partnership & settlement</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => {
                  api.get(`/crm/projects/${id}/export`, { params: { format: 'xlsx' }, responseType: 'blob' }).then((response) => {
                    const url = URL.createObjectURL(response.data);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${data.projectId}-settlement.xlsx`;
                    link.click();
                    URL.revokeObjectURL(url);
                  });
                }}>Export Excel</Button>
                <Button size="small" variant="contained" onClick={() => {
                  setPartnerForm({
                    engagementType: data.engagementType || 'CLIENT',
                    shareBasis: data.shareBasis || 'GROSS_CONTRACT',
                    companySharePercent: data.companySharePercent ?? 100,
                    allowUnevenPercent: Boolean(data.allowUnevenPercent),
                    referrerName: data.referrerName || '',
                    referrerCompany: data.referrerCompany || '',
                    referrerEmail: data.referrerEmail || '',
                    referrerPhone: data.referrerPhone || '',
                    referralCommission: data.referralCommission || '',
                    referralPercent: data.referralPercent || '',
                    referralNotes: data.referralNotes || '',
                    partnershipNotes: data.partnershipNotes || '',
                    partners: (data.partners || []).length
                      ? data.partners.map((row) => ({
                        _id: row._id, name: row.name, companyName: row.companyName || '', email: row.email || '',
                        phone: row.phone || '', role: row.role || 'PARTNER', sharePercent: row.sharePercent || '',
                        fixedCommission: row.fixedCommission || ''
                      }))
                      : [{ name: '', companyName: '', email: '', phone: '', role: 'PARTNER', sharePercent: '', fixedCommission: '' }]
                  });
                  setPartnerOpen(true);
                }}>Edit agreement</Button>
              </Stack>
            </Box>
            {data.settlement ? (
              <Stack spacing={2}>
                <Alert severity="info">
                  Contract {money(data.settlement.contractValue, data.currency)} · Basis {labelize(data.settlement.shareBasis)} {money(data.settlement.basisAmount, data.currency)}
                  · Company {data.settlement.company.sharePercent}% = {money(data.settlement.company.entitlement, data.currency)}
                  · Received toward my share {money(data.settlement.company.received, data.currency)}
                  · Remaining {money(data.settlement.company.remaining, data.currency)}
                </Alert>
                <Typography variant="body2" color="text.secondary">Invoices are not treated as payments. Imported PDFs stay documents until a confirmed receipt is recorded.</Typography>
                <Alert severity="success">
                  My share invoiced {money(data.settlement.company.invoiced, data.currency)} (not a payment)
                  · Received {money(data.settlement.company.received, data.currency)}
                  · Remaining {money(data.settlement.company.remaining, data.currency)}
                </Alert>
                {(data.settlement.partners || []).length > 0 && (
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Partner</TableCell><TableCell>%</TableCell><TableCell>Entitlement</TableCell><TableCell>Invoiced</TableCell><TableCell>Paid</TableCell><TableCell>Outstanding</TableCell></TableRow></TableHead>
                    <TableBody>
                      {data.settlement.partners.map((row) => (
                        <TableRow key={row.partnerId}>
                          <TableCell>{row.name}{row.companyName ? ` · ${row.companyName}` : ''}</TableCell>
                          <TableCell>{row.sharePercent}%</TableCell>
                          <TableCell>{money(row.entitlement, data.currency)}</TableCell>
                          <TableCell>{money(row.invoiced, data.currency)}</TableCell>
                          <TableCell>{money(row.paid, data.currency)}</TableCell>
                          <TableCell>{money(row.outstanding, data.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {data.settlement.referral?.entitlement > 0 && (
                  <Alert severity="warning">Referral due {money(data.settlement.referral.outstanding, data.currency)} ({data.settlement.referral.name || data.referrerName || 'referrer'})</Alert>
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField select size="small" label="Adjustment" value={adjustmentForm.type} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, type: e.target.value })} sx={{ minWidth: 160 }}>
                    {ADJUSTMENT_TYPES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
                  </TextField>
                  <TextField size="small" type="number" label="Amount" value={adjustmentForm.amount} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })} />
                  <TextField size="small" label="Notes" value={adjustmentForm.notes} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })} />
                  <Button size="small" disabled={!adjustmentForm.amount || addAdjustment.isPending} onClick={() => addAdjustment.mutate()}>Add</Button>
                </Stack>
                {addAdjustment.isError && <Alert severity="error">{apiErrorMessage(addAdjustment.error)}</Alert>}
                {(data.agreements || []).length > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Agreement history: {(data.agreements || []).map((row) => `v${row.version}`).join(' · ')}
                  </Typography>
                )}
              </Stack>
            ) : <Typography color="text.secondary">No partnership terms yet.</Typography>}
          </CardContent>
        </Card>
      )}

      {superAdmin && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">Payments for this project</Typography>
              <Button size="small" onClick={() => navigate(`/crm/finance?clientId=${data.clientId?._id || data.clientId}&projectId=${data._id}`)}>Open ledger</Button>
            </Box>
            {(payments.data || []).length === 0 ? <Typography color="text.secondary">No payments recorded against this project.</Typography>
              : (
                <Table size="small">
                  <TableHead><TableRow><TableCell>Payment</TableCell><TableCell>Date</TableCell><TableCell>Amount</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                  <TableBody>
                    {(payments.data || []).map((row) => (
                      <TableRow key={row._id}>
                        <TableCell>{row.paymentId}{row.installmentNumber ? ` · #${row.installmentNumber}` : ''}</TableCell>
                        <TableCell>{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>{money(row.amount, row.currency)}</TableCell>
                        <TableCell><Chip size="small" label={labelize(row.status || 'CONFIRMED')} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6">Documents & agreements</Typography>
            {!readOnly && (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField select size="small" label="Category" value={docType} onChange={(e) => setDocType(e.target.value)} sx={{ minWidth: 180 }}>
                  {DOCUMENT_TYPES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
                </TextField>
                <Button size="small" component="label">
                  Upload
                  <input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv" onChange={(e) => e.target.files?.[0] && uploadDoc.mutate(e.target.files[0])} />
                </Button>
              </Stack>
            )}
          </Box>
          {(data.documents || []).length === 0 ? <Typography color="text.secondary">No project files yet.</Typography>
            : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Category</TableCell><TableCell>Version</TableCell><TableCell>Uploaded</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                <TableBody>
                  {(data.documents || []).map((doc) => (
                    <TableRow key={doc._id}>
                      <TableCell>{doc.documentName}</TableCell>
                      <TableCell>{labelize(doc.documentType)}</TableCell>
                      <TableCell>v{doc.versionNumber || doc.version || 1}</TableCell>
                      <TableCell>{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '—'}</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => {
                          api.get(`/crm/files/project/${data._id}/${doc._id}`, { responseType: 'blob' }).then((response) => {
                            const url = URL.createObjectURL(response.data);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = doc.documentName || 'document';
                            link.click();
                            URL.revokeObjectURL(url);
                          });
                        }}>Download</Button>
                        {can('crm:projects:write') && <Button size="small" color="error" onClick={() => deleteDoc.mutate(doc._id)}>Delete</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Dialog open={partnerOpen} onClose={() => setPartnerOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Partnership agreement</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Engagement" value={partnerForm.engagementType} onChange={(e) => setPartnerForm({ ...partnerForm, engagementType: e.target.value })} fullWidth>
                {ENGAGEMENT_TYPES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
              </TextField>
              <TextField select label="Share basis" value={partnerForm.shareBasis} onChange={(e) => setPartnerForm({ ...partnerForm, shareBasis: e.target.value })} fullWidth>
                {SHARE_BASES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
              </TextField>
              <TextField type="number" label="My company %" value={partnerForm.companySharePercent} onChange={(e) => setPartnerForm({ ...partnerForm, companySharePercent: e.target.value })} fullWidth />
            </Stack>
            <FormControlLabel
              control={<Checkbox checked={Boolean(partnerForm.allowUnevenPercent)} onChange={(e) => setPartnerForm({ ...partnerForm, allowUnevenPercent: e.target.checked })} />}
              label="Authorize a total other than 100%"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Referrer name" value={partnerForm.referrerName} onChange={(e) => setPartnerForm({ ...partnerForm, referrerName: e.target.value })} fullWidth />
              <TextField label="Referrer company" value={partnerForm.referrerCompany} onChange={(e) => setPartnerForm({ ...partnerForm, referrerCompany: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Referral %" value={partnerForm.referralPercent} onChange={(e) => setPartnerForm({ ...partnerForm, referralPercent: e.target.value })} fullWidth />
              <TextField label="Fixed referral fee" value={partnerForm.referralCommission} onChange={(e) => setPartnerForm({ ...partnerForm, referralCommission: e.target.value })} fullWidth />
            </Stack>
            {(partnerForm.partners || []).map((row, index) => (
              <Stack key={index} spacing={1} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField label="Partner name" value={row.name} onChange={(e) => {
                    const partners = [...partnerForm.partners];
                    partners[index] = { ...row, name: e.target.value };
                    setPartnerForm({ ...partnerForm, partners });
                  }} fullWidth />
                  <TextField label="Company" value={row.companyName} onChange={(e) => {
                    const partners = [...partnerForm.partners];
                    partners[index] = { ...row, companyName: e.target.value };
                    setPartnerForm({ ...partnerForm, partners });
                  }} fullWidth />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField select label="Role" value={row.role} onChange={(e) => {
                    const partners = [...partnerForm.partners];
                    partners[index] = { ...row, role: e.target.value };
                    setPartnerForm({ ...partnerForm, partners });
                  }} fullWidth>
                    {PARTNER_ROLES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
                  </TextField>
                  <TextField type="number" label="Share %" value={row.sharePercent} onChange={(e) => {
                    const partners = [...partnerForm.partners];
                    partners[index] = { ...row, sharePercent: e.target.value };
                    setPartnerForm({ ...partnerForm, partners });
                  }} fullWidth />
                  <TextField type="number" label="Fixed fee" value={row.fixedCommission} onChange={(e) => {
                    const partners = [...partnerForm.partners];
                    partners[index] = { ...row, fixedCommission: e.target.value };
                    setPartnerForm({ ...partnerForm, partners });
                  }} fullWidth />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField label="Email" value={row.email} onChange={(e) => {
                    const partners = [...partnerForm.partners];
                    partners[index] = { ...row, email: e.target.value };
                    setPartnerForm({ ...partnerForm, partners });
                  }} fullWidth />
                  <TextField label="Phone" value={row.phone} onChange={(e) => {
                    const partners = [...partnerForm.partners];
                    partners[index] = { ...row, phone: e.target.value };
                    setPartnerForm({ ...partnerForm, partners });
                  }} fullWidth />
                </Stack>
              </Stack>
            ))}
            <Button size="small" onClick={() => setPartnerForm({
              ...partnerForm,
              partners: [...partnerForm.partners, { name: '', companyName: '', email: '', phone: '', role: 'PARTNER', sharePercent: '', fixedCommission: '' }]
            })}>Add partner</Button>
            <TextField label="Agreement notes" value={partnerForm.partnershipNotes} onChange={(e) => setPartnerForm({ ...partnerForm, partnershipNotes: e.target.value })} fullWidth multiline minRows={2} />
            {savePartnership.isError && <Alert severity="error">{apiErrorMessage(savePartnership.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPartnerOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={savePartnership.isPending} onClick={() => savePartnership.mutate()}>Save agreement</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={memberOpen} onClose={() => setMemberOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add team member</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Autocomplete
              multiple
              options={users.data || []}
              getOptionLabel={(user) => user.name ? `${user.name} (${user.email})` : ''}
              onChange={(_e, value) => setMemberForm({ ...memberForm, userIds: value.map((user) => user.id) })}
              renderInput={(params) => <TextField {...params} label="Developers / team" />}
            />
            <TextField select label="Role" value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} fullWidth>
              {PROJECT_MEMBER_ROLES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            {addMember.isError && <Alert severity="error">{apiErrorMessage(addMember.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemberOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!memberForm.userIds?.length || addMember.isPending} onClick={() => addMember.mutate()}>Add</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={milestoneOpen} onClose={() => setMilestoneOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add milestone</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Milestone name" value={milestoneForm.milestoneName} onChange={(e) => setMilestoneForm({ ...milestoneForm, milestoneName: e.target.value })} fullWidth />
            <TextField type="date" label="Due date" InputLabelProps={{ shrink: true }} value={milestoneForm.dueDate} onChange={(e) => setMilestoneForm({ ...milestoneForm, dueDate: e.target.value })} fullWidth />
            <TextField label="Description" value={milestoneForm.description} onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })} fullWidth multiline minRows={2} />
            {addMilestone.isError && <Alert severity="error">{apiErrorMessage(addMilestone.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMilestoneOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!milestoneForm.milestoneName.trim() || addMilestone.isPending} onClick={() => addMilestone.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
