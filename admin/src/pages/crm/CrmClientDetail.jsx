import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { labelize } from '../../constants/crm';

export default function CrmClientDetail() {
  const { id } = useParams();
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState({ contactName: '', designation: '', email: '', phone: '', isPrimary: true });
  const readOnly = isViewAdmin || !can('crm:clients:write');

  const detail = useQuery({
    queryKey: ['crm-client', id],
    queryFn: () => api.get(`/crm/clients/${id}`).then((r) => r.data.data)
  });
  const addContact = useMutation({
    mutationFn: () => api.post(`/crm/clients/${id}/contacts`, contact),
    onSuccess: () => {
      setContactOpen(false);
      setContact({ contactName: '', designation: '', email: '', phone: '', isPrimary: true });
      client.invalidateQueries({ queryKey: ['crm-client', id] });
    }
  });
  const data = detail.data;

  if (detail.isLoading) return <Typography>Loading client…</Typography>;
  if (detail.isError || !data) return <Alert severity="error">Client not found.</Alert>;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Button size="small" onClick={() => navigate('/crm/clients')}>← Back to clients</Button>
          <Typography variant="h4" sx={{ mt: 1 }}>{data.clientName}</Typography>
          <Typography color="text.secondary">{data.clientId} · {data.companyName || 'No company'}</Typography>
        </Box>
        {can('crm:projects:write') && (
          <Button variant="contained" onClick={() => navigate(`/crm/projects?clientId=${data._id}`)}>Create project</Button>
        )}
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Email" value={data.companyEmail || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Phone" value={data.companyPhone || '—'} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Industry" value={data.industry || '—'} InputProps={{ readOnly: true }} fullWidth />
            </Stack>
            <TextField label="Address" value={[data.address, data.city, data.state, data.country].filter(Boolean).join(', ') || '—'} InputProps={{ readOnly: true }} fullWidth />
            {data.sourceLeadId && (
              <Alert severity="info" action={<Button size="small" onClick={() => navigate(`/crm/leads/${data.sourceLeadId._id || data.sourceLeadId}`)}>Open lead</Button>}>
                Created from lead {data.sourceLeadId.leadId || ''} — original lead history remains intact.
              </Alert>
            )}
          </Stack>
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
          <Typography variant="h6" sx={{ mb: 2 }}>Projects</Typography>
          {(data.projects || []).length === 0 ? <Typography color="text.secondary">No projects yet.</Typography>
            : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Project</TableCell><TableCell>Type</TableCell><TableCell>Status</TableCell><TableCell align="right">Open</TableCell></TableRow></TableHead>
                <TableBody>
                  {(data.projects || []).map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>
                        <Typography fontWeight={650}>{row.projectName}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.projectId}</Typography>
                      </TableCell>
                      <TableCell>{labelize(row.projectType) || '—'}</TableCell>
                      <TableCell><Chip size="small" label={labelize(row.status)} /></TableCell>
                      <TableCell align="right"><Button size="small" onClick={() => navigate(`/crm/projects/${row._id}`)}>View</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Activity history</Typography>
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
    </Stack>
  );
}
