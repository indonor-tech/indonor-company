import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { apiErrorMessage } from '../../services/api';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, taskApi } from '../../services/tasks';
import { useAuth } from '../../context/AuthContext';
import MentionField, { useMentionableUsers } from './MentionField';
import RichTextEditor from './RichTextEditor';

const empty = {
  title: '', description: '', content: '', project: '', client: '', department: '', technology: '', module: '',
  priority: 'MEDIUM', status: 'PENDING', deadline: '', estimatedHours: '', actualHours: '', assignee: '', owner: '', collaborators: [], mentions: []
};

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const idOf = (value) => (value && typeof value === 'object' ? value._id || value.id : value) || '';

/** Create task, create subtask (parent set) or edit task. Fields the user may not change are disabled; the API enforces the same rules. */
export default function TaskFormDialog({ open, onClose, task, parent, onSaved }) {
  const { user, can } = useAuth();
  const client = useQueryClient();
  const editing = Boolean(task);
  const perms = task?.permissions || {};
  const [form, setForm] = useState(empty);
  const { data: meta } = useQuery({ queryKey: ['task-meta'], queryFn: taskApi.meta, enabled: open });
  const { data: lookups } = useQuery({ queryKey: ['task-lookups'], queryFn: taskApi.lookups, enabled: open, staleTime: 60_000 });
  const { data: users = [] } = useMentionableUsers();
  const canAssign = can('task:assign');
  useEffect(() => {
    if (!open) return;
    if (task) {
      setForm({
        ...empty,
        title: task.title || '', description: task.description || '', content: task.content || '',
        project: idOf(task.project), client: task.client || '', department: idOf(task.department), technology: task.technology || '', module: task.module || '',
        priority: task.priority, status: task.status, deadline: toLocalInput(task.deadline),
        estimatedHours: task.estimatedHours ?? '', actualHours: task.actualHours ?? '',
        assignee: idOf(task.assignee), owner: idOf(task.owner), collaborators: (task.collaborators || []).map(idOf)
      });
    } else {
      setForm({ ...empty, project: idOf(parent?.project), client: parent?.client || '', department: idOf(parent?.department), technology: parent?.technology || '', module: parent?.module || '', assignee: user?.id || '' });
    }
  }, [open, task, parent, user?.id]);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const userById = useMemo(() => new Map(users.map((item) => [String(item.id), item])), [users]);
  const chooseProject = (event) => {
    const project = lookups?.projects?.find((item) => item._id === event.target.value);
    setForm((current) => ({
      ...current, project: event.target.value,
      client: current.client || project?.client || '',
      department: current.department || idOf(project?.department) || '',
      technology: current.technology || project?.technologies?.[0] || ''
    }));
  };
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(), description: form.description, content: form.content,
        project: form.project || null, client: form.client, department: form.department || null, technology: form.technology, module: form.module,
        priority: form.priority, deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        collaborators: form.collaborators, mentions: form.mentions
      };
      if (meta?.timeTrackingEnabled) {
        payload.estimatedHours = form.estimatedHours === '' ? null : Number(form.estimatedHours);
        payload.actualHours = form.actualHours === '' ? null : Number(form.actualHours);
      }
      if (!editing) {
        payload.status = form.status;
        if (canAssign && form.assignee) payload.assignee = form.assignee;
        if (canAssign && form.owner) payload.owner = form.owner;
        return parent ? taskApi.createSubtask(parent._id, payload) : taskApi.create(payload);
      }
      const update = {};
      const original = {
        title: task.title, description: task.description || '', content: task.content || '', project: idOf(task.project) || null, client: task.client || '',
        department: idOf(task.department) || null, technology: task.technology || '', module: task.module || '', estimatedHours: task.estimatedHours ?? null
      };
      if (perms.editContent) {
        for (const key of Object.keys(original)) if (key in payload && JSON.stringify(payload[key] ?? null) !== JSON.stringify(original[key] ?? null)) update[key] = payload[key];
      }
      if (perms.changeStatus && form.status !== task.status) update.status = form.status;
      if (perms.changePriority && form.priority !== task.priority) update.priority = form.priority;
      if (perms.changeDeadline && (payload.deadline || null) !== (task.deadline ? new Date(task.deadline).toISOString() : null)) update.deadline = payload.deadline;
      if (perms.logTime && meta?.timeTrackingEnabled && payload.actualHours !== (task.actualHours ?? null)) update.actualHours = payload.actualHours;
      if (perms.manageCollaborators && JSON.stringify([...form.collaborators].sort()) !== JSON.stringify((task.collaborators || []).map(idOf).sort())) update.collaborators = form.collaborators;
      if (perms.assign && form.assignee && form.assignee !== idOf(task.assignee)) update.assignee = form.assignee;
      if (form.mentions.length) update.mentions = form.mentions;
      if (!Object.keys(update).length) return task;
      return taskApi.update(task._id, update);
    },
    onSuccess: (saved) => {
      client.invalidateQueries({ queryKey: ['tasks'] });
      client.invalidateQueries({ queryKey: ['task'] });
      client.invalidateQueries({ queryKey: ['task-dashboard'] });
      onSaved?.(saved);
      onClose();
    }
  });
  const contentLocked = editing && !perms.editContent;
  const title = editing ? `Edit ${task.taskKey}` : parent ? `Add subtask to ${parent.taskKey}` : 'Create task';
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.2} sx={{ pt: 0.5 }}>
          {editing && perms.locked && <Alert severity="info">This task belongs to a locked date ({task.workDate}). Title, description and tags are frozen. You can still progress open work (status, time, deadline) and every change is recorded in the audit history. Use Request correction to fix historical content.</Alert>}
          {!editing && meta && <Typography variant="body2" color="text.secondary">This task will be recorded for <strong>{meta.today}</strong> (server date, {meta.timezone}).</Typography>}
          <TextField label="Task title" value={form.title} onChange={set('title')} required disabled={contentLocked} inputProps={{ maxLength: 200 }} autoFocus={!editing} />
          <MentionField label="Description" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} mentions={form.mentions} onMentionsChange={(mentions) => setForm((current) => ({ ...current, mentions }))} disabled={contentLocked} minRows={2} />
          <RichTextEditor label="Detailed notes (rich text)" value={form.content} onChange={(content) => setForm((current) => ({ ...current, content }))} placeholder="Implementation notes, acceptance criteria, checklists…" disabled={contentLocked} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Project" value={form.project} onChange={chooseProject} disabled={contentLocked}>
                <MenuItem value="">No project</MenuItem>
                {(lookups?.projects || []).map((project) => <MenuItem key={project._id} value={project._id}>{project.name}{project.code ? ` (${project.code})` : ''}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Client" value={form.client} onChange={set('client')} disabled={contentLocked} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Department" value={form.department} onChange={set('department')} disabled={contentLocked}>
                <MenuItem value="">None</MenuItem>
                {(lookups?.departments || []).map((department) => <MenuItem key={department._id} value={department._id}>{department.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Autocomplete freeSolo options={lookups?.technologies || []} value={form.technology} onInputChange={(_event, value) => setForm((current) => ({ ...current, technology: value }))} disabled={contentLocked} renderInput={(params) => <TextField {...params} label="Technology" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Module" value={form.module} onChange={set('module')} disabled={contentLocked} placeholder="e.g. Admin CRM" /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Priority" value={form.priority} onChange={set('priority')} disabled={editing && !perms.changePriority}>
                {PRIORITY_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Status" value={form.status} onChange={set('status')} disabled={editing && !perms.changeStatus}>
                {STATUS_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth type="datetime-local" label="Deadline" value={form.deadline} onChange={set('deadline')} InputLabelProps={{ shrink: true }} disabled={editing && !perms.changeDeadline} /></Grid>
            {meta?.timeTrackingEnabled && <>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" label="Estimated time (hours)" value={form.estimatedHours} onChange={set('estimatedHours')} inputProps={{ min: 0, step: 0.25 }} disabled={contentLocked} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" label="Actual time spent (hours)" value={form.actualHours} onChange={set('actualHours')} inputProps={{ min: 0, step: 0.25 }} disabled={editing && !perms.logTime} /></Grid>
            </>}
            {canAssign && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <Autocomplete
                  options={users} value={userById.get(String(form.assignee)) || null} getOptionLabel={(option) => option?.name || ''}
                  isOptionEqualToValue={(option, value) => option.id === value.id} disabled={editing && !perms.assign}
                  onChange={(_event, value) => setForm((current) => ({ ...current, assignee: value?.id || '' }))}
                  renderInput={(params) => <TextField {...params} label="Assigned employee" helperText="Team Leads can assign only to their team; the server checks this." />}
                />
              </Grid>
            )}
            {canAssign && !editing && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <Autocomplete
                  options={users} value={userById.get(String(form.owner)) || null} getOptionLabel={(option) => option?.name || ''}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  onChange={(_event, value) => setForm((current) => ({ ...current, owner: value?.id || '' }))}
                  renderInput={(params) => <TextField {...params} label="Primary owner" helperText="Defaults to the assigned employee." />}
                />
              </Grid>
            )}
            <Grid size={{ xs: 12 }}>
              <Autocomplete
                multiple options={users} value={form.collaborators.map((id) => userById.get(String(id))).filter(Boolean)} getOptionLabel={(option) => option?.name || ''}
                isOptionEqualToValue={(option, value) => option.id === value.id} disabled={editing && !perms.manageCollaborators}
                onChange={(_event, value) => setForm((current) => ({ ...current, collaborators: value.map((item) => item.id) }))}
                renderInput={(params) => <TextField {...params} label="Collaborators" />}
              />
            </Grid>
          </Grid>
          {save.isError && <Alert severity="error">{apiErrorMessage(save.error, 'Could not save this task.')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.title.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}
