import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { InterviewHistory } from '../components/InterviewRecords';
import { ConfirmDialog, dateInput, displayName, idOf } from '../components/RecordActions';
import { CertificatePanel, DocumentPanel, OnboardingChecklist, ProfilePhoto, RepeatableRows } from '../components/PeopleRecords';
import { AddressFields, TrackSelect, currentAddressOf, fromCurrentAddress, fromPermanentAddress, permanentAddressOf } from '../components/GeoFields';
import { ConvertEmployeeDialog } from '../components/ConvertEmployeeDialog';
import { OfferLetterDialog } from '../components/OfferLetterDialog';
import { EntityDialog } from './EntityPage';
import { EMPLOYEE_TAB_LABEL_KEYS } from '../constants/employeeTabs';

function Info({ label, value }) {
  if (value == null || value === '') return <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Typography color="text.secondary" sx={{ width: 200 }}>{label}</Typography><Typography fontWeight={600}>—</Typography></Stack>;
  return <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Typography color="text.secondary" sx={{ width: 200 }}>{label}</Typography><Typography fontWeight={600}>{String(value)}</Typography></Stack>;
}

function EmployeeDetailsEditor({ data, onClose }) {
  const client = useQueryClient();
  const [form, setForm] = useState({});
  useEffect(() => {
    setForm({
      firstName: data.firstName || '', lastName: data.lastName || '', middleName: data.middleName || '',
      fatherName: data.fatherName || '', motherName: data.motherName || '',
      personalEmail: data.personalEmail || '', companyEmail: data.companyEmail || '', phone: data.phone || '', alternatePhone: data.alternatePhone || '',
      dateOfBirth: dateInput(data.dateOfBirth), gender: data.gender || '', bloodGroup: data.bloodGroup || '', maritalStatus: data.maritalStatus || '', nationality: data.nationality || 'Indian',
      address: data.address || '', city: data.city || '', state: data.state || '', country: data.country || '', postalCode: data.postalCode || '', district: data.district || '',
      permanentAddress: data.permanentAddress || '', permanentCity: data.permanentCity || '', permanentState: data.permanentState || '',
      permanentCountry: data.permanentCountry || '', permanentPostalCode: data.permanentPostalCode || '', permanentDistrict: data.permanentDistrict || '',
      panNumber: data.panNumber || '', aadhaarNumber: data.aadhaarNumber || '', passportNumber: data.passportNumber || '',
      uanNumber: data.uanNumber || '', pfNumber: data.pfNumber || '', esiNumber: data.esiNumber || '',
      emergencyName: data.emergencyContact?.name || '', emergencyPhone: data.emergencyContact?.phone || '', emergencyRelation: data.emergencyContact?.relation || '',
      accountHolder: data.bank?.accountHolder || '', accountNumber: data.bank?.accountNumber || '', ifsc: data.bank?.ifsc || '', bankName: data.bank?.bankName || '',
      joiningDate: dateInput(data.joiningDate), workLocation: data.workLocation || '', workMode: data.workMode || '', noticePeriod: data.noticePeriod ?? '',
      specialization: data.specialization || ''
    });
  }, [data]);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const save = useMutation({
    mutationFn: () => api.patch(`/employees/${data._id}`, {
      firstName: form.firstName, lastName: form.lastName, middleName: form.middleName, fatherName: form.fatherName, motherName: form.motherName,
      personalEmail: form.personalEmail, companyEmail: form.companyEmail, phone: form.phone, alternatePhone: form.alternatePhone,
      dateOfBirth: form.dateOfBirth || undefined, gender: form.gender, bloodGroup: form.bloodGroup, maritalStatus: form.maritalStatus, nationality: form.nationality,
      address: form.address, city: form.city, state: form.state, country: form.country, postalCode: form.postalCode, district: form.district,
      permanentAddress: form.permanentAddress, permanentCity: form.permanentCity, permanentState: form.permanentState, permanentCountry: form.permanentCountry,
      permanentPostalCode: form.permanentPostalCode, permanentDistrict: form.permanentDistrict,
      panNumber: form.panNumber, aadhaarNumber: form.aadhaarNumber, passportNumber: form.passportNumber, uanNumber: form.uanNumber, pfNumber: form.pfNumber, esiNumber: form.esiNumber,
      joiningDate: form.joiningDate || undefined, workLocation: form.workLocation, workMode: form.workMode || undefined,
      noticePeriod: form.noticePeriod === '' ? undefined : Number(form.noticePeriod),
      specialization: form.specialization,
      emergencyContact: { name: form.emergencyName, phone: form.emergencyPhone, relation: form.emergencyRelation },
      bank: { accountHolder: form.accountHolder, accountNumber: form.accountNumber, ifsc: form.ifsc, bankName: form.bankName }
    }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['employees', data._id] }); onClose(); }
  });
  return <Dialog open onClose={onClose} fullWidth maxWidth="md"><DialogTitle>Edit employee details</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Typography variant="subtitle2">Personal</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="First name" value={form.firstName || ''} onChange={set('firstName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Middle name" value={form.middleName || ''} onChange={set('middleName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Last name" value={form.lastName || ''} onChange={set('lastName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Father's name" value={form.fatherName || ''} onChange={set('fatherName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Mother's name" value={form.motherName || ''} onChange={set('motherName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField type="date" label="Date of birth" value={form.dateOfBirth || ''} onChange={set('dateOfBirth')} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField select label="Gender" value={form.gender || ''} onChange={set('gender')} fullWidth><MenuItem value="">Not specified</MenuItem><MenuItem value="MALE">Male</MenuItem><MenuItem value="FEMALE">Female</MenuItem><MenuItem value="OTHER">Other</MenuItem></TextField></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField select label="Marital status" value={form.maritalStatus || ''} onChange={set('maritalStatus')} fullWidth><MenuItem value="">Not specified</MenuItem><MenuItem value="SINGLE">Single</MenuItem><MenuItem value="MARRIED">Married</MenuItem><MenuItem value="OTHER">Other</MenuItem></TextField></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Blood group" value={form.bloodGroup || ''} onChange={set('bloodGroup')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Nationality" value={form.nationality || ''} onChange={set('nationality')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField type="date" label="Joining date" value={form.joiningDate || ''} onChange={set('joiningDate')} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
        <Grid size={{ xs: 12 }}><TrackSelect value={form.specialization || ''} onChange={(value) => setForm((current) => ({ ...current, specialization: value }))} /></Grid>
      </Grid>
      <Typography variant="subtitle2">Contact</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Phone" value={form.phone || ''} onChange={set('phone')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Alternate phone" value={form.alternatePhone || ''} onChange={set('alternatePhone')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField select label="Work mode" value={form.workMode || ''} onChange={set('workMode')} fullWidth><MenuItem value="">Not specified</MenuItem><MenuItem value="ONSITE">Onsite</MenuItem><MenuItem value="HYBRID">Hybrid</MenuItem><MenuItem value="REMOTE">Remote</MenuItem></TextField></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Personal email" value={form.personalEmail || ''} onChange={set('personalEmail')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Company email" value={form.companyEmail || ''} onChange={set('companyEmail')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Work location" value={form.workLocation || ''} onChange={set('workLocation')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField type="number" label="Notice period (days)" value={form.noticePeriod ?? ''} onChange={set('noticePeriod')} fullWidth /></Grid>
      </Grid>
      <Typography variant="subtitle2">Address</Typography>
      <AddressFields title="Current address" streetLabel="Current address line" value={currentAddressOf(form)} onChange={(next) => setForm((current) => ({ ...current, ...fromCurrentAddress(next) }))} />
      <AddressFields title="Permanent address" streetLabel="Permanent address line" value={permanentAddressOf(form)} onChange={(next) => setForm((current) => ({ ...current, ...fromPermanentAddress(next) }))} />
      <Typography variant="subtitle2">Identity & statutory</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="PAN" value={form.panNumber || ''} onChange={set('panNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Aadhaar" value={form.aadhaarNumber || ''} onChange={set('aadhaarNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Passport" value={form.passportNumber || ''} onChange={set('passportNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="UAN" value={form.uanNumber || ''} onChange={set('uanNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="PF number" value={form.pfNumber || ''} onChange={set('pfNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="ESI number" value={form.esiNumber || ''} onChange={set('esiNumber')} fullWidth /></Grid>
      </Grid>
      <Typography variant="subtitle2">Emergency & bank</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Emergency contact" value={form.emergencyName || ''} onChange={set('emergencyName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Emergency phone" value={form.emergencyPhone || ''} onChange={set('emergencyPhone')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Relation" value={form.emergencyRelation || ''} onChange={set('emergencyRelation')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField label="Account holder" value={form.accountHolder || ''} onChange={set('accountHolder')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField label="Bank" value={form.bankName || ''} onChange={set('bankName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField label="Account number" value={form.accountNumber || ''} onChange={set('accountNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField label="IFSC" value={form.ifsc || ''} onChange={set('ifsc')} fullWidth /></Grid>
      </Grid>
      {save.isError && <Alert severity="error">{save.error.response?.data?.message || 'Could not save details.'}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save details'}</Button></DialogActions>
  </Dialog>;
}

export default function Profile({ type, profileId, self }) {
  const { id: routeId } = useParams();
  const id = profileId || routeId;
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const isSelf = Boolean(self);
  const adminEdit = can(type === 'employees' ? 'employee:update' : 'candidate:update');
  const canEditTab = (key) => adminEdit || (isSelf && can(`self:${key}:update`));
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [offering, setOffering] = useState(false);
  const resource = type === 'employees' ? 'employees' : 'candidates';
  const allTabs = type === 'employees'
    ? ['Overview', 'Address & ID', 'Education', 'Experience', 'Skills', 'Certificates', 'Documents', 'Salary', 'Onboarding', 'Interviews', 'Timeline']
    : ['Overview', 'Address', 'Education', 'Experience', 'Skills', 'Interviews', 'Documents', 'Notes', 'Timeline'];
  const tabs = isSelf
    ? allTabs.filter((label) => {
      const level = user?.tabAccess?.[EMPLOYEE_TAB_LABEL_KEYS[label]];
      return level === 'view' || level === 'edit';
    })
    : allTabs;
  const activeTab = tabs[tab] || tabs[0];
  const { data, isLoading, error } = useQuery({ queryKey: [resource, id], queryFn: () => api.get(isSelf ? '/employees/me' : `/${resource}/${id}`).then((response) => response.data.data), enabled: Boolean(id) });
  const timeline = useQuery({ queryKey: [resource, id, 'timeline'], queryFn: () => api.get(`/${resource}/${id}/timeline`).then((response) => response.data.data), enabled: Boolean(id) && activeTab === 'Timeline' });
  const interviews = useQuery({ queryKey: ['interviews', type === 'candidates' ? id : data?.candidateId], queryFn: () => api.get('/interviews', { params: { candidate: type === 'candidates' ? id : data?.candidateId, limit: 100 } }).then((response) => response.data.data), enabled: type === 'candidates' || (Boolean(data?.candidateId) && (can('interview:read') || can('self:interviews:read'))) });
  const salary = useQuery({ queryKey: ['salary', id], queryFn: () => api.get(`/employees/${id}/salary`).then((response) => response.data.data), enabled: type === 'employees' && activeTab === 'Salary' && (can('salary:read') || can('self:salary:read')) });
  const remove = useMutation({ mutationFn: () => api.delete(`/${resource}/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: [resource] }); navigate(`/${resource}`); } });
  const saveLists = useMutation({
    mutationFn: (body) => api.patch(isSelf ? '/employees/me' : `/${resource}/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resource, id] })
  });
  const saveSalary = useMutation({
    mutationFn: (body) => api.patch(`/employees/${id}`, { salary: body }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['salary', id] }); queryClient.invalidateQueries({ queryKey: [resource, id] }); }
  });
  if (isLoading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 400 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">This profile could not be loaded.</Alert>;
  const name = data?.fullName || `${data?.firstName} ${data?.lastName}`;
  const passed = (interviews.data || []).some((interview) => interview.result === 'PASS');
  const canConvert = type === 'candidates' && can('employee:create') && !data.convertedEmployeeId && (passed || ['SELECTED', 'OFFER_SENT', 'OFFER_ACCEPTED'].includes(data.status));
  const canEdit = adminEdit;
  return <Stack spacing={3}>
    {!isSelf && <Button onClick={() => navigate(`/${resource}`)} sx={{ alignSelf: 'flex-start' }}>← Back to {type === 'employees' ? 'employees' : 'recruitment'}</Button>}
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
      <Stack direction="row" gap={2} alignItems="center">
        <ProfilePhoto
          ownerType={type === 'employees' ? 'Employee' : 'Candidate'}
          ownerId={id}
          name={name}
          canEdit={type === 'employees' ? (adminEdit || canEditTab('overview') || canEditTab('documents')) : can('candidate:update')}
        />
        <Box>
        <Typography variant="h4">{isSelf ? 'My profile' : name}</Typography>
        {isSelf && <Typography color="text.secondary" sx={{ mt: 0.7 }}>{name}. Admin chooses which tabs you can view or edit.</Typography>}
        <Stack direction="row" gap={1} sx={{ mt: 1 }} flexWrap="wrap">
          <Chip label={data?.employeeRegistrationNumber || data?.candidateRegistrationNumber} size="small" />
          <Chip label={(data?.employmentStatus || data?.status || '').replaceAll('_', ' ')} size="small" color="success" />
          {passed && <Chip label="Interview passed" size="small" color="success" />}
        </Stack>
        </Box>
      </Stack>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {type === 'candidates' && can('candidate:update') && (passed || ['SELECTED', 'OFFER_SENT', 'OFFER_ACCEPTED'].includes(data.status)) && !data.convertedEmployeeId && <Button variant="contained" onClick={() => setOffering(true)}>Generate offer letter</Button>}
        {canConvert && <Button variant={type === 'candidates' && (passed || data.status === 'OFFER_SENT') ? 'outlined' : 'contained'} onClick={() => setConverting(true)}>Convert to employee</Button>}
        {data.convertedEmployeeId && <Button onClick={() => navigate(`/employees/${data.convertedEmployeeId}`)}>Open employee</Button>}
        {!isSelf && type === 'employees' && can('employee:update') && (
          <>
            <Button variant="outlined" onClick={() => navigate(`/letters/offer?employeeId=${id}`)}>Offer letter</Button>
            <Button variant="outlined" onClick={() => navigate(`/letters/agreement?employeeId=${id}`)}>Agreement letter</Button>
            <Button variant="outlined" onClick={() => navigate(`/letters/relieving?employeeId=${id}`)}>Relieving letter</Button>
            <Button variant="outlined" onClick={() => navigate(`/letters/company-card?employeeId=${id}`)}>Company card</Button>
            <Button variant="outlined" onClick={() => setDetails(true)}>Edit full details</Button>
          </>
        )}
        {!isSelf && can(type === 'employees' ? 'employee:update' : 'candidate:update') && <Button variant="outlined" onClick={() => setEditing(true)}>Quick edit</Button>}
        {!isSelf && can(type === 'employees' ? 'employee:delete' : 'candidate:delete') && <Button color="error" variant="outlined" onClick={() => setRemoving(true)}>Delete</Button>}
      </Stack>
    </Stack>
    <Card>
      <Tabs value={tabs.length ? tab : false} onChange={(_event, value) => setTab(value)} variant="scrollable">{tabs.map((label) => <Tab key={label} label={label} />)}</Tabs>
      <CardContent>
        {!tabs.length && <Alert severity="info">No profile tabs are enabled for your login. Ask an admin to grant view or edit access.</Alert>}
        {activeTab === 'Overview' && (canEditTab('overview') && type === 'employees' ? <OverviewEditor limited={isSelf && !adminEdit} data={data} onSave={(body) => saveLists.mutate(body)} saving={saveLists.isPending} error={saveLists.isError ? apiErrorMessage(saveLists.error, 'Could not save overview.') : ''} /> : <Stack spacing={2}>
          <Info label="Email" value={data?.companyEmail || data?.email} />
          {type === 'employees' && <Info label="Personal email" value={data?.personalEmail} />}
          <Info label="Phone" value={data?.phone} />
          <Info label={type === 'employees' ? 'Department' : 'Applying position'} value={data?.department?.name || (type === 'candidates' ? [data?.applyingPosition, data?.applyingTrack].filter(Boolean).join(' · ') : data?.applyingPosition)} />
          {type === 'employees' && <Info label="Designation" value={data?.designation?.name} />}
          {type === 'employees' && <Info label="Specialization" value={data?.specialization} />}
          {type === 'employees' && <Info label="Employment type" value={data?.employeeType?.replaceAll('_', ' ')} />}
          {type === 'employees' && <Info label="Joining date" value={data?.joiningDate && new Date(data.joiningDate).toLocaleDateString()} />}
          {type === 'candidates' && <Info label="Current company" value={data?.currentCompany} />}
          {type === 'candidates' && <Info label="Current salary" value={data?.currentSalary} />}
          {type === 'candidates' && <Info label="Expected / offered salary" value={data?.offerSalaryType === 'UNPAID' || data?.offerEmploymentType === 'INTERN' ? 'Unpaid internship' : (data?.offerSalary ? `${data.offerSalary} (${(data.offerSalaryType || 'MONTHLY').replaceAll('_', ' ')})` : data?.expectedSalary)} />}
          {type === 'candidates' && data?.offerJoiningDate && <Info label="Offered joining date" value={new Date(data.offerJoiningDate).toLocaleDateString()} />}
          {type === 'candidates' && canConvert && <Alert severity="success">This candidate passed the interview. Generate an offer letter, then convert them to an employee when they join.</Alert>}
          {type === 'candidates' && !canConvert && !data.convertedEmployeeId && <Alert severity="warning">Record a passed interview before converting this person to an employee.</Alert>}
        </Stack>)}
        {(activeTab === 'Address & ID' || activeTab === 'Address') && (canEditTab('address') || (activeTab === 'Address' && canEdit) ? <AddressIdEditor data={data} employee={type === 'employees'} onSave={(body) => saveLists.mutate(body)} saving={saveLists.isPending} error={saveLists.isError ? apiErrorMessage(saveLists.error, 'Could not save address and ID.') : ''} /> : <Stack spacing={2} sx={{ mt: 0 }}>
          <Info label="Current address" value={data.address} />
          <Info label="Country" value={data.country} />
          <Info label="State" value={data.state} />
          <Info label="District" value={data.district} />
          <Info label="City" value={data.city} />
          <Info label="PIN" value={data.postalCode} />
          <Info label="Permanent address" value={data.permanentAddress} />
          <Info label="Permanent country" value={data.permanentCountry} />
          <Info label="Permanent state" value={data.permanentState} />
          <Info label="Permanent district" value={data.permanentDistrict} />
          <Info label="Permanent city" value={data.permanentCity} />
          <Info label="Permanent PIN" value={data.permanentPostalCode} />
          {type === 'employees' && <Info label="Father's name" value={data.fatherName} />}
          {type === 'employees' && <Info label="PAN" value={data.panNumber} />}
          {type === 'employees' && <Info label="Aadhaar" value={data.aadhaarNumber} />}
          {type === 'employees' && <Info label="Passport" value={data.passportNumber} />}
          {type === 'employees' && <Info label="UAN / PF / ESI" value={[data.uanNumber, data.pfNumber, data.esiNumber].filter(Boolean).join(' · ')} />}
          {type === 'employees' && <Info label="Emergency contact" value={data.emergencyContact?.name && `${data.emergencyContact.name} (${data.emergencyContact.relation || '—'}) ${data.emergencyContact.phone || ''}`} />}
          {type === 'employees' && <Info label="Bank" value={data.bank?.bankName && `${data.bank.bankName} · ${data.bank.accountNumber || ''} · ${data.bank.ifsc || ''}`} />}
        </Stack>)}
        {activeTab === 'Education' && <RepeatableRows title="Education" readOnly={!canEditTab('education') && !(activeTab === 'Education' && type === 'candidates' && canEdit)} deferSave rows={data.education || []} onChange={(education) => saveLists.mutate({ education })} addLabel="+ Add education" fields={[{ name: 'degree', label: 'Degree' }, { name: 'institution', label: 'Institution' }, { name: 'fieldOfStudy', label: 'Field' }, { name: 'startYear', label: 'Start year' }, { name: 'endYear', label: 'End year' }, { name: 'grade', label: 'Grade' }]} />}
        {activeTab === 'Experience' && <RepeatableRows title="Previous employment" readOnly={!canEditTab('experience') && !(type === 'candidates' && canEdit)} deferSave rows={data.experience || []} onChange={(experience) => saveLists.mutate({ experience })} addLabel="+ Add role" fields={[{ name: 'jobTitle', label: 'Job title' }, { name: 'companyName', label: 'Company' }, { name: 'location', label: 'Location' }, { name: 'yearsOfExperience', label: 'Years' }, { name: 'lastSalary', label: 'Last salary' }, { name: 'responsibilities', label: 'Responsibilities', multiline: true }]} />}
        {activeTab === 'Skills' && <RepeatableRows title="Skills" readOnly={!canEditTab('skills') && !(type === 'candidates' && canEdit)} deferSave rows={data.skills || []} onChange={(skills) => saveLists.mutate({ skills })} addLabel="+ Add skill" fields={[{ name: 'technology', label: 'Skill' }, { name: 'skillLevel', label: 'Level' }, { name: 'yearsOfExperience', label: 'Years' }]} />}
        {activeTab === 'Certificates' && type === 'employees' && <CertificatePanel employeeId={id} readOnly={!canEditTab('certificates')} certificates={data.certificates || []} onSave={(certificates) => saveLists.mutate({ certificates })} saving={saveLists.isPending} error={saveLists.isError ? apiErrorMessage(saveLists.error, 'Could not save certificates.') : ''} />}
        {activeTab === 'Documents' && <DocumentPanel ownerType={type === 'employees' ? 'Employee' : 'Candidate'} ownerId={id} />}
        {activeTab === 'Onboarding' && type === 'employees' && <OnboardingChecklist employeeId={id} canEdit={canEditTab('onboarding')} canAdd={adminEdit} />}
        {activeTab === 'Salary' && (can('salary:read') || can('self:salary:read') ? <Stack spacing={2}>
          <Info label="Current salary" value={salary.data?.current?.current} />
          <Info label="Base" value={salary.data?.current?.base} />
          <Info label="Allowances" value={salary.data?.current?.allowances} />
          {can('salary:update') && <SalaryEditor current={salary.data?.current} saving={saveSalary.isPending} onSave={(body) => saveSalary.mutate(body)} error={saveSalary.isError && (saveSalary.error.response?.data?.message || 'Could not save salary.')} />}
          <Typography variant="h6">Salary history</Typography>
          {(salary.data?.history || []).map((row) => <Typography key={row._id}>{new Date(row.effectiveDate).toLocaleDateString()} · {row.previousSalary || 0} → {row.newSalary}</Typography>)}
          {!salary.data?.history?.length && <Typography color="text.secondary">No salary changes recorded yet.</Typography>}
        </Stack> : <Alert severity="warning">You do not have permission to view salary.</Alert>)}
        {activeTab === 'Interviews' && <InterviewHistory candidateId={type === 'candidates' ? id : data?.candidateId} candidateLabel={name} onView={can('interview:read') ? (interview) => navigate(`/interviews/${interview._id}`) : undefined} />}
        {activeTab === 'Notes' && <Typography>{data?.notes || 'No notes added yet.'}</Typography>}
        {activeTab === 'Timeline' && <Stack divider={<Divider />} spacing={2}>{timeline.data?.map((event) => <Box key={event._id}><Typography fontWeight={650}>{event.title}</Typography><Typography variant="body2" color="text.secondary">{event.description || event.eventType} · {new Date(event.occurredAt).toLocaleString()}</Typography></Box>)}{!timeline.data?.length && <Typography color="text.secondary">No timeline events yet.</Typography>}</Stack>}
        {saveLists.isError && <Alert severity="error" sx={{ mt: 2 }}>{saveLists.error.response?.data?.message || 'Could not save these records.'}</Alert>}
      </CardContent>
    </Card>
    {!isSelf && <EntityDialog type={resource} record={data} open={editing} onClose={() => setEditing(false)} />}
    {!isSelf && details && <EmployeeDetailsEditor data={data} onClose={() => setDetails(false)} />}
    <ConvertEmployeeDialog candidate={data} open={converting} onClose={() => setConverting(false)} />
    <OfferLetterDialog candidate={data} open={offering} onClose={() => setOffering(false)} />
    <ConfirmDialog open={removing} title={`Delete ${displayName(data)}`} message="This archives the profile. Related history is kept." onClose={() => setRemoving(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} error={remove.isError ? (remove.error.response?.data?.message || 'Could not delete this profile.') : ''} />
  </Stack>;
}

const EMPLOYEE_TYPES = ['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY'];
const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_PROBATION', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'INACTIVE', 'COMPLETED'];

function OverviewEditor({ data, onSave, saving, error, limited }) {
  const [form, setForm] = useState({});
  const catalogs = useQuery({
    queryKey: ['catalogs', 'employee-profile'],
    queryFn: async () => ({
      departments: (await api.get('/catalog/departments', { params: { limit: 500 } })).data.data,
      designations: (await api.get('/catalog/designations', { params: { limit: 500 } })).data.data
    }),
    enabled: !limited
  });
  useEffect(() => {
    setForm({
      firstName: data.firstName || '', lastName: data.lastName || '', middleName: data.middleName || '',
      companyEmail: data.companyEmail || '', personalEmail: data.personalEmail || '', phone: data.phone || '',
      employeeType: data.employeeType || 'FULL_TIME', employmentStatus: data.employmentStatus || 'ACTIVE',
      department: idOf(data.department), designation: idOf(data.designation),
      specialization: data.specialization || '', joiningDate: dateInput(data.joiningDate),
      workLocation: data.workLocation || '', workMode: data.workMode || ''
    });
  }, [data]);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  return <Stack spacing={2}>
    <Typography color="text.secondary">{limited ? 'You can update your name and contact details. Job title, department, and status are managed by Admin.' : 'View and edit this employee’s role and contact details.'}</Typography>
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 4 }}><TextField label="First name" value={form.firstName || ''} onChange={set('firstName')} fullWidth /></Grid>
      <Grid size={{ xs: 12, md: 4 }}><TextField label="Middle name" value={form.middleName || ''} onChange={set('middleName')} fullWidth /></Grid>
      <Grid size={{ xs: 12, md: 4 }}><TextField label="Last name" value={form.lastName || ''} onChange={set('lastName')} fullWidth /></Grid>
      {!limited && <Grid size={{ xs: 12, md: 4 }}><TextField label="Company email" value={form.companyEmail || ''} onChange={set('companyEmail')} fullWidth /></Grid>}
      <Grid size={{ xs: 12, md: 4 }}><TextField label="Personal email" value={form.personalEmail || ''} onChange={set('personalEmail')} fullWidth /></Grid>
      <Grid size={{ xs: 12, md: 4 }}><TextField label="Phone" value={form.phone || ''} onChange={set('phone')} fullWidth /></Grid>
      {!limited && <>
        <Grid size={{ xs: 12, md: 4 }}><TextField select label="Employment type" value={form.employeeType || ''} onChange={set('employeeType')} fullWidth>{EMPLOYEE_TYPES.map((option) => <MenuItem key={option} value={option}>{option.replaceAll('_', ' ')}</MenuItem>)}</TextField></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField select label="Status" value={form.employmentStatus || ''} onChange={set('employmentStatus')} fullWidth>{EMPLOYEE_STATUSES.map((option) => <MenuItem key={option} value={option}>{option.replaceAll('_', ' ')}</MenuItem>)}</TextField></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField type="date" label="Joining date" value={form.joiningDate || ''} onChange={set('joiningDate')} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField select label="Department" value={form.department || ''} onChange={set('department')} fullWidth><MenuItem value="">None</MenuItem>{(catalogs.data?.departments || []).map((row) => <MenuItem key={row._id} value={row._id}>{row.name}</MenuItem>)}</TextField></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField select label="Designation" value={form.designation || ''} onChange={set('designation')} fullWidth><MenuItem value="">None</MenuItem>{(catalogs.data?.designations || []).map((row) => <MenuItem key={row._id} value={row._id}>{row.name}</MenuItem>)}</TextField></Grid>
        <Grid size={{ xs: 12 }}><TrackSelect value={form.specialization || ''} onChange={(value) => setForm((current) => ({ ...current, specialization: value }))} /></Grid>
      </>}
      <Grid size={{ xs: 12, md: 6 }}><TextField label="Work location" value={form.workLocation || ''} onChange={set('workLocation')} fullWidth /></Grid>
      <Grid size={{ xs: 12, md: 6 }}><TextField select label="Work mode" value={form.workMode || ''} onChange={set('workMode')} fullWidth><MenuItem value="">Not specified</MenuItem><MenuItem value="ONSITE">Onsite</MenuItem><MenuItem value="HYBRID">Hybrid</MenuItem><MenuItem value="REMOTE">Remote</MenuItem></TextField></Grid>
    </Grid>
    {error && <Alert severity="error">{error}</Alert>}
    <Button variant="contained" disabled={saving} onClick={() => onSave(limited ? {
      firstName: form.firstName, lastName: form.lastName, middleName: form.middleName,
      personalEmail: form.personalEmail, phone: form.phone,
      workLocation: form.workLocation, workMode: form.workMode || undefined
    } : {
      firstName: form.firstName, lastName: form.lastName, middleName: form.middleName,
      companyEmail: form.companyEmail, personalEmail: form.personalEmail, phone: form.phone,
      employeeType: form.employeeType, employmentStatus: form.employmentStatus,
      department: form.department || undefined, designation: form.designation || undefined,
      specialization: form.specialization, joiningDate: form.joiningDate || undefined,
      workLocation: form.workLocation, workMode: form.workMode || undefined
    })} sx={{ alignSelf: 'flex-start' }}>{saving ? 'Saving…' : 'Save overview'}</Button>
  </Stack>;
}

function AddressIdEditor({ data, employee, onSave, saving, error }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    setForm({
      address: data.address || '', city: data.city || '', state: data.state || '', country: data.country || '', postalCode: data.postalCode || '', district: data.district || '',
      permanentAddress: data.permanentAddress || '', permanentCity: data.permanentCity || '', permanentState: data.permanentState || '',
      permanentCountry: data.permanentCountry || '', permanentPostalCode: data.permanentPostalCode || '', permanentDistrict: data.permanentDistrict || '',
      fatherName: data.fatherName || '', motherName: data.motherName || '',
      panNumber: data.panNumber || '', aadhaarNumber: data.aadhaarNumber || '', passportNumber: data.passportNumber || '',
      uanNumber: data.uanNumber || '', pfNumber: data.pfNumber || '', esiNumber: data.esiNumber || '',
      emergencyName: data.emergencyContact?.name || '', emergencyPhone: data.emergencyContact?.phone || '', emergencyRelation: data.emergencyContact?.relation || '',
      accountHolder: data.bank?.accountHolder || '', accountNumber: data.bank?.accountNumber || '', ifsc: data.bank?.ifsc || '', bankName: data.bank?.bankName || ''
    });
  }, [data]);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  return <Stack spacing={2}>
    <Typography color="text.secondary">View and edit address, identity, emergency, and bank details.</Typography>
    <AddressFields title="Current address" streetLabel="Current address line" value={currentAddressOf(form)} onChange={(next) => setForm((current) => ({ ...current, ...fromCurrentAddress(next) }))} />
    <AddressFields title="Permanent address" streetLabel="Permanent address line" value={permanentAddressOf(form)} onChange={(next) => setForm((current) => ({ ...current, ...fromPermanentAddress(next) }))} />
    {employee && <>
      <Typography variant="subtitle2">Identity & statutory</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Father's name" value={form.fatherName || ''} onChange={set('fatherName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Mother's name" value={form.motherName || ''} onChange={set('motherName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="PAN" value={form.panNumber || ''} onChange={set('panNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Aadhaar" value={form.aadhaarNumber || ''} onChange={set('aadhaarNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Passport" value={form.passportNumber || ''} onChange={set('passportNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="UAN" value={form.uanNumber || ''} onChange={set('uanNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="PF number" value={form.pfNumber || ''} onChange={set('pfNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="ESI number" value={form.esiNumber || ''} onChange={set('esiNumber')} fullWidth /></Grid>
      </Grid>
      <Typography variant="subtitle2">Emergency & bank</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Emergency contact" value={form.emergencyName || ''} onChange={set('emergencyName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Emergency phone" value={form.emergencyPhone || ''} onChange={set('emergencyPhone')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField label="Relation" value={form.emergencyRelation || ''} onChange={set('emergencyRelation')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField label="Account holder" value={form.accountHolder || ''} onChange={set('accountHolder')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField label="Bank" value={form.bankName || ''} onChange={set('bankName')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField label="Account number" value={form.accountNumber || ''} onChange={set('accountNumber')} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField label="IFSC" value={form.ifsc || ''} onChange={set('ifsc')} fullWidth /></Grid>
      </Grid>
    </>}
    {error && <Alert severity="error">{error}</Alert>}
    <Button variant="contained" disabled={saving} onClick={() => onSave({
      address: form.address, city: form.city, state: form.state, country: form.country, postalCode: form.postalCode, district: form.district,
      permanentAddress: form.permanentAddress, permanentCity: form.permanentCity, permanentState: form.permanentState,
      permanentCountry: form.permanentCountry, permanentPostalCode: form.permanentPostalCode, permanentDistrict: form.permanentDistrict,
      ...(employee ? {
        fatherName: form.fatherName, motherName: form.motherName,
        panNumber: form.panNumber, aadhaarNumber: form.aadhaarNumber, passportNumber: form.passportNumber,
        uanNumber: form.uanNumber, pfNumber: form.pfNumber, esiNumber: form.esiNumber,
        emergencyContact: { name: form.emergencyName, phone: form.emergencyPhone, relation: form.emergencyRelation },
        bank: { accountHolder: form.accountHolder, accountNumber: form.accountNumber, ifsc: form.ifsc, bankName: form.bankName }
      } : {})
    })} sx={{ alignSelf: 'flex-start' }}>{saving ? 'Saving…' : 'Save address & ID'}</Button>
  </Stack>;
}

function SalaryEditor({ current, onSave, saving, error }) {
  const [form, setForm] = useState({ current: '', base: '', allowances: '', bonus: '', variable: '' });
  useEffect(() => setForm({ current: current?.current ?? '', base: current?.base ?? '', allowances: current?.allowances ?? '', bonus: current?.bonus ?? '', variable: current?.variable ?? '' }), [current]);
  return <Stack spacing={2} sx={{ maxWidth: 480 }}>
    <Typography variant="h6">Update salary</Typography>
    {['current', 'base', 'allowances', 'bonus', 'variable'].map((name) => <TextField key={name} type="number" label={name.replace(/^./, (letter) => letter.toUpperCase())} value={form[name]} onChange={(event) => setForm((item) => ({ ...item, [name]: event.target.value }))} />)}
    {error && <Alert severity="error">{error}</Alert>}
    <Button variant="contained" disabled={saving} onClick={() => onSave({ currency: 'INR', frequency: 'MONTHLY', current: Number(form.current || 0), base: Number(form.base || 0), allowances: Number(form.allowances || 0), bonus: Number(form.bonus || 0), variable: Number(form.variable || 0) })}>{saving ? 'Saving…' : 'Save salary'}</Button>
  </Stack>;
}
