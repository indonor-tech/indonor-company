import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_EMPLOYEE_TAB_ACCESS, EMPLOYEE_PROFILE_TABS, tabAccessOf } from '../constants/employeeTabs';

const emptyForm = { name: '', email: '', password: '', role: 'EMPLOYEE', employeeId: '', isActive: true, tabAccess: { ...DEFAULT_EMPLOYEE_TAB_ACCESS } };
const roleLabel = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', MANAGER: 'Manager', EMPLOYEE: 'Employee' };

function employeeName(employee) {
  return [employee?.firstName, employee?.lastName].filter(Boolean).join(' ');
}

function employeeEmail(employee) {
  return (employee?.companyEmail || employee?.personalEmail || '').trim().toLowerCase();
}

export default function Users() {
  const { user, can } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const assignable = user?.role === 'SUPER_ADMIN' ? ['ADMIN', 'MANAGER', 'EMPLOYEE'] : ['MANAGER', 'EMPLOYEE'];
  const users = useQuery({ queryKey: ['crm-users'], queryFn: () => api.get('/users').then((response) => response.data.data) });
  const employees = useQuery({
    queryKey: ['employees', 'user-link'],
    queryFn: () => api.get('/employees', { params: { limit: 100, order: 'asc', sortBy: 'firstName' } }).then((response) => response.data.data),
    enabled: open
  });
  const rows = useMemo(() => users.data || [], [users.data]);
  const staff = useMemo(() => (Array.isArray(employees.data) ? employees.data : []).filter(Boolean), [employees.data]);
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        isActive: form.isActive
      };
      if (form.employeeId) payload.employeeId = form.employeeId;
      if (form.password.trim()) payload.password = form.password.trim();
      if (form.role === 'EMPLOYEE') payload.tabAccess = tabAccessOf(form.tabAccess);
      return editingId ? api.patch(`/users/${editingId}`, payload) : api.post('/users', { ...payload, password: form.password.trim() });
    },
    onSuccess: () => { client.invalidateQueries({ queryKey: ['crm-users'] }); setOpen(false); setShowPassword(false); }
  });
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const startCreate = () => { setEditingId(''); setShowPassword(false); setForm({ ...emptyForm, role: assignable.includes('EMPLOYEE') ? 'EMPLOYEE' : assignable[0], tabAccess: { ...DEFAULT_EMPLOYEE_TAB_ACCESS } }); setOpen(true); };
  const startEdit = (record) => {
    setEditingId(record.id);
    setShowPassword(false);
    setForm({
      name: record.name || '', email: record.email || '', password: '', role: record.role, employeeId: record.employeeId ? String(record.employeeId) : '', isActive: record.isActive !== false, tabAccess: tabAccessOf(record.tabAccess)
    });
    setOpen(true);
  };
  const closeDialog = () => { setOpen(false); setShowPassword(false); };
  const chooseName = (_event, value) => {
    if (value && typeof value === 'object') {
      setForm((current) => ({
        ...current,
        name: employeeName(value),
        email: employeeEmail(value) || current.email,
        employeeId: String(value._id)
      }));
      return;
    }
    if (typeof value === 'string') {
      setForm((current) => ({ ...current, name: value, employeeId: '' }));
    }
  };
  const typeName = (_event, value, reason) => {
    if (reason === 'reset') return;
    setForm((current) => ({
      ...current,
      name: value,
      ...(reason === 'input' || reason === 'clear' ? { employeeId: '' } : {})
    }));
  };
  const canSave = form.name.trim() && form.email.trim() && (editingId || form.password.trim().length >= 8) && !save.isPending;
  return <Stack spacing={3}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
      <Box>
        <Typography variant="h4">CRM users</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.7 }}>Create logins for Admin, Manager, and Employee. Choose an employee name to fill their email, or type a new name.</Typography>
      </Box>
      {can('users:write') && <Button variant="contained" onClick={startCreate}>+ Add user</Button>}
    </Stack>
    {users.isError && <Alert severity="error">{apiErrorMessage(users.error, 'Could not load CRM users.')}</Alert>}
    <Card><CardContent>
      {!users.isLoading && !rows.length && <Typography color="text.secondary">No CRM users yet.</Typography>}
      {rows.length > 0 && <Table><TableHead><TableRow><TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
        <TableBody>{rows.map((record) => <TableRow key={record.id}>
          <TableCell><Typography fontWeight={650}>{record.name}</Typography></TableCell>
          <TableCell>{record.email}</TableCell>
          <TableCell>{roleLabel[record.role] || record.role}</TableCell>
          <TableCell>
            <Stack direction="row" spacing={0.8} alignItems="center">
              <Chip size="small" color={record.isActive ? 'success' : 'default'} label={record.isActive ? 'Active' : 'Inactive'} />
              {record.employeeId && <Chip size="small" variant="outlined" label="Linked" />}
            </Stack>
          </TableCell>
          <TableCell align="right">{record.role !== 'SUPER_ADMIN' && <Button size="small" onClick={() => startEdit(record)}>Edit</Button>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </CardContent></Card>
    <Dialog open={open} onClose={closeDialog} fullWidth maxWidth={form.role === 'EMPLOYEE' ? 'md' : 'sm'}>
      <DialogTitle>{editingId ? 'Edit CRM user' : 'Add CRM user'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="CRM role" value={form.role} onChange={set('role')}>{assignable.map((role) => <MenuItem key={role} value={role}>{roleLabel[role]}</MenuItem>)}</TextField>
          <Autocomplete
            freeSolo
            selectOnFocus
            handleHomeEndKeys
            options={staff}
            loading={employees.isLoading}
            getOptionLabel={(option) => typeof option === 'string' ? option : employeeName(option)}
            isOptionEqualToValue={(option, value) => String(option?._id) === String(value?._id)}
            filterOptions={(options, { inputValue }) => {
              const query = inputValue.trim().toLowerCase();
              if (!query) return options;
              return options.filter((employee) => [employeeName(employee), employeeEmail(employee), employee.employeeRegistrationNumber].join(' ').toLowerCase().includes(query));
            }}
            inputValue={form.name}
            onInputChange={typeName}
            onChange={chooseName}
            renderOption={(props, employee) => {
              const { key, ...rest } = props;
              return (
                <Box component="li" key={key || employee._id} {...rest}>
                  <Box>
                    <Typography>{employeeName(employee)}</Typography>
                    <Typography variant="caption" color="text.secondary">{employeeEmail(employee) || employee.employeeRegistrationNumber || 'No email on file'}</Typography>
                  </Box>
                </Box>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Name"
                required
                helperText={staff.length ? 'Select an employee from the list, or type a new name.' : 'Type a name. Employee records will appear here when they are available.'}
              />
            )}
          />
          {employees.isError && <Alert severity="warning">{apiErrorMessage(employees.error, 'Could not load employees. You can still type a name.')}</Alert>}
          <TextField label="Email" type="email" autoComplete="off" value={form.email} onChange={set('email')} required helperText={form.employeeId ? 'Filled from the selected employee. You can change it.' : 'This is the login email.'} />
          <TextField
            label={editingId ? 'New password (optional)' : 'Password'}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            required={!editingId}
            helperText={editingId ? 'Leave blank to keep the current password.' : 'Share this password with the user so they can sign in.'}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)} edge="end">
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          <FormControlLabel control={<Switch checked={form.isActive} onChange={set('isActive')} />} label="Active login" />
          {form.role === 'EMPLOYEE' && <Box>
            <Typography variant="subtitle2">My profile tabs</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Choose what this employee can see and edit after they sign in. Salary, interviews, and timeline cannot be edited by the employee.</Typography>
            <Stack spacing={1.2}>
              {EMPLOYEE_PROFILE_TABS.map((tab) => {
                const value = form.tabAccess?.[tab.key] || 'none';
                return <Stack key={tab.key} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1}>
                  <Typography>{tab.label}</Typography>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={value}
                    onChange={(_event, next) => {
                      if (!next) return;
                      setForm((current) => ({ ...current, tabAccess: { ...tabAccessOf(current.tabAccess), [tab.key]: next } }));
                    }}
                  >
                    <ToggleButton value="none">None</ToggleButton>
                    <ToggleButton value="view">View</ToggleButton>
                    {tab.allowEdit && <ToggleButton value="edit">Edit</ToggleButton>}
                  </ToggleButtonGroup>
                </Stack>;
              })}
            </Stack>
          </Box>}
          {save.isError && <Alert severity="error">{apiErrorMessage(save.error, 'Could not save this CRM user.')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="contained" disabled={!canSave} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
