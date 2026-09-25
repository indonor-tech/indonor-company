import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, FormControlLabel, MenuItem, Stack, Switch, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../services/api';

const ACTIVE_STATUSES = ['ACTIVE', 'ON_PROBATION', 'ON_LEAVE'];
const STATUS_COLOR = { SENT: 'success', PARTIAL: 'warning', FAILED: 'error' };
const MODE_LABEL = { TOGETHER: 'One message', SEPARATE: 'Separately', TEST: 'Test' };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalize = (values) => [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function RecipientField({ label, value, onChange, options, byEmail, helperText, required, placeholder }) {
  return <Autocomplete
    multiple
    freeSolo
    options={options.map((recipient) => recipient.email)}
    groupBy={(email) => byEmail.get(email)?.group || 'Other'}
    getOptionLabel={(email) => email}
    filterOptions={(emails, { inputValue }) => {
      const query = inputValue.trim().toLowerCase();
      if (!query) return emails.slice(0, 200);
      return emails.filter((email) => {
        const recipient = byEmail.get(email);
        return [email, recipient?.label, recipient?.department, recipient?.registrationNumber].join(' ').toLowerCase().includes(query);
      }).slice(0, 200);
    }}
    value={value}
    onChange={(_event, next) => onChange(normalize(next))}
    renderOption={(props, email) => {
      const { key, ...rest } = props;
      const recipient = byEmail.get(email);
      return <li key={key} {...rest}>
        <Box>
          <Typography fontWeight={600}>{recipient?.label || email}</Typography>
          <Typography variant="caption" color="text.secondary">{[email, recipient?.department, recipient?.employmentStatus?.replaceAll('_', ' ')].filter(Boolean).join(' · ')}</Typography>
        </Box>
      </li>;
    }}
    renderTags={(values, getTagProps) => values.map((email, index) => {
      const { key, ...tagProps } = getTagProps({ index });
      const recipient = byEmail.get(email);
      return <Tooltip key={key} title={email}><Chip {...tagProps} label={recipient?.label || email} color={emailPattern.test(email) ? 'default' : 'error'} /></Tooltip>;
    })}
    renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} required={required && !value.length} helperText={helperText} />}
  />;
}

function MailStatus({ status, onVerify, onTest, verifying, testing }) {
  if (status.isLoading) return <Alert severity="info" icon={<CircularProgress size={18} />}>Checking email setup…</Alert>;
  if (status.isError) return <Alert severity="error">{apiErrorMessage(status.error, 'Could not load email status.')}</Alert>;
  const data = status.data;
  const providerName = data.provider === 'gmail' ? 'Gmail' : data.provider === 'json' ? 'test transport' : data.host;
  if (!data.configured) {
    return <Alert severity="warning">
      Email is not configured yet. In the backend environment set <b>SMTP_USER</b> to your Gmail address and <b>SMTP_PASS</b> to a Gmail App Password
      (Google Account → Security → 2-Step Verification → App passwords), then restart the backend.
    </Alert>;
  }
  return <Alert
    severity="success"
    action={<Stack direction="row" spacing={1}>
      <Button color="inherit" size="small" onClick={onVerify} disabled={verifying}>{verifying ? 'Checking…' : 'Verify'}</Button>
      <Button color="inherit" size="small" onClick={onTest} disabled={testing}>{testing ? 'Sending…' : 'Send test to me'}</Button>
    </Stack>}
  >
    Sending through <b>{providerName}</b>{data.account ? <> as <b>{data.account}</b></> : null}. Replies go to your CRM email.
  </Alert>;
}

