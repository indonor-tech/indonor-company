import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { api } from '../services/api';

export default function Notifications() {
  const { data, isLoading, error } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/notifications').then((response) => response.data.data) });
  return <Stack spacing={3}><Typography variant="h4">Notifications</Typography><Typography color="text.secondary">Automated reminders for interviews, follow-ups and key employee dates.</Typography><Card><CardContent>{isLoading ? <CircularProgress /> : error ? <Alert severity="error">Notifications are unavailable.</Alert> : data?.length ? <Stack spacing={2}>{data.map((item) => <Stack key={item._id} direction="row" justifyContent="space-between" gap={2}><Stack><Typography fontWeight={650}>{item.title}</Typography><Typography variant="body2" color="text.secondary">{item.message}</Typography></Stack><Chip size="small" label={item.readAt ? 'Read' : 'New'} color={item.readAt ? 'default' : 'primary'} /></Stack>)}</Stack> : <Typography color="text.secondary">You’re all caught up.</Typography>}</CardContent></Card></Stack>;
}
