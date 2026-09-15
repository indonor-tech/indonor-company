import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AddressFields, currentAddressOf, fromCurrentAddress } from '../components/GeoFields';
import Profile from './Profile';

function UnlinkedProfile() {
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ['my-profile'], queryFn: () => api.get('/employees/me').then((response) => response.data.data) });
  const [form, setForm] = useState({ phone: '', alternatePhone: '', personalEmail: '', emergencyName: '', emergencyPhone: '', emergencyRelation: '' });
  const [address, setAddress] = useState({});
  useEffect(() => {
    if (!profile.data) return;
    setForm({
      phone: profile.data.phone || '',
      alternatePhone: profile.data.alternatePhone || '',
      personalEmail: profile.data.personalEmail || '',
      emergencyName: profile.data.emergencyContact?.name || '',
      emergencyPhone: profile.data.emergencyContact?.phone || '',
      emergencyRelation: profile.data.emergencyContact?.relation || ''
    });
    setAddress(currentAddressOf(profile.data));
  }, [profile.data]);
  const save = useMutation({
    mutationFn: () => api.patch('/employees/me', {
      phone: form.phone,
      alternatePhone: form.alternatePhone,
      personalEmail: form.personalEmail,
      ...fromCurrentAddress(address),
      emergencyContact: { name: form.emergencyName, phone: form.emergencyPhone, relation: form.emergencyRelation }
    }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['my-profile'] })
  });
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  if (profile.isLoading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 280 }}><CircularProgress /></Box>;
  if (profile.isError) return <Alert severity="error">{apiErrorMessage(profile.error, 'Your employee profile is not linked yet. Ask an admin to link your CRM login.')}</Alert>;
  return <Stack spacing={3}>
    <Box>
      <Typography variant="h4">My profile</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.7 }}>You can update contact details, address, and emergency contact. Password, CRM role, job title, and salary are managed by Admin.</Typography>
    </Box>
    <Card><CardContent>
      <Stack spacing={2}>
        <Typography variant="h6">{[profile.data?.firstName, profile.data?.lastName].filter(Boolean).join(' ') || 'Your profile'}</Typography>
        <Typography color="text.secondary">{profile.data?.companyEmail || profile.data?.personalEmail} · {(profile.data?.employmentStatus || '').replaceAll('_', ' ')}</Typography>
        <Typography color="text.secondary">{[profile.data?.designation?.name, profile.data?.specialization].filter(Boolean).join(' · ') || 'Job title is managed by Admin'}</Typography>
        <TextField label="Phone" value={form.phone} onChange={set('phone')} />
        <TextField label="Alternate phone" value={form.alternatePhone} onChange={set('alternatePhone')} />
        <TextField label="Personal email" value={form.personalEmail} onChange={set('personalEmail')} />
        <AddressFields title="Current address" value={address} onChange={setAddress} />
        <TextField label="Emergency contact name" value={form.emergencyName} onChange={set('emergencyName')} />
        <TextField label="Emergency contact phone" value={form.emergencyPhone} onChange={set('emergencyPhone')} />
        <TextField label="Relation" value={form.emergencyRelation} onChange={set('emergencyRelation')} />
        {save.isError && <Alert severity="error">{apiErrorMessage(save.error, 'Could not update your profile.')}</Alert>}
        {save.isSuccess && <Alert severity="success">Profile updated.</Alert>}
        <Button variant="contained" disabled={save.isPending} onClick={() => save.mutate()} sx={{ alignSelf: 'flex-start' }}>{save.isPending ? 'Saving…' : 'Save profile'}</Button>
      </Stack>
    </CardContent></Card>
  </Stack>;
}

export default function MyProfile() {
  const { user, can } = useAuth();
  if (user?.employeeId && can('employee:read')) return <Navigate to={`/employees/${user.employeeId}`} replace />;
  if (user?.employeeId) return <Profile type="employees" profileId={user.employeeId} self />;
  return <UnlinkedProfile />;
}
