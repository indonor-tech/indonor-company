import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ActionButtons, ConfirmDialog, dateInput, displayName, idOf } from '../components/RecordActions';
import { ConvertEmployeeDialog, canConvertCandidate } from '../components/ConvertEmployeeDialog';
import { OfferLetterDialog, canOfferCandidate } from '../components/OfferLetterDialog';
import { RoleSelect, TrackSelect, formatApplyingRole } from '../components/GeoFields';

const employeeTypes = ['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY'];
const employeeStatuses = ['ACTIVE', 'ON_PROBATION', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'INACTIVE', 'COMPLETED'];
const workModes = ['ONSITE', 'HYBRID', 'REMOTE'];
const candidateStatuses = ['NEW', 'SCREENING', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED', 'SELECTED', 'REJECTED', 'ON_HOLD', 'OFFER_SENT', 'OFFER_ACCEPTED', 'JOINED', 'WITHDRAWN'];

const configs = {
  employees: {
    title: 'Employees', subtitle: 'Manage your people, roles and employment records.', create: 'Add employee',
    permission: 'employee:create', update: 'employee:update', remove: 'employee:delete',
    columns: ['Registration', 'Name', 'Type', 'Department', 'Status'],
    fields: [
      { name: 'firstName', label: 'First name', required: true },
      { name: 'lastName', label: 'Last name', required: true },
      { name: 'companyEmail', label: 'Company email', type: 'email' },
      { name: 'personalEmail', label: 'Personal email', type: 'email', editOnly: true },
      { name: 'phone', label: 'Phone' },
      { name: 'employeeType', label: 'Employment type', select: employeeTypes, required: true },
      { name: 'employmentStatus', label: 'Status', select: employeeStatuses, editOnly: true },
      { name: 'department', label: 'Department', catalog: 'departments', editOnly: true },
      { name: 'designation', label: 'Designation', catalog: 'designations', editOnly: true },
      { name: 'specialization', label: 'Specialization', trackSelect: true, editOnly: true },
      { name: 'joiningDate', label: 'Joining date', type: 'date', editOnly: true },
      { name: 'workLocation', label: 'Work location', editOnly: true },
      { name: 'workMode', label: 'Work mode', select: workModes, editOnly: true }
    ]
  },
  candidates: {
    title: 'Recruitment', subtitle: 'Register from a CV or by hand, interview, then convert passed candidates into employees.', create: 'Register candidate',
    permission: 'candidate:create', update: 'candidate:update', remove: 'candidate:delete',
    columns: ['Registration', 'Name', 'Position', 'Source', 'Status'],
    fields: [
      { name: 'firstName', label: 'First name', required: true },
      { name: 'lastName', label: 'Last name', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone' },
      { name: 'applyingPosition', label: 'Applying position', required: true, positionSelect: true },
      { name: 'source', label: 'Source' },
      { name: 'status', label: 'Status', select: candidateStatuses, editOnly: true },
      { name: 'location', label: 'Location', editOnly: true },
      { name: 'currentCompany', label: 'Current company', editOnly: true },
      { name: 'notes', label: 'Notes', multiline: true, editOnly: true }
    ]
  }
};

const emptyValues = (fields) => ({ applyingTrack: '', specialization: '', ...Object.fromEntries(fields.map((field) => [field.name, field.select ? (field.required ? field.select[0] : '') : ''])) });
const formValues = (record, fields) => {
  if (!record) return emptyValues(fields);
  return {
    applyingTrack: record.applyingTrack || '',
    ...Object.fromEntries(fields.map((field) => {
      if (field.type === 'date') return [field.name, dateInput(record[field.name])];
      if (field.catalog) return [field.name, idOf(record[field.name])];
      return [field.name, record[field.name] ?? ''];
    }))
  };
};
const sanitize = (body) => {
  const next = { ...body };
  ['department', 'designation', 'reportingManager', 'recruiter'].forEach((key) => { if (!next[key]) delete next[key]; });
  Object.keys(next).forEach((key) => { if (next[key] === '') next[key] = undefined; });
  return next;
};

function RecordDialog({ config, type, record, open, onClose }) {
  const fields = config.fields.filter((field) => record || !field.editOnly);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({ defaultValues: emptyValues(config.fields) });
  const queryClient = useQueryClient();
  const catalogs = useQuery({
    queryKey: ['catalogs', 'record-form'],
    queryFn: async () => ({
      departments: (await api.get('/catalog/departments', { params: { limit: 500 } })).data.data,
      designations: (await api.get('/catalog/designations', { params: { limit: 500 } })).data.data
    }),
    enabled: open && (type === 'employees' || type === 'candidates'),
    retry: false
  });
  useEffect(() => { if (open) reset(formValues(record, config.fields)); }, [open, record, reset, config.fields]);
  useEffect(() => {
    register('applyingPosition');
    register('applyingTrack');
    register('specialization');
  }, [register]);
  const mutation = useMutation({
    mutationFn: (body) => record ? api.patch(`/${type}/${record._id}`, sanitize(body)) : api.post(`/${type}`, sanitize(body)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [type] }); queryClient.invalidateQueries({ queryKey: [type, record?._id] }); reset(); onClose(); }
  });
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>{record ? `Edit ${displayName(record)}` : config.create}</DialogTitle>
    <Box component="form" onSubmit={handleSubmit((body) => mutation.mutate(body))}>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{fields.map((field) => {
        if (field.positionSelect) {
          return <RoleSelect key={field.name} required={field.required} position={watch('applyingPosition') || ''} track={watch('applyingTrack') || ''} onChange={({ position, track }) => { setValue('applyingPosition', position, { shouldValidate: true, shouldDirty: true }); setValue('applyingTrack', track, { shouldDirty: true }); }} />;
        }
        if (field.trackSelect) {
          return <TrackSelect key={field.name} required={field.required} value={watch('specialization') || ''} onChange={(value) => setValue('specialization', value, { shouldDirty: true })} />;
        }
        const options = field.catalog ? (catalogs.data?.[field.catalog] || []) : field.select;
        return <TextField key={field.name} label={field.label} type={field.type || 'text'} select={Boolean(options)} multiline={Boolean(field.multiline)} minRows={field.multiline ? 3 : undefined} InputLabelProps={field.type === 'date' ? { shrink: true } : undefined} {...register(field.name, { required: field.required ? `${field.label} is required` : false })} error={Boolean(errors[field.name])} helperText={errors[field.name]?.message} fullWidth>
          {(field.catalog) && <MenuItem value="">None</MenuItem>}
          {options?.map((option) => {
            const value = option._id || option;
            const label = option.name || String(option).replaceAll('_', ' ');
            return <MenuItem key={value} value={value}>{label}</MenuItem>;
          })}
        </TextField>;
      })}{mutation.isError && <Alert severity="error">{apiErrorMessage(mutation.error, 'Could not save record')}</Alert>}</Stack></DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : record ? 'Save changes' : 'Save record'}</Button></DialogActions>
    </Box>
  </Dialog>;
}

