import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, FormControlLabel, Stack, Switch, TablePagination, Typography } from '@mui/material';
import { api } from '../services/api';

const formatWhen = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function Notifications() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const params = { page: page + 1, limit: 30, ...(unreadOnly && { unread: 'true' }) };
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications', params],
    queryFn: () => api.get('/notifications', { params }).then((response) => ({ rows: response.data.data, meta: response.data.meta })),
    placeholderData: keepPreviousData
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({ mutationFn: (id) => api.patch(`/notifications/${id}/read`), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api.patch('/notifications/read-all'), onSuccess: refresh });
  const open = (item) => {
    if (!item.readAt) markRead.mutate(item._id);
    if (item.link && item.link.startsWith('/')) navigate(item.link);
  };
  const rows = data?.rows || [];
  const unread = data?.meta?.unread ?? 0;
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} spacing={2}>
        <Box>
          <Typography variant="h4">Notifications</Typography>
          <Typography color="text.secondary">Task assignments, mentions, comments, deadlines, daily log reminders and correction decisions, plus interview, follow-up and employee date reminders.</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControlLabel control={<Switch checked={unreadOnly} onChange={(event) => { setUnreadOnly(event.target.checked); setPage(0); }} />} label="Unread only" />
          <Button variant="outlined" onClick={() => markAll.mutate()} disabled={!unread || markAll.isPending}>Mark all read</Button>
        </Stack>
      </Stack>
      <Card>
        <CardContent>
          {isLoading ? <CircularProgress /> : error ? <Alert severity="error">Notifications are unavailable.</Alert> : rows.length ? (
            <Stack divider={<Divider flexItem />}>
              {rows.map((item) => (
                <Stack
                  key={item._id} direction="row" justifyContent="space-between" gap={2} onClick={() => open(item)}
                  sx={{ py: 1.5, px: 1, borderRadius: 1, cursor: item.link || !item.readAt ? 'pointer' : 'default', bgcolor: item.readAt ? 'transparent' : 'rgba(15,118,110,0.04)', '&:hover': { bgcolor: '#f8fafb' } }}
                >
                  <Stack sx={{ minWidth: 0 }}>
                    <Typography fontWeight={item.readAt ? 500 : 700}>{item.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{item.message}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatWhen(item.createdAt)}{item.link ? ' · Open' : ''}</Typography>
                  </Stack>
                  <Chip size="small" label={item.readAt ? 'Read' : 'New'} color={item.readAt ? 'default' : 'primary'} sx={{ flexShrink: 0 }} />
                </Stack>
              ))}
            </Stack>
          ) : <Typography color="text.secondary">You’re all caught up.</Typography>}
        </CardContent>
        <TablePagination component="div" count={data?.meta?.total || 0} page={page} rowsPerPage={30} rowsPerPageOptions={[30]} onPageChange={(_event, value) => setPage(value)} />
      </Card>
    </Stack>
  );
}
