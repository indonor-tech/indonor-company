import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { dateInput } from './RecordActions';
import { AddressFields, TrackSelect, currentAddressOf, formatApplyingRole, fromCurrentAddress, fromPermanentAddress, permanentAddressOf } from './GeoFields';

export function ConvertEmployeeDialog({ candidateId, candidate, open, onClose }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const client = useQueryClient();
  const id = candidateId || candidate?._id;
  const loaded = useQuery({
    queryKey: ['candidates', id],
    queryFn: () => api.get(`/candidates/${id}`).then((response) => response.data.data),
    enabled: open && Boolean(id)
  });
  const record = loaded.data || candidate;
  const catalogs = useQuery({
    queryKey: ['catalogs', 'record-form'],
    queryFn: async () => ({
      departments: (await api.get('/catalog/departments', { params: { limit: 500 } })).data.data,
      designations: (await api.get('/catalog/designations', { params: { limit: 500 } })).data.data
    }),
    enabled: open,
    retry: false
  });
  const [form, setForm] = useState({});
  useEffect(() => {
    if (!open || !record) return;
    const matched = (catalogs.data?.designations || []).find((item) => item.name.toLowerCase() === (record.applyingPosition || '').toLowerCase());
    const intern = /intern/i.test(record.applyingPosition || '');
    setForm({
      employeeType: intern ? 'INTERN' : (record.offerEmploymentType || 'FULL_TIME'),
      joiningDate: dateInput(record.offerJoiningDate) || dateInput(new Date()),
      companyEmail: '',
      department: '',
      designation: matched?._id || '',
      specialization: record.applyingTrack || '',
      workLocation: record.location || record.city || '',
      workMode: record.offerWorkMode || 'HYBRID',
      probationPeriod: '',
      fatherName: '',
      nationality: 'Indian',
      maritalStatus: '',
      address: record.address || '',
      city: record.city || '',
      state: record.state || '',
      country: record.country || 'India',
      postalCode: record.postalCode || '',
      district: record.district || '',
      permanentAddress: record.permanentAddress || '',
      permanentCity: record.permanentCity || '',
      permanentState: record.permanentState || '',
      permanentCountry: record.permanentCountry || record.country || 'India',
      permanentPostalCode: record.permanentPostalCode || '',
      permanentDistrict: record.permanentDistrict || '',
      panNumber: '',
      aadhaarNumber: '',
      emergencyName: '',
      emergencyPhone: '',
      emergencyRelation: '',
      accountHolder: `${record.firstName || ''} ${record.lastName || ''}`.trim(),
      accountNumber: '',
      ifsc: '',
      bankName: '',
      salaryCurrent: record.offerSalary || record.expectedSalary || record.currentSalary || '',
      salaryBase: '',
      salaryAllowances: ''
    });
  }, [open, record?._id, record?.applyingTrack, record?.applyingPosition, catalogs.data?.designations]);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const convert = useMutation({
    mutationFn: () => api.post(`/candidates/${id}/convert`, {
      employeeType: form.employeeType,
      joiningDate: form.joiningDate || undefined,
      companyEmail: form.companyEmail || undefined,
      department: form.department || undefined,
      designation: form.designation || undefined,
      specialization: form.specialization || undefined,
      workLocation: form.workLocation,
      workMode: form.workMode || undefined,
      probationPeriod: form.probationPeriod === '' ? undefined : Number(form.probationPeriod),
      fatherName: form.fatherName,
      nationality: form.nationality,
      maritalStatus: form.maritalStatus,
      address: form.address,
      city: form.city,
      state: form.state,
      country: form.country,
      postalCode: form.postalCode,
      district: form.district,
      permanentAddress: form.permanentAddress,
      permanentCity: form.permanentCity,
      permanentState: form.permanentState,
      permanentCountry: form.permanentCountry,
      permanentPostalCode: form.permanentPostalCode,
      permanentDistrict: form.permanentDistrict,
      panNumber: form.panNumber,
      aadhaarNumber: form.aadhaarNumber,
      emergencyContact: { name: form.emergencyName, phone: form.emergencyPhone, relation: form.emergencyRelation },
      bank: { accountHolder: form.accountHolder, accountNumber: form.accountNumber, ifsc: form.ifsc, bankName: form.bankName },
      salary: can('salary:update') && form.salaryCurrent !== ''
        ? {
          current: Number(form.salaryCurrent),
          base: form.salaryBase === '' ? undefined : Number(form.salaryBase),
          allowances: form.salaryAllowances === '' ? undefined : Number(form.salaryAllowances),
          currency: 'INR',
          frequency: 'MONTHLY'
        }
        : undefined
    }),
    onSuccess: ({ data }) => {
      client.invalidateQueries({ queryKey: ['candidates'] });
      client.invalidateQueries({ queryKey: ['employees'] });
      client.invalidateQueries({ queryKey: ['interviews'] });
      onClose();
      navigate(`/employees/${data.data._id}`);
    }
  });
  const already = record?.convertedEmployeeId;
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle>Convert to employee</DialogTitle>
    <DialogContent>
      {loaded.isLoading && !record ? <CircularProgress sx={{ mt: 2 }} /> : already ? <Alert sx={{ mt: 1 }} severity="info">This candidate is already an employee.</Alert> : <Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="success">{record ? `${record.firstName} ${record.lastName}` : 'This candidate'} passed the interview as {formatApplyingRole(record?.applyingPosition, record?.applyingTrack) || 'this role'}. Fill joining details below. Education, experience, skills and resume files are copied automatically.</Alert>
        <Typography variant="subtitle2">Joining details</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}><TextField select required label="Employment type" value={form.employeeType || 'FULL_TIME'} onChange={set('employeeType')} fullWidth>{['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY'].map((option) => <MenuItem key={option} value={option}>{option.replaceAll('_', ' ')}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField type="date" required label="Joining date" value={form.joiningDate || ''} onChange={set('joiningDate')} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Company email" type="email" value={form.companyEmail || ''} onChange={set('companyEmail')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField select label="Department" value={form.department || ''} onChange={set('department')} fullWidth><MenuItem value="">None</MenuItem>{(catalogs.data?.departments || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField select label="Designation" value={form.designation || ''} onChange={set('designation')} fullWidth><MenuItem value="">None</MenuItem>{(catalogs.data?.designations || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TrackSelect value={form.specialization || ''} onChange={(value) => setForm((current) => ({ ...current, specialization: value }))} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField select label="Work mode" value={form.workMode || ''} onChange={set('workMode')} fullWidth><MenuItem value="ONSITE">Onsite</MenuItem><MenuItem value="HYBRID">Hybrid</MenuItem><MenuItem value="REMOTE">Remote</MenuItem></TextField></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Work location" value={form.workLocation || ''} onChange={set('workLocation')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField type="number" label="Probation (months)" value={form.probationPeriod ?? ''} onChange={set('probationPeriod')} fullWidth /></Grid>
        </Grid>
        <Typography variant="subtitle2">New employee records</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Father's name" value={form.fatherName || ''} onChange={set('fatherName')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Nationality" value={form.nationality || ''} onChange={set('nationality')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField select label="Marital status" value={form.maritalStatus || ''} onChange={set('maritalStatus')} fullWidth><MenuItem value="">Not specified</MenuItem><MenuItem value="SINGLE">Single</MenuItem><MenuItem value="MARRIED">Married</MenuItem><MenuItem value="OTHER">Other</MenuItem></TextField></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="PAN" value={form.panNumber || ''} onChange={set('panNumber')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Aadhaar" value={form.aadhaarNumber || ''} onChange={set('aadhaarNumber')} fullWidth /></Grid>
          {can('salary:update') && <Grid size={{ xs: 12, md: 4 }}><TextField type="number" label="Starting salary (monthly)" value={form.salaryCurrent || ''} onChange={set('salaryCurrent')} fullWidth /></Grid>}
          {can('salary:update') && <Grid size={{ xs: 12, md: 4 }}><TextField type="number" label="Base" value={form.salaryBase || ''} onChange={set('salaryBase')} fullWidth /></Grid>}
          {can('salary:update') && <Grid size={{ xs: 12, md: 4 }}><TextField type="number" label="Allowances" value={form.salaryAllowances || ''} onChange={set('salaryAllowances')} fullWidth /></Grid>}
        </Grid>
        <AddressFields title="Current address" streetLabel="Current address line" value={currentAddressOf(form)} onChange={(next) => setForm((current) => ({ ...current, ...fromCurrentAddress(next) }))} />
        <AddressFields title="Permanent address" streetLabel="Permanent address line" value={permanentAddressOf(form)} onChange={(next) => setForm((current) => ({ ...current, ...fromPermanentAddress(next) }))} />
        <Typography variant="subtitle2">Emergency contact</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Name" value={form.emergencyName || ''} onChange={set('emergencyName')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Phone" value={form.emergencyPhone || ''} onChange={set('emergencyPhone')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Relation" value={form.emergencyRelation || ''} onChange={set('emergencyRelation')} fullWidth /></Grid>
        </Grid>
        <Typography variant="subtitle2">Bank</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Account holder" value={form.accountHolder || ''} onChange={set('accountHolder')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Bank" value={form.bankName || ''} onChange={set('bankName')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Account number" value={form.accountNumber || ''} onChange={set('accountNumber')} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="IFSC" value={form.ifsc || ''} onChange={set('ifsc')} fullWidth /></Grid>
        </Grid>
        {convert.isError && <Alert severity="error">{convert.error.response?.data?.message || 'Could not convert this candidate.'}</Alert>}
      </Stack>}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      {already
        ? <Button variant="contained" onClick={() => { onClose(); navigate(`/employees/${already}`); }}>Open employee</Button>
        : <Button variant="contained" onClick={() => convert.mutate()} disabled={convert.isPending || loaded.isLoading}>{convert.isPending ? 'Saving employee…' : 'Create employee'}</Button>}
    </DialogActions>
  </Dialog>;
}

export function candidateIdOf(interview) {
  const value = interview?.candidate;
  return value && typeof value === 'object' ? value._id || value.id : value || '';
}

export function canConvertCandidate(record) {
  if (!record || record.convertedEmployeeId) return false;
  return ['SELECTED', 'OFFER_SENT', 'OFFER_ACCEPTED'].includes(record.status);
}
