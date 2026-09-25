import React, { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Avatar, AvatarGroup, Box, Breadcrumbs, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Grid, Link, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography
} from '@mui/material';
import { Add, ArrowBack, Edit, History, Inventory2Outlined, LockOutlined, RateReview, WarningAmber } from '@mui/icons-material';
import { apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { correctionApi, formatDate, formatDateTime, humanize, STATUS_OPTIONS, taskApi } from '../../services/tasks';
import { LockCountdown, PriorityChip, ProgressBar, StatusChip } from '../../components/tasks/TaskChips';
import { RichTextView } from '../../components/tasks/RichTextEditor';
import { MentionText, useMentionableUsers } from '../../components/tasks/MentionField';
import TaskFormDialog from '../../components/tasks/TaskFormDialog';
import SubtaskTree from '../../components/tasks/SubtaskTree';
import AuditTimeline from '../../components/tasks/AuditTimeline';
import AttachmentsPanel from '../../components/tasks/AttachmentsPanel';
import CommentsPanel from '../../components/tasks/CommentsPanel';
import CorrectionDialog from '../../components/tasks/CorrectionDialog';

function Field({ label, children }) {
  return (
    <Box sx={{ py: 0.9 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ fontSize: 14 }}>{children || '—'}</Box>
    </Box>
  );
}

function Person({ user }) {
  if (!user) return null;
  return <Stack direction="row" spacing={1} alignItems="center"><Avatar sx={{ width: 22, height: 22, fontSize: 11, bgcolor: 'primary.main' }}>{user.name?.[0]}</Avatar><span>{user.name}</span></Stack>;
}

function CorrectionsList({ corrections = [], timezone }) {
  if (!corrections.length) return <Typography variant="body2" color="text.secondary">No correction requests.</Typography>;
  const color = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' };
  return (
    <Stack spacing={1.5} divider={<Divider flexItem />}>
      {corrections.map((request) => (
        <Box key={request._id}>
          <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" color={color[request.status]} label={humanize(request.status)} /><Typography variant="caption" color="text.secondary">{humanize(request.targetType)} · {request.requestedBy?.name} · {formatDateTime(request.createdAt, timezone)}</Typography></Stack>
          <Typography variant="body2" sx={{ mt: 0.5 }}><strong>Reason:</strong> {request.reason}</Typography>
          {Object.entries(request.requestedChanges || {}).map(([key, value]) => (
            <Typography key={key} variant="caption" component="div">
              {humanize(key)}: <span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{String(request.originalValues?.[key] ?? '—').slice(0, 120)}</span> → <span style={{ color: '#15803d' }}>{String(value ?? '—').slice(0, 120)}</span>
            </Typography>
          ))}
          {request.reviewedBy && <Typography variant="caption" color="text.secondary" component="div">Reviewed by {request.reviewedBy.name} on {formatDateTime(request.reviewedAt, timezone)}{request.reviewNote ? ` · "${request.reviewNote}"` : ''}</Typography>}
        </Box>
      ))}
    </Stack>
  );
}

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { user, can } = useAuth();
  const [tab, setTab] = useState('comments');
  const [editing, setEditing] = useState(false);
  const [subtaskParent, setSubtaskParent] = useState(null);
  const [correction, setCorrection] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const { data: meta } = useQuery({ queryKey: ['task-meta'], queryFn: taskApi.meta, staleTime: 60_000 });
  const { data: users = [] } = useMentionableUsers();
  const { data: task, isLoading, error } = useQuery({ queryKey: ['task', id], queryFn: () => taskApi.get(id), retry: (count, reason) => reason?.response?.status !== 404 && count < 2 });
  const { data: timeline = [], isLoading: timelineLoading } = useQuery({ queryKey: ['task', id, 'timeline'], queryFn: () => taskApi.timeline(id), enabled: tab === 'history' });
  const refresh = () => client.invalidateQueries({ queryKey: ['task', id] });
  const status = useMutation({
    mutationFn: (value) => taskApi.status(id, value),
    onSuccess: () => { setActionError(''); refresh(); client.invalidateQueries({ queryKey: ['tasks'] }); },
    onError: (reason) => setActionError(apiErrorMessage(reason, 'Could not change status'))
  });
  const archive = useMutation({
    mutationFn: () => taskApi.archive(id),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['tasks'] }); navigate('/tasks/my'); },
    onError: (reason) => setActionError(apiErrorMessage(reason, 'Could not remove task'))
  });
  if (isLoading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 400 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" action={<Button onClick={() => navigate(-1)}>Back</Button>}>{error.response?.status === 404 ? 'Task not found or you do not have access to it.' : apiErrorMessage(error, 'Unable to load task')}</Alert>;
  const perms = task.permissions || {};
  const today = meta?.today;
  const limits = meta?.upload;
  const timezone = task.timezone;
  const canEditAnything = perms.editContent || perms.changeStatus || perms.changePriority || perms.changeDeadline || perms.logTime || perms.manageCollaborators || perms.assign;
  const correctionSubmit = (targetType, targetId) => async (form) => {
    if (targetType === 'Task') return taskApi.requestCorrection(targetId, form);
    form.append('targetType', targetType);
    form.append('targetId', targetId);
    return correctionApi.create(form);
  };
  const afterCorrection = () => { setCorrection(null); refresh(); };
  const original = task.original || {};
  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Breadcrumbs>
          <Link component={RouterLink} to="/tasks/my" underline="hover" color="inherit" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}><ArrowBack sx={{ fontSize: 16 }} />Tasks</Link>
          {(task.ancestors || []).map((ancestor) => <Link key={ancestor._id} component={RouterLink} to={`/tasks/${ancestor._id}`} underline="hover" color="inherit">{ancestor.taskKey}</Link>)}
          <Typography color="text.primary">{task.taskKey}</Typography>
        </Breadcrumbs>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" sx={{ wordBreak: 'break-word' }}>{task.title}</Typography>
            {original.title !== undefined && <Typography variant="caption" color="text.secondary">Original title: <span style={{ textDecoration: 'line-through' }}>{original.title}</span></Typography>}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              <StatusChip status={task.status} size="medium" />
              <PriorityChip priority={task.priority} size="medium" />
              {task.isLocked ? <Tooltip title={`The ${task.workDate} record locked at 23:59:59 (${timezone}). Content changes need a correction request.`}><Chip icon={<LockOutlined />} label={`Locked · ${formatDate(task.workDate)}`} /></Tooltip> : <LockCountdown lockAt={task.lockAt} serverTime={task.serverTime} timezone={timezone} />}
              {task.isOverdue && <Chip color="error" icon={<WarningAmber />} label="Overdue" />}
              {task.hasCorrections && <Chip color="secondary" variant="outlined" label={`Corrected (${task.correctionCount || 1})`} />}
              {task.isArchived && <Chip label="Removed" />}
            </Stack>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {perms.changeStatus && (
              <TextField select size="small" label="Status" value={task.status} onChange={(event) => status.mutate(event.target.value)} sx={{ minWidth: 150 }} disabled={status.isPending}>
                {STATUS_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
            )}
            {canEditAnything && <Button variant="outlined" startIcon={<Edit />} onClick={() => setEditing(true)}>Edit</Button>}
            {perms.createSubtask && can('task:create') && <Button variant="outlined" startIcon={<Add />} onClick={() => setSubtaskParent(task)}>Subtask</Button>}
            {perms.requestCorrection && <Button variant="outlined" color="secondary" startIcon={<RateReview />} onClick={() => setCorrection({ targetType: 'Task', targetId: task._id, record: task, title: task.taskKey })}>Request correction</Button>}
            {perms.archive && <Button color="error" startIcon={<Inventory2Outlined />} onClick={() => setArchiveOpen(true)}>Remove</Button>}
          </Stack>
        </Stack>
        {actionError && <Alert severity="error" onClose={() => setActionError('')}>{actionError}</Alert>}
        {task.isLocked && !perms.closed && perms.changeStatus && <Alert severity="info">This task was recorded on {formatDate(task.workDate)} and that day is locked. You can keep progressing it (status, time, deadline); each change is recorded as a new event without altering the locked history.</Alert>}
      </Stack>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2.5}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>Description</Typography>
                {task.description ? <Typography variant="body2" component="div"><MentionText text={task.description} users={users} /></Typography> : <Typography variant="body2" color="text.secondary">No description.</Typography>}
                {original.description !== undefined && <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>Original: <span style={{ textDecoration: 'line-through' }}>{original.description}</span></Typography>}
                {task.content && <><Divider sx={{ my: 2 }} /><RichTextView html={task.content} /></>}
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Stack direction="row" spacing={2} alignItems="center"><Typography variant="h6">Subtasks</Typography><ProgressBar progress={task.progress} /></Stack>
                  {perms.createSubtask && can('task:create') && <Button size="small" startIcon={<Add />} onClick={() => setSubtaskParent(task)}>Add subtask</Button>}
                </Stack>
                <SubtaskTree nodes={task.subtasks} canAdd={perms.createSubtask && can('task:create')} onAddChild={setSubtaskParent} maxDepth={meta?.maxSubtaskDepth || 10} />
              </CardContent>
            </Card>
            <Card>
              <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ px: 2, borderBottom: '1px solid #eef2f4' }}>
                <Tab value="comments" label={`Comments (${task.comments?.length || 0})`} />
                <Tab value="history" icon={<History fontSize="small" />} iconPosition="start" label="Audit history" />
                <Tab value="corrections" label={`Corrections (${task.corrections?.length || 0})`} />
              </Tabs>
              <CardContent>
                {tab === 'comments' && (
                  <CommentsPanel
                    comments={task.comments} canComment={perms.comment} currentUserId={user?.id} today={today} timezone={timezone} limits={limits}
                    onSubmit={async (form) => { await taskApi.comment(id, form); refresh(); }}
                    onEdit={async (comment, text) => { await taskApi.editComment(id, comment._id, text); refresh(); }}
                    onRequestCorrection={(comment) => setCorrection({ targetType: 'TaskComment', targetId: comment._id, record: comment, title: 'Comment' })}
                  />
                )}
                {tab === 'history' && (timelineLoading ? <CircularProgress size={24} /> : <AuditTimeline events={timeline} timezone={timezone} />)}
                {tab === 'corrections' && <CorrectionsList corrections={task.corrections} timezone={timezone} />}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            <Card>
              <CardContent>
                <Typography variant="h6">Details</Typography>
                <Grid container columnSpacing={2}>
                  <Grid size={6}><Field label="Project">{task.project?.name}</Field></Grid>
                  <Grid size={6}><Field label="Client">{task.client}</Field></Grid>
                  <Grid size={6}><Field label="Department">{task.department?.name}</Field></Grid>
                  <Grid size={6}><Field label="Technology">{task.technology}</Field></Grid>
                  <Grid size={12}><Field label="Module">{task.module}</Field></Grid>
                  <Grid size={6}><Field label="Owner"><Person user={task.owner} /></Field></Grid>
                  <Grid size={6}><Field label="Assigned to"><Person user={task.assignee} /></Field></Grid>
                  <Grid size={6}><Field label="Assigned by"><Person user={task.assignedBy} /></Field></Grid>
                  <Grid size={6}><Field label="Created by"><Person user={task.createdBy} /></Field></Grid>
                  <Grid size={12}>
                    <Field label="Collaborators">
                      {task.collaborators?.length ? <AvatarGroup max={8} sx={{ justifyContent: 'flex-start' }}>{task.collaborators.map((person) => <Tooltip key={person._id} title={person.name}><Avatar sx={{ width: 26, height: 26, fontSize: 12, bgcolor: 'primary.main' }}>{person.name?.[0]}</Avatar></Tooltip>)}</AvatarGroup> : null}
                    </Field>
                  </Grid>
                  {task.mentions?.length > 0 && <Grid size={12}><Field label="Mentioned">{task.mentions.map((person) => person.name).join(', ')}</Field></Grid>}
                  <Grid size={6}><Field label="Deadline"><Typography variant="body2" color={task.isOverdue ? 'error' : 'text.primary'}>{task.deadline ? formatDateTime(task.deadline, timezone) : '—'}</Typography></Field></Grid>
                  <Grid size={6}><Field label="Work date">{formatDate(task.workDate)}</Field></Grid>
                  {task.timeTrackingEnabled && <>
                    <Grid size={6}><Field label="Estimated">{task.estimatedHours !== undefined && task.estimatedHours !== null ? `${task.estimatedHours} h` : null}</Field></Grid>
                    <Grid size={6}><Field label="Actual">{task.actualHours !== undefined && task.actualHours !== null ? `${task.actualHours} h` : null}</Field></Grid>
                  </>}
                  <Grid size={6}><Field label="Created">{formatDateTime(task.createdAt, timezone)}</Field></Grid>
                  <Grid size={6}><Field label="Last activity">{formatDateTime(task.lastActivityAt || task.updatedAt, timezone)}</Field></Grid>
                  {task.startedAt && <Grid size={6}><Field label="Started">{formatDateTime(task.startedAt, timezone)}</Field></Grid>}
                  {task.completedAt && <Grid size={6}><Field label="Completed">{formatDateTime(task.completedAt, timezone)}</Field></Grid>}
                  {task.reopenCount > 0 && <Grid size={6}><Field label="Reopened">{task.reopenCount} time(s)</Field></Grid>}
                </Grid>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>Files &amp; links</Typography>
                <AttachmentsPanel
                  attachments={task.attachments} urls={task.urls} canAttach={perms.attach} limits={limits} timezone={timezone}
                  onUpload={async (files) => { const form = new FormData(); files.forEach((file) => form.append('files', file)); await taskApi.upload(id, form); refresh(); }}
                  canRemoveFile={(file) => perms.attach && file.workDate === today && (String(file.uploadedBy?._id || file.uploadedBy) === String(user?.id) || can('task:update:any'))}
                  onRemoveFile={async (file) => { if (window.confirm(`Remove ${file.name}? The removal is recorded in the audit history.`)) { await taskApi.removeAttachment(id, file._id).catch((reason) => setActionError(apiErrorMessage(reason))); refresh(); } }}
                  onAddUrl={async (payload) => { await taskApi.addUrl(id, payload); refresh(); }}
                  canRemoveUrl={(item) => perms.attach && item.workDate === today && (String(item.addedBy?._id || item.addedBy) === String(user?.id) || can('task:update:any'))}
                  onRemoveUrl={async (item) => { await taskApi.removeUrl(id, item._id).catch((reason) => setActionError(apiErrorMessage(reason))); refresh(); }}
                />
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
      <TaskFormDialog open={editing} onClose={() => setEditing(false)} task={task} onSaved={refresh} />
      <TaskFormDialog open={Boolean(subtaskParent)} onClose={() => setSubtaskParent(null)} parent={subtaskParent} onSaved={refresh} />
      <CorrectionDialog
        open={Boolean(correction)} onClose={afterCorrection} targetType={correction?.targetType} record={correction?.record} title={correction?.title} limits={limits}
        onSubmit={correction ? correctionSubmit(correction.targetType, correction.targetId) : undefined}
      />
      <Dialog open={archiveOpen} onClose={() => setArchiveOpen(false)}>
        <DialogTitle>Remove {task.taskKey}?</DialogTitle>
        <DialogContent><Typography>The task is hidden from lists but kept permanently with its history. This is only possible on the day it was created.</Typography></DialogContent>
        <DialogActions><Button onClick={() => setArchiveOpen(false)}>Cancel</Button><Button color="error" variant="contained" onClick={() => archive.mutate()} disabled={archive.isPending}>Remove</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
