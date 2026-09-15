import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../services/api';

const emptyForm = {
  title: '', client: '', summary: '', detailsText: '', url: '', tagsText: '',
  coverImageUrl: '', videoUrl: '', featured: true, isPublished: true, status: 'COMPLETED'
};

function payloadFromForm(form) {
  return {
    title: form.title.trim(),
    client: form.client.trim(),
    summary: form.summary.trim(),
    details: form.detailsText.split('\n').map((line) => line.trim()).filter(Boolean),
    url: form.url.trim(),
    tags: form.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
    coverImageUrl: form.coverImageUrl.trim(),
    videoUrl: form.videoUrl.trim(),
    videoType: form.videoUrl.trim().startsWith('http') && !/youtube|youtu\.be|vimeo/i.test(form.videoUrl) ? 'file' : undefined,
    featured: form.featured,
    status: form.status,
    isPublished: form.isPublished
  };
}

export default function WebsiteProjects() {
  const client = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [open, setOpen] = useState(false);
  const projects = useQuery({ queryKey: ['website-projects'], queryFn: () => api.get('/website-projects').then((response) => response.data.data) });
  const rows = useMemo(() => [...(projects.data || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)), [projects.data]);
  const save = useMutation({
    mutationFn: () => editingId ? api.patch(`/website-projects/${editingId}`, payloadFromForm(form)) : api.post('/website-projects', payloadFromForm(form)),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['website-projects'] }); setOpen(false); }
  });
  const uploadCover = useMutation({
    mutationFn: (file) => {
      const payload = new FormData();
      payload.append('cover', file);
      return api.post('/website-projects/cover', payload).then((response) => response.data.data.coverImageUrl);
    },
    onSuccess: (coverImageUrl) => setForm((current) => ({ ...current, coverImageUrl }))
  });
  const uploadVideo = useMutation({
    mutationFn: (file) => {
      const payload = new FormData();
      payload.append('video', file);
      return api.post('/website-projects/video', payload, { timeout: 120000 }).then((response) => response.data.data);
    },
    onSuccess: (data) => setForm((current) => ({ ...current, videoUrl: data.videoUrl }))
  });
  const reorder = useMutation({
    mutationFn: (ids) => api.patch('/website-projects/reorder', { ids }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['website-projects'] })
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/website-projects/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['website-projects'] })
  });
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const startCreate = () => { setEditingId(''); setForm(emptyForm); setOpen(true); };
  const startEdit = (project) => {
    setEditingId(project._id);
    setForm({
      title: project.title || '',
      client: project.client || '',
      summary: project.summary || '',
      detailsText: (project.details || []).join('\n'),
      url: project.url || '',
      tagsText: (project.tags || []).join(', '),
      coverImageUrl: project.coverImageUrl || '',
      videoUrl: project.videoUrl || (project.videoType === 'youtube' && project.videoId ? `https://www.youtube.com/watch?v=${project.videoId}` : '') || (project.videoType === 'vimeo' && project.videoId ? `https://vimeo.com/${project.videoId}` : ''),
      featured: project.featured !== false,
      isPublished: project.isPublished !== false,
      status: project.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'COMPLETED'
    });
    setOpen(true);
  };
  const move = (index, direction) => {
    const next = [...rows];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    reorder.mutate(next.map((project) => project._id));
  };
  return <Stack spacing={3}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
      <Box>
        <Typography variant="h4">Website projects</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.7 }}>Projects shown on indonortech.com and the homepage. Upload a Cloudinary demo video or paste a YouTube / Vimeo link. Use the arrows for the public order.</Typography>
      </Box>
      <Button variant="contained" onClick={startCreate}>+ Add project</Button>
    </Stack>
    {projects.isError && <Alert severity="error">{apiErrorMessage(projects.error, 'Could not load website projects.')}</Alert>}
    {reorder.isError && <Alert severity="error">{apiErrorMessage(reorder.error, 'Could not update project order.')}</Alert>}
    {remove.isError && <Alert severity="error">{apiErrorMessage(remove.error, 'Could not remove this project.')}</Alert>}
    {!projects.isLoading && !rows.length && <Card><CardContent><Typography color="text.secondary">No projects yet. Add one here and it will appear on the public Projects page after you publish it.</Typography></CardContent></Card>}
    {rows.map((project, index) => <Card key={project._id}><CardContent>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }}>
        <Box sx={{ width: 120, height: 72, borderRadius: 2, overflow: 'hidden', bgcolor: '#eef2f3', flexShrink: 0 }}>
          {project.coverImageUrl ? <Box component="img" src={project.coverImageUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography fontWeight={700}>{project.title}</Typography>
            <Chip size="small" color={project.isPublished ? 'success' : 'default'} label={project.isPublished ? 'Visible' : 'Hidden'} />
            {project.featured ? <Chip size="small" variant="outlined" label="Homepage" /> : null}
            <Chip size="small" variant="outlined" color={project.status === 'IN_PROGRESS' ? 'warning' : 'success'} label={project.status === 'IN_PROGRESS' ? 'In progress' : 'Completed'} />
            {project.videoUrl || project.videoId ? <Chip size="small" variant="outlined" label="Has video" /> : null}
          </Stack>
          <Typography color="text.secondary">{project.client}{project.url ? ` · ${project.url}` : ''}</Typography>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button size="small" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}>Move up</Button>
          <Button size="small" disabled={index === rows.length - 1 || reorder.isPending} onClick={() => move(index, 1)}>Move down</Button>
          <Button size="small" onClick={() => startEdit(project)}>Edit</Button>
          <Button size="small" color="error" onClick={() => remove.mutate(project._id)}>Remove</Button>
        </Stack>
      </Stack>
    </CardContent></Card>)}
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>{editingId ? 'Edit project' : 'Add project'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Title" value={form.title} onChange={set('title')} required />
          <TextField label="Client" value={form.client} onChange={set('client')} required />
          <TextField label="Summary" value={form.summary} onChange={set('summary')} required multiline minRows={2} />
          <TextField label="Details" value={form.detailsText} onChange={set('detailsText')} multiline minRows={4} helperText="One bullet per line." />
          <TextField label="Live project URL" value={form.url} onChange={set('url')} placeholder="https://…" />
          <TextField label="Tags" value={form.tagsText} onChange={set('tagsText')} placeholder="Marketplace, Web App" helperText="Separate tags with commas." />
          <Stack spacing={1.25}>
            {form.coverImageUrl ? <Box component="img" src={form.coverImageUrl} alt="" sx={{ width: 180, height: 110, objectFit: 'cover', borderRadius: 2, bgcolor: '#eef2f3' }} /> : null}
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              <Button component="label" variant="outlined" disabled={uploadCover.isPending}>
                {uploadCover.isPending ? 'Uploading…' : 'Upload cover'}
                <input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadCover.mutate(file); event.target.value = ''; }} />
              </Button>
              {form.coverImageUrl ? <Button size="small" onClick={() => setForm((current) => ({ ...current, coverImageUrl: '' }))}>Remove cover</Button> : null}
            </Stack>
            <TextField label="Or paste a cover image URL" value={form.coverImageUrl} onChange={set('coverImageUrl')} placeholder="https://…" />
            {uploadCover.isError && <Alert severity="error">{apiErrorMessage(uploadCover.error, 'Could not upload this cover image.')}</Alert>}
          </Stack>
          <Stack spacing={1.25}>
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              <Button component="label" variant="outlined" disabled={uploadVideo.isPending}>
                {uploadVideo.isPending ? 'Uploading video…' : 'Upload video to Cloudinary'}
                <input hidden type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadVideo.mutate(file); event.target.value = ''; }} />
              </Button>
              {form.videoUrl ? <Button size="small" onClick={() => setForm((current) => ({ ...current, videoUrl: '' }))}>Remove video</Button> : null}
            </Stack>
            <TextField label="Or paste a YouTube, Vimeo, or video URL" value={form.videoUrl} onChange={set('videoUrl')} placeholder="https://…" helperText="Upload an MP4 for Cloudinary, or paste a YouTube / Vimeo link." />
            {uploadVideo.isError && <Alert severity="error">{apiErrorMessage(uploadVideo.error, 'Could not upload this video.')}</Alert>}
          </Stack>
          <FormControlLabel control={<Switch checked={form.featured} onChange={set('featured')} />} label="Show on the homepage" />
          <TextField select label="Status" value={form.status || 'COMPLETED'} onChange={set('status')}>
            <MenuItem value="COMPLETED">Completed</MenuItem>
            <MenuItem value="IN_PROGRESS">In progress / going on</MenuItem>
          </TextField>
          <FormControlLabel control={<Switch checked={form.isPublished} onChange={set('isPublished')} />} label="Show on the website" />
          {save.isError && <Alert severity="error">{apiErrorMessage(save.error, 'Could not save this project.')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="contained" disabled={!form.title.trim() || !form.client.trim() || !form.summary.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
