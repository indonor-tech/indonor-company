import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Autocomplete, Box, Card, CardContent, CircularProgress, Grid, MenuItem, Stack, TablePagination, TextField, Typography } from '@mui/material';
import { api } from '../../services/api';
import { ACTION_LABELS, humanize, withMeta } from '../../services/tasks';
import AuditTimeline from '../../components/tasks/AuditTimeline';
import { useMentionableUsers } from '../../components/tasks/MentionField';

const RECORD_TYPES = ['Task', 'DailyWorkLog', 'TaskComment', 'TaskAttachment', 'TaskUrl', 'CorrectionRequest', 'Project', 'CalendarDay', 'TaskSettings', 'Report'];

export default function TaskAuditHistory() {
  const { data: users = [] } = useMentionableUsers();
  const [filters, setFilters] = useState({ actions: [], actor: '', subjectUser: '', recordType: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const params = {
    action: filters.actions.join(',') || undefined, actor: filters.actor || undefined, subjectUser: filters.subjectUser || undefined,
    recordType: filters.recordType || undefined, from: filters.from || undefined, to: filters.to || undefined, page: page + 1, limit
  };
  const { data: result, isLoading, error } = useQuery({ queryKey: ['task-audit', params], queryFn: () => withMeta(api.get('/task-audit', { params })), placeholderData: keepPreviousData });
  const update = (changes) => { setFilters({ ...filters, ...changes }); setPage(0); };
  const person = (key, label) => (
    <Autocomplete size="small" options={users} value={users.find((item) => String(item.id) === filters[key]) || null} getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id} onChange={(_event, value) => update({ [key]: value?.id || '' })} renderInput={(props) => <TextField {...props} label={label} />} />
  );
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Audit history</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.7 }}>Append-only record of every task, work log, correction and settings change with who, when, old/new values, IP address and device. Records cannot be edited or deleted.</Typography>
      </Box>
      <Card sx={{ p: 2 }}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Autocomplete multiple size="small" options={Object.keys(ACTION_LABELS)} value={filters.actions} getOptionLabel={(option) => ACTION_LABELS[option] || humanize(option)} onChange={(_event, value) => update({ actions: value })} renderInput={(props) => <TextField {...props} label="Actions" />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>{person('actor', 'Performed by')}</Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>{person('subjectUser', 'Employee')}</Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2 }}>
            <TextField select fullWidth size="small" label="Record type" value={filters.recordType} onChange={(event) => update({ recordType: event.target.value })}>
              <MenuItem value="">Any</MenuItem>{RECORD_TYPES.map((type) => <MenuItem key={type} value={type}>{humanize(type.replace(/([a-z])([A-Z])/g, '$1_$2'))}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 1 }}><TextField fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.from} onChange={(event) => update({ from: event.target.value })} /></Grid>
          <Grid size={{ xs: 6, sm: 4, md: 1 }}><TextField fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.to} onChange={(event) => update({ to: event.target.value })} /></Grid>
        </Grid>
      </Card>
      {error && <Alert severity="error">Unable to load audit history.</Alert>}
      <Card>
        <CardContent>
          {isLoading ? <CircularProgress size={24} /> : <AuditTimeline events={result?.rows || []} showTask pageSize={limit} />}
        </CardContent>
        <TablePagination component="div" count={result?.meta?.total || 0} page={page} rowsPerPage={limit} rowsPerPageOptions={[25, 50, 100, 200]} onPageChange={(_event, value) => setPage(value)} onRowsPerPageChange={(event) => { setLimit(Number(event.target.value)); setPage(0); }} />
      </Card>
    </Stack>
  );
}
