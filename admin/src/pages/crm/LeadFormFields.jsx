import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '../../services/api';
import { AddressFields, currentAddressOf, fromCurrentAddress } from '../../components/GeoFields';
import {
  CURRENCIES, FOLLOW_UP_TYPES, LEAD_PRIORITIES, LEAD_SOURCES, PROJECT_TYPES,
  SALES_PIPELINE_STATUSES, SERVICE_TYPES, TECH_STACK, labelize
} from '../../constants/crm';

export default function LeadFormFields({ form, setForm, showFollowUp = true }) {
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const sales = useQuery({
    queryKey: ['crm-directory', 'sales'],
    queryFn: () => api.get('/crm/directory', { params: { kind: 'sales' } }).then((r) => r.data.data),
    retry: false
  });
  const techs = useQuery({
    queryKey: ['crm-directory', 'technologies'],
    queryFn: () => api.get('/crm/directory/technologies').then((r) => r.data.data),
    retry: false
  });
  const techOptions = techs.data?.length ? techs.data : TECH_STACK;
  const address = currentAddressOf(form);

  return (
    <Stack spacing={2.5} sx={{ pt: 1 }}>
      <Typography variant="subtitle2" color="text.secondary">Contact</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Lead name" value={form.leadName} onChange={(e) => set({ leadName: e.target.value })} fullWidth required />
        <TextField label="Company name" value={form.companyName} onChange={(e) => set({ companyName: e.target.value })} fullWidth />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Contact person" value={form.contactPersonName} onChange={(e) => set({ contactPersonName: e.target.value })} fullWidth />
        <TextField label="Designation" value={form.designation} onChange={(e) => set({ designation: e.target.value })} fullWidth />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} fullWidth />
        <TextField label="Phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} fullWidth />
        <TextField label="WhatsApp" value={form.whatsappNumber} onChange={(e) => set({ whatsappNumber: e.target.value })} fullWidth />
      </Stack>
      <AddressFields value={address} onChange={(next) => set(fromCurrentAddress(next))} />

      <Typography variant="subtitle2" color="text.secondary">Opportunity</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField select label="Lead source" value={form.source} onChange={(e) => set({ source: e.target.value })} fullWidth>
          {LEAD_SOURCES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
        </TextField>
        <TextField select label="Service / project type" value={form.interestedService || form.expectedProjectType} onChange={(e) => {
          const value = e.target.value;
          set({
            interestedService: SERVICE_TYPES.includes(value) ? value : '',
            expectedProjectType: PROJECT_TYPES.includes(value) ? value : ''
          });
        }} fullWidth>
          <MenuItem value="">Select type</MenuItem>
          {SERVICE_TYPES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
          {PROJECT_TYPES.filter((item) => !SERVICE_TYPES.includes(item)).map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
        </TextField>
      </Stack>
      <TextField label="Project description" value={form.projectDescription} onChange={(e) => set({ projectDescription: e.target.value })} fullWidth multiline minRows={2} />
      <TextField label="Business requirements" value={form.businessRequirements || form.requirementDescription} onChange={(e) => set({ businessRequirements: e.target.value, requirementDescription: e.target.value })} fullWidth multiline minRows={2} />
      <Autocomplete
        multiple
        freeSolo
        options={techOptions}
        value={form.requiredTechnologies || []}
        onChange={(_e, value) => set({ requiredTechnologies: value })}
        renderInput={(params) => <TextField {...params} label="Required technologies" placeholder="Java, Python, React…" />}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Estimated budget" type="number" value={form.estimatedBudget} onChange={(e) => set({ estimatedBudget: e.target.value })} fullWidth />
        <TextField label="Quoted / bid amount" type="number" value={form.quotedAmount} onChange={(e) => set({ quotedAmount: e.target.value })} fullWidth />
        <TextField select label="Currency" value={form.currency || 'INR'} onChange={(e) => set({ currency: e.target.value })} fullWidth>
          {CURRENCIES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField type="date" label="Expected start" InputLabelProps={{ shrink: true }} value={form.expectedStartDate} onChange={(e) => set({ expectedStartDate: e.target.value })} fullWidth />
        <TextField label="Estimated duration" value={form.estimatedDuration} onChange={(e) => set({ estimatedDuration: e.target.value })} fullWidth placeholder="e.g. 12 weeks" />
        <TextField type="date" label="Deadline" InputLabelProps={{ shrink: true }} value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} fullWidth />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField select label="Priority" value={form.priority} onChange={(e) => set({ priority: e.target.value })} fullWidth>
          {LEAD_PRIORITIES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
        </TextField>
        <TextField select label="Lead status" value={form.status} onChange={(e) => set({ status: e.target.value })} fullWidth>
          {SALES_PIPELINE_STATUSES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
        </TextField>
        <TextField select label="Assigned sales representative" value={form.assignedTo} onChange={(e) => set({ assignedTo: e.target.value })} fullWidth>
          <MenuItem value="">Assign to me</MenuItem>
          {(sales.data || []).map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
        </TextField>
      </Stack>
      {showFollowUp && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField type="date" label="Next follow-up date" InputLabelProps={{ shrink: true }} value={form.nextFollowUpDate} onChange={(e) => set({ nextFollowUpDate: e.target.value })} fullWidth />
          <TextField label="Follow-up time" value={form.nextFollowUpTime} onChange={(e) => set({ nextFollowUpTime: e.target.value })} fullWidth placeholder="11:30" />
          <TextField select label="Follow-up type" value={form.followUpType || 'CALL'} onChange={(e) => set({ followUpType: e.target.value })} fullWidth>
            {FOLLOW_UP_TYPES.map((item) => <MenuItem key={item} value={item}>{labelize(item)}</MenuItem>)}
          </TextField>
        </Stack>
      )}
      <TextField label="Notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} fullWidth multiline minRows={2} />
    </Stack>
  );
}

export function leadPayload(form) {
  const numberOrNull = (value) => (value === '' || value == null ? undefined : Number(value));
  return {
    ...form,
    estimatedBudget: numberOrNull(form.estimatedBudget),
    quotedAmount: numberOrNull(form.quotedAmount),
    expectedDealValue: numberOrNull(form.quotedAmount),
    expectedStartDate: form.expectedStartDate || undefined,
    deadline: form.deadline || undefined,
    nextFollowUpDate: form.nextFollowUpDate || undefined,
    assignedTo: form.assignedTo || undefined
  };
}
