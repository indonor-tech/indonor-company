import React, { useState } from 'react';
import { Alert, Avatar, Box, Button, Collapse, Stack, TextField, Typography } from '@mui/material';
import { apiErrorMessage } from '../../services/api';
import { buildForm, formatDateTime } from '../../services/tasks';
import { AttachmentList, FilePicker, UrlList } from './AttachmentsPanel';
import MentionField, { MentionText, useMentionableUsers } from './MentionField';

function Comment({ comment, currentUserId, today, timezone, users, onEdit, onRequestCorrection }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const [showRevisions, setShowRevisions] = useState(false);
  const [error, setError] = useState('');
  const mine = String(comment.author?._id || comment.author) === String(currentUserId);
  const editable = mine && comment.workDate === today && onEdit;
  const save = async () => {
    try {
      await onEdit(comment, text.trim());
      setEditing(false);
      setError('');
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Could not update comment'));
    }
  };
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1.5, borderBottom: '1px solid #f1f5f9' }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>{comment.author?.name?.[0] || '?'}</Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
          <Typography variant="body2" fontWeight={700}>{comment.author?.name || 'User'}</Typography>
          <Typography variant="caption" color="text.secondary">{formatDateTime(comment.createdAt, timezone)}</Typography>
          {comment.editedAt && <Button size="small" sx={{ p: 0, minWidth: 0, fontSize: 12 }} onClick={() => setShowRevisions(!showRevisions)}>(edited{comment.revisions?.length ? ` · ${comment.revisions.length} earlier version${comment.revisions.length > 1 ? 's' : ''}` : ''})</Button>}
          {comment.hasCorrections && <Typography variant="caption" color="secondary">corrected</Typography>}
        </Stack>
        {editing ? (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <TextField multiline minRows={2} value={text} onChange={(event) => setText(event.target.value)} fullWidth />
            <Stack direction="row" spacing={1}><Button size="small" variant="contained" onClick={save} disabled={!text.trim()}>Save</Button><Button size="small" onClick={() => { setEditing(false); setText(comment.text); }}>Cancel</Button></Stack>
          </Stack>
        ) : (
          <Typography variant="body2" component="div" sx={{ mt: 0.5 }}><MentionText text={comment.text} users={users} /></Typography>
        )}
        {comment.original && <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>Original: <span style={{ textDecoration: 'line-through' }}>{comment.original.text}</span></Typography>}
        <Collapse in={showRevisions}>
          <Box sx={{ mt: 1, p: 1, bgcolor: '#f8fafb', borderRadius: 1 }}>
            {(comment.revisions || []).map((revision, index) => (
              <Typography key={index} variant="caption" component="div" sx={{ mb: 0.5 }}>
                <strong>{formatDateTime(revision.editedAt, timezone)}</strong>{revision.editedBy?.name ? ` (${revision.editedBy.name})` : ''}: {revision.text}
              </Typography>
            ))}
          </Box>
        </Collapse>
        {comment.urls?.length > 0 && <Box sx={{ mt: 0.5 }}><UrlList urls={comment.urls} /></Box>}
        {comment.attachments?.length > 0 && <Box sx={{ mt: 0.5 }}><AttachmentList attachments={comment.attachments} dense /></Box>}
        {error && <Typography variant="caption" color="error">{error}</Typography>}
        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
          {editable && !editing && <Button size="small" onClick={() => setEditing(true)}>Edit</Button>}
          {mine && comment.workDate < today && onRequestCorrection && <Button size="small" onClick={() => onRequestCorrection(comment)}>Request correction</Button>}
        </Stack>
      </Box>
    </Stack>
  );
}

/** Comments are permanent: no delete control exists and edits keep previous versions. */
export default function CommentsPanel({ comments = [], canComment, onSubmit, onEdit, onRequestCorrection, currentUserId, today, timezone, limits }) {
  const { data: users = [] } = useMentionableUsers();
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState([]);
  const [files, setFiles] = useState([]);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSubmit(buildForm({ text: text.trim(), mentions, urls: url.trim() ? [url.trim()] : [] }, files));
      setText('');
      setMentions([]);
      setFiles([]);
      setUrl('');
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Could not post comment'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box>
      {comments.length ? comments.map((comment) => (
        <Comment key={comment._id} comment={comment} currentUserId={currentUserId} today={today} timezone={timezone} users={users} onEdit={onEdit} onRequestCorrection={onRequestCorrection} />
      )) : <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>No comments yet.</Typography>}
      {canComment && (
        <Stack spacing={1.2} sx={{ mt: 2 }}>
          <MentionField label="Add a comment" value={text} onChange={setText} mentions={mentions} onMentionsChange={setMentions} minRows={2} />
          <TextField size="small" label="Link (optional)" placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} />
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <FilePicker files={files} onChange={setFiles} limits={limits} />
            <Button variant="contained" onClick={submit} disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Comment'}</Button>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      )}
    </Box>
  );
}