function History() {
  const [page, setPage] = useState(1);
  const history = useQuery({ queryKey: ['email-history', page], queryFn: () => api.get('/email/history', { params: { page, limit: 20 } }).then((response) => response.data) });
  if (history.isLoading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (history.isError) return <Alert severity="error">{apiErrorMessage(history.error, 'Could not load email history.')}</Alert>;
  const rows = history.data?.data || [];
  const totalPages = history.data?.meta?.pages || 1;
  if (!rows.length) return <Typography color="text.secondary" sx={{ p: 3 }}>No emails sent yet.</Typography>;
  return <Stack spacing={2}>
    <TableContainer>
      <Table size="small">
        <TableHead><TableRow><TableCell>Sent</TableCell><TableCell>Subject</TableCell><TableCell>Recipients</TableCell><TableCell>Mode</TableCell><TableCell>Status</TableCell><TableCell>Sent by</TableCell></TableRow></TableHead>
        <TableBody>
          {rows.map((row) => {
            const recipients = [...(row.to || []), ...(row.cc || []), ...(row.bcc || [])];
            return <TableRow key={row._id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.sentAt || row.createdAt)}</TableCell>
              <TableCell>
                <Typography fontWeight={600}>{row.subject}</Typography>
                {row.attachmentNames?.length > 0 && <Typography variant="caption" color="text.secondary">{row.attachmentNames.length} attachment{row.attachmentNames.length === 1 ? '' : 's'}</Typography>}
              </TableCell>
              <TableCell><Tooltip title={recipients.join(', ')}><span>{recipients.length === 1 ? recipients[0] : `${recipients.length} recipients`}</span></Tooltip></TableCell>
              <TableCell>{MODE_LABEL[row.mode] || MODE_LABEL.TOGETHER}</TableCell>
              <TableCell>
                <Tooltip title={(row.failed || []).map((item) => `${item.email}: ${item.error}`).join('\n')}>
                  <Chip size="small" color={STATUS_COLOR[row.status || 'SENT']} label={row.status === 'PARTIAL' ? `Partial (${row.failed?.length} failed)` : (row.status || 'SENT').toLowerCase().replace(/^./, (c) => c.toUpperCase())} />
                </Tooltip>
              </TableCell>
              <TableCell>{row.sender?.name || '—'}</TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
    </TableContainer>
    {totalPages > 1 && <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
      <Button size="small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
      <Typography variant="body2">Page {page} of {totalPages}</Typography>
      <Button size="small" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
    </Stack>}
  </Stack>;
}

export default function Email() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('compose');
  const [to, setTo] = useState(() => normalize((searchParams.get('to') || '').split(',')));
  const [cc, setCc] = useState([]);
  const [bcc, setBcc] = useState([]);
  const [separate, setSeparate] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [department, setDepartment] = useState('');
  const [notice, setNotice] = useState(null);

  const status = useQuery({ queryKey: ['email-status'], queryFn: () => api.get('/email/status').then((response) => response.data.data) });
  const recipients = useQuery({ queryKey: ['email-recipients'], queryFn: () => api.get('/email/recipients').then((response) => response.data.data) });
  const options = useMemo(() => recipients.data || [], [recipients.data]);
  const byEmail = useMemo(() => new Map(options.map((recipient) => [recipient.email, recipient])), [options]);
  const activeEmployees = useMemo(() => options.filter((recipient) => recipient.group === 'Employees' && ACTIVE_STATUSES.includes(recipient.employmentStatus || 'ACTIVE')), [options]);
  const departments = useMemo(() => [...new Set(activeEmployees.map((recipient) => recipient.department).filter(Boolean))].sort(), [activeEmployees]);

  const addRecipients = (emails) => setTo((current) => normalize([...current, ...emails]));
  const totalRecipients = to.length + (separate ? 0 : cc.length + bcc.length);
  const invalid = [...to, ...(separate ? [] : [...cc, ...bcc])].filter((email) => !emailPattern.test(email));

  const verify = useMutation({
    mutationFn: () => api.post('/email/verify'),
    onSuccess: () => setNotice({ severity: 'success', text: 'Connected to the mail server successfully.' }),
    onError: (error) => setNotice({ severity: 'error', text: apiErrorMessage(error, 'Could not connect to the mail server.') })
  });
  const test = useMutation({
    mutationFn: () => api.post('/email/test'),
    onSuccess: (response) => { setNotice({ severity: 'success', text: response.data.message }); queryClient.invalidateQueries({ queryKey: ['email-history'] }); },
    onError: (error) => setNotice({ severity: 'error', text: apiErrorMessage(error, 'Test email could not be sent.') })
  });
  const send = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('to', to.join(','));
      if (!separate) { form.append('cc', cc.join(',')); form.append('bcc', bcc.join(',')); }
      form.append('separate', String(separate));
      form.append('subject', subject);
      form.append('body', body);
      files.forEach((file) => form.append('attachments', file));
      return api.post('/email/send', form);
    },
    onSuccess: (response) => {
      const log = response.data.data;
      setNotice({ severity: log?.status === 'PARTIAL' ? 'warning' : 'success', text: response.data.message });
      setTo([]); setCc([]); setBcc([]); setSubject(''); setBody(''); setFiles([]);
      queryClient.invalidateQueries({ queryKey: ['email-history'] });
    },
    onError: (error) => setNotice({ severity: 'error', text: apiErrorMessage(error, 'Email could not be sent.') })
  });

  const submit = (event) => { event.preventDefault(); setNotice(null); send.mutate(); };
  const canSend = status.data?.configured && to.length > 0 && !invalid.length && subject.trim() && body.trim() && totalRecipients <= 100 && !send.isPending;

  return <Stack spacing={3}>
    <Box>
      <Typography variant="h4">Email</Typography>
      <Typography color="text.secondary" sx={{ mt: .7 }}>Send emails to employees and CRM users from the company Gmail account.</Typography>
    </Box>
    <MailStatus status={status} onVerify={() => { setNotice(null); verify.mutate(); }} onTest={() => { setNotice(null); test.mutate(); }} verifying={verify.isPending} testing={test.isPending} />
    {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ whiteSpace: 'pre-line' }}>{notice.text}</Alert>}
    <Card>
      <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="compose" label="Compose" />
        <Tab value="history" label="Sent history" />
      </Tabs>
      <CardContent>
        {tab === 'history' ? <History /> : <Stack component="form" onSubmit={submit} spacing={2.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <Button variant="outlined" size="small" disabled={!activeEmployees.length} onClick={() => addRecipients(activeEmployees.map((recipient) => recipient.email))}>
              Add all active employees ({activeEmployees.length})
            </Button>
            {departments.length > 0 && <TextField select size="small" label="Add a department" value={department} sx={{ minWidth: 220 }} onChange={(event) => {
              const name = event.target.value;
              setDepartment('');
              addRecipients(activeEmployees.filter((recipient) => recipient.department === name).map((recipient) => recipient.email));
            }}>
              {departments.map((name) => <MenuItem key={name} value={name}>{name} ({activeEmployees.filter((recipient) => recipient.department === name).length})</MenuItem>)}
            </TextField>}
            {to.length > 0 && <Button size="small" color="inherit" onClick={() => setTo([])}>Clear recipients</Button>}
            {recipients.isLoading && <CircularProgress size={18} />}
          </Stack>
          <RecipientField
            label="To"
            required
            value={to}
            onChange={setTo}
            options={options}
            byEmail={byEmail}
            placeholder="Search employees by name, email or department"
            helperText={`${to.length} recipient${to.length === 1 ? '' : 's'}. You can also type any email address and press Enter.`}
          />
          <FormControlLabel
            control={<Switch checked={separate} onChange={(event) => setSeparate(event.target.checked)} />}
            label={<Box><Typography>Send separately to each recipient</Typography><Typography variant="caption" color="text.secondary">Each person gets their own copy and can't see who else received it. Turn off to send one message with CC/BCC.</Typography></Box>}
          />
          {!separate && <>
            <RecipientField label="CC" value={cc} onChange={setCc} options={options} byEmail={byEmail} placeholder="Optional CC recipients" />
            <RecipientField label="BCC" value={bcc} onChange={setBcc} options={options} byEmail={byEmail} placeholder="Optional hidden recipients" />
          </>}
          <TextField label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} required fullWidth inputProps={{ maxLength: 200 }} />
          <TextField
            label="Message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            fullWidth
            multiline
            minRows={10}
            placeholder={'Hi {{firstName}},\n\nWrite your message…'}
            helperText="Tip: {{name}} and {{firstName}} are replaced with each employee's name."
          />
          <Box>
            <Button component="label" variant="outlined">+ Add PDF or image<input hidden type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" onChange={(event) => { setFiles((current) => [...current, ...Array.from(event.target.files || [])].slice(0, 5)); event.target.value = ''; }} /></Button>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>Up to 5 files, 10 MB each.</Typography>
            {files.length > 0 && <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>{files.map((file, index) => <Chip key={`${file.name}-${index}`} label={file.name} onDelete={() => setFiles((current) => current.filter((item) => item !== file))} />)}</Stack>}
          </Box>
          {invalid.length > 0 && <Alert severity="error">Invalid email address: {invalid.join(', ')}</Alert>}
          {totalRecipients > 100 && <Alert severity="error">You can email at most 100 people at once. Currently {totalRecipients}.</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={!canSend}>
            {send.isPending ? 'Sending…' : separate && to.length > 1 ? `Send to ${to.length} recipients` : 'Send email'}
          </Button>
        </Stack>}
      </CardContent>
    </Card>
  </Stack>;
}
