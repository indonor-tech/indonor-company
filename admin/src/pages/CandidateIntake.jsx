import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '../services/api';
import { RepeatableRows } from '../components/PeopleRecords';
import { AddressFields, RoleSelect, currentAddressOf, fromCurrentAddress, fromPermanentAddress, permanentAddressOf } from '../components/GeoFields';
import { matchLocation } from '../utils/geo';

const sources = ['WALK_IN', 'RESUME_UPLOAD', 'LINKEDIN', 'REFERRAL', 'JOB_PORTAL', 'CAMPUS', 'OTHER'];
const emptyForm = {
  firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '', applyingPosition: '', applyingTrack: '', source: 'WALK_IN',
  location: '', address: '', city: '', state: '', country: 'India', postalCode: '', district: '',
  permanentAddress: '', permanentCity: '', permanentState: '', permanentCountry: 'India', permanentPostalCode: '', permanentDistrict: '',
  linkedin: '', github: '', currentCompany: '', currentSalary: '', expectedSalary: '', noticePeriod: '', notes: '',
  education: [], experience: [], skills: []
};

export default function CandidateIntake() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [fileName, setFileName] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const parse = useMutation({
    mutationFn: (file) => { setResumeFile(file); const body = new FormData(); body.append('file', file); return api.post('/candidates/parse-resume', body, { timeout: 120000 }); },
    onSuccess: ({ data }) => {
      const extracted = data.data || {};
      const geo = matchLocation([extracted.location, extracted.resumeText?.slice(0, 1500)].filter(Boolean).join('\n'));
      setFileName(extracted.fileName || resumeFile?.name || 'Resume');
      setForm((current) => ({
        ...current,
        firstName: extracted.firstName || current.firstName,
        lastName: extracted.lastName || current.lastName,
        email: extracted.email || current.email,
        phone: extracted.phone || current.phone,
        location: extracted.location || current.location,
        country: geo.country || current.country,
        state: geo.state || current.state,
        district: geo.district || current.district,
        city: geo.city || current.city,
        linkedin: extracted.linkedin || current.linkedin,
        github: extracted.github || current.github,
        applyingPosition: extracted.applyingPosition || current.applyingPosition,
        applyingTrack: current.applyingTrack,
        notes: extracted.resumeText ? `Extracted from ${extracted.fileName || 'resume'}. Review all fields before saving.` : current.notes,
        education: extracted.education?.length ? extracted.education : current.education,
        experience: extracted.experience?.length ? extracted.experience : current.experience,
        skills: extracted.skills?.length ? extracted.skills : current.skills,
        resumeText: extracted.resumeText,
        source: current.source === 'WALK_IN' ? 'RESUME_UPLOAD' : current.source
      }));
    }
  });
  const save = useMutation({
    mutationFn: async () => {
      const created = await api.post('/candidates', {
        ...form,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        applyingPosition: form.applyingPosition || 'To be assigned',
        applyingTrack: form.applyingTrack || '',
        currentSalary: form.currentSalary === '' ? undefined : Number(form.currentSalary),
        expectedSalary: form.expectedSalary === '' ? undefined : Number(form.expectedSalary),
        noticePeriod: form.noticePeriod === '' ? undefined : Number(form.noticePeriod),
        education: form.education,
        experience: form.experience.map((row) => ({ ...row, lastSalary: row.lastSalary === '' ? undefined : Number(row.lastSalary) })),
        skills: form.skills.map((row) => ({ ...row, technology: row.technology || row.name })).filter((row) => row.technology)
      });
      const id = created.data.data._id;
      if (resumeFile) {
        const body = new FormData();
        body.append('file', resumeFile);
        body.append('type', 'RESUME');
        try { await api.post(`/documents/Candidate/${id}`, body); } catch { /* candidate is saved even if the file attach fails */ }
      }
      return created;
    },
    onSuccess: ({ data }) => navigate(`/candidates/${data.data._id}`)
  });
  return <Stack spacing={3}>
    <Box>
      <Typography variant="h4">Register candidate</Typography>
      <Typography color="text.secondary" sx={{ mt: .7 }}>Upload a CV to extract details, or enter them manually. Review everything before saving — extraction is a starting point, not the final record.</Typography>
    </Box>
    <Card><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }}>
        <Button component="label" variant="contained" disabled={parse.isPending}>{parse.isPending ? 'Reading resume…' : 'Upload resume'}<input hidden type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" onChange={(event) => event.target.files?.[0] && parse.mutate(event.target.files[0])} /></Button>
        <Typography color="text.secondary">{fileName ? `Extracted from ${fileName}. Edit any field below.` : 'No file uploaded yet. You can still fill the form by hand.'}</Typography>
      </Stack>
      {parse.isError && <Alert severity="error" sx={{ mt: 2 }}>{parse.error.response?.data?.message || 'Could not read that resume.'}</Alert>}
    </CardContent></Card>
    <Card><CardContent><Stack spacing={2.5} component="form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <Typography variant="h6">Personal details</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><TextField required label="First name" value={form.firstName} onChange={set('firstName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField required label="Last name" value={form.lastName} onChange={set('lastName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField required label="Email" type="email" value={form.email} onChange={set('email')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Phone" value={form.phone} onChange={set('phone')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField type="date" label="Date of birth" value={form.dateOfBirth} onChange={set('dateOfBirth')} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField select label="Gender" value={form.gender} onChange={set('gender')} fullWidth><MenuItem value="">Not specified</MenuItem><MenuItem value="MALE">Male</MenuItem><MenuItem value="FEMALE">Female</MenuItem><MenuItem value="OTHER">Other</MenuItem></TextField></Grid>
        <Grid size={{ xs: 12 }}><RoleSelect required position={form.applyingPosition} track={form.applyingTrack} onChange={({ position, track }) => setForm((current) => ({ ...current, applyingPosition: position, applyingTrack: track }))} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField select label="Source" value={form.source} onChange={set('source')} fullWidth>{sources.map((option) => <MenuItem key={option} value={option}>{option.replaceAll('_', ' ')}</MenuItem>)}</TextField></Grid>
      </Grid>
      <AddressFields title="Current address" streetLabel="Current address line" value={currentAddressOf(form)} extras={{ city: form.location }} onChange={(next) => setForm((current) => ({ ...current, ...fromCurrentAddress(next), location: next.city || current.location }))} />
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1}>
        <Typography variant="h6" sx={{ mb: 0 }}>Permanent address</Typography>
        <Button onClick={() => setForm((current) => ({ ...current, ...fromPermanentAddress(currentAddressOf(current)) }))}>Copy current address</Button>
      </Stack>
      <AddressFields streetLabel="Permanent address line" value={permanentAddressOf(form)} onChange={(next) => setForm((current) => ({ ...current, ...fromPermanentAddress(next) }))} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Location / current city" value={form.location} onChange={set('location')} fullWidth /></Grid>
      </Grid>
      <Typography variant="h6">Current employment & salary</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Current company" value={form.currentCompany} onChange={set('currentCompany')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField type="number" label="Current salary" value={form.currentSalary} onChange={set('currentSalary')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField type="number" label="Expected salary" value={form.expectedSalary} onChange={set('expectedSalary')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField type="number" label="Notice period (days)" value={form.noticePeriod} onChange={set('noticePeriod')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="LinkedIn" value={form.linkedin} onChange={set('linkedin')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="GitHub" value={form.github} onChange={set('github')} fullWidth /></Grid>
      </Grid>
      <RepeatableRows title="Education" rows={form.education} onChange={(education) => setForm((current) => ({ ...current, education }))} addLabel="+ Add education" fields={[{ name: 'degree', label: 'Degree' }, { name: 'institution', label: 'Institution' }, { name: 'fieldOfStudy', label: 'Field' }, { name: 'startYear', label: 'Start year', type: 'number' }, { name: 'endYear', label: 'End year', type: 'number' }, { name: 'grade', label: 'Grade' }]} />
      <RepeatableRows title="Previous employment" rows={form.experience} onChange={(experience) => setForm((current) => ({ ...current, experience }))} addLabel="+ Add role" fields={[{ name: 'jobTitle', label: 'Job title' }, { name: 'companyName', label: 'Company' }, { name: 'location', label: 'Location' }, { name: 'yearsOfExperience', label: 'Years', type: 'number' }, { name: 'lastSalary', label: 'Last salary', type: 'number' }, { name: 'responsibilities', label: 'Responsibilities', multiline: true, minWidth: 280 }]} />
      <RepeatableRows title="Skills" rows={form.skills} onChange={(skills) => setForm((current) => ({ ...current, skills }))} addLabel="+ Add skill" fields={[{ name: 'technology', label: 'Skill / technology' }, { name: 'skillLevel', label: 'Level' }, { name: 'yearsOfExperience', label: 'Years', type: 'number' }]} />
      <TextField label="Notes" value={form.notes} onChange={set('notes')} fullWidth multiline minRows={3} />
      {save.isError && <Alert severity="error">{save.error.response?.data?.message || 'Could not save this candidate.'}</Alert>}
      <Stack direction="row" gap={1}><Button type="submit" variant="contained" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save candidate'}</Button><Button onClick={() => navigate('/candidates')}>Cancel</Button></Stack>
    </Stack></CardContent></Card>
  </Stack>;
}