export function EntityDialog({ type, record, open, onClose }) {
  return <RecordDialog config={configs[type]} type={type} record={record} open={open} onClose={onClose} />;
}

export default function EntityPage({ type }) {
  const config = configs[type];
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [convertId, setConvertId] = useState(null);
  const [offerId, setOfferId] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: [type, search], queryFn: () => api.get(`/${type}`, { params: { q: search || undefined } }).then((response) => response.data) });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/${type}/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [type] }); setRemoving(null); }
  });
  const rows = data?.data || [];
  return <Stack spacing={3}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Typography variant="h4">{config.title}</Typography><Typography color="text.secondary" sx={{ mt: .7 }}>{config.subtitle}</Typography></Box>{can(config.permission) && <Button variant="contained" onClick={() => type === 'candidates' ? navigate('/candidates/new') : setDialog(true)}>+ {config.create}</Button>}</Stack>
    <Card><CardContent><TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${type}…`} size="small" sx={{ width: { xs: '100%', sm: 320 }, mb: 2 }} />{isLoading ? <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box> : error ? <Alert severity="error">Could not load records. Confirm your account has access.</Alert> : rows.length === 0 ? <Box sx={{ py: 8, textAlign: 'center' }}><Typography variant="h6">No {type} yet</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Create the first record to start building your HR workspace.</Typography></Box> : <Box sx={{ overflowX: 'auto' }}><Table><TableHead><TableRow>{config.columns.map((column) => <TableCell key={column}>{column}</TableCell>)}<TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow hover key={row._id}><TableCell>{row.employeeRegistrationNumber || row.candidateRegistrationNumber}</TableCell><TableCell><Typography fontWeight={650}>{row.fullName || `${row.firstName} ${row.lastName}`}</Typography><Typography variant="caption" color="text.secondary">{row.companyEmail || row.email}</Typography></TableCell><TableCell>{row.employeeType ? formatApplyingRole(String(row.employeeType).replaceAll('_', ' '), row.specialization) : formatApplyingRole(row.applyingPosition, row.applyingTrack)}</TableCell><TableCell>{row.department?.name || row.source || '—'}</TableCell><TableCell><Chip size="small" label={(row.employmentStatus || row.status || '').replaceAll('_', ' ')} color={['ACTIVE', 'SELECTED', 'OFFER_SENT', 'OFFER_ACCEPTED'].includes(row.employmentStatus || row.status) ? 'success' : 'default'} /></TableCell><TableCell align="right"><ActionButtons onView={() => navigate(`/${type}/${row._id}`)} onEdit={can(config.update) ? () => setEditing(row) : undefined} onDelete={can(config.remove) ? () => setRemoving(row) : undefined} extra={type === 'candidates' ? (row.convertedEmployeeId ? (can('employee:create') ? <Button size="small" onClick={() => navigate(`/employees/${row.convertedEmployeeId}`)}>Employee</Button> : null) : <>
        {can('candidate:update') && canOfferCandidate(row) ? <Button size="small" variant="contained" onClick={() => setOfferId(row._id)}>Offer letter</Button> : null}
        {can('employee:create') && canConvertCandidate(row) ? <Button size="small" onClick={() => setConvertId(row._id)}>Convert</Button> : null}
      </>) : null} /></TableCell></TableRow>)}</TableBody></Table></Box>}</CardContent></Card>
    <RecordDialog config={config} type={type} open={dialog} onClose={() => setDialog(false)} />
    <RecordDialog config={config} type={type} record={editing} open={Boolean(editing)} onClose={() => setEditing(null)} />
    <ConfirmDialog open={Boolean(removing)} title={`Delete ${displayName(removing)}`} message="This archives the record. You can restore it later from the API if needed." onClose={() => setRemoving(null)} onConfirm={() => remove.mutate(removing._id)} loading={remove.isPending} error={remove.isError ? (remove.error.response?.data?.message || 'Could not delete this record.') : ''} />
    <ConvertEmployeeDialog open={Boolean(convertId)} candidateId={convertId} onClose={() => setConvertId(null)} />
    <OfferLetterDialog open={Boolean(offerId)} candidateId={offerId} onClose={() => setOfferId(null)} />
  </Stack>;
}
