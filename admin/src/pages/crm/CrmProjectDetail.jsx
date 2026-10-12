import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PROJECT_MEMBER_ROLES, PROJECT_STATUSES, labelize, money } from '../../constants/crm';

export default function CrmProjectDetail() {
  const { id } = useParams();
  const { can, is, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [memberOpen, setMemberOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ userId: '', role: 'DEVELOPER' });
  const [milestoneForm, setMilestoneForm] = useState({ milestoneName: '', dueDate: '', description: '' });
  const superAdmin = is('SUPER_ADMIN');
  const readOnly = isViewAdmin || !can('crm:projects:write');

  const detail = useQuery({
    queryKey: ['crm-project', id],
    queryFn: () => api.get(`/crm/projects/${id}`).then((r) => r.data.data)
  });
  const users = useQuery({
    queryKey: ['crm-users', 'project-members'],
    queryFn: () => api.get('/users').then((r) => r.data.data),
    enabled: memberOpen
  });
  const addMember = useMutation({
    mutationFn: () => api.post(`/crm/projects/${id}/members`, memberForm),
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
        <Chip label={labelize(data.status)} />
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
            {superAdmin && (
              <Alert severity="info">
                Contract value: {money(data.contractValue, data.currency)} · Final amount: {money(data.finalAmount, data.currency)}
              </Alert>
            )}
            {data.clientId && (
              <Button size="small" onClick={() => navigate(`/crm/clients/${data.clientId._id || data.clientId}`)}>Open client profile</Button>
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

      <Dialog open={memberOpen} onClose={() => setMemberOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add team member</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label="User" value={memberForm.userId} onChange={(e) => setMemberForm({ ...memberForm, userId: e.target.value })} fullWidth>
              {(users.data || []).map((user) => <MenuItem key={user.id} value={user.id}>{user.name} ({user.email})</MenuItem>)}
            </TextField>
            <TextField select label="Role" value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} fullWidth>
              {PROJECT_MEMBER_ROLES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
            </TextField>
            {addMember.isError && <Alert severity="error">{apiErrorMessage(addMember.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemberOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!memberForm.userId || addMember.isPending} onClick={() => addMember.mutate()}>Add</Button>
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
