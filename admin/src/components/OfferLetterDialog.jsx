import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { api, apiErrorMessage } from '../services/api';
import { dateInput } from './RecordActions';
import { RoleSelect } from './GeoFields';
import { openStoredDocument } from './PeopleRecords';
import LetterTenureFields from './LetterTenureFields';
import { DEFAULT_DURATION_MONTHS, PAID_SALARY_TYPES, defaultSalaryType, isUnpaidInternship, lastWorkingFromDuration, letterPayBody, letterTenureBody, withLetterTenure } from '../utils/letters';

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY'];

export function canOfferCandidate(record) {
  if (!record || record.convertedEmployeeId) return false;
  return ['SELECTED', 'OFFER_SENT', 'OFFER_ACCEPTED'].includes(record.status);
}

export function OfferLetterDialog({ candidateId, candidate, open, onClose }) {
  const client = useQueryClient();
  const id = candidateId || candidate?._id;
  const loaded = useQuery({
    queryKey: ['candidates', id],
    queryFn: () => api.get(`/candidates/${id}`).then((response) => response.data.data),
    enabled: open && Boolean(id)
  });
  const record = loaded.data || candidate;
  const intern = /intern/i.test(record?.applyingPosition || '') || /intern/i.test(record?.offerEmploymentType || '');
  const [form, setForm] = useState({
    joiningDate: '', applyingPosition: '', applyingTrack: '', salary: '', salaryType: 'MONTHLY',
    employmentType: 'FULL_TIME', workMode: 'HYBRID', offerExpiryDate: '', durationMonths: '', lastWorkingDate: '', weekendOff: true, workingHours: true
  });
  const unpaid = isUnpaidInternship(form.applyingPosition, form.employmentType, form.salaryType);
  useEffect(() => {
    if (!open || !record) return;
    const joining = dateInput(record.offerJoiningDate) || dateInput(new Date(Date.now() + 7 * 86400000));
    const expiry = dateInput(record.offerExpiryDate) || dateInput(new Date(Date.now() + 7 * 86400000));
    const employmentType = record.offerEmploymentType || (intern ? 'INTERN' : 'FULL_TIME');
    const durationMonths = record.offerDurationMonths ?? (intern ? DEFAULT_DURATION_MONTHS : '');
    setForm({
      joiningDate: joining,
      applyingPosition: record.applyingPosition || '',
      applyingTrack: record.applyingTrack || '',
      salary: intern ? '' : (record.offerSalary || record.expectedSalary || ''),
      salaryType: intern ? 'UNPAID' : (record.offerSalaryType || defaultSalaryType(record.applyingPosition, employmentType)),
      employmentType,
      workMode: record.offerWorkMode || 'HYBRID',
      offerExpiryDate: expiry,
      durationMonths,
      lastWorkingDate: dateInput(record.offerLastWorkingDate) || lastWorkingFromDuration(joining, durationMonths),
      weekendOff: true,
      workingHours: true
    });
  }, [open, record?._id, intern]);
  const set = (name) => (event) => {
    const raw = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    const value = name === 'durationMonths' && raw !== '' ? Number(raw) : raw;
    setForm((current) => {
      const patch = { [name]: value };
      if (name === 'employmentType') {
        patch.salaryType = defaultSalaryType(current.applyingPosition, value);
        if (value === 'INTERN' && (current.durationMonths === '' || current.durationMonths == null)) patch.durationMonths = DEFAULT_DURATION_MONTHS;
      }
      return withLetterTenure(current, patch);
    });
  };
  const generate = useMutation({
    mutationFn: () => api.post(`/candidates/${id}/offer-letter`, {
      joiningDate: form.joiningDate,
      applyingPosition: form.applyingPosition,
      applyingTrack: form.applyingTrack || '',
      ...letterPayBody(form),
      employmentType: form.employmentType,
      workMode: form.workMode || undefined,
      offerExpiryDate: form.offerExpiryDate || undefined,
      ...letterTenureBody(form)
    }),
    onSuccess: async ({ data }) => {
      client.invalidateQueries({ queryKey: ['candidates'] });
      client.invalidateQueries({ queryKey: ['documents'] });
      const document = data.data?.document;
      if (document?._id) {
        try { await openStoredDocument(document); } catch { /* PDF is saved on Documents even if download is blocked */ }
      }
      onClose();
    }
  });
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>Generate offer letter</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography color="text.secondary">Creates a PDF on Indonor letterhead with the Director signature, then saves it under Documents.</Typography>
        {record && <Typography fontWeight={650}>{record.firstName} {record.lastName} · {record.candidateRegistrationNumber}</Typography>}
        <RoleSelect required position={form.applyingPosition} track={form.applyingTrack} onChange={({ position, track }) => setForm((current) => {
          const internRole = /intern/i.test(position);
          const employmentType = internRole ? 'INTERN' : current.employmentType;
          const durationMonths = internRole && (current.durationMonths === '' || current.durationMonths == null)
            ? DEFAULT_DURATION_MONTHS
            : current.durationMonths;
          return withLetterTenure(current, {
            applyingPosition: position,
            applyingTrack: track,
            salaryType: defaultSalaryType(position, employmentType),
            employmentType,
            durationMonths
          });
        })} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}><TextField type="date" required label="Joining date" value={form.joiningDate} onChange={set('joiningDate')} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField type="date" label="Offer valid until" value={form.offerExpiryDate} onChange={set('offerExpiryDate')} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField select required label="Employment type" value={form.employmentType} onChange={set('employmentType')} fullWidth>{EMPLOYMENT_TYPES.map((option) => <MenuItem key={option} value={option}>{option.replaceAll('_', ' ')}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField select label="Work mode" value={form.workMode} onChange={set('workMode')} fullWidth><MenuItem value="ONSITE">Onsite</MenuItem><MenuItem value="HYBRID">Hybrid</MenuItem><MenuItem value="REMOTE">Remote</MenuItem></TextField></Grid>
          <LetterTenureFields form={form} onChange={set} />
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControlLabel control={<Switch checked={form.workingHours !== false} onChange={set('workingHours')} />} label="8-hour working day" />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControlLabel control={<Switch checked={form.weekendOff !== false} onChange={set('weekendOff')} />} label="Saturday and Sunday off" />
          </Grid>
          {unpaid ? (
            <Grid size={{ xs: 12 }}><Alert severity="info">Internships at Indonor are unpaid. The letter will state that no stipend or salary is payable.</Alert></Grid>
          ) : (
            <>
              <Grid size={{ xs: 12, md: 6 }}><TextField select required label="Salary type" value={form.salaryType} onChange={set('salaryType')} fullWidth>{PAID_SALARY_TYPES.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</TextField></Grid>
              <Grid size={{ xs: 12, md: 6 }}><TextField type="number" required label="Salary amount (INR)" value={form.salary} onChange={set('salary')} fullWidth /></Grid>
            </>
          )}
        </Grid>
        {generate.isError && <Alert severity="error">{apiErrorMessage(generate.error, 'Could not generate the offer letter.')}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="contained" disabled={generate.isPending || !form.joiningDate || !form.applyingPosition || (!unpaid && form.salary === '')} onClick={() => generate.mutate()}>{generate.isPending ? 'Generating…' : 'Generate PDF'}</Button>
    </DialogActions>
  </Dialog>;
}
