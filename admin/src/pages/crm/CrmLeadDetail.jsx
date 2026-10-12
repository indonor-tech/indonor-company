import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FOLLOW_UP_TYPES, SALES_PIPELINE_STATUSES, labelize } from '../../constants/crm';

export default function CrmLeadDetail() {
  const { id } = useParams();
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [note, setNote] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
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
  const schedule = useMutation({
    mutationFn: () => {
      const reminderDateTime = followForm.nextFollowUpDate
        ? new Date(`${followForm.nextFollowUpDate}T${followForm.nextFollowUpTime || '09:00'}:00`)
        : null;
      if (reminderDateTime) reminderDateTime.setMinutes(reminderDateTime.getMinutes() - 30);
      return api.post(`/crm/leads/${id}/follow-ups`, {
        ...followForm,
        reminderDateTime: reminderDateTime?.toISOString() || null
      });
    },
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

  if (leadQuery.isLoading) return <Typography>Loading lead…</Typography>;
  if (leadQuery.isError || !lead) return <Alert severity="error">Lead not found.</Alert>;

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
          {!readOnly && lead.status !== 'WON' && lead.status !== 'CONVERTED' && can('crm:leads:convert') && (
            <Button variant="contained" onClick={() => setConvertOpen(true)}>Convert to client</Button>
          )}
          {!readOnly && <Button variant="outlined" onClick={() => setFollowOpen(true)}>Schedule follow-up</Button>}
        </Stack>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Contact" value={lead.contactPersonName || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Email" value={lead.email || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Phone" value={lead.phone || '—'} InputProps={{ readOnly: true }} fullWidth />
            </Stack>
            <TextField label="Requirement" value={lead.requirementDescription || '—'} InputProps={{ readOnly: true }} fullWidth multiline minRows={2} />
            {!readOnly && (
              <TextField select label="Status" value={lead.status === 'CONVERTED' ? 'WON' : lead.status} onChange={(e) => saveStatus.mutate(e.target.value)} disabled={lead.status === 'WON' || lead.status === 'CONVERTED' || saveStatus.isPending} sx={{ maxWidth: 280 }}>
                {SALES_PIPELINE_STATUSES.map((item) => <MenuItem key={item} value={item} disabled={item === 'WON'}>{labelize(item)}</MenuItem>)}
              </TextField>
            )}
            {lead.clientId && (
              <Alert severity="success" action={<Button size="small" onClick={() => navigate(`/crm/clients/${lead.clientId._id || lead.clientId}`)}>Open client</Button>}>
                Converted to {lead.clientId.clientId || 'client'} — lead history is preserved.
              </Alert>
            )}
          </Stack>
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
          <Typography variant="h6" sx={{ mb: 2 }}>Activity timeline</Typography>
          {!readOnly && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              <TextField size="small" placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
              <Button variant="outlined" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Add note</Button>
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
          <Typography sx={{ mb: 2 }}>Create a client from this lead. The original lead and its history will remain available.</Typography>
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
