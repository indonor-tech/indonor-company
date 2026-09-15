import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DeleteInterviewDialog, InterviewDialog, InterviewTable, ResultDialog, interviewResult } from '../components/InterviewRecords';
import { ConvertEmployeeDialog, candidateIdOf } from '../components/ConvertEmployeeDialog';
import { OfferLetterDialog } from '../components/OfferLetterDialog';

export default function Interviews() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [convertId, setConvertId] = useState(null);
  const [offerId, setOfferId] = useState(null);
  const afterResult = (_interview, result, id) => {
    if (result !== 'PASS' || !id) return;
    if (can('candidate:update')) setOfferId(id);
    else if (can('employee:create')) setConvertId(id);
  };
  const { data, isLoading, error } = useQuery({ queryKey: ['interviews'], queryFn: () => api.get('/interviews', { params: { limit: 100 } }).then((response) => response.data.data) });
  const rows = useMemo(() => {
    const list = data || [];
    if (tab === 1) return list.filter((interview) => interview.status === 'SCHEDULED' && interviewResult(interview) === 'PENDING');
    if (tab === 2) return list.filter((interview) => interviewResult(interview) !== 'PENDING' || interview.status === 'COMPLETED');
    return list;
  }, [data, tab]);
  const takenCount = (data || []).filter((interview) => interviewResult(interview) !== 'PENDING' || interview.status === 'COMPLETED').length;
  return <Stack spacing={3}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
      <Box><Typography variant="h4">Interviews</Typography><Typography color="text.secondary" sx={{ mt: .7 }}>Schedule rounds and keep every taken interview with a pass or fail result.</Typography></Box>
      {can('interview:create') && <Stack direction="row" gap={1}><Button variant="outlined" onClick={() => setDialog('schedule')}>Schedule interview</Button><Button variant="contained" onClick={() => setDialog('taken')}>Record taken interview</Button></Stack>}
    </Stack>
    <Card>
      <Tabs value={tab} onChange={(_event, value) => setTab(value)} variant="scrollable">
        <Tab label={`All (${data?.length || 0})`} />
        <Tab label={`Scheduled (${(data || []).filter((interview) => interview.status === 'SCHEDULED' && interviewResult(interview) === 'PENDING').length})`} />
        <Tab label={`Taken (${takenCount})`} />
      </Tabs>
      <CardContent>
        {isLoading ? <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box> : error ? <Alert severity="error">Could not load interviews.</Alert> : !rows.length ? <Box sx={{ textAlign: 'center', py: 8 }}><Typography color="primary" fontSize={44}>◷</Typography><Typography variant="h6" sx={{ mt: 1 }}>{tab === 2 ? 'No taken interviews yet' : tab === 1 ? 'No scheduled interviews' : 'Your interview calendar is clear'}</Typography><Typography color="text.secondary">{tab === 2 ? 'Record completed rounds here so pass and fail history is never lost.' : 'Scheduled interviews will appear here.'}</Typography></Box> : <InterviewTable rows={rows} canUpdate={can('interview:update')} canDelete={can('interview:delete')} onView={(interview) => navigate(`/interviews/${interview._id}`)} onEdit={setEditing} onDelete={setRemoving} onRecordResult={setSelected} onConvert={(interview) => setConvertId(candidateIdOf(interview))} onOpenEmployee={(employeeId) => navigate(`/employees/${employeeId}`)} />}
      </CardContent>
    </Card>
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Chip size="small" color="success" label={`${(data || []).filter((interview) => interviewResult(interview) === 'PASS').length} passed`} />
      <Chip size="small" color="error" label={`${(data || []).filter((interview) => interviewResult(interview) === 'FAIL').length} failed`} />
      <Chip size="small" label={`${(data || []).filter((interview) => interviewResult(interview) === 'PENDING').length} pending result`} />
    </Stack>
    <InterviewDialog open={Boolean(dialog)} mode={dialog || 'schedule'} onClose={() => setDialog(null)} onSaved={afterResult} />
    <InterviewDialog open={Boolean(editing)} mode="edit" interview={editing} onClose={() => setEditing(null)} onSaved={afterResult} />
    <ResultDialog interview={selected} onClose={() => setSelected(null)} onSaved={afterResult} />
    <DeleteInterviewDialog interview={removing} onClose={() => setRemoving(null)} />
    <ConvertEmployeeDialog open={Boolean(convertId)} candidateId={convertId} onClose={() => setConvertId(null)} />
    <OfferLetterDialog open={Boolean(offerId)} candidateId={offerId} onClose={() => setOfferId(null)} />
  </Stack>;
}
