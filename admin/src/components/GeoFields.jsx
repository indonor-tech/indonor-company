import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '../services/api';
import { cityOptions, countryOptions, districtOptions, matchPosition, stateOptions, withExtra } from '../utils/geo';

export function AddressFields({ title, streetLabel = 'Address line', pinLabel = 'PIN / ZIP', value, onChange, extras = {} }) {
  const current = {
    address: value?.address || '',
    country: value?.country || '',
    state: value?.state || '',
    district: value?.district || '',
    city: value?.city || '',
    postalCode: value?.postalCode || ''
  };
  const set = (patch) => onChange({ ...current, ...patch });
  const countries = withExtra(countryOptions(), current.country, extras.country);
  const states = withExtra(stateOptions(current.country), current.state, extras.state);
  const districts = withExtra(districtOptions(current.country, current.state), current.district, extras.district);
  const cities = withExtra(cityOptions(current.country, current.state), current.city, extras.city);
  return <Stack spacing={2}>
    {title && <Typography variant="h6">{title}</Typography>}
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}><TextField label={streetLabel} value={current.address} onChange={(event) => set({ address: event.target.value })} fullWidth /></Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField select label="Country" value={current.country} onChange={(event) => set({ country: event.target.value, state: '', district: '', city: '' })} fullWidth>
          <MenuItem value="">Select country</MenuItem>
          {countries.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField select label="State" value={current.state} onChange={(event) => set({ state: event.target.value, district: '', city: '' })} fullWidth disabled={!current.country}>
          <MenuItem value="">{current.country ? 'Select state' : 'Select country first'}</MenuItem>
          {states.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <TextField select label="District" value={current.district} onChange={(event) => set({ district: event.target.value })} fullWidth disabled={!current.state}>
          <MenuItem value="">{current.state ? 'Select district' : 'Select state first'}</MenuItem>
          {districts.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <TextField select label="City" value={current.city} onChange={(event) => set({ city: event.target.value })} fullWidth disabled={!current.state}>
          <MenuItem value="">{current.state ? 'Select city' : 'Select state first'}</MenuItem>
          {cities.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}><TextField label={pinLabel} value={current.postalCode} onChange={(event) => set({ postalCode: event.target.value })} fullWidth /></Grid>
    </Grid>
  </Stack>;
}

export function formatApplyingRole(position, track) {
  const role = String(position || '').trim();
  const spec = String(track || '').trim();
  if (!role) return spec;
  return spec ? `${role} · ${spec}` : role;
}

export function PositionSelect({ value, onChange, required, extra }) {
  const { data } = useQuery({
    queryKey: ['catalog', 'designations', 'dropdown'],
    queryFn: () => api.get('/catalog/designations', { params: { limit: 500 } }).then((response) => response.data.data),
    retry: false
  });
  const names = (data || []).map((item) => item.name);
  const selected = matchPosition(value, names) || value || '';
  const options = withExtra(names, extra, selected);
  return <TextField select required={required} label="Applying position" value={selected} onChange={(event) => onChange(event.target.value)} fullWidth>
    <MenuItem value="">Select position</MenuItem>
    {options.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
  </TextField>;
}

export function TrackSelect({ value, onChange, required, label = 'Specialization', helperText = 'UI/UX, Python, AI/ML, Frontend, Backend, and so on.' }) {
  const tracks = useQuery({
    queryKey: ['catalog', 'tracks', 'dropdown'],
    queryFn: () => api.get('/catalog/tracks', { params: { limit: 500 } }).then((response) => response.data.data),
    retry: false
  });
  const options = withExtra((tracks.data || []).map((item) => item.name), value);
  return <Autocomplete
    freeSolo
    options={options}
    inputValue={value || ''}
    onInputChange={(_event, next, reason) => { if (reason !== 'reset') onChange(next); }}
    renderInput={(params) => <TextField {...params} required={required} label={label} helperText={helperText} />}
  />;
}

export function RoleSelect({ position, track, onChange, required, positionLabel = 'Applying position', positionHelper = 'Intern, Software Engineer, and so on.', trackLabel }) {
  const designations = useQuery({
    queryKey: ['catalog', 'designations', 'dropdown'],
    queryFn: () => api.get('/catalog/designations', { params: { limit: 500 } }).then((response) => response.data.data),
    retry: false
  });
  const positionOptions = withExtra((designations.data || []).map((item) => item.name), position);
  return <Grid container spacing={2}>
    <Grid size={{ xs: 12, md: 6 }}>
      <Autocomplete
        freeSolo
        options={positionOptions}
        inputValue={position || ''}
        onInputChange={(_event, value, reason) => { if (reason !== 'reset') onChange({ position: value, track }); }}
        renderInput={(params) => <TextField {...params} required={required} label={positionLabel} helperText={positionHelper} />}
      />
    </Grid>
    <Grid size={{ xs: 12, md: 6 }}>
      <TrackSelect required={required} value={track} onChange={(next) => onChange({ position, track: next })} {...(trackLabel ? { label: trackLabel } : {})} />
    </Grid>
  </Grid>;
}

export function currentAddressOf(record = {}) {
  return {
    address: record.address || '',
    country: record.country || '',
    state: record.state || '',
    district: record.district || '',
    city: record.city || '',
    postalCode: record.postalCode || ''
  };
}

export function permanentAddressOf(record = {}) {
  return {
    address: record.permanentAddress || '',
    country: record.permanentCountry || '',
    state: record.permanentState || '',
    district: record.permanentDistrict || '',
    city: record.permanentCity || '',
    postalCode: record.permanentPostalCode || ''
  };
}

export function fromCurrentAddress(next) {
  return { address: next.address, country: next.country, state: next.state, district: next.district, city: next.city, postalCode: next.postalCode };
}

export function fromPermanentAddress(next) {
  return { permanentAddress: next.address, permanentCountry: next.country, permanentState: next.state, permanentDistrict: next.district, permanentCity: next.city, permanentPostalCode: next.postalCode };
}
