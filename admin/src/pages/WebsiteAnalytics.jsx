import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../services/api';

const teal = '#0f766e';

function formatDuration(ms = 0) {
  const total = Math.max(0, Math.round(Number(ms) / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatWhen(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function eventLabel(event) {
  if (event.type === 'click') return `Clicked ${event.click?.text || event.click?.tag || 'element'} on ${event.path || 'page'}`;
  if (event.type === 'page_view') return `Opened ${event.path || '/'}`;
  if (event.type === 'page_leave') return `Left ${event.path || '/'} after ${formatDuration(event.durationMs)}`;
  if (event.type === 'scroll') return `Scrolled ${event.scrollPercent || 0}% on ${event.path || '/'}`;
  if (event.type === 'heartbeat') return `Still on ${event.path || '/'} (${formatDuration(event.durationMs)})`;
  if (event.type === 'form_submit') return `Submitted the ${event.form || 'contact'} form on ${event.path || '/'}`;
  if (event.type === 'session_end') return `Ended visit on ${event.path || '/'}`;
  return `${event.type} on ${event.path || '/'}`;
}

function pagesPreview(row) {
  const pages = row.pages?.length ? row.pages : [row.landingPage || '/'];
  return pages.join(', ');
}

export default function WebsiteAnalytics() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const summary = useQuery({ queryKey: ['website-analytics-summary'], queryFn: () => api.get('/website-analytics/summary', { params: { days: 14 } }).then((response) => response.data.data) });
  const sessions = useQuery({ queryKey: ['website-analytics-sessions', search], queryFn: () => api.get('/website-analytics/sessions', { params: { q: search || undefined, days: 14, limit: 50 } }).then((response) => response.data) });
  const detail = useQuery({
    queryKey: ['website-analytics-session', selectedId],
    queryFn: () => api.get(`/website-analytics/sessions/${selectedId}`).then((response) => response.data.data),
    enabled: Boolean(selectedId)
  });
  const today = summary.data?.today || {};
  const rows = sessions.data?.data || [];
  return <Stack spacing={3}>
    <Box>
      <Typography variant="h4">Website traffic</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.7 }}>Daily visitors, time on each page, and clicks from indonortech.com.</Typography>
    </Box>
    {summary.isError && <Alert severity="error">Could not load website analytics.</Alert>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      {[['Visits today', today.visits], ['Unique visitors today', today.uniqueVisitors], ['Page views today', today.pageViews], ['Avg. time on site', formatDuration(today.avgDurationMs)]].map(([label, value]) => (
        <Card key={label} sx={{ flex: 1 }}><CardContent><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h4" sx={{ mt: 1 }}>{value ?? 0}</Typography></CardContent></Card>
      ))}
    </Stack>
    <Card><CardContent>
      <Typography variant="h6">Last 14 days</Typography>
      <Box sx={{ width: '100%', height: 280, mt: 2 }}>
        <ResponsiveContainer><BarChart data={summary.data?.daily || []}><CartesianGrid vertical={false} stroke="#edf1f3" /><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="visits" fill={teal} radius={[5, 5, 0, 0]} name="Visits" /></BarChart></ResponsiveContainer>
      </Box>
    </CardContent></Card>
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
      <Card sx={{ flex: 1 }}><CardContent>
        <Typography variant="h6" mb={2}>Top pages</Typography>
        {(summary.data?.topPages || []).map((page) => <Stack key={page.path} direction="row" justifyContent="space-between" gap={2} sx={{ py: 0.8 }}>
          <Typography variant="body2">{page.path || '/'}</Typography>
          <Typography variant="body2" color="text.secondary">{page.views} views · {formatDuration(page.avgTimeMs)}</Typography>
        </Stack>)}
        {!summary.data?.topPages?.length && <Typography color="text.secondary">No page views yet. Open the public website to start collecting traffic.</Typography>}
      </CardContent></Card>
      <Card sx={{ flex: 1 }}><CardContent>
        <Typography variant="h6" mb={2}>Devices</Typography>
        {(summary.data?.devices || []).map((item) => <Stack key={item.device} direction="row" justifyContent="space-between" sx={{ py: 0.8 }}>
          <Typography variant="body2">{(item.device || 'unknown').replace(/^./, (letter) => letter.toUpperCase())}</Typography>
          <Chip size="small" label={item.count} />
        </Stack>)}
        {!summary.data?.devices?.length && <Typography color="text.secondary">Device mix appears after the first visits.</Typography>}
      </CardContent></Card>
    </Stack>
    <Card><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: 'center' }}>
        <Typography variant="h6" sx={{ flex: 1 }}>Recent visitors</Typography>
        <TextField size="small" placeholder="Search IP, page, or session…" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: 260 }} />
      </Stack>
      {sessions.isLoading ? <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>
        : sessions.isError ? <Alert severity="error">Could not load visitor sessions.</Alert>
          : !rows.length ? <Typography color="text.secondary">No visitors recorded yet.</Typography>
            : <Table size="small"><TableHead><TableRow><TableCell>Last seen</TableCell><TableCell>IP</TableCell><TableCell>Landing page</TableCell><TableCell>Pages in this visit</TableCell><TableCell>Device</TableCell><TableCell>Time</TableCell><TableCell align="right">Details</TableCell></TableRow></TableHead>
              <TableBody>{rows.map((row) => <TableRow hover key={row.sessionId}>
                <TableCell>{formatWhen(row.lastSeenAt)}</TableCell>
                <TableCell>{row.ip || '—'}</TableCell>
                <TableCell>{row.landingPage || '/'}</TableCell>
                <TableCell><Typography variant="body2">{row.pageCount || row.pages?.length || 1} page{(row.pageCount || row.pages?.length || 1) === 1 ? '' : 's'}</Typography><Typography variant="caption" color="text.secondary">{pagesPreview(row)}</Typography></TableCell>
                <TableCell>{[row.deviceType, row.browser, row.os].filter(Boolean).join(' · ') || '—'}</TableCell>
                <TableCell>{formatDuration(row.durationMs)}</TableCell>
                <TableCell align="right"><Button size="small" onClick={() => setSelectedId(row.sessionId)}>View</Button></TableCell>
              </TableRow>)}</TableBody></Table>}
    </CardContent></Card>
    <Dialog open={Boolean(selectedId)} onClose={() => setSelectedId('')} fullWidth maxWidth="md">
      <DialogTitle>Visitor activity</DialogTitle>
      <DialogContent dividers>
        {detail.isLoading ? <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
          : detail.data ? <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">IP {detail.data.session.ip || '—'} · {detail.data.session.browser} on {detail.data.session.os} · {formatWhen(detail.data.session.startedAt)} to {formatWhen(detail.data.session.lastSeenAt)}</Typography>
            <Typography variant="body2" color="text.secondary">Total time {formatDuration(detail.data.session.durationMs)} · Referrer {detail.data.session.referrer || 'direct'}</Typography>
            <Typography variant="subtitle1" fontWeight={700}>Pages in this visit</Typography>
            {(detail.data.pages || []).map((page) => <Stack key={page.path} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ p: 1.5, border: '1px solid #eef2f3', borderRadius: 2 }}>
              <Typography fontWeight={650}>{page.path}</Typography>
              <Typography variant="body2" color="text.secondary">{page.views} view{page.views === 1 ? '' : 's'} · {formatDuration(page.timeMs)} · {page.clicks} click{page.clicks === 1 ? '' : 's'}{page.formSubmitted ? ' · form submitted' : ''}</Typography>
            </Stack>)}
            <Typography variant="subtitle1" fontWeight={700}>Activity</Typography>
            {(detail.data.events || []).map((event) => <Stack key={event._id} spacing={0.3} sx={{ p: 1.5, border: '1px solid #eef2f3', borderRadius: 2 }}>
              <Typography fontWeight={650}>{eventLabel(event)}</Typography>
              <Typography variant="caption" color="text.secondary">{formatWhen(event.occurredAt)}</Typography>
            </Stack>)}
            {!detail.data.events?.length && <Typography color="text.secondary">No events were stored for this visit.</Typography>}
          </Stack> : <Alert severity="error">Could not load this visit.</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setSelectedId('')}>Close</Button></DialogActions>
    </Dialog>
  </Stack>;
}
