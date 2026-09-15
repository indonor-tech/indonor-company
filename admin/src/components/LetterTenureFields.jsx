import React from 'react';
import { Grid, MenuItem, TextField } from '@mui/material';
import { DURATION_OPTIONS } from '../utils/letters';

export default function LetterTenureFields({ form, onChange }) {
  return (
    <>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          select
          label="Duration"
          value={form.durationMonths === '' || form.durationMonths == null ? '' : String(form.durationMonths)}
          onChange={onChange('durationMonths')}
          fullWidth
          helperText="Optional. Internships default to 6 months."
        >
          <MenuItem value="">Not specified</MenuItem>
          {DURATION_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={String(option.value)}>{option.label}</MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          type="date"
          label="Last working day"
          value={form.lastWorkingDate || ''}
          onChange={onChange('lastWorkingDate')}
          InputLabelProps={{ shrink: true }}
          fullWidth
          helperText="Optional. Filled from joining date and duration when you pick a period."
        />
      </Grid>
    </>
  );
}
