import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const colors = { teal: '#0f766e', amber: '#f59e0b', purple: '#7c3aed', blue: '#2563eb' };
function Metric({ icon, label, value, color }) { return <Card sx={{ height: '100%' }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h4" sx={{ mt: 1 }}>{value ?? 0}</Typography></Box><Box sx={{ p: 1.2, borderRadius: 2, bgcolor: `${color}18`, color }}>{icon}</Box></Stack></CardContent></Card>; }
function total(rows = {}) { return Object.values(rows).reduce((sum, value) => sum + value, 0); }
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard').then((response) => response.data.data) });
  if (isLoading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 400 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">Unable to load dashboard. Check that the API and database are running.</Alert>;
  if (data?.kind === 'employee') {
    const employee = data.employee;
    return (
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4">Welcome{user?.name ? `, ${user.name}` : ''}</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.7 }}>This is your employee dashboard. Open My profile to view or edit the tabs Admin has allowed. Job title and employment status stay with Admin.</Typography>
        </Box>
        {!data.linked && <Alert severity="info">Your login is not linked to an employee profile yet. Ask an Admin to link it so you can view your details and update your contact information.</Alert>}
        {data.linked && (
          <>
            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Status" value={(employee.status || '—').replaceAll('_', ' ')} color={colors.teal} icon="◎" /></Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Department" value={employee.department || '—'} color={colors.blue} icon="◎" /></Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Designation" value={employee.designation || '—'} color={colors.purple} icon="✦" /></Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Joining date" value={formatDate(employee.joiningDate)} color={colors.amber} icon="◷" /></Grid>
            </Grid>
            <Card>
              <CardContent>
                <Stack spacing={1.2}>
                  <Typography variant="h6">{employee.name || user?.name}</Typography>
                  <Typography color="text.secondary">{employee.email}</Typography>
                  {employee.workLocation && <Typography color="text.secondary">Work location: {employee.workLocation}</Typography>}
                  {employee.type && <Chip size="small" label={employee.type.replaceAll('_', ' ')} sx={{ alignSelf: 'flex-start' }} />}
                  <Button component={Link} to="/me" variant="contained" sx={{ alignSelf: 'flex-start', mt: 1 }}>Update my profile</Button>
                </Stack>
              </CardContent>
            </Card>
          </>
        )}
      </Stack>
    );
  }
  const employees = data?.employees || {}; const candidates = data?.candidates || {};
  const chartData = (data?.byDepartment || []).map((item) => ({ name: item.name, employees: item.count }));
  const website = data?.website || {};
  const websiteToday = website.today || {};
  return <Stack spacing={4}>
    <Box><Typography variant="h4">Good morning, HR team</Typography><Typography color="text.secondary" sx={{ mt: .7 }}>Here’s what’s happening across your people operations and the IndonorTech website today.</Typography></Box>
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Total employees" value={data?.totalEmployees} color={colors.teal} icon="◎" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Active employees" value={(employees.ACTIVE || 0) + (employees.ON_PROBATION || 0)} color={colors.blue} icon="◎" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Candidates in pipeline" value={data?.totalCandidates} color={colors.purple} icon="✦" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Interviews scheduled" value={data?.interviews?.SCHEDULED} color={colors.amber} icon="◷" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Interviews passed" value={data?.interviewResults?.PASS} color={colors.teal} icon="✓" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Interviews failed" value={data?.interviewResults?.FAIL} color={colors.purple} icon="✕" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Website visits today" value={websiteToday.visits} color={colors.teal} icon="◎" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Website unique visitors" value={websiteToday.uniqueVisitors} color={colors.blue} icon="◎" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Website page views today" value={websiteToday.pageViews} color={colors.purple} icon="✦" /></Grid>
    </Grid>
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, lg: 8 }}><Card><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}><Box><Typography variant="h6">Employees by department</Typography><Typography color="text.secondary" variant="body2">Current workforce distribution</Typography></Box><Chip label={`${total(employees)} people`} size="small" /></Stack><Box sx={{ width: '100%', height: 300 }}><ResponsiveContainer><BarChart data={chartData}><CartesianGrid vertical={false} stroke="#edf1f3" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="employees" fill={colors.teal} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Box></CardContent></Card></Grid>
      <Grid size={{ xs: 12, lg: 4 }}><Card sx={{ height: '100%' }}><CardContent><Typography variant="h6">Recruitment pipeline</Typography><Typography color="text.secondary" variant="body2" mb={2}>Candidates by current stage</Typography><Stack spacing={1.6}>{Object.entries(candidates).slice(0, 7).map(([stage, count]) => <Stack key={stage} direction="row" justifyContent="space-between" alignItems="center"><Typography variant="body2">{stage.replaceAll('_', ' ')}</Typography><Chip label={count} size="small" color={stage === 'SELECTED' ? 'success' : 'default'} /></Stack>)}</Stack>{!Object.keys(candidates).length && <Typography color="text.secondary">No recruitment data yet.</Typography>}</CardContent></Card></Grid>
    </Grid>
    <Card><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} mb={2} gap={1}>
        <Box>
          <Typography variant="h6">IndonorTech website visits</Typography>
          <Typography color="text.secondary" variant="body2">Daily visitors from the public website</Typography>
        </Box>
        <Button component={Link} to="/website-analytics" size="small">Open traffic details</Button>
      </Stack>
      <Box sx={{ width: '100%', height: 260 }}><ResponsiveContainer><BarChart data={website.daily || []}><CartesianGrid vertical={false} stroke="#edf1f3" /><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="visits" fill={colors.blue} radius={[5, 5, 0, 0]} name="Visits" /></BarChart></ResponsiveContainer></Box>
    </CardContent></Card>
    <Card sx={{ bgcolor: '#effcf9', borderColor: '#b7ebe1' }}><CardContent><Stack direction="row" spacing={2} alignItems="center"><Typography color="primary" fontSize={24}>◷</Typography><Box><Typography fontWeight={700}>Stay ahead of important dates</Typography><Typography variant="body2" color="text.secondary">Upcoming interviews, probation endings and candidate follow-ups appear here as your team adds data.</Typography></Box></Stack></CardContent></Card>
  </Stack>;
}
