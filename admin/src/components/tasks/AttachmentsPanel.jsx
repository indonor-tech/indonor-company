import React, { useRef, useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, Link, List, ListItem, ListItemIcon, ListItemText, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { AttachFile, DeleteOutline, Download, InsertDriveFile, Link as LinkIcon, OpenInNew, Visibility } from '@mui/icons-material';
import { apiErrorMessage } from '../../services/api';
import { downloadAttachment, formatBytes, formatDateTime, humanize } from '../../services/tasks';

export const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp', 'zip'];
export const URL_KIND_OPTIONS = ['GITHUB', 'GITLAB', 'JIRA', 'FIGMA', 'GOOGLE_DRIVE', 'DEPLOYMENT', 'DOCUMENTATION', 'CLIENT', 'OTHER'];
const PREVIEWABLE = /^(image\/(png|jpeg|webp)|application\/pdf)$/;

/** Client-side pre-check only; the server re-validates extension, MIME type, file signature and size. */
export function checkFiles(files, { maxBytes = 10 * 1024 * 1024, maxFiles = 5 } = {}) {
  if (files.length > maxFiles) return `You can attach up to ${maxFiles} files at a time.`;
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) return `${file.name}: file type is not allowed.`;
    if (file.size > maxBytes) return `${file.name}: larger than ${formatBytes(maxBytes)}.`;
  }
  return '';
}

export function FilePicker({ files, onChange, limits, disabled, label = 'Attach files' }) {
  const ref = useRef(null);
  const [error, setError] = useState('');
  return (
    <Box>
      <input ref={ref} type="file" hidden multiple accept={ALLOWED_EXTENSIONS.map((item) => `.${item}`).join(',')} onChange={(event) => {
        const picked = [...files, ...Array.from(event.target.files || [])];
        const message = checkFiles(picked, limits);
        setError(message);
        if (!message) onChange(picked);
        event.target.value = '';
      }} />
      <Button size="small" startIcon={<AttachFile />} onClick={() => ref.current?.click()} disabled={disabled}>{label}</Button>
      <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap sx={{ mt: files.length ? 0.8 : 0 }}>
        {files.map((file, index) => <Chip key={`${file.name}-${index}`} size="small" label={`${file.name} (${formatBytes(file.size)})`} onDelete={() => onChange(files.filter((_item, position) => position !== index))} />)}
      </Stack>
      {error && <Typography variant="caption" color="error">{error}</Typography>}
    </Box>
  );
}

export function AttachmentList({ attachments = [], canRemove, onRemove, timezone, dense }) {
  const [error, setError] = useState('');
  if (!attachments.length) return <Typography variant="body2" color="text.secondary">No files.</Typography>;
  const open = (attachment, inline) => downloadAttachment(attachment, { inline }).catch((reason) => setError(apiErrorMessage(reason, 'Download failed')));
  return (
    <>
      <List dense disablePadding>
        {attachments.map((attachment) => (
          <ListItem key={attachment._id} disableGutters secondaryAction={
            <Stack direction="row">
              {PREVIEWABLE.test(attachment.mimeType || '') && <Tooltip title="Preview"><IconButton size="small" onClick={() => open(attachment, true)}><Visibility fontSize="small" /></IconButton></Tooltip>}
              <Tooltip title="Download"><IconButton size="small" onClick={() => open(attachment, false)}><Download fontSize="small" /></IconButton></Tooltip>
              {canRemove?.(attachment) && <Tooltip title="Remove (today only; recorded in history)"><IconButton size="small" onClick={() => onRemove(attachment)}><DeleteOutline fontSize="small" /></IconButton></Tooltip>}
            </Stack>
          }>
            <ListItemIcon sx={{ minWidth: 34 }}><InsertDriveFile fontSize="small" color="action" /></ListItemIcon>
            <ListItemText
              primary={attachment.name}
              secondary={dense ? formatBytes(attachment.size) : `${formatBytes(attachment.size)} · ${attachment.uploadedBy?.name || ''} · ${formatDateTime(attachment.createdAt, timezone)}`}
              primaryTypographyProps={{ fontSize: 14, noWrap: true, sx: { pr: 12 } }}
            />
          </ListItem>
        ))}
      </List>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    </>
  );
}

export function UrlList({ urls = [], canRemove, onRemove }) {
  if (!urls.length) return <Typography variant="body2" color="text.secondary">No links.</Typography>;
  return (
    <List dense disablePadding>
      {urls.map((item, index) => (
        <ListItem key={item._id || index} disableGutters secondaryAction={canRemove?.(item) ? <Tooltip title="Remove link"><IconButton size="small" onClick={() => onRemove(item)}><DeleteOutline fontSize="small" /></IconButton></Tooltip> : null}>
          <ListItemIcon sx={{ minWidth: 34 }}><LinkIcon fontSize="small" color="action" /></ListItemIcon>
          <ListItemText
            primary={<Link href={item.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 14 }}>{item.label || item.url}<OpenInNew sx={{ fontSize: 13 }} /></Link>}
            secondary={`${humanize(item.kind || 'OTHER')}${item.addedBy?.name ? ` · ${item.addedBy.name}` : ''}`}
          />
        </ListItem>
      ))}
    </List>
  );
}

export function UrlForm({ onAdd, disabled }) {
  const [form, setForm] = useState({ url: '', label: '', kind: 'OTHER' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    try {
      const parsed = new URL(form.url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad');
    } catch {
      setError('Enter a full http(s) URL, for example https://github.com/org/repo/pull/12');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onAdd({ url: form.url.trim(), label: form.label.trim(), kind: form.kind });
      setForm({ url: '', label: '', kind: 'OTHER' });
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Could not add link'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField size="small" label="URL" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} sx={{ flex: 2 }} disabled={disabled} placeholder="https://" />
        <TextField size="small" label="Label" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} sx={{ flex: 1 }} disabled={disabled} />
        <TextField size="small" select label="Type" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} sx={{ minWidth: 150 }} disabled={disabled}>
          {URL_KIND_OPTIONS.map((kind) => <MenuItem key={kind} value={kind}>{humanize(kind)}</MenuItem>)}
        </TextField>
        <Button variant="outlined" onClick={submit} disabled={disabled || busy || !form.url.trim()}>Add</Button>
      </Stack>
      {error && <Typography variant="caption" color="error">{error}</Typography>}
    </Stack>
  );
}

/** Files + links section used on the task detail page and daily work log. */
export default function AttachmentsPanel({ attachments, urls, canAttach, onUpload, canRemoveFile, onRemoveFile, onAddUrl, canRemoveUrl, onRemoveUrl, limits, timezone }) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    setBusy(true);
    setError('');
    try {
      await onUpload(files);
      setFiles([]);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Upload failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Files</Typography>
        <AttachmentList attachments={attachments} canRemove={canRemoveFile} onRemove={onRemoveFile} timezone={timezone} />
        {canAttach && (
          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
            <Box sx={{ flex: 1 }}><FilePicker files={files} onChange={setFiles} limits={limits} /></Box>
            {files.length > 0 && <Button variant="contained" size="small" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Button>}
          </Stack>
        )}
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Links</Typography>
        <UrlList urls={urls} canRemove={canRemoveUrl} onRemove={onRemoveUrl} />
        {canAttach && onAddUrl && <Box sx={{ mt: 1 }}><UrlForm onAdd={onAddUrl} /></Box>}
      </Box>
    </Stack>
  );
}
