import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, IconButton, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { PhotoCamera } from '@mui/icons-material';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';

function initialsOf(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
}

export function ProfilePhoto({ ownerType, ownerId, name, canEdit }) {
  const client = useQueryClient();
  const resource = ownerType === 'Employee' ? 'employees' : 'candidates';
  const queryKey = ['profile-photo', ownerType, ownerId];
  const photo = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const response = await api.get(`/${resource}/${ownerId}/photo`, { responseType: 'blob' });
        if (!response.data || String(response.headers['content-type'] || '').includes('json')) return '';
        return URL.createObjectURL(response.data);
      } catch (error) {
        if (error.response?.status === 404) return '';
        throw error;
      }
    },
    enabled: Boolean(ownerId),
    retry: false
  });
  useEffect(() => () => { if (photo.data) URL.revokeObjectURL(photo.data); }, [photo.data]);
  const upload = useMutation({
    mutationFn: (file) => {
      const payload = new FormData();
      payload.append('photo', file);
      return api.post(`/${resource}/${ownerId}/photo`, payload);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey });
      client.invalidateQueries({ queryKey: ['documents', ownerType, ownerId] });
    }
  });
  return <Stack alignItems="center" spacing={0.5} sx={{ position: 'relative' }}>
    <Avatar src={photo.data || undefined} alt={name || 'Profile photo'} sx={{ width: 88, height: 88, fontSize: 28, bgcolor: 'primary.light', color: 'primary.dark' }}>
      {initialsOf(name)}
    </Avatar>
    {canEdit && <IconButton component="label" size="small" aria-label="Change profile photo" disabled={upload.isPending} sx={{ position: 'absolute', right: -4, bottom: upload.isError ? 22 : -4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'grey.100' } }}>
      <PhotoCamera fontSize="small" />
      <input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ''; }} />
    </IconButton>}
    {upload.isError && <Typography variant="caption" color="error">{apiErrorMessage(upload.error, 'Could not update photo.')}</Typography>}
  </Stack>;
}

export const DOCUMENT_TYPES = ['RESUME', 'OFFER_LETTER', 'AGREEMENT_LETTER', 'PHOTO', 'AADHAAR', 'PAN', 'PASSPORT', 'DEGREE', 'MARKSHEET', 'CERTIFICATE', 'EXPERIENCE_LETTER', 'RELIEVING_LETTER', 'COMPANY_CARD', 'SALARY_SLIP', 'BANK_PROOF', 'OTHER'];
const FILE_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*';

function fileNameFromDisposition(header) {
  if (!header) return '';
  const utf = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try { return decodeURIComponent(utf[1].trim().replace(/^"(.*)"$/, '$1')); } catch { /* ignore malformed header */ }
  }
  const ascii = /filename="?([^";]+)"?/i.exec(header);
  return ascii?.[1]?.trim() || '';
}

