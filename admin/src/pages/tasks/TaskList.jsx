import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, CircularProgress, FormControlLabel, Grid, InputAdornment, MenuItem, Stack, Switch, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, Tabs, TextField, Tooltip, Typography
} from '@mui/material';
import { Add, FilterAltOff, LockOutlined, Search, WarningAmber } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatDateTime, PRIORITY_OPTIONS, STATUS_OPTIONS, taskApi } from '../../services/tasks';
import { PriorityChip, ProgressBar, StatusChip } from '../../components/tasks/TaskChips';
import TaskFormDialog from '../../components/tasks/TaskFormDialog';
import { useMentionableUsers } from '../../components/tasks/MentionField';

const MY_SCOPES = [
  { value: 'mine', label: 'Owned / assigned' }, { value: 'assigned', label: 'Assigned by others' }, { value: 'created', label: 'Created by me' },
  { value: 'mentioned', label: 'Mentioned' }, { value: 'collaborating', label: 'Collaborating' }
];
const FILTER_KEYS = ['q', 'status', 'priority', 'project', 'department', 'assignee', 'technology', 'client', 'module', 'dateFrom', 'dateTo', 'deadlineFrom', 'deadlineTo', 'overdue', 'rootOnly', 'sort', 'scope'];

export default function TaskList({ mode = 'my' }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(params.get('q') || '');
  const { data: lookups } = useQuery({ queryKey: ['task-lookups'], queryFn: taskApi.lookups, staleTime: 60_000 });
  const { data: users = [] } = useMentionableUsers();
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) || ''])), [params]);
  const scope = mode === 'my' ? filters.scope || 'mine' : '';
  useEffect(() => { setPage(0); }, [params, mode]);
  useEffect(() => {
    const timer = window.setTimeout(() => { if (search !== (params.get('q') || '')) update('q', search); }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  const query = { ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), ...(scope && { scope }), page: page + 1, limit, rootOnly: filters.rootOnly || 'true' };
  if (filters.rootOnly === 'false') delete query.rootOnly;
  const { data: result, isLoading, isFetching, error } = useQuery({ queryKey: ['tasks', mode, query], queryFn: () => taskApi.list(query), placeholderData: keepPreviousData });
  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value === '' || value === null || value === undefined) next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  }
  const clear = () => { setSearch(''); setParams(new URLSearchParams(), { replace: true }); };
  const statusList = filters.status ? filters.status.split(',') : [];
  const rows = result?.rows || [];
  const total = result?.meta?.total || 0;
  const activeFilters = FILTER_KEYS.filter((key) => key !== 'scope' && key !== 'sort' && filters[key]).length;
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} spacing={2}>
        <Box>
          <Typography variant="h4">{mode === 'my' ? 'My tasks' : 'All tasks'}</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.7 }}>{mode === 'my' ? 'Tasks you own, were assigned, created, or are mentioned on.' : can('task:read:all') ? 'Every task across the company.' : 'Tasks for you and your team.'}</Typography>
        </Box>
        {can('task:create') && <Button variant="contained" startIcon={<Add />} onClick={() => setCreating(true)}>New task</Button>}
      </Stack>
      {mode === 'my' && <Tabs value={scope} onChange={(_event, value) => update('scope', value === 'mine' ? '' : value)} variant="scrollable">{MY_SCOPES.map((item) => <Tab key={item.value} value={item.value} label={item.label} />)}</Tabs>}
      <Card sx={{ p: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth size="small" placeholder="Search title, description or key" value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Autocomplete multiple size="small" options={STATUS_OPTIONS} value={STATUS_OPTIONS.filter((item) => statusList.includes(item.value))} getOptionLabel={(option) => option.label} onChange={(_event, value) => update('status', value.map((item) => item.value).join(','))} renderInput={(props) => <TextField {...props} label="Status" />} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField select fullWidth size="small" label="Priority" value={filters.priority} onChange={(event) => update('priority', event.target.value)}>
              <MenuItem value="">Any</MenuItem>{PRIORITY_OPTIONS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <TextField select fullWidth size="small" label="Sort" value={filters.sort || 'newest'} onChange={(event) => update('sort', event.target.value === 'newest' ? '' : event.target.value)}>
              <MenuItem value="newest">Newest first</MenuItem><MenuItem value="oldest">Oldest first</MenuItem><MenuItem value="deadline">Deadline</MenuItem><MenuItem value="priority">Priority</MenuItem><MenuItem value="updated">Recently updated</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField select fullWidth size="small" label="Project" value={filters.project} onChange={(event) => update('project', event.target.value)}>
              <MenuItem value="">Any project</MenuItem>{(lookups?.projects || []).map((project) => <MenuItem key={project._id} value={project._id}>{project.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField select fullWidth size="small" label="Department" value={filters.department} onChange={(event) => update('department', event.target.value)}>
              <MenuItem value="">Any department</MenuItem>{(lookups?.departments || []).map((department) => <MenuItem key={department._id} value={department._id}>{department.name}</MenuItem>)}
            </TextField>
          </Grid>
          {mode === 'all' && (
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Autocomplete size="small" options={users} value={users.find((item) => String(item.id) === filters.assignee) || null} getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id} onChange={(_event, value) => update('assignee', value?.id || '')} renderInput={(props) => <TextField {...props} label="Employee" />} />
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Autocomplete freeSolo size="small" options={lookups?.technologies || []} value={filters.technology} onChange={(_event, value) => update('technology', value || '')} renderInput={(props) => <TextField {...props} label="Technology" />} />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField fullWidth size="small" type="date" label="Work date from" InputLabelProps={{ shrink: true }} value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField fullWidth size="small" type="date" label="Work date to" InputLabelProps={{ shrink: true }} value={filters.dateTo} onChange={(event) => update('dateTo', event.target.value)} /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField fullWidth size="small" type="date" label="Deadline from" InputLabelProps={{ shrink: true }} value={filters.deadlineFrom} onChange={(event) => update('deadlineFrom', event.target.value)} /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField fullWidth size="small" type="date" label="Deadline to" InputLabelProps={{ shrink: true }} value={filters.deadlineTo} onChange={(event) => update('deadlineTo', event.target.value)} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <FormControlLabel control={<Switch size="small" checked={filters.overdue === 'true'} onChange={(event) => update('overdue', event.target.checked ? 'true' : '')} />} label="Overdue" />
              <FormControlLabel control={<Switch size="small" checked={filters.rootOnly === 'false'} onChange={(event) => update('rootOnly', event.target.checked ? 'false' : '')} />} label="Include subtasks" />
              {activeFilters > 0 && <Button size="small" startIcon={<FilterAltOff />} onClick={clear}>Clear</Button>}
            </Stack>
          </Grid>
        </Grid>
      </Card>
      {error && <Alert severity="error">Unable to load tasks.</Alert>}
      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Task</TableCell><TableCell>Project</TableCell><TableCell>Assignee</TableCell><TableCell>Priority</TableCell><TableCell>Status</TableCell>
                <TableCell>Subtasks</TableCell><TableCell>Deadline</TableCell><TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5 }}><CircularProgress size={28} /></TableCell></TableRow>}
              {!isLoading && !rows.length && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: 'text.secondary' }}>No tasks match these filters.</TableCell></TableRow>}
              {rows.map((task) => (
                <TableRow key={task._id} hover sx={{ cursor: 'pointer', opacity: isFetching ? 0.7 : 1 }} onClick={() => navigate(`/tasks/${task._id}`)}>
                  <TableCell sx={{ maxWidth: 360 }}>
                    <Stack direction="row" spacing={0.8} alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{task.taskKey}</Typography>
                      {task.isLocked && <Tooltip title={`Locked record (${task.workDate})`}><LockOutlined sx={{ fontSize: 14, color: 'text.disabled' }} /></Tooltip>}
                      {task.hasCorrections && <Chip size="small" label="Corrected" variant="outlined" sx={{ height: 18, fontSize: 11 }} />}
                    </Stack>
                    <Typography variant="body2" fontWeight={600} noWrap>{task.title}</Typography>
                    {task.parent?.taskKey && <Typography variant="caption" color="text.secondary" noWrap component="div">Subtask of {task.parent.taskKey}</Typography>}
                  </TableCell>
                  <TableCell><Typography variant="body2" noWrap>{task.project?.name || '—'}</Typography><Typography variant="caption" color="text.secondary">{task.client || ''}</Typography></TableCell>
                  <TableCell><Typography variant="body2" noWrap>{task.assignee?.name || task.owner?.name || '—'}</Typography>{task.assignedBy?.name && <Typography variant="caption" color="text.secondary">by {task.assignedBy.name}</Typography>}</TableCell>
                  <TableCell><PriorityChip priority={task.priority} /></TableCell>
                  <TableCell><StatusChip status={task.status} /></TableCell>
                  <TableCell><ProgressBar progress={task.progress} /></TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {task.isOverdue && <Tooltip title="Overdue"><WarningAmber color="error" sx={{ fontSize: 16 }} /></Tooltip>}
                      <Typography variant="body2" color={task.isOverdue ? 'error' : 'text.primary'} noWrap>{task.deadline ? formatDateTime(task.deadline) : '—'}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell><Typography variant="body2" noWrap>{formatDate(task.workDate)}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={total} page={page} rowsPerPage={limit} rowsPerPageOptions={[10, 20, 50, 100]} onPageChange={(_event, value) => setPage(value)} onRowsPerPageChange={(event) => { setLimit(Number(event.target.value)); setPage(0); }} />
      </Card>
      <TaskFormDialog open={creating} onClose={() => setCreating(false)} onSaved={(task) => task?._id && navigate(`/tasks/${task._id}`)} />
    </Stack>
  );
}
