import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Divider, FormControl, List, ListItemButton, ListItemText,
  MenuItem, Select, Stack, TextField, Typography
} from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { SALES_PIPELINE_STATUSES, labelize, money } from '../../constants/crm';

export default function CrmLeadBoard() {
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [error, setError] = useState('');
  const [activeStage, setActiveStage] = useState('NEW');
  const readOnly = isViewAdmin || !can('crm:leads:write');

  const board = useQuery({
    queryKey: ['crm-lead-board', search, assignedTo],
    queryFn: () => api.get('/crm/leads/board', { params: { q: search || undefined, assignedTo: assignedTo || undefined } }).then((r) => r.data.data)
  });
  const sales = useQuery({
    queryKey: ['crm-directory', 'sales'],
    queryFn: () => api.get('/crm/directory', { params: { kind: 'sales' } }).then((r) => r.data.data),
    retry: false
  });

  const move = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/crm/leads/${id}`, { status }),
    onSuccess: () => {
      setError('');
      client.invalidateQueries({ queryKey: ['crm-lead-board'] });
      client.invalidateQueries({ queryKey: ['crm-leads'] });
      client.invalidateQueries({ queryKey: ['crm-lead-dashboard'] });
    },
    onError: (err) => setError(apiErrorMessage(err, 'Could not move lead'))
  });

  const columns = board.data?.columns || {};
  const stages = board.data?.stages || SALES_PIPELINE_STATUSES;
  const stageLeads = columns[activeStage] || [];

  useEffect(() => {
    if (!stages.includes(activeStage) && stages[0]) setActiveStage(stages[0]);
  }, [stages, activeStage]);

  const total = useMemo(
    () => stages.reduce((sum, stage) => sum + (columns[stage]?.length || 0), 0),
    [stages, columns]
  );

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Sales pipeline</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.4 }}>
            Select a stage to review leads. {total} open opportunities.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button size="small" variant="outlined" onClick={() => navigate('/crm/leads')}>View list</Button>
          {!readOnly && (
            <Button size="small" variant="contained" onClick={() => navigate('/crm/leads')}>Add lead</Button>
          )}
        </Stack>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          size="small"
          placeholder="Search pipeline…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ maxWidth: 320 }}
        />
        <TextField select size="small" label="Salesperson" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">All owners</MenuItem>
          {(sales.data || []).map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
        </TextField>
      </Stack>
      {(board.data?.overdueAlerts || []).length > 0 && (
        <Alert severity="warning">{board.data.overdueAlerts.length} lead(s) have overdue follow-ups or payments.</Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {board.isError && <Alert severity="error">Could not load sales board.</Alert>}

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '220px 1fr' },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
        minHeight: { xs: 420, md: 560 },
        overflow: 'hidden'
      }}>
        <Box sx={{
          borderRight: { md: '1px solid' },
          borderBottom: { xs: '1px solid', md: 0 },
          borderColor: 'divider',
          bgcolor: '#fafbfc',
          maxHeight: { xs: 220, md: 'none' },
          overflowY: 'auto'
        }}>
          <Typography variant="overline" sx={{ px: 1.75, pt: 1.5, display: 'block', color: 'text.secondary' }}>
            Stages
          </Typography>
          <List dense disablePadding sx={{ px: 0.75, pb: 1 }}>
            {stages.map((stage) => {
              const count = columns[stage]?.length || 0;
              const selected = stage === activeStage;
              return (
                <ListItemButton
                  key={stage}
                  selected={selected}
                  onClick={() => setActiveStage(stage)}
                  sx={{ mb: 0.25, py: 0.7, borderRadius: 1 }}
                >
                  <ListItemText
                    primary={labelize(stage)}
                    primaryTypographyProps={{ fontSize: 13, fontWeight: selected ? 700 : 550 }}
                  />
                  <Chip
                    size="small"
                    label={count}
                    color={stage === 'WON' ? 'success' : stage === 'LOST' ? 'default' : selected ? 'primary' : 'default'}
                    variant={selected ? 'filled' : 'outlined'}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Box>

        <Box sx={{ p: { xs: 1.5, md: 2 }, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography fontWeight={700}>{labelize(activeStage)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {stageLeads.length} lead{stageLeads.length === 1 ? '' : 's'}
              </Typography>
            </Box>
          </Stack>
          <Divider sx={{ mb: 1.5 }} />
          {board.isLoading ? (
            <Typography color="text.secondary">Loading stage…</Typography>
          ) : stageLeads.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography fontWeight={650}>No leads in this stage</Typography>
              <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
                Move a lead here from another stage or create a new one.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1} sx={{ overflowY: 'auto', flex: 1, pr: 0.5 }}>
              {stageLeads.map((lead) => (
                <Box
                  key={lead._id}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    px: 1.5,
                    py: 1.25,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr auto' },
                    gap: 1,
                    alignItems: 'center',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <Box sx={{ minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(`/crm/leads/${lead._id}`)}>
                    <Typography fontWeight={650} noWrap>{lead.leadName} {lead.overdueAlert ? '· overdue' : ''}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block" noWrap>
                      {lead.leadId} · {lead.assignedTo?.name || 'Unassigned'} · {money(lead.quotedAmount, lead.currency)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" noWrap>
                      Next: {lead.nextFollowUp?.nextFollowUpDate ? new Date(lead.nextFollowUp.nextFollowUpDate).toLocaleDateString() : '—'}
                      {lead.projectStatus ? ` · Project ${labelize(lead.projectStatus)}` : ''}
                      {lead.outstandingPayment ? ` · Outstanding ${money(lead.outstandingPayment, lead.currency)}` : ''}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                    <Button size="small" onClick={() => navigate(`/crm/leads/${lead._id}`)}>Open</Button>
                    {!readOnly && (
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <Select
                          value={activeStage}
                          onChange={(event) => move.mutate({ id: lead._id, status: event.target.value })}
                          disabled={move.isPending}
                        >
                          {SALES_PIPELINE_STATUSES.map((option) => (
                            <MenuItem key={option} value={option}>{labelize(option)}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </Stack>
  );
}
