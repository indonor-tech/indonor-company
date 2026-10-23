import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FOLLOW_UP_TYPES, SALES_PIPELINE_STATUSES, emptyLead, labelize, money } from '../../constants/crm';
import LeadFormFields, { leadPayload } from './LeadFormFields';

function dateInput(value) {
  return value ? String(value).slice(0, 10) : '';
}

export default function CrmLeadDetail() {
  const { id } = useParams();
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [note, setNote] = useState('');
  const [callNote, setCallNote] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(emptyLead());
  const [followForm, setFollowForm] = useState({
    nextFollowUpDate: '', nextFollowUpTime: '11:30', followUpType: 'CALL', followUpNote: '', reminderPreference: '30_MINUTES_BEFORE'
  });
  const readOnly = isViewAdmin || !can('crm:leads:write');

  const leadQuery = useQuery({
    queryKey: ['crm-lead', id],
    queryFn: () => api.get(`/crm/leads/${id}`).then((r) => r.data.data)
  });
  const lead = leadQuery.data;

  const saveStatus = useMutation({
    mutationFn: (status) => api.patch(`/crm/leads/${id}`, { status }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['crm-lead', id] })
  });
  const addNote = useMutation({
    mutationFn: () => api.post(`/crm/leads/${id}/notes`, { note }),
    onSuccess: () => { setNote(''); client.invalidateQueries({ queryKey: ['crm-lead', id] }); }
  });
  const addCall = useMutation({
    mutationFn: () => api.post(`/crm/leads/${id}/calls`, { notes: callNote }),
    onSuccess: () => { setCallNote(''); client.invalidateQueries({ queryKey: ['crm-lead', id] }); }
  });
  const schedule = useMutation({
    mutationFn: () => api.post(`/crm/leads/${id}/follow-ups`, followForm),
    onSuccess: () => {
      setFollowOpen(false);
      client.invalidateQueries({ queryKey: ['crm-lead', id] });
      client.invalidateQueries({ queryKey: ['crm-lead-dashboard'] });
    }
  });
  const convert = useMutation({
    mutationFn: () => api.post(`/crm/leads/${id}/convert`, { conversionNotes: note || '' }),
    onSuccess: (response) => {
      setConvertOpen(false);
      client.invalidateQueries({ queryKey: ['crm-lead', id] });
      navigate(`/crm/clients/${response.data.data.client._id}`);
    }
  });
  const saveLead = useMutation({
    mutationFn: () => api.patch(`/crm/leads/${id}`, leadPayload(form)),
    onSuccess: () => {
      setEditOpen(false);
      client.invalidateQueries({ queryKey: ['crm-lead', id] });
    }
  });
  const upload = useMutation({
    mutationFn: (file) => {
      const data = new FormData();
      data.append('files', file);
      return api.post(`/crm/leads/${id}/attachments`, data);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['crm-lead', id] })
  });

  if (leadQuery.isLoading) return <Typography>Loading lead…</Typography>;
  if (leadQuery.isError || !lead) return <Alert severity="error">Lead not found.</Alert>;

  const openEdit = () => {
    setForm({
      ...emptyLead(),
      ...lead,
      expectedStartDate: dateInput(lead.expectedStartDate),
      deadline: dateInput(lead.deadline),
      assignedTo: lead.assignedTo?._id || lead.assignedTo || '',
      quotedAmount: lead.quotedAmount ?? lead.expectedDealValue ?? '',
      estimatedBudget: lead.estimatedBudget ?? '',
      requiredTechnologies: lead.requiredTechnologies || []
    });
    setEditOpen(true);
  };

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Button size="small" onClick={() => navigate('/crm/leads')}>← Back to leads</Button>
          <Typography variant="h4" sx={{ mt: 1 }}>{lead.leadName}</Typography>
          <Typography color="text.secondary">{lead.leadId} · {lead.companyName || 'No company'}</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={labelize(lead.status)} color={lead.status === 'WON' || lead.status === 'CONVERTED' ? 'success' : 'default'} />
          {!readOnly && <Button variant="outlined" onClick={openEdit}>Edit</Button>}
          {!readOnly && !lead.clientId && can('crm:leads:convert') && (
            <Button variant="contained" onClick={() => setConvertOpen(true)}>Convert to client</Button>
          )}
          {!readOnly && <Button variant="outlined" onClick={() => setFollowOpen(true)}>Schedule follow-up</Button>}
        </Stack>
      </Box>

      {lead.overdueAlert && <Alert severity="error">This lead has an overdue follow-up or outstanding payment.</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Contact" value={lead.contactPersonName || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Designation" value={lead.designation || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Email" value={lead.email || '—'} InputProps={{ readOnly: true }} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Phone" value={lead.phone || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="WhatsApp" value={lead.whatsappNumber || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Country" value={lead.country || '—'} InputProps={{ readOnly: true }} fullWidth />
            </Stack>
            <TextField label="Address" value={[lead.address, lead.city, lead.state, lead.country].filter(Boolean).join(', ') || '—'} InputProps={{ readOnly: true }} fullWidth />
            <TextField label="Project description" value={lead.projectDescription || '—'} InputProps={{ readOnly: true }} fullWidth multiline minRows={2} />
            <TextField label="Business requirements" value={lead.businessRequirements || lead.requirementDescription || '—'} InputProps={{ readOnly: true }} fullWidth multiline minRows={2} />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Quoted amount" value={money(lead.quotedAmount, lead.currency)} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Technologies" value={(lead.requiredTechnologies || []).join(', ') || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Owner" value={lead.assignedTo?.name || '—'} InputProps={{ readOnly: true }} fullWidth />
            </Stack>
            {!readOnly && (
              <TextField select label="Status" value={lead.status === 'CONVERTED' ? 'WON' : lead.status} onChange={(e) => saveStatus.mutate(e.target.value)} disabled={lead.status === 'WON' || lead.status === 'CONVERTED' || saveStatus.isPending} sx={{ maxWidth: 280 }}>
                {SALES_PIPELINE_STATUSES.map((item) => <MenuItem key={item} value={item} disabled={item === 'WON'}>{labelize(item)}</MenuItem>)}
              </TextField>
            )}
            {lead.clientId && (
              <Alert severity="success" action={<Button size="small" onClick={() => navigate(`/crm/clients/${lead.clientId._id || lead.clientId}`)}>Open client</Button>}>
                Converted to {lead.clientId.clientId || 'client'} on {lead.convertedDate ? new Date(lead.convertedDate).toLocaleString() : '—'} — original Lead ID {lead.leadId} is preserved.
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Attachments</Typography>
            {!readOnly && (
              <Button size="small" component="label">
                Upload
                <input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
              </Button>
            )}
          </Box>
          {(lead.attachments || []).length === 0 ? <Typography color="text.secondary">No files yet.</Typography>
            : <Stack spacing={1}>{(lead.attachments || []).map((file) => (
              <Button key={file._id} size="small" sx={{ justifyContent: 'flex-start' }} onClick={() => {
                api.get(`/crm/files/lead/${lead._id}/${file._id}`, { responseType: 'blob' }).then((response) => {
                  const url = URL.createObjectURL(response.data);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = file.name || 'attachment';
                  link.click();
                  URL.revokeObjectURL(url);
                });
              }}>{file.name}</Button>
            ))}</Stack>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Follow-ups</Typography>
          {(lead.followUps || []).length === 0 ? <Typography color="text.secondary">No follow-ups scheduled.</Typography>
            : <Stack spacing={1.5}>{(lead.followUps || []).map((item) => (
              <Box key={item._id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography fontWeight={650}>{labelize(item.followUpType)} · {new Date(item.nextFollowUpDate).toLocaleDateString()} {item.nextFollowUpTime}</Typography>
                <Typography variant="body2" color="text.secondary">{item.followUpNote || 'No note'} · {labelize(item.status)}</Typography>
              </Box>
            ))}</Stack>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Activity & call history</Typography>
          {!readOnly && (
            <Stack spacing={1} sx={{ mb: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField size="small" placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
                <Button variant="outlined" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Add note</Button>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField size="small" placeholder="Log a call or meeting…" value={callNote} onChange={(e) => setCallNote(e.target.value)} fullWidth />
                <Button variant="outlined" disabled={!callNote.trim() || addCall.isPending} onClick={() => addCall.mutate()}>Log call</Button>
              </Stack>
            </Stack>
          )}
          <Stack spacing={1.5} divider={<Divider />}>
            {(lead.activities || []).map((activity) => (
              <Box key={activity._id}>
                <Typography fontWeight={650}>{activity.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(activity.occurredAt).toLocaleString()} · {activity.actor?.name || 'System'}
                </Typography>
                {activity.description && <Typography sx={{ mt: .5 }}>{activity.description}</Typography>}
                {activity.result && <Typography variant="body2">Result: {activity.result}</Typography>}
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Edit lead</DialogTitle>
        <DialogContent dividers>
          <LeadFormFields form={form} setForm={setForm} showFollowUp={false} />
          {saveLead.isError && <Alert severity="error" sx={{ mt: 2 }}>{apiErrorMessage(saveLead.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.leadName?.trim() || saveLead.isPending} onClick={() => saveLead.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={followOpen} onClose={() => setFollowOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Schedule follow-up</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField type="date" label="Date" InputLabelProps={{ shrink: true }} value={followForm.nextFollowUpDate} onChange={(e) => setFollowForm({ ...followForm, nextFollowUpDate: e.target.value })} fullWidth />
            <TextField label="Time" value={followForm.nextFollowUpTime} onChange={(e) => setFollowForm({ ...followForm, nextFollowUpTime: e.target.value })} fullWidth placeholder="11:30" />
            <TextField select label="Type" value={followForm.followUpType} onChange={(e) => setFollowForm({ ...followForm, followUpType: e.target.value })} fullWidth>
              {FOLLOW_UP_TYPES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            <TextField label="Note" value={followForm.followUpNote} onChange={(e) => setFollowForm({ ...followForm, followUpNote: e.target.value })} fullWidth multiline minRows={3} />
            {schedule.isError && <Alert severity="error">{apiErrorMessage(schedule.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFollowOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!followForm.nextFollowUpDate || schedule.isPending} onClick={() => schedule.mutate()}>Schedule</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={convertOpen} onClose={() => setConvertOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Convert lead to client</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ mb: 2 }}>Create a client from this lead without re-entering data. The original Lead ID is preserved and a unique Client ID is generated. A first project is created from the opportunity details.</Typography>
          {convert.isError && <Alert severity="error">{apiErrorMessage(convert.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConvertOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={convert.isPending} onClick={() => convert.mutate()}>Convert</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
