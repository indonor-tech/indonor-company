import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Card, CardContent, Chip, FormControl, MenuItem, Select, Stack, Typography } from '@mui/material';
import { api } from '../services/api';
import { formatApplyingRole } from '../components/GeoFields';

/** Netbase hiring order (plus terminal outcomes). */
const stages = [
  'NEW', 'SCREENING', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED',
  'SELECTED', 'REJECTED', 'OFFER_SENT', 'OFFER_ACCEPTED', 'ONBOARDING', 'JOINED'
];
const stageAlias = { APPLICATION: 'NEW', ACTIVE_EMPLOYEE: 'JOINED' };

export default function Pipeline() {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.get('/candidates', { params: { limit: 200 } }).then((response) => response.data.data)
  });
  const move = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/candidates/${id}`, { status }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['pipeline'] }),
    onError: (requestError) => setError(requestError.response?.data?.message || 'Could not move candidate')
  });
  const inStage = (candidate, stage) => {
    const status = stageAlias[candidate.status] || candidate.status;
    return status === stage;
  };
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Hiring pipeline</Typography>
        <Typography color="text.secondary" sx={{ mt: .7 }}>
          Job application → Screening → Shortlisted → Interview → Feedback → Selected/Rejected → Offer → Onboarding → Active employee
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {isLoading && <Typography>Loading pipeline…</Typography>}
      <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2 }}>
        {stages.map((stage) => (
          <Card key={stage} sx={{ minWidth: 260, flex: '0 0 260px', bgcolor: '#fbfcfd' }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography fontWeight={700}>{stage.replaceAll('_', ' ')}</Typography>
                <Chip size="small" label={data?.filter((candidate) => inStage(candidate, stage)).length || 0} />
              </Stack>
              <Stack spacing={1.5}>
                {data?.filter((candidate) => inStage(candidate, stage)).map((candidate) => (
                  <Card key={candidate._id} variant="outlined" sx={{ bgcolor: 'white' }}>
                    <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                      <Typography fontWeight={650}>{candidate.firstName} {candidate.lastName}</Typography>
                      <Typography variant="caption" color="text.secondary">{formatApplyingRole(candidate.applyingPosition, candidate.applyingTrack)}</Typography>
                      <FormControl size="small" fullWidth sx={{ mt: 1.5 }}>
                        <Select value={candidate.status === 'ONBOARDING' ? 'ONBOARDING' : candidate.status} onChange={(event) => move.mutate({ id: candidate._id, status: event.target.value })}>
                          {stages.map((option) => <MenuItem key={option} value={option}>{option.replaceAll('_', ' ')}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Stack>
  );
}
