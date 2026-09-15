import React from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';

export function ActionButtons({ onView, onEdit, onDelete, extra }) {
  return <Stack direction="row" gap={0.5} justifyContent="flex-end" flexWrap="wrap" onClick={(event) => event.stopPropagation()}>
    {onView && <Button size="small" onClick={onView}>View</Button>}
    {onEdit && <Button size="small" onClick={onEdit}>Edit</Button>}
    {onDelete && <Button size="small" color="error" onClick={onDelete}>Delete</Button>}
    {extra}
  </Stack>;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onClose, onConfirm, loading, error }) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>
      <Typography>{message}</Typography>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button color="error" variant="contained" onClick={onConfirm} disabled={loading}>{loading ? 'Deleting…' : confirmLabel}</Button>
    </DialogActions>
  </Dialog>;
}

export const dateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
export const idOf = (value) => (value && typeof value === 'object' ? value._id || value.id : value) || '';
export const displayName = (record) => record?.fullName || [record?.firstName, record?.lastName].filter(Boolean).join(' ') || record?.name || 'this record';
