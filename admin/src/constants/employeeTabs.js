export const EMPLOYEE_PROFILE_TABS = [
  { key: 'overview', label: 'Overview', allowEdit: true },
  { key: 'address', label: 'Address & ID', allowEdit: true },
  { key: 'education', label: 'Education', allowEdit: true },
  { key: 'experience', label: 'Experience', allowEdit: true },
  { key: 'skills', label: 'Skills', allowEdit: true },
  { key: 'certificates', label: 'Certificates', allowEdit: true },
  { key: 'documents', label: 'Documents', allowEdit: true },
  { key: 'salary', label: 'Salary', allowEdit: false },
  { key: 'onboarding', label: 'Onboarding', allowEdit: true },
  { key: 'interviews', label: 'Interviews', allowEdit: false },
  { key: 'timeline', label: 'Timeline', allowEdit: false }
];

export const DEFAULT_EMPLOYEE_TAB_ACCESS = {
  overview: 'view',
  address: 'edit',
  education: 'edit',
  experience: 'edit',
  skills: 'edit',
  certificates: 'edit',
  documents: 'edit',
  salary: 'none',
  onboarding: 'view',
  interviews: 'view',
  timeline: 'view'
};

export const EMPLOYEE_TAB_LABEL_KEYS = {
  Overview: 'overview',
  'Address & ID': 'address',
  Education: 'education',
  Experience: 'experience',
  Skills: 'skills',
  Certificates: 'certificates',
  Documents: 'documents',
  Salary: 'salary',
  Onboarding: 'onboarding',
  Interviews: 'interviews',
  Timeline: 'timeline'
};

export function tabAccessOf(stored) {
  return { ...DEFAULT_EMPLOYEE_TAB_ACCESS, ...(stored || {}) };
}
