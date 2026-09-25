import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, InputAdornment,
  LinearProgress, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import { Add, Edit, Search } from '@mui/icons-material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatDate, humanize, taskApi, withMeta, data } from '../../services/tasks';
import { useMentionableUsers } from '../../components/tasks/MentionField';

const STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];
const STATUS_COLOR = { ACTIVE: 'success', ON_HOLD: 'warning', COMPLETED: 'info', ARCHIVED: 'default' };
const blank = { name: '', code: '', client: '', description: '', department: '', technologies: [], status: 'ACTIVE', startDate: '', endDate: '', members: [] };
const dateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

function ProjectDialog({ open, project, onClose }) {
  const client = useQueryClient();
  const { data: lookups } = useQuery({ queryKey: ['task-lookups'], queryFn: taskApi.lookups, enabled: open });
  const { data: users = [] } = useMentionableUsers();
  const [form, setForm] = useState(blank);
  React.useEffect(() => {
    if (!open) return;
    setForm(project ? {
      name: project.name, code: project.code || '', client: project.client || '', description: project.description || '', department: project.department?._id || project.department || '',
      technologies: project.technologies || [], status: project.status, startDate: dateInput(project.startDate), endDate: dateInput(project.endDate), members: (project.members || []).map((member) => member._id || member)
    } : blank);
  }, [open, project]);
  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, startDate: form.startDate || null, endDate: form.endDate || null };
      return project ? data(api.patch(`/task-projects/${project._id}`, payload)) : data(api.post('/task-projects', payload));
    },
    onSuccess: () => { client.invalidateQueries({ queryKey: ['task-projects'] }); client.invalidateQueries({ queryKey: ['task-lookups'] }); onClose(); }
  });
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{project ? `Edit ${project.name}` : 'New project'}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ pt: 0.5 }}>
          <Grid size={{ xs: 12, sm: 8 }}><TextField fullWidth label="Project name" value={form.name} onChange={set('name')} required /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Code" value={form.code} onChange={set('code')} inputProps={{ maxLength: 20 }} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Client" value={form.client} onChange={set('client')} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select fullWidth label="Department" value={form.department} onChange={set('department')}>
              <MenuItem value="">None</MenuItem>{(lookups?.departments || []).map((department) => <MenuItem key={department._id} value={department._id}>{department.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={12}><Autocomplete multiple freeSolo options={lookups?.technologies || []} value={form.technologies} onChange={(_event, value) => setForm({ ...form, technologies: value })} renderInput={(params) => <TextField {...params} label="Technologies" />} /></Grid>
          <Grid size={12}><TextField fullWidth multiline minRows={2} label="Description" value={form.description} onChange={set('description')} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField select fullWidth label="Status" value={form.status} onChange={set('status')}>{STATUSES.map((status) => <MenuItem key={status} value={status}>{humanize(status)}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 6, sm: 4 }}><TextField fullWidth type="date" label="Start" InputLabelProps={{ shrink: true }} value={form.startDate} onChange={set('startDate')} /></Grid>
          <Grid size={{ xs: 6, sm: 4 }}><TextField fullWidth type="date" label="End" InputLabelProps={{ shrink: true }} value={form.endDate} onChange={set('endDate')} /></Grid>
          <Grid size={12}>
            <Autocomplete multiple options={users} value={users.filter((user) => form.members.includes(user.id))} getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id} onChange={(_event, value) => setForm({ ...form, members: value.map((user) => user.id) })} renderInput={(params) => <TextField {...params} label="Members" />} />
          </Grid>
        </Grid>
        {save.isError && <Alert severity="error" sx={{ mt: 2 }}>{apiErrorMessage(save.error, 'Could not save project')}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={() => save.mutate()} disabled={form.name.trim().length < 2 || save.isPending}>Save</Button></DialogActions>
    </Dialog>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can('task:projects:manage');
  const [q, setQ] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const { data: result, isLoading, error } = useQuery({
    queryKey: ['task-projects', q, includeArchived],
    queryFn: () => withMeta(api.get('/task-projects', { params: { q: q || undefined, includeArchived: includeArchived ? 'true' : undefined, limit: 500 } }))
  });
  const rows = result?.rows || [];
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} spacing={2}>
        <Box>
          <Typography variant="h4">Projects</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.7 }}>Group tasks by project and client. Projects are never deleted; archive them instead.</Typography>
        </Box>
        {canManage && <Button variant="contained" startIcon={<Add />} onClick={() => setEditing({})}>New project</Button>}
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center">
        <TextField size="small" placeholder="Search projects" value={q} onChange={(event) => setQ(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} sx={{ width: 320 }} />
        <FormControlLabel control={<Switch checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />} label="Show archived" />
      </Stack>
      {error && <Alert severity="error">Unable to load projects.</Alert>}
      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow><TableCell>Project</TableCell><TableCell>Client</TableCell><TableCell>Department</TableCell><TableCell>Technologies</TableCell><TableCell>Status</TableCell><TableCell>Tasks</TableCell><TableCell>Dates</TableCell>{canManage && <TableCell />}</TableRow></TableHead>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
              {!isLoading && !rows.length && <TableRow><TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 4 }}>No projects yet.</TableCell></TableRow>}
              {rows.map((project) => {
                const percent = project.taskCount ? Math.round((project.completedCount / project.taskCount) * 100) : 0;
                return (
                  <TableRow key={project._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks/all?project=${project._id}`)}>
                    <TableCell><Typography variant="body2" fontWeight={600}>{project.name}</Typography>{project.code && <Typography variant="caption" color="text.secondary">{project.code}</Typography>}</TableCell>
                    <TableCell>{project.client || '—'}</TableCell>
                    <TableCell>{project.department?.name || '—'}</TableCell>
                    <TableCell><Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>{(project.technologies || []).slice(0, 4).map((tech) => <Chip key={tech} size="small" label={tech} variant="outlined" />)}</Stack></TableCell>
                    <TableCell><Chip size="small" label={humanize(project.status)} color={STATUS_COLOR[project.status]} /></TableCell>
                    <TableCell sx={{ minWidth: 140 }}>
                      <Typography variant="caption">{project.completedCount}/{project.taskCount} completed</Typography>
                      <LinearProgress variant="determinate" value={percent} sx={{ height: 5, borderRadius: 3 }} />
                    </TableCell>
                    <TableCell><Typography variant="caption">{project.startDate ? formatDate(project.startDate) : '—'} → {project.endDate ? formatDate(project.endDate) : '—'}</Typography></TableCell>
                    {canManage && <TableCell onClick={(event) => event.stopPropagation()}><Tooltip title="Edit"><IconButton size="small" onClick={() => setEditing(project)}><Edit fontSize="small" /></IconButton></Tooltip></TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <ProjectDialog open={Boolean(editing)} project={editing?._id ? editing : null} onClose={() => setEditing(null)} />
    </Stack>
  );
}
