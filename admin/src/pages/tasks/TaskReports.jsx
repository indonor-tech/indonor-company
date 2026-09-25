import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, ButtonGroup, Card, CardContent, CircularProgress, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Typography
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { data, DAY_STATUS, downloadReport, formatDateTime, statusLabel, taskApi } from '../../services/tasks';
import { useMentionableUsers } from '../../components/tasks/MentionField';

const REPORTS = [
  { value: 'daily', label: 'Daily report', hint: 'Tasks created/completed and log submissions per day.' },
  { value: 'weekly', label: 'Weekly report', hint: 'The same metrics rolled up by ISO week.' },
  { value: 'monthly', label: 'Monthly report', hint: 'The same metrics rolled up by month.' },
  { value: 'employee', label: 'Employee report', hint: 'Task counts per employee (factual counts, no ratings).' },
  { value: 'project', label: 'Project report', hint: 'Task counts per project.' },
  { value: 'pending', label: 'Pending tasks', hint: 'Open tasks (pending, in progress, on hold, blocked).' },
  { value: 'completed', label: 'Completed tasks', hint: 'Tasks completed in the range.' },
  { value: 'overdue', label: 'Overdue tasks', hint: 'Open tasks past their deadline.' },
  { value: 'blocked', label: 'Blocked tasks', hint: 'Tasks currently blocked.' },
  { value: 'missing', label: 'Missing submissions', hint: 'Working days where a required employee did not submit a log.' }
];
const LIST_TYPES = ['pending', 'completed', 'overdue', 'blocked'];

export default function TaskReports() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const type = REPORTS.some((item) => item.value === params.get('type')) ? params.get('type') : 'daily';
  const [filters, setFilters] = useState({ from: '', to: '', employee: '', project: '', department: '' });
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const { data: lookups } = useQuery({ queryKey: ['task-lookups'], queryFn: taskApi.lookups, staleTime: 60_000 });
  const { data: users = [] } = useMentionableUsers();
  const query = {
    from: filters.from || undefined, to: filters.to || undefined, project: filters.project || undefined, department: filters.department || undefined,
    ...(filters.employee && (type === 'missing' ? { employee: filters.employee } : { assignee: filters.employee })),
    ...(LIST_TYPES.includes(type) && { page: page + 1, limit: 50, rootOnly: 'false' })
  };
  const { data: report, isLoading, isFetching, error } = useQuery({ queryKey: ['task-report', type, query], queryFn: () => data(api.get(`/task-reports/${type}`, { params: query })), placeholderData: keepPreviousData });
  const set = (key) => (event) => { setFilters({ ...filters, [key]: event.target.value }); setPage(0); };
  const exportAs = async (format) => {
    setExporting(format);
    setExportError('');
    try {
      const { page: _page, limit: _limit, ...rest } = query;
      await downloadReport(type, format, rest);
    } catch (reason) {
      let message = apiErrorMessage(reason, 'Export failed');
      if (reason.response?.data instanceof Blob) {
        try { message = JSON.parse(await reason.response.data.text()).message || message; } catch { /* keep generic message */ }
      }
      setExportError(message);
    } finally {
      setExporting('');
    }
  };
  const meta = REPORTS.find((item) => item.value === type);
  const render = (row, column) => {
    const value = row[column.key];
    if (column.key === 'status') return DAY_STATUS[value]?.label || statusLabel(value);
    if (column.key === 'priority') return value ? value[0] + value.slice(1).toLowerCase() : '';
    return value === null || value === undefined || value === '' ? '—' : String(value);
  };
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Task reports</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.7 }}>Factual metrics only. Exports are recorded in the audit history.</Typography>
      </Box>
      <Card sx={{ p: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField select fullWidth size="small" label="Report" value={type} onChange={(event) => { setParams({ type: event.target.value }, { replace: true }); setPage(0); }}>
              {REPORTS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.from} onChange={set('from')} disabled={type === 'overdue'} /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.to} onChange={set('to')} disabled={type === 'overdue'} /></Grid>
          {!['daily', 'weekly', 'monthly'].includes(type) && (
            <Grid size={{ xs: 12, md: 2.5 }}>
              <Autocomplete size="small" options={users} value={users.find((item) => String(item.id) === filters.employee) || null} getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id} onChange={(_event, value) => { setFilters({ ...filters, employee: value?.id || '' }); setPage(0); }} renderInput={(props) => <TextField {...props} label="Employee" />} />
            </Grid>
          )}
          {!['daily', 'weekly', 'monthly', 'missing'].includes(type) && (
            <Grid size={{ xs: 12, md: 2.5 }}>
              <TextField select fullWidth size="small" label="Project" value={filters.project} onChange={set('project')}>
                <MenuItem value="">Any</MenuItem>{(lookups?.projects || []).map((project) => <MenuItem key={project._id} value={project._id}>{project.name}</MenuItem>)}
              </TextField>
            </Grid>
          )}
        </Grid>
      </Card>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6">{meta.label}</Typography>
              <Typography variant="body2" color="text.secondary">
                {meta.hint}
                {report?.range && ` ${report.range.from} → ${report.range.to}.`}
                {report?.generatedAt && ` Generated ${formatDateTime(report.generatedAt, report.timezone)} (${report.timezone}).`}
              </Typography>
            </Box>
            {can('task:reports:export') && (
              <ButtonGroup variant="outlined" size="small">
                {['xlsx', 'csv', 'pdf'].map((format) => <Button key={format} startIcon={<Download />} onClick={() => exportAs(format)} disabled={Boolean(exporting)}>{exporting === format ? '…' : format === 'xlsx' ? 'Excel' : format.toUpperCase()}</Button>)}
              </ButtonGroup>
            )}
          </Stack>
          {exportError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setExportError('')}>{exportError}</Alert>}
          {error && <Alert severity="error">{apiErrorMessage(error, 'Unable to generate this report')}</Alert>}
          {isLoading ? <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 200 }}><CircularProgress /></Box> : report && (
            <>
              <TableContainer sx={{ maxHeight: 620, opacity: isFetching ? 0.7 : 1 }}>
                <Table size="small" stickyHeader>
                  <TableHead><TableRow>{report.columns.map((column) => <TableCell key={column.key} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{column.label}</TableCell>)}</TableRow></TableHead>
                  <TableBody>
                    {!report.rows.length && <TableRow><TableCell colSpan={report.columns.length} align="center" sx={{ py: 4, color: 'text.secondary' }}>No records for the selected filters.</TableCell></TableRow>}
                    {report.rows.map((row, index) => (
                      <TableRow key={row._id || `${index}`} hover sx={{ cursor: row._id && LIST_TYPES.includes(type) ? 'pointer' : 'default' }} onClick={() => row._id && LIST_TYPES.includes(type) && navigate(`/tasks/${row._id}`)}>
                        {report.columns.map((column) => <TableCell key={column.key} sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{render(row, column)}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {LIST_TYPES.includes(type) && <TablePagination component="div" count={report.total || 0} page={page} rowsPerPage={50} rowsPerPageOptions={[50]} onPageChange={(_event, value) => setPage(value)} />}
            </>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
