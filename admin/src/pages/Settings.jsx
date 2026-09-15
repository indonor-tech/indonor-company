import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import ChangePasswordForm from '../components/ChangePasswordForm';
import { api, apiErrorMessage } from '../services/api';

const roleCopy = {
  SUPER_ADMIN: 'You can manage every CRM login, including Admins, and all HR and website tools. Manager and Employee passwords and roles are set in CRM users.',
  ADMIN: 'You can create and update Managers and Employees, including their CRM role and password. They cannot change those themselves.'
};

function GoogleCalendarCard() {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const googleResult = params.get('google');
  const status = useQuery({ queryKey: ['google-calendar'], queryFn: () => api.get('/google-calendar/status').then((response) => response.data.data) });
  const connect = useMutation({
    mutationFn: () => api.get('/google-calendar/connect').then((response) => response.data.data.url),
    onSuccess: (url) => { window.location.href = url; }
  });
  const disconnect = useMutation({
    mutationFn: () => api.delete('/google-calendar'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['google-calendar'] })
  });
  const data = status.data;
  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="h6">Google Calendar & Meet</Typography>
          <Typography color="text.secondary">
            Connect <strong>ghulam.shubhani9909@gmail.com</strong>. When you set an interview start time, CRM creates a Google Meet and places the event on that calendar.
          </Typography>
          {googleResult === 'connected' && <Alert severity="success" onClose={() => setParams({})}>Google Calendar is connected.</Alert>}
          {googleResult === 'error' && <Alert severity="error" onClose={() => setParams({})}>Google Calendar could not be connected. Sign in with ghulam.shubhani9909@gmail.com and allow calendar access.</Alert>}
          {status.isError && <Alert severity="error">{apiErrorMessage(status.error, 'Could not load Google Calendar status.')}</Alert>}
          {data?.connected ? (
            <Alert severity="success">Connected as {data.email || 'Google account'}. New timed interviews will appear in Google Calendar with a Meet link.</Alert>
          ) : (
            <Alert severity="info">Not connected yet. Create a Google Cloud OAuth web client, put the client ID and secret in the API .env, then click Connect.</Alert>
          )}
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button variant="contained" onClick={() => connect.mutate()} disabled={connect.isPending}>{connect.isPending ? 'Opening Google…' : data?.connected ? 'Reconnect Google' : 'Connect Google Calendar'}</Button>
            {data?.connected && <Button color="error" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>Disconnect</Button>}
          </Stack>
          {connect.isError && <Alert severity="error">{apiErrorMessage(connect.error, 'Could not start Google Calendar connect.')}</Alert>}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Settings</Typography>
      <Typography color="text.secondary">Your account. Manager and Employee logins are controlled from CRM users — they cannot change their own password or role.</Typography>
      <Card>
        <CardContent>
          <Typography variant="h6">Your access</Typography>
          <Typography sx={{ mt: 1 }}>Signed in as <strong>{user?.email}</strong></Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Role: {(user?.role || '').replaceAll('_', ' ')}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1.5 }}>{roleCopy[user?.role] || 'Access is limited to what your Admin assigned.'}</Typography>
        </CardContent>
      </Card>
      <GoogleCalendarCard />
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Change password</Typography>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </Stack>
  );
}
