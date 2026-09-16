import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Avatar, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, List, ListItemButton, ListItemIcon, ListItemText, Stack, Switch, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage, assetUrl } from '../services/api';
import { countryOptions, stateOptions } from '../utils/geo';

const emptyForm = {
  name: '', roles: [], bio: '', photoUrl: '', location: '', email: '', linkedinUrl: '', isPublished: true
};
const uniqueValues = (...lists) => [...new Set(lists.flat().map((value) => String(value || '').trim()).filter(Boolean))];
const parseRoles = (member) => {
  if (Array.isArray(member?.roles) && member.roles.length) return member.roles.map((item) => String(item || '').trim()).filter(Boolean);
  return String(member?.role || '').split(/\s*(?:,|;|\/|·|•|\band\b)\s*/i).map((item) => item.trim()).filter((item) => item.length >= 2);
};
const formatRoles = (member) => parseRoles(member).join(' · ');

function SelectOrType({ label, value, onChange, options, required, helperText }) {
  return <Autocomplete
    freeSolo
    options={options}
    inputValue={value}
    onInputChange={(_event, next) => onChange(next)}
    renderInput={(params) => <TextField {...params} label={label} required={required} helperText={helperText} />}
  />;
}

export default function WebsiteTeam() {
  const client = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [fromEmployee, setFromEmployee] = useState(false);
  const [open, setOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const members = useQuery({ queryKey: ['website-team'], queryFn: () => api.get('/website-team').then((response) => response.data.data) });
  const employees = useQuery({
    queryKey: ['website-team-employees'],
    queryFn: () => api.get('/website-team/employees').then((response) => response.data.data),
    enabled: pickOpen
  });
  const designations = useQuery({
    queryKey: ['catalog', 'designations', 'dropdown'],
    queryFn: () => api.get('/catalog/designations', { params: { limit: 500 } }).then((response) => response.data.data),
    enabled: open,
    retry: false
  });
  const rows = useMemo(() => [...(members.data || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)), [members.data]);
  const roleOptions = useMemo(
    () => uniqueValues((designations.data || []).map((item) => item.name), rows.flatMap((member) => parseRoles(member))).sort((left, right) => left.localeCompare(right)),
    [designations.data, rows]
  );
  const locationOptions = useMemo(
    () => uniqueValues(
      rows.map((member) => member.location),
      stateOptions('India').map((name) => `${name}, India`),
      countryOptions()
    ).sort((left, right) => left.localeCompare(right)),
    [rows]
  );
  const choices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (employees.data || []).filter((employee) => {
      if (!query) return true;
      return [employee.name, employee.role, employee.email, employee.location].join(' ').toLowerCase().includes(query);
    });
  }, [employees.data, search]);
  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, roles: form.roles, role: form.roles.join(' · ') };
      return editingId ? api.patch(`/website-team/${editingId}`, payload) : api.post('/website-team', payload);
    },
    onSuccess: () => { client.invalidateQueries({ queryKey: ['website-team'] }); setOpen(false); }
  });
  const uploadPhoto = useMutation({
    mutationFn: (file) => {
      const payload = new FormData();
      payload.append('photo', file);
      return api.post('/website-team/photo', payload).then((response) => response.data.data.photoUrl);
    },
    onSuccess: (photoUrl) => setForm((current) => ({ ...current, photoUrl }))
  });
  const addEmployees = useMutation({
    mutationFn: (ids) => api.post('/website-team/from-employees', { ids }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['website-team'] });
      client.invalidateQueries({ queryKey: ['website-team-employees'] });
      setPickOpen(false);
      setSelected([]);
      setSearch('');
    }
  });
  const reorder = useMutation({
    mutationFn: (ids) => api.patch('/website-team/reorder', { ids }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['website-team'] })
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/website-team/${id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['website-team'] });
      client.invalidateQueries({ queryKey: ['website-team-employees'] });
    }
  });
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const startCreate = () => { setEditingId(''); setFromEmployee(false); setForm(emptyForm); setOpen(true); };
  const startEdit = (member) => {
    setEditingId(member._id);
    setFromEmployee(member.source === 'employee');
    setForm({
      name: member.name || '', roles: parseRoles(member), bio: member.bio || '', photoUrl: member.photoUrl || '',
      location: member.location || '', email: member.email || '', linkedinUrl: member.linkedinUrl || '',
      isPublished: member.isPublished !== false
    });
    setOpen(true);
  };
  const startPick = () => { setSelected([]); setSearch(''); setPickOpen(true); };
  const toggleEmployee = (id) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const move = (index, direction) => {
    const next = [...rows];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    reorder.mutate(next.map((member) => member._id));
  };
  return <Stack spacing={3}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
      <Box>
        <Typography variant="h4">Website team</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.7 }}>Add people from Employees, or enter someone by hand. Use the arrows to set the order visitors see on indonortech.com/team.</Typography>
      </Box>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button variant="outlined" onClick={startPick}>Add from employees</Button>
        <Button variant="contained" onClick={startCreate}>+ Add member</Button>
      </Stack>
    </Stack>
    {members.isError && <Alert severity="error">{apiErrorMessage(members.error, 'Could not load the website team.')}</Alert>}
    {reorder.isError && <Alert severity="error">{apiErrorMessage(reorder.error, 'Could not update team order.')}</Alert>}
    {remove.isError && <Alert severity="error">{apiErrorMessage(remove.error, 'Could not remove this member.')}</Alert>}
    {!members.isLoading && !rows.length && <Card><CardContent><Typography color="text.secondary">No team members yet. Add current employees, or create a member by hand for someone who is not in HR.</Typography></CardContent></Card>}
    {rows.map((member, index) => <Card key={member._id}><CardContent>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }}>
        <Box sx={{ width: 72, height: 72, borderRadius: 2, overflow: 'hidden', bgcolor: '#eef2f3', flexShrink: 0 }}>
          {member.photoUrl ? <Box component="img" src={assetUrl(member.photoUrl)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography fontWeight={700}>{member.name}</Typography>
            <Chip size="small" color={member.isPublished ? 'success' : 'default'} label={member.isPublished ? 'Visible' : 'Hidden'} />
            <Chip size="small" variant="outlined" label={member.source === 'employee' ? 'From employees' : 'Added manually'} />
          </Stack>
          <Typography color="text.secondary">{formatRoles(member)}{member.location ? ` · ${member.location}` : ''}</Typography>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button size="small" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}>Move up</Button>
          <Button size="small" disabled={index === rows.length - 1 || reorder.isPending} onClick={() => move(index, 1)}>Move down</Button>
          <Button size="small" onClick={() => startEdit(member)}>Edit</Button>
          <Button size="small" color="error" onClick={() => remove.mutate(member._id)}>Remove</Button>
        </Stack>
      </Stack>
    </CardContent></Card>)}
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>{editingId ? 'Edit team member' : 'Add team member'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {fromEmployee && <Alert severity="info">This person comes from Employees. Changes here only affect the public team page, not their HR record.</Alert>}
          <TextField label="Name" value={form.name} onChange={set('name')} required />
          <Autocomplete
            multiple
            freeSolo
            options={roleOptions}
            value={form.roles}
            onChange={(_event, roles) => setForm((current) => ({ ...current, roles }))}
            renderTags={(values, getTagProps) => values.map((value, index) => <Chip {...getTagProps({ index })} key={`${value}-${index}`} label={value} />)}
            renderInput={(params) => <TextField {...params} label="Roles / titles" required helperText="Select one or more, or type a title and press Enter." />}
          />
          <SelectOrType
            label="Location"
            value={form.location}
            onChange={(location) => setForm((current) => ({ ...current, location }))}
            options={locationOptions}
            helperText="Select a location, or type one if it is not in the list."
          />
          <Stack spacing={1.25}>
            {form.photoUrl ? <Box component="img" src={assetUrl(form.photoUrl)} alt="" sx={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 2, bgcolor: '#eef2f3' }} /> : null}
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              <Button component="label" variant="outlined" disabled={uploadPhoto.isPending}>
                {uploadPhoto.isPending ? 'Uploading…' : 'Upload from computer'}
                <input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadPhoto.mutate(file); event.target.value = ''; }} />
              </Button>
              {form.photoUrl ? <Button size="small" onClick={() => setForm((current) => ({ ...current, photoUrl: '' }))}>Remove photo</Button> : null}
            </Stack>
            <TextField label="Or paste a photo URL" value={form.photoUrl} onChange={set('photoUrl')} placeholder="https://… or /api/v1/website-team/photos/…" helperText="Uploads are stored without localhost, so they work locally and on the live site. You can also paste a public image URL." />
            {uploadPhoto.isError && <Alert severity="error">{apiErrorMessage(uploadPhoto.error, 'Could not upload this photo.')}</Alert>}
          </Stack>
          <TextField label="Email" value={form.email} onChange={set('email')} />
          <TextField label="LinkedIn URL" value={form.linkedinUrl} onChange={set('linkedinUrl')} />
          <TextField label="Short bio" value={form.bio} onChange={set('bio')} multiline minRows={3} />
          <FormControlLabel control={<Switch checked={form.isPublished} onChange={set('isPublished')} />} label="Show on the website" />
          {save.isError && <Alert severity="error">{apiErrorMessage(save.error, 'Could not save this team member.')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="contained" disabled={!form.name.trim() || !form.roles.length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={pickOpen} onClose={() => setPickOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Add from employees</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">Choose current employees to show on the public team page. Name, role, photo, location and email are copied from HR. You can edit the website details afterwards.</Typography>
          <TextField label="Search employees" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, role, or email" />
          {employees.isError && <Alert severity="error">{apiErrorMessage(employees.error, 'Could not load employees.')}</Alert>}
          {addEmployees.isError && <Alert severity="error">{apiErrorMessage(addEmployees.error, 'Could not add those employees.')}</Alert>}
          {employees.isLoading && <Typography color="text.secondary">Loading employees…</Typography>}
          {!employees.isLoading && !choices.length && <Typography color="text.secondary">{search.trim() ? 'No employees match that search.' : 'Every current employee is already on the website team, or there are no current employees yet.'}</Typography>}
          <List disablePadding>
            {choices.map((employee) => <ListItemButton key={employee.id} onClick={() => toggleEmployee(employee.id)}>
              <ListItemIcon><Checkbox edge="start" checked={selected.includes(employee.id)} tabIndex={-1} disableRipple /></ListItemIcon>
              <Avatar src={assetUrl(employee.photoUrl) || undefined} alt="" sx={{ width: 40, height: 40, mr: 1.5 }}>{employee.name.slice(0, 1)}</Avatar>
              <ListItemText primary={employee.name} secondary={[employee.role, employee.location].filter(Boolean).join(' · ')} />
            </ListItemButton>)}
          </List>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPickOpen(false)}>Cancel</Button>
        <Button variant="contained" disabled={!selected.length || addEmployees.isPending} onClick={() => addEmployees.mutate(selected)}>{addEmployees.isPending ? 'Adding…' : selected.length ? `Add ${selected.length}` : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
