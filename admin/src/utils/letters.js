export const PAID_SALARY_TYPES = [
  { value: 'MONTHLY', label: 'Monthly salary' },
  { value: 'ANNUAL_CTC', label: 'Annual CTC' }
];

export const DURATION_OPTIONS = [
  { value: 1, label: '1 month' },
  { value: 2, label: '2 months' },
  { value: 3, label: '3 months' },
  { value: 6, label: '6 months' },
  { value: 12, label: '12 months' }
];
export const DEFAULT_DURATION_MONTHS = 6;

export function isUnpaidInternship(position, employmentType, salaryType) {
  return salaryType === 'UNPAID' || employmentType === 'INTERN' || /intern/i.test(position || '');
}

export function defaultSalaryType(position, employmentType, frequency) {
  if (isUnpaidInternship(position, employmentType)) return 'UNPAID';
  if (frequency === 'ANNUAL' || frequency === 'YEARLY' || frequency === 'ANNUAL_CTC') return 'ANNUAL_CTC';
  return 'MONTHLY';
}

export function letterPayBody(form) {
  const unpaid = isUnpaidInternship(form.applyingPosition, form.employmentType, form.salaryType);
  return {
    salary: unpaid ? 0 : Number(form.salary),
    salaryType: unpaid ? 'UNPAID' : form.salaryType
  };
}

export function lastWorkingFromDuration(joiningDate, months) {
  if (!joiningDate || months === '' || months == null) return '';
  const [year, month, day] = String(joiningDate).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '';
  const end = new Date(year, month - 1 + Number(months), day);
  end.setDate(end.getDate() - 1);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, '0');
  const d = String(end.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function withLetterTenure(current, patch) {
  const next = { ...current, ...patch };
  const durationTouched = Object.prototype.hasOwnProperty.call(patch, 'durationMonths');
  const joiningTouched = Object.prototype.hasOwnProperty.call(patch, 'joiningDate');
  if ((durationTouched || joiningTouched) && next.durationMonths !== '' && next.durationMonths != null && next.joiningDate) {
    next.lastWorkingDate = lastWorkingFromDuration(next.joiningDate, next.durationMonths);
  }
  return next;
}

export function letterTenureBody(form) {
  return {
    ...(form.durationMonths !== '' && form.durationMonths != null ? { durationMonths: Number(form.durationMonths) } : {}),
    ...(form.lastWorkingDate ? { lastWorkingDate: form.lastWorkingDate } : {}),
    weekendOff: form.weekendOff !== false,
    workingHours: form.workingHours !== false
  };
}
