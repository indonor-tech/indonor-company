import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { api } from '../services/api';

function ReportCard({ title, rows }) { return <Card><CardContent><Typography variant="h6" mb={2}>{title}</Typography><Stack spacing={1.2}>{Object.entries(rows || {}).map(([name, count]) => <Stack key={name} direction="row" justifyContent="space-between"><Typography variant="body2">{name.replaceAll('_', ' ')}</Typography><Typography fontWeight={700}>{count}</Typography></Stack>)}</Stack></CardContent></Card>; }
export default function Reports() {
  const { data, error } = useQuery({ queryKey: ['reports'], queryFn: () => api.get('/dashboard').then((response) => response.data.data) });
  return <Stack spacing={3}><BoxTitle /><Typography color="text.secondary">Operational summaries refresh from the live HR database.</Typography>{error && <Alert severity="error">Reports are unavailable.</Alert>}<Grid container spacing={2.5}><Grid size={{ xs: 12, md: 3 }}><ReportCard title="Employees by status" rows={data?.employees} /></Grid><Grid size={{ xs: 12, md: 3 }}><ReportCard title="Recruitment by stage" rows={data?.candidates} /></Grid><Grid size={{ xs: 12, md: 3 }}><ReportCard title="Interviews by status" rows={data?.interviews} /></Grid><Grid size={{ xs: 12, md: 3 }}><ReportCard title="Interview results" rows={data?.interviewResults} /></Grid></Grid></Stack>;
}
function BoxTitle() { return <Typography variant="h4">Reports</Typography>; }
