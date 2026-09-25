import React, { useEffect, useRef } from 'react';
import { Box, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { FormatBold, FormatItalic, FormatListBulleted, FormatListNumbered, FormatQuote, FormatUnderlined, Link as LinkIcon, Code } from '@mui/icons-material';

const TOOLS = [
  { command: 'bold', icon: <FormatBold fontSize="small" />, label: 'Bold' },
  { command: 'italic', icon: <FormatItalic fontSize="small" />, label: 'Italic' },
  { command: 'underline', icon: <FormatUnderlined fontSize="small" />, label: 'Underline' },
  { command: 'insertUnorderedList', icon: <FormatListBulleted fontSize="small" />, label: 'Bulleted list' },
  { command: 'insertOrderedList', icon: <FormatListNumbered fontSize="small" />, label: 'Numbered list' },
  { command: 'formatBlock', value: 'blockquote', icon: <FormatQuote fontSize="small" />, label: 'Quote' },
  { command: 'formatBlock', value: 'pre', icon: <Code fontSize="small" />, label: 'Code block' }
];

/** Lightweight rich text editor. Output is sanitized again on the server before it is stored. */
export default function RichTextEditor({ label, value, onChange, placeholder, minHeight = 140, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) ref.current.innerHTML = value || '';
  }, [value]);
  const run = (command, arg) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    onChange(ref.current?.innerHTML || '');
  };
  const addLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (url && /^https?:\/\//i.test(url)) run('createLink', url);
  };
  return (
    <Box>
      {label && <Typography variant="body2" color="text.secondary" sx={{ mb: 0.6 }}>{label}</Typography>}
      <Box sx={{ border: '1px solid #d0d7de', borderRadius: 2, overflow: 'hidden', bgcolor: disabled ? '#f8fafb' : 'background.paper' }}>
        {!disabled && (
          <Stack direction="row" alignItems="center" sx={{ px: 0.5, py: 0.3, bgcolor: '#f8fafb', flexWrap: 'wrap' }}>
            {TOOLS.map((tool) => <Tooltip key={tool.label} title={tool.label}><IconButton size="small" onMouseDown={(event) => { event.preventDefault(); run(tool.command, tool.value); }}>{tool.icon}</IconButton></Tooltip>)}
            <Tooltip title="Link"><IconButton size="small" onMouseDown={(event) => { event.preventDefault(); addLink(); }}><LinkIcon fontSize="small" /></IconButton></Tooltip>
          </Stack>
        )}
        {!disabled && <Divider />}
        <Box
          ref={ref}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={() => onChange(ref.current?.innerHTML || '')}
          data-placeholder={placeholder}
          sx={{
            minHeight, p: 1.5, outline: 'none', fontSize: 14, lineHeight: 1.6,
            '&:empty:before': { content: 'attr(data-placeholder)', color: 'text.disabled' },
            '& blockquote': { borderLeft: '3px solid #cbd5e1', m: 0, pl: 1.5, color: 'text.secondary' },
            '& pre': { bgcolor: '#f1f5f9', p: 1, borderRadius: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }
          }}
        />
      </Box>
    </Box>
  );
}

export function RichTextView({ html }) {
  if (!html) return null;
  return (
    <Box
      sx={{ fontSize: 14, lineHeight: 1.7, '& a': { color: 'primary.main' }, '& blockquote': { borderLeft: '3px solid #cbd5e1', m: 0, pl: 1.5, color: 'text.secondary' }, '& pre': { bgcolor: '#f1f5f9', p: 1, borderRadius: 1, whiteSpace: 'pre-wrap' } }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
