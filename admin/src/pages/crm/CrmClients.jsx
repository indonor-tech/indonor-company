import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const empty = { clientName: '', companyName: '', companyEmail: '', companyPhone: '', industry: '', city: '', country: '' };

export default function CrmClients() {
  const { can, isViewAdmin } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const readOnly = isViewAdmin || !can('crm:clients:write');

  const list = useQuery({
    queryKey: ['crm-clients', search],
    queryFn: () => api.get('/crm/clients', { params: { q: search || undefined, limit: 100 } }).then((r) => r.data)
  });
  const create = useMutation({
    mutationFn: () => api.post('/crm/clients', form),
    onSuccess: (response) => {
      client.invalidateQueries({ queryKey: ['crm-clients'] });
      setOpen(false);
      setForm(empty);
      navigate(`/crm/clients/${response.data.data._id}`);
    }
  });
  const rows = list.data?.data || [];

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4">Clients</Typography>
          <Typography color="text.secondary" sx={{ mt: .5 }}>Converted customers and their project portfolio.</Typography>
        </Box>
        {!readOnly && <Button size="small" variant="contained" onClick={() => setOpen(true)}>Add client</Button>}
      </Box>
      <Card>
        <CardContent>
          <TextField size="small" placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 2, maxWidth: 420 }} fullWidth />
          {list.isLoading ? <Typography>Loading…</Typography>
            : list.isError ? <Alert severity="error">Could not load clients.</Alert>
              : rows.length === 0 ? <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No clients yet.</Typography>
                : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Client</TableCell>
                        <TableCell>Company</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>City</TableCell>
                        <TableCell align="right">Open</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow hover key={row._id}>
                          <TableCell>
                            <Typography fontWeight={650}>{row.clientName}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.clientId}</Typography>
                          </TableCell>
                          <TableCell>{row.companyName || '—'}</TableCell>
                          <TableCell>{row.companyEmail || '—'}</TableCell>
                          <TableCell>{row.city || '—'}</TableCell>
                          <TableCell align="right"><Button size="small" onClick={() => navigate(`/crm/clients/${row._id}`)}>View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add client</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Client name" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} fullWidth required />
            <TextField label="Company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} fullWidth />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Email" value={form.companyEmail} onChange={(e) => setForm({ ...form, companyEmail: e.target.value })} fullWidth />
              <TextField label="Phone" value={form.companyPhone} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} fullWidth />
              <TextField label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} fullWidth />
              <TextField label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} fullWidth />
            </Stack>
            {create.isError && <Alert severity="error">{apiErrorMessage(create.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.clientName.trim() || create.isPending} onClick={() => create.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
