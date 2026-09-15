import React, { useState } from 'react';
import { Alert, Button, IconButton, InputAdornment, Stack, TextField } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { api, apiErrorMessage } from '../services/api';

function PasswordField({ label, value, onChange, show, onToggle, helperText, autoComplete }) {
  return (
    <TextField
      label={label}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      required
      helperText={helperText}
      autoComplete={autoComplete}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} onClick={onToggle} edge="end">
              {show ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        )
      }}
    />
  );
}

export default function ChangePasswordForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!form.currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (form.currentPassword === form.newPassword) {
      setError('Choose a new password that is different from the current one.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccess('Password updated. Use the new password the next time you sign in.');
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Could not change password.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Stack spacing={2} component="form" onSubmit={submit}>
      <PasswordField label="Current password" value={form.currentPassword} onChange={set('currentPassword')} show={show.current} onToggle={() => setShow((current) => ({ ...current, current: !current.current }))} autoComplete="current-password" />
      <PasswordField label="New password" value={form.newPassword} onChange={set('newPassword')} show={show.next} onToggle={() => setShow((current) => ({ ...current, next: !current.next }))} helperText="At least 8 characters." autoComplete="new-password" />
      <PasswordField label="Confirm new password" value={form.confirmPassword} onChange={set('confirmPassword')} show={show.confirm} onToggle={() => setShow((current) => ({ ...current, confirm: !current.confirm }))} autoComplete="new-password" />
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>{saving ? 'Saving…' : 'Update password'}</Button>
    </Stack>
  );
}
