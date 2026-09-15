import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Button, Card, CardContent, FormControlLabel, Grid, MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { dateInput, displayName } from '../components/RecordActions';
import { RoleSelect } from '../components/GeoFields';
import { openStoredDocument } from '../components/PeopleRecords';
import LetterTenureFields from '../components/LetterTenureFields';
import { DEFAULT_DURATION_MONTHS, PAID_SALARY_TYPES, defaultSalaryType, isUnpaidInternship, lastWorkingFromDuration, letterPayBody, letterTenureBody, withLetterTenure } from '../utils/letters';
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY'];
const LETTERS = {
  offer: {
    title: 'Generate offer letter',
    subtitle: 'Create an offer or appointment confirmation for people who already work here and never received an offer letter. You can also generate one for a selected candidate. The PDF is saved on their Documents tab.',
    success: 'Offer letter generated and saved.'
  },
  agreement: {
    title: 'Generate agreement letter',
    subtitle: 'Issue an employment or internship agreement on company letterhead. The PDF is saved on the employee Documents tab.',
    success: 'Agreement letter generated and saved.'
  },
  relieving: {
    title: 'Generate relieving letter',
    subtitle: 'Issue a relieving letter for an employee who is leaving. The PDF is saved on their Documents tab.',
    success: 'Relieving letter generated and saved.'
  },
  'company-card': {
    title: 'Generate company card',
    subtitle: 'Create an employee identity card for printing. The photo is taken from the Documents tab if a PHOTO file is stored. The PDF is saved there as well.',
    success: 'Company card generated and saved.'
  }
};

function personLabel(record) {
  if (!record) return '';
  const number = record.employeeRegistrationNumber || record.candidateRegistrationNumber;
  return `${displayName(record)}${number ? ` · ${number}` : ''}`;
}

function formFromRecord(record, kind) {
  const intern = record.employeeType === 'INTERN' || /intern/i.test(record.applyingPosition || '') || /intern/i.test(record.offerEmploymentType || '');
  const employmentType = record.offerEmploymentType || record.employeeType || (intern ? 'INTERN' : 'FULL_TIME');
  const position = record.applyingPosition || record.designation?.name || (intern ? 'Intern' : '');
  const track = record.applyingTrack || record.specialization || '';
  const unpaid = isUnpaidInternship(position, employmentType, intern ? 'UNPAID' : record.offerSalaryType);
  const joiningDate = dateInput(record.offerJoiningDate || record.joiningDate);
  const durationMonths = record.offerDurationMonths ?? record.engagementDurationMonths ?? (intern && kind !== 'relieving' ? DEFAULT_DURATION_MONTHS : '');
  const lastWorkingDate = kind === 'relieving'
    ? (dateInput(record.lastWorkingDate) || dateInput(new Date()))
    : (dateInput(record.offerLastWorkingDate || record.contractEndDate) || lastWorkingFromDuration(joiningDate, durationMonths));
  return {
    joiningDate,
    applyingPosition: position,
    applyingTrack: track,
    salary: unpaid ? '' : (record.offerSalary || record.expectedSalary || record.salary?.current || ''),
    salaryType: unpaid ? 'UNPAID' : (record.offerSalaryType || defaultSalaryType(position, employmentType, record.salary?.frequency)),
    employmentType,
    workMode: record.offerWorkMode || record.workMode || 'HYBRID',
    noticePeriod: record.noticePeriod ?? (intern ? 7 : 30),
    durationMonths,
    lastWorkingDate,
    weekendOff: true,
    workingHours: true,
    relievingDate: dateInput(record.relievingDate) || (kind === 'relieving' ? dateInput(new Date()) : ''),
    noDues: true,
    offerExpiryDate: dateInput(record.offerExpiryDate) || dateInput(new Date(Date.now() + 7 * 86400000)),
    bloodGroup: record.bloodGroup || '',
    emergencyName: record.emergencyContact?.name || '',
    emergencyPhone: record.emergencyContact?.phone || ''
  };
}

