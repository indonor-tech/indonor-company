import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Link, Stack, Typography } from '@mui/material';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DeleteInterviewDialog, InterviewDialog, MeetLinks, ResultChip, candidateName, interviewResult } from '../components/InterviewRecords';
import { ConvertEmployeeDialog, candidateIdOf } from '../components/ConvertEmployeeDialog';
import { OfferLetterDialog } from '../components/OfferLetterDialog';

function Info({ label, value }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Typography color="text.secondary" sx={{ width: 180 }}>{label}</Typography><Typography fontWeight={600}>{value || '—'}</Typography></Stack>;
}

export default function InterviewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [offering, setOffering] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['interviews', 'detail', id], queryFn: () => api.get(`/interviews/${id}`).then((response) => response.data.data) });
  const createMeet = useMutation({
    mutationFn: () => api.post(`/interviews/${id}/meet`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interviews'] })
  });
  if (isLoading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 400 }}><CircularProgress /></Box>;
  if (error || !data) return <Alert severity="error">This interview could not be loaded.</Alert>;
  const feedback = data.feedbackHistory || [];
  const passed = interviewResult(data) === 'PASS';
  const convertedId = data.candidate?.convertedEmployeeId;
  return <Stack spacing={3}>
    <Button onClick={() => navigate('/interviews')} sx={{ alignSelf: 'flex-start' }}>← Back to interviews</Button>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
      <Box>
        <Typography variant="h4">{data.round} interview</Typography>
        <Typography color="text.secondary" sx={{ mt: .7 }}>{candidateName(data.candidate)} · {data.interviewId || 'Interview record'}</Typography>
        <Stack direction="row" gap={1} sx={{ mt: 1.5 }}><Chip size="small" label={(data.status || '').replaceAll('_', ' ')} /><ResultChip result={interviewResult(data)} /></Stack>
      </Box>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {passed && can('candidate:update') && !convertedId && <Button variant="contained" onClick={() => setOffering(true)}>Generate offer letter</Button>}
        {passed && can('employee:create') && !convertedId && <Button variant="outlined" onClick={() => setConverting(true)}>Convert to employee</Button>}
        {convertedId && <Button variant="outlined" onClick={() => navigate(`/employees/${convertedId}`)}>Open employee</Button>}
        {can('interview:update') && <Button variant="outlined" onClick={() => setEditing(true)}>Edit</Button>}
        {can('interview:update') && data.startTime && !data.meetUrl && <Button variant="outlined" onClick={() => createMeet.mutate()} disabled={createMeet.isPending}>{createMeet.isPending ? 'Creating Meet…' : 'Create Google Meet'}</Button>}
        {can('interview:delete') && <Button color="error" variant="outlined" onClick={() => setRemoving(true)}>Delete</Button>}
      </Stack>
    </Stack>
    {passed && !convertedId && can('candidate:update') && <Alert severity="success">This interview passed. Generate an offer letter with joining date, role, and salary, then convert the candidate when they join.</Alert>}
    <Card><CardContent><Stack spacing={2}>
      <Info label="Candidate" value={candidateName(data.candidate)} />
      <Info label="Registration" value={data.candidate?.candidateRegistrationNumber} />
      <Info label="Interviewer" value={data.interviewer?.name} />
      <Info label="Date" value={data.interviewDate && new Date(data.interviewDate).toLocaleDateString()} />
      <Info label="Time" value={[data.startTime, data.endTime].filter(Boolean).join(' – ')} />
      <Info label="Mode" value={data.mode} />
      {data.meetUrl && <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}><Typography color="text.secondary" sx={{ width: 180 }}>Google Meet</Typography><Link href={data.meetUrl} target="_blank" rel="noreferrer" fontWeight={600}>{data.meetUrl}</Link></Stack>}
      {data.calendarHtmlLink && <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}><Typography color="text.secondary" sx={{ width: 180 }}>Google Calendar</Typography><Link href={data.calendarHtmlLink} target="_blank" rel="noreferrer" fontWeight={600}>Open event</Link></Stack>}
      {data.meetError && !data.meetUrl && <Alert severity="warning">{data.meetError}</Alert>}
      {createMeet.isError && <Alert severity="error">{createMeet.error.response?.data?.message || 'Could not create Google Meet.'}</Alert>}
      <MeetLinks interview={data} />
      <Info label="Position / technology" value={data.technology || data.position} />
      <Info label="Result" value={interviewResult(data)} />
      <Info label="Notes" value={data.resultNotes} />
      <Info label="Recorded by" value={data.resultRecordedBy?.name} />
      <Info label="Created by" value={data.createdBy?.name} />
    </Stack></CardContent></Card>
    <Card><CardContent>
      <Typography variant="h6" mb={2}>Feedback history</Typography>
      <Stack divider={<Divider />} spacing={2}>
        {feedback.map((entry) => <Box key={entry._id}>
          <Typography fontWeight={650}>{entry.recommendation?.replaceAll('_', ' ') || 'Feedback'}{entry.overallScore != null ? ` · ${entry.overallScore}/10` : ''}</Typography>
          <Typography variant="body2" color="text.secondary">{entry.feedback || 'No written notes'} · {entry.submittedBy?.name || 'Interviewer'} · {entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : ''}</Typography>
        </Box>)}
        {!feedback.length && <Typography color="text.secondary">No feedback entries yet.</Typography>}
      </Stack>
    </CardContent></Card>
    <InterviewDialog open={editing} mode="edit" interview={data} onClose={() => setEditing(false)} onSaved={(_interview, result) => { if (result === 'PASS') setOffering(true); }} />
    <DeleteInterviewDialog interview={removing ? data : null} onClose={() => setRemoving(false)} onDeleted={() => navigate('/interviews')} />
    <ConvertEmployeeDialog open={converting} candidateId={candidateIdOf(data)} candidate={data.candidate} onClose={() => setConverting(false)} />
    <OfferLetterDialog open={offering} candidateId={candidateIdOf(data)} candidate={data.candidate} onClose={() => setOffering(false)} />
  </Stack>;
}
