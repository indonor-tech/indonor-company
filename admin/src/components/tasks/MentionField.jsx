import React, { useMemo, useRef, useState } from 'react';
import { Avatar, ListItemButton, ListItemText, Paper, Popper, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { taskApi } from '../../services/tasks';

export function useMentionableUsers() {
  return useQuery({ queryKey: ['task-users'], queryFn: taskApi.users, staleTime: 5 * 60_000 });
}

/**
 * Text field with @mention autocomplete. Selecting a person inserts "@Full Name" and records their id,
 * so the backend receives explicit mention ids in addition to parsing the text.
 */
export default function MentionField({ value, onChange, mentions = [], onMentionsChange, label, placeholder, minRows = 3, disabled, autoFocus }) {
  const { data: users = [] } = useMentionableUsers();
  const inputRef = useRef(null);
  const [query, setQuery] = useState(null);
  const matches = useMemo(() => {
    if (query === null) return [];
    const term = query.toLowerCase();
    return users.filter((user) => user.name.toLowerCase().includes(term)).slice(0, 8);
  }, [query, users]);
  const detect = (text, caret) => {
    const before = text.slice(0, caret);
    const match = /(^|\s)@([\w.]{0,30})$/.exec(before);
    setQuery(match ? match[2] : null);
  };
  const pick = (user) => {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([\w.]{0,30})$/, `@${user.name} `);
    const next = before + value.slice(caret);
    onChange(next);
    if (!mentions.includes(user.id)) onMentionsChange?.([...mentions, user.id]);
    setQuery(null);
    window.setTimeout(() => { input?.focus(); input?.setSelectionRange(before.length, before.length); }, 0);
  };
  return (
    <>
      <TextField
        fullWidth multiline minRows={minRows} label={label} placeholder={placeholder || 'Type @ to mention someone'} value={value} disabled={disabled} autoFocus={autoFocus}
        inputRef={inputRef}
        onChange={(event) => { onChange(event.target.value); detect(event.target.value, event.target.selectionStart); }}
        onKeyDown={(event) => {
          if (matches.length && (event.key === 'Enter' || event.key === 'Tab') && query !== null) { event.preventDefault(); pick(matches[0]); }
          if (event.key === 'Escape') setQuery(null);
        }}
        onBlur={() => window.setTimeout(() => setQuery(null), 150)}
      />
      <Popper open={Boolean(matches.length)} anchorEl={inputRef.current} placement="bottom-start" sx={{ zIndex: 1500 }}>
        <Paper elevation={6} sx={{ mt: 0.5, minWidth: 260, maxHeight: 280, overflow: 'auto' }}>
          {matches.map((user) => (
            <ListItemButton key={user.id} onMouseDown={(event) => { event.preventDefault(); pick(user); }}>
              <Avatar sx={{ width: 28, height: 28, mr: 1.2, fontSize: 13, bgcolor: 'primary.main' }}>{user.name[0]}</Avatar>
              <ListItemText primary={user.name} secondary={user.email} primaryTypographyProps={{ fontSize: 14 }} secondaryTypographyProps={{ fontSize: 12 }} />
            </ListItemButton>
          ))}
        </Paper>
      </Popper>
    </>
  );
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function MentionText({ text, users = [] }) {
  const names = users.map((user) => user.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
  const alternatives = names.map(escapeRegExp).join('|');
  const pattern = new RegExp(`(@(?:${alternatives}))`, 'gi');
  const exact = new RegExp(`^@(?:${alternatives})$`, 'i');
  return <span style={{ whiteSpace: 'pre-wrap' }}>{String(text).split(pattern).map((part, index) => (exact.test(part) ? <strong key={index} style={{ color: '#0f766e' }}>{part}</strong> : <React.Fragment key={index}>{part}</React.Fragment>))}</span>;
}