const emptyForm = {
  joiningDate: '', applyingPosition: '', applyingTrack: '', salary: '', salaryType: 'MONTHLY',
  employmentType: 'FULL_TIME', workMode: 'HYBRID', noticePeriod: 30, durationMonths: '', lastWorkingDate: '', weekendOff: true, workingHours: true,
  relievingDate: '', noDues: true, offerExpiryDate: '', bloodGroup: '', emergencyName: '', emergencyPhone: ''
};

export default function Letters({ kind }) {
  const { can } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const copy = LETTERS[kind];
  const canEmployees = can('employee:update');
  const isCard = kind === 'company-card';
  const canCandidates = kind === 'offer' && can('candidate:update');
  const requestedId = { employee: params.get('employeeId') || '', candidate: params.get('candidateId') || '' };
  const [sourceState, setSourceState] = useState(requestedId.candidate ? 'candidate' : 'employee');
  const source = canEmployees && canCandidates ? sourceState : canEmployees ? 'employee' : 'candidate';
  const selectedId = source === 'candidate' ? requestedId.candidate : requestedId.employee;
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (requestedId.candidate) setSourceState('candidate');
    else if (requestedId.employee) setSourceState('employee');
  }, [requestedId.candidate, requestedId.employee]);

  const employees = useQuery({
    queryKey: ['employees', 'letters'],
    queryFn: () => api.get('/employees', { params: { limit: 500 } }).then((response) => response.data.data),
    enabled: canEmployees
  });
  const candidates = useQuery({
    queryKey: ['candidates', 'letters'],
    queryFn: () => api.get('/candidates', { params: { limit: 500 } }).then((response) => response.data.data),
    enabled: canCandidates
  });
  const resource = source === 'candidate' ? 'candidates' : 'employees';
  const record = useQuery({
    queryKey: [resource, selectedId],
    queryFn: () => api.get(`/${resource}/${selectedId}`).then((response) => response.data.data),
    enabled: Boolean(selectedId)
  });
  const options = (() => {
    const list = source === 'candidate'
      ? (candidates.data || []).filter((item) => !item.convertedEmployeeId)
      : (employees.data || []);
    if (record.data && !list.some((item) => item._id === record.data._id)) return [record.data, ...list];
    return list;
  })();
  const selected = options.find((item) => item._id === selectedId) || null;

  useEffect(() => {
    if (record.data) setForm(formFromRecord(record.data, kind));
    else if (!selectedId) setForm(emptyForm);
  }, [kind, selectedId, record.data?._id]);

  const setSource = (_event, value) => {
    if (!value) return;
    setSourceState(value);
    setParams({}, { replace: true });
    setForm(emptyForm);
  };
  const choose = (_event, value) => {
    if (!value) {
      setParams({}, { replace: true });
      return;
    }
    setParams(source === 'candidate' ? { candidateId: value._id } : { employeeId: value._id }, { replace: true });
  };
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

  const payload = useMemo(() => {
    const pay = letterPayBody(form);
    const body = {
      joiningDate: form.joiningDate,
      applyingPosition: form.applyingPosition,
      applyingTrack: form.applyingTrack || '',
      salary: pay.salary,
      salaryType: pay.salaryType,
      employmentType: form.employmentType,
      workMode: form.workMode || undefined,
      ...letterTenureBody(form)
    };
    if (kind === 'offer' && source === 'candidate') body.offerExpiryDate = form.offerExpiryDate || undefined;
    if (kind === 'agreement') body.noticePeriod = form.noticePeriod === '' ? undefined : Number(form.noticePeriod);
    if (kind === 'relieving') {
      return {
        lastWorkingDate: form.lastWorkingDate,
        relievingDate: form.relievingDate || form.lastWorkingDate,
        joiningDate: form.joiningDate || undefined,
        applyingPosition: form.applyingPosition,
        applyingTrack: form.applyingTrack || '',
        noDues: form.noDues
      };
    }
    if (kind === 'company-card') {
      return {
        applyingPosition: form.applyingPosition,
        applyingTrack: form.applyingTrack || '',
        bloodGroup: form.bloodGroup || '',
        emergencyName: form.emergencyName || '',
        emergencyPhone: form.emergencyPhone || ''
      };
    }
    return body;
  }, [form, kind, source]);

  const generate = useMutation({
    mutationFn: () => {
      if (kind === 'offer' && source === 'candidate') return api.post(`/candidates/${selectedId}/offer-letter`, payload);
      return api.post(`/employees/${selectedId}/letters/${kind}`, payload);
    },
    onSuccess: async ({ data }) => {
      client.invalidateQueries({ queryKey: [resource] });
      client.invalidateQueries({ queryKey: ['documents'] });
      const document = data.data?.document;
      if (document?._id) {
        try { await openStoredDocument(document); } catch { /* PDF is saved on Documents even if download is blocked */ }
      }
    }
  });

  const unpaid = isUnpaidInternship(form.applyingPosition, form.employmentType, form.salaryType);
  const missing = !selectedId
    || (!isCard && !form.applyingPosition)
    || (!isCard && kind !== 'relieving' && (!form.joiningDate || (!unpaid && form.salary === '')))
    || (kind === 'relieving' && !form.lastWorkingDate);
  const documentsHint = isCard
    ? 'The identity card PDF is saved on the employee Documents tab.'
    : source === 'employee'
      ? 'Use this for staff who already joined and never received this letter.'
      : 'Offer letters for candidates still require a passed interview or selected / offer status.';

  return (
    <Stack spacing={3}>
      <BoxTitle copy={copy} />
      <Card>
        <CardContent>
          <Stack spacing={2.5} component="form" onSubmit={(event) => { event.preventDefault(); generate.mutate(); }}>
            {canEmployees && canCandidates && (
              <ToggleButtonGroup exclusive value={source} onChange={setSource} size="small">
                <ToggleButton value="employee">Working employee</ToggleButton>
                <ToggleButton value="candidate">Candidate</ToggleButton>
              </ToggleButtonGroup>
            )}
            <Autocomplete
              options={options}
              value={selected}
              onChange={choose}
              getOptionLabel={personLabel}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  required
                  label={source === 'candidate' ? 'Candidate' : 'Employee'}
                  helperText={documentsHint}
                />
              )}
            />
            {record.isError && <Alert severity="error">{apiErrorMessage(record.error, 'Could not load this person.')}</Alert>}
            {selected && (
              <>
                <Typography fontWeight={650}>{personLabel(record.data || selected)}</Typography>
                <RoleSelect
                  required={!isCard}
                  position={form.applyingPosition}
                  track={form.applyingTrack}
                  positionLabel="Role"
                  positionHelper="Intern, Software Engineer, and so on."
                  onChange={({ position, track }) => setForm((current) => {
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
                  })}
                />
                {isCard ? (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField label="Blood group" value={form.bloodGroup} onChange={set('bloodGroup')} fullWidth />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField label="Emergency contact" value={form.emergencyName} onChange={set('emergencyName')} fullWidth />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField label="Emergency phone" value={form.emergencyPhone} onChange={set('emergencyPhone')} fullWidth />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Alert severity="info">Add a PHOTO on the employee Documents tab if you want a face photo on the card. Otherwise initials are used.</Alert>
                    </Grid>
                  </Grid>
                ) : (
                  <>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField type="date" required={kind !== 'relieving'} label="Joining date" value={form.joiningDate} onChange={set('joiningDate')} InputLabelProps={{ shrink: true }} fullWidth />
                      </Grid>
                      {kind === 'offer' && source === 'candidate' && (
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField type="date" label="Offer valid until" value={form.offerExpiryDate} onChange={set('offerExpiryDate')} InputLabelProps={{ shrink: true }} fullWidth />
                        </Grid>
                      )}
                      {kind === 'relieving' && (
                        <>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField type="date" required label="Last working day" value={form.lastWorkingDate} onChange={set('lastWorkingDate')} InputLabelProps={{ shrink: true }} fullWidth />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField type="date" label="Relieved from" value={form.relievingDate} onChange={set('relievingDate')} InputLabelProps={{ shrink: true }} fullWidth />
                          </Grid>
                        </>
                      )}
                      {kind !== 'relieving' && (
                        <>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField select required label="Employment type" value={form.employmentType} onChange={set('employmentType')} fullWidth>
                              {EMPLOYMENT_TYPES.map((option) => <MenuItem key={option} value={option}>{option.replaceAll('_', ' ')}</MenuItem>)}
                            </TextField>
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField select label="Work mode" value={form.workMode} onChange={set('workMode')} fullWidth>
                              <MenuItem value="ONSITE">Onsite</MenuItem>
                              <MenuItem value="HYBRID">Hybrid</MenuItem>
                              <MenuItem value="REMOTE">Remote</MenuItem>
                            </TextField>
                          </Grid>
                          {(kind === 'offer' || kind === 'agreement') && <LetterTenureFields form={form} onChange={set} />}
                          {(kind === 'offer' || kind === 'agreement') && (
                            <Grid size={{ xs: 12, md: 6 }}>
                              <FormControlLabel control={<Switch checked={form.workingHours !== false} onChange={set('workingHours')} />} label="8-hour working day" />
                            </Grid>
                          )}
                          {(kind === 'offer' || kind === 'agreement') && (
                            <Grid size={{ xs: 12, md: 6 }}>
                              <FormControlLabel control={<Switch checked={form.weekendOff !== false} onChange={set('weekendOff')} />} label="Saturday and Sunday off" />
                            </Grid>
                          )}
                          {unpaid ? (
                            <Grid size={{ xs: 12 }}>
                              <Alert severity="info">Internships at Indonor are unpaid. The letter will state that no stipend or salary is payable.</Alert>
                            </Grid>
                          ) : (
                            <>
                              <Grid size={{ xs: 12, md: 6 }}>
                                <TextField select required label="Salary type" value={form.salaryType} onChange={set('salaryType')} fullWidth>
                                  {PAID_SALARY_TYPES.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                                </TextField>
                              </Grid>
                              <Grid size={{ xs: 12, md: 6 }}>
                                <TextField type="number" required label="Salary amount (INR)" value={form.salary} onChange={set('salary')} fullWidth />
                              </Grid>
                            </>
                          )}
                        </>
                      )}
                      {kind === 'agreement' && (
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField type="number" label="Notice period (days)" value={form.noticePeriod} onChange={set('noticePeriod')} fullWidth />
                        </Grid>
                      )}
                    </Grid>
                    {kind === 'relieving' && (
                      <FormControlLabel control={<Switch checked={form.noDues} onChange={set('noDues')} />} label="No dues pending" />
                    )}
                  </>
                )}
              </>
            )}
            {generate.isError && <Alert severity="error">{apiErrorMessage(generate.error, isCard ? 'Could not generate the company card.' : `Could not generate the ${kind} letter.`)}</Alert>}
            {generate.isSuccess && <Alert severity="success">{copy.success} Open it from Documents if the PDF did not appear.</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={generate.isPending || missing} sx={{ alignSelf: 'flex-start' }}>
              {generate.isPending ? 'Generating…' : isCard ? 'Generate card' : 'Generate PDF'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function BoxTitle({ copy }) {
  return (
    <Stack>
      <Typography variant="h4">{copy.title}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.7 }}>{copy.subtitle}</Typography>
    </Stack>
  );
}