export async function openStoredDocument(documentOrId, fallbackUrl) {
  if (fallbackUrl) {
    window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  if (documentOrId?.externalUrl) {
    window.open(documentOrId.externalUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  const id = documentOrId?._id || documentOrId;
  const response = await api.get(`/documents/file/${id}`, { responseType: 'blob' });
  const fileName = fileNameFromDisposition(response.headers['content-disposition']) || documentOrId?.name || 'document.pdf';
  const url = URL.createObjectURL(new Blob([response.data], { type: response.data.type || 'application/pdf' }));
  const link = window.document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function RepeatableRows({ title, rows, onChange, fields, addLabel, deferSave, readOnly }) {
  const [draft, setDraft] = useState(rows || []);
  useEffect(() => { setDraft(rows || []); }, [rows]);
  const list = deferSave ? draft : (rows || []);
  const emit = (next) => deferSave ? setDraft(next) : onChange(next);
  const update = (index, name, value) => emit(list.map((row, rowIndex) => rowIndex === index ? { ...row, [name]: value } : row));
  return <Stack spacing={2}>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">{title}</Typography>{!readOnly && <Button onClick={() => emit([...(list || []), Object.fromEntries(fields.map((field) => [field.name, '']))])}>{addLabel || '+ Add'}</Button>}</Stack>
    {list.map((row, index) => <Stack key={row._id || index} spacing={1.5} sx={{ p: 2, border: '1px solid #e7ecef', borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} flexWrap="wrap">
        {fields.map((field) => <TextField key={field.name} label={field.label} type={field.type || 'text'} value={row[field.name] ?? ''} onChange={(event) => update(index, field.name, event.target.value)} sx={{ flex: field.flex || 1, minWidth: field.minWidth || 160 }} InputLabelProps={field.type === 'date' ? { shrink: true } : undefined} multiline={Boolean(field.multiline)} minRows={field.multiline ? 2 : undefined} InputProps={{ readOnly }} />)}
      </Stack>
      {!readOnly && <Button color="error" size="small" onClick={() => emit(list.filter((_, rowIndex) => rowIndex !== index))} sx={{ alignSelf: 'flex-start' }}>Remove</Button>}
    </Stack>)}
    {!list.length && <Typography color="text.secondary">{readOnly ? 'No records yet.' : 'No records yet. Add one, or extract them from a resume.'}</Typography>}
    {deferSave && !readOnly && <Button variant="contained" onClick={() => onChange(draft)} sx={{ alignSelf: 'flex-start' }}>Save {title.toLowerCase()}</Button>}
  </Stack>;
}

const emptyCertificate = () => ({ name: '', issuer: '', year: '', credentialId: '', url: '', documentId: '' });

export function CertificatePanel({ employeeId, certificates, onSave, saving, error, readOnly }) {
  const [draft, setDraft] = useState(certificates?.length ? certificates : [emptyCertificate()]);
  const [fileError, setFileError] = useState('');
  const [uploadingIndex, setUploadingIndex] = useState(null);
  useEffect(() => { setDraft(certificates?.length ? certificates.map((row) => ({ ...emptyCertificate(), ...row })) : [emptyCertificate()]); }, [certificates]);
  const update = (index, patch) => setDraft((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const attachFile = async (index, file) => {
    if (!file) return;
    setFileError('');
    setUploadingIndex(index);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', 'CERTIFICATE');
      form.append('name', draft[index]?.name || file.name);
      const { data } = await api.post(`/documents/Employee/${employeeId}`, form);
      const document = Array.isArray(data.data) ? data.data[0] : data.data;
      update(index, { documentId: document._id });
    } catch (uploadError) {
      setFileError(apiErrorMessage(uploadError, 'Could not upload this certificate file.'));
    } finally {
      setUploadingIndex(null);
    }
  };
  const save = () => onSave(draft.filter((row) => row.name || row.url || row.documentId).map((row) => ({
    _id: row._id,
    name: row.name,
    issuer: row.issuer,
    year: Number.isFinite(Number(row.year)) ? Number(row.year) : undefined,
    credentialId: row.credentialId,
    url: row.url,
    documentId: row.documentId || undefined
  })));
  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
      <Box>
        <Typography variant="h6">Certificates</Typography>
        <Typography color="text.secondary">Add as many certificates as needed. Each one can be a public URL, a PDF, or an image.</Typography>
      </Box>
      {!readOnly && <Button onClick={() => setDraft((current) => [...current, emptyCertificate()])}>+ Add certificate</Button>}
    </Stack>
    {draft.map((row, index) => <Stack key={row._id || index} spacing={1.5} sx={{ p: 2, border: '1px solid #e7ecef', borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} flexWrap="wrap">
        <TextField label="Certificate" value={row.name || ''} onChange={(event) => update(index, { name: event.target.value })} sx={{ flex: 1.4, minWidth: 180 }} InputProps={{ readOnly }} />
        <TextField label="Issuer" value={row.issuer || ''} onChange={(event) => update(index, { issuer: event.target.value })} sx={{ flex: 1, minWidth: 160 }} InputProps={{ readOnly }} />
        <TextField label="Year" type="number" value={row.year ?? ''} onChange={(event) => update(index, { year: event.target.value })} sx={{ width: 120 }} InputProps={{ readOnly }} />
        <TextField label="Credential ID" value={row.credentialId || ''} onChange={(event) => update(index, { credentialId: event.target.value })} sx={{ flex: 1, minWidth: 140 }} InputProps={{ readOnly }} />
      </Stack>
      <TextField label="Certificate URL" placeholder="https://…" value={row.url || ''} onChange={(event) => update(index, { url: event.target.value })} helperText={readOnly ? undefined : 'Use this when the certificate is hosted online.'} InputProps={{ readOnly }} />
      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
        {!readOnly && <Button component="label" variant="outlined" disabled={uploadingIndex === index}>{uploadingIndex === index ? 'Uploading…' : row.documentId ? 'Replace PDF / image' : 'Upload PDF / image'}
          <input hidden type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*" onChange={(event) => { attachFile(index, event.target.files?.[0]); event.target.value = ''; }} />
        </Button>}
        {row.url && <Button size="small" onClick={() => openStoredDocument(null, row.url)}>Open URL</Button>}
        {row.documentId && <Button size="small" onClick={() => openStoredDocument(row.documentId)}>View file</Button>}
        {!readOnly && <Button color="error" size="small" onClick={() => setDraft((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button>}
      </Stack>
    </Stack>)}
    {(fileError || error) && <Alert severity="error">{fileError || (typeof error === 'string' ? error : 'Could not save certificates.')}</Alert>}
    {!readOnly && <Button variant="contained" onClick={save} disabled={saving} sx={{ alignSelf: 'flex-start' }}>{saving ? 'Saving…' : 'Save certificates'}</Button>}
  </Stack>;
}

function emptyDocumentForm() {
  return { type: '', name: '', url: '', files: [] };
}

export function DocumentPanel({ ownerType, ownerId }) {
  const client = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState(emptyDocumentForm);
  const [fileKey, setFileKey] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['documents', ownerType, ownerId], queryFn: () => api.get(`/documents/${ownerType}/${ownerId}`).then((response) => response.data.data), enabled: Boolean(ownerId) });
  const resetForm = () => {
    setForm(emptyDocumentForm());
    setFileKey((current) => current + 1);
  };
  const upload = useMutation({
    mutationFn: ({ files = [], url, name, type }) => {
      const payload = new FormData();
      payload.append('type', type || 'OTHER');
      if (name) payload.append('name', name);
      if (url) payload.append('externalUrl', url);
      files.forEach((file) => payload.append('files', file));
      return api.post(`/documents/${ownerType}/${ownerId}`, payload);
    },
    onSuccess: () => {
      resetForm();
      setJustAdded(true);
      client.invalidateQueries({ queryKey: ['documents', ownerType, ownerId] });
    }
  });
  const remove = useMutation({
    mutationFn: (documentId) => api.delete(`/documents/${documentId}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['documents', ownerType, ownerId] })
  });
  const canUpload = can('documents:upload') || can('self:documents:update');
  const canRemove = can('documents:delete') || can('self:documents:update');
  const canSubmit = Boolean(form.type) && (form.files.length > 0 || form.url.trim());
  const submit = () => {
    if (!canSubmit) return;
    setJustAdded(false);
    upload.mutate({ files: form.files, url: form.url.trim(), name: form.name.trim(), type: form.type });
  };
  return <Stack spacing={2}>
    <Typography variant="h6">Documents</Typography>
    <Typography color="text.secondary">Store soft copies as PDF, Word, or images: resume, offer letter, agreement letter, ID proofs, and more. You can also paste a file URL.</Typography>
    {canUpload && <Stack spacing={1.5} sx={{ p: 2, border: '1px solid #e7ecef', borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} flexWrap="wrap">
        <TextField select size="small" label="Type" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} sx={{ minWidth: 180 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">Select type</MenuItem>
          {DOCUMENT_TYPES.map((type) => <MenuItem key={type} value={type}>{type.replaceAll('_', ' ')}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Label (optional)" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} sx={{ minWidth: 180 }} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
        <Button component="label" variant="outlined">{form.files.length ? `${form.files.length} file${form.files.length > 1 ? 's' : ''} selected` : 'Choose files'}
          <input key={fileKey} hidden multiple type="file" accept={FILE_ACCEPT} onChange={(event) => { setJustAdded(false); setForm((current) => ({ ...current, files: [...(event.target.files || [])] })); }} />
        </Button>
        {form.files.length > 0 && <Typography variant="body2" color="text.secondary">{form.files.map((file) => file.name).join(', ')}</Typography>}
        {form.files.length > 0 && <Button size="small" onClick={() => { setForm((current) => ({ ...current, files: [] })); setFileKey((current) => current + 1); }}>Clear files</Button>}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
        <TextField size="small" fullWidth label="Or paste a document URL" placeholder="https://…" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} />
        <Button variant="contained" disabled={upload.isPending || !canSubmit} onClick={submit}>{upload.isPending ? 'Adding…' : 'Add document'}</Button>
      </Stack>
    </Stack>}
    {justAdded && <Alert severity="success">Document added. The form is empty — choose the next type and file.</Alert>}
    {upload.isError && <Alert severity="error">{apiErrorMessage(upload.error, 'Upload failed.')}</Alert>}
    {remove.isError && <Alert severity="error">{apiErrorMessage(remove.error, 'Could not remove this document.')}</Alert>}
    {isLoading ? <CircularProgress size={24} /> : data?.map((document) => <Stack key={document._id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }} sx={{ p: 1.5, border: '1px solid #eef2f3', borderRadius: 2 }}>
      <Box>
        <Typography>{document.name}</Typography>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
          <Chip size="small" label={(document.type || 'DOCUMENT').replaceAll('_', ' ')} />
          {document.externalUrl && <Chip size="small" variant="outlined" label="URL" />}
          {document.mimeType && <Chip size="small" variant="outlined" label={document.mimeType.split('/').pop()} />}
        </Stack>
      </Box>
      <Stack direction="row" gap={1}>
        <Button size="small" onClick={() => openStoredDocument(document)}>View</Button>
        {canRemove && <Button size="small" color="error" onClick={() => remove.mutate(document._id)}>Remove</Button>}
      </Stack>
    </Stack>)}
    {!isLoading && !data?.length && <Typography color="text.secondary">No files yet. Upload resume, offer letter, agreement letter, ID proofs, or other documents here.</Typography>}
  </Stack>;
}

const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED'];

export function OnboardingChecklist({ employeeId, canEdit = true, canAdd = true }) {
  const client = useQueryClient();
  const [taskName, setTaskName] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['onboarding', employeeId],
    queryFn: () => api.get(`/onboarding/${employeeId}`).then((response) => response.data.data),
    enabled: Boolean(employeeId)
  });
  const update = useMutation({
    mutationFn: ({ taskId, status, notes }) => api.patch(`/onboarding/${employeeId}/tasks/${taskId}`, { status, notes }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['onboarding', employeeId] })
  });
  const addTask = useMutation({
    mutationFn: (name) => api.post(`/onboarding/${employeeId}/tasks`, { name }),
    onSuccess: () => { setTaskName(''); client.invalidateQueries({ queryKey: ['onboarding', employeeId] }); }
  });
  if (isLoading) return <CircularProgress size={24} />;
  const tasks = data?.tasks || [];
  const done = tasks.filter((task) => ['COMPLETED', 'NOT_REQUIRED'].includes(task.status)).length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return <Stack spacing={2}>
    <Box>
      <Typography variant="h6">Joining checklist</Typography>
      <Typography color="text.secondary" sx={{ mb: 1 }}>Track certificates, bank, IDs and joining formalities. Add extra tasks if this employee needs them.</Typography>
      <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 4 }} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{done} of {tasks.length} complete</Typography>
    </Box>
    {tasks.map((task) => <Stack key={task._id} spacing={1} sx={{ p: 2, border: '1px solid #e7ecef', borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
        <Typography fontWeight={600}>{task.name}</Typography>
        <TextField select size="small" value={task.status || 'PENDING'} onChange={(event) => update.mutate({ taskId: task._id, status: event.target.value })} sx={{ minWidth: 180 }} disabled={!canEdit} InputProps={{ readOnly: !canEdit }}>
          {TASK_STATUSES.map((status) => <MenuItem key={status} value={status}>{status.replaceAll('_', ' ')}</MenuItem>)}
        </TextField>
      </Stack>
      <TextField size="small" label="Notes" defaultValue={task.notes || ''} key={`${task._id}-${task.notes || ''}`} InputProps={{ readOnly: !canEdit }} onBlur={(event) => {
        if (!canEdit) return;
        const notes = event.target.value;
        if (notes !== (task.notes || '')) update.mutate({ taskId: task._id, notes });
      }} />
    </Stack>)}
    {canAdd && <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
      <TextField size="small" fullWidth label="Add a custom onboarding task" value={taskName} onChange={(event) => setTaskName(event.target.value)} />
      <Button variant="outlined" disabled={addTask.isPending || taskName.trim().length < 2} onClick={() => addTask.mutate(taskName.trim())}>Add task</Button>
    </Stack>}
    {data?.completedAt && <Chip color="success" label={`Onboarding completed ${new Date(data.completedAt).toLocaleDateString()}`} />}
    {(update.isError || addTask.isError) && <Alert severity="error">{apiErrorMessage(update.error || addTask.error, 'Could not update onboarding.')}</Alert>}
  </Stack>;
}
