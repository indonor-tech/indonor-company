export const CRM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'];

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee'
};

const LEGACY_ROLES = {
  HR_ADMIN: 'ADMIN',
  HR_MANAGER: 'MANAGER',
  RECRUITER: 'MANAGER',
  VIEWER: 'EMPLOYEE'
};

const ADMIN_PERMISSIONS = [
  'employee:create', 'employee:read', 'employee:update', 'employee:delete',
  'candidate:create', 'candidate:read', 'candidate:update', 'candidate:delete',
  'interview:create', 'interview:read', 'interview:update', 'interview:delete',
  'salary:read', 'salary:update', 'documents:read', 'documents:upload', 'documents:delete',
  'reports:read', 'analytics:read', 'website:read', 'website:write', 'audit:read',
  'catalog:read', 'catalog:create', 'users:read', 'users:write', 'email:send',
  'contact:read', 'contact:update'
];

const MANAGER_PERMISSIONS = [
  'employee:create', 'employee:read', 'employee:update',
  'candidate:create', 'candidate:read', 'candidate:update',
  'interview:create', 'interview:read', 'interview:update',
  'documents:read', 'documents:upload',
  'reports:read', 'catalog:read', 'email:send', 'contact:read'
];

export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ADMIN_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  EMPLOYEE: []
};

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

const SELF_TAB_FIELDS = {
  overview: ['firstName', 'lastName', 'middleName', 'personalEmail', 'phone', 'alternatePhone', 'workLocation', 'workMode'],
  address: ['address', 'city', 'state', 'country', 'postalCode', 'district', 'permanentAddress', 'permanentCity', 'permanentState', 'permanentCountry', 'permanentPostalCode', 'permanentDistrict', 'fatherName', 'motherName', 'panNumber', 'aadhaarNumber', 'passportNumber', 'uanNumber', 'pfNumber', 'esiNumber', 'emergencyContact', 'bank'],
  education: ['education'],
  experience: ['experience'],
  skills: ['skills'],
  certificates: ['certificates']
};

export function normalizeTabAccess(role, stored) {
  if (normalizeRole(role) !== 'EMPLOYEE') return null;
  const next = { ...DEFAULT_EMPLOYEE_TAB_ACCESS };
  for (const tab of EMPLOYEE_PROFILE_TABS) {
    const value = stored?.[tab.key];
    if (value === 'none' || value === 'view') next[tab.key] = value;
    else if (value === 'edit') next[tab.key] = tab.allowEdit ? 'edit' : 'view';
  }
  return next;
}

export function permissionsFromTabAccess(tabAccess) {
  if (!tabAccess) return [];
  return EMPLOYEE_PROFILE_TABS.flatMap((tab) => {
    const level = tabAccess[tab.key];
    const granted = [];
    if (level === 'view' || level === 'edit') granted.push(`self:${tab.key}:read`);
    if (level === 'edit') granted.push(`self:${tab.key}:update`);
    return granted;
  });
}

export function hasTabAccess(user, tab, level = 'view') {
  const access = normalizeTabAccess(user?.role, user?.tabAccess)?.[tab] || 'none';
  if (level === 'view') return access === 'view' || access === 'edit';
  return access === 'edit';
}

export function pickSelfEmployeeFields(user, body = {}) {
  const allowed = new Set();
  for (const [tab, fields] of Object.entries(SELF_TAB_FIELDS)) {
    if (hasTabAccess(user, tab, 'edit')) fields.forEach((field) => allowed.add(field));
  }
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.has(key)));
}

const HIDDEN_SELF_FIELDS = {
  address: SELF_TAB_FIELDS.address,
  education: SELF_TAB_FIELDS.education,
  experience: SELF_TAB_FIELDS.experience,
  skills: SELF_TAB_FIELDS.skills,
  certificates: SELF_TAB_FIELDS.certificates
};

export function sanitizeOwnEmployee(user, employee) {
  const raw = employee?.toJSON ? employee.toJSON() : { ...(employee || {}) };
  for (const [tab, fields] of Object.entries(HIDDEN_SELF_FIELDS)) {
    if (!hasTabAccess(user, tab, 'view')) {
      for (const field of fields) delete raw[field];
    }
  }
  if (!hasTabAccess(user, 'salary', 'view')) delete raw.salary;
  return raw;
}

export function normalizeRole(role) {
  return LEGACY_ROLES[role] || role || 'EMPLOYEE';
}

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[normalizeRole(role)] || [];
}

export function hasPermission(user, permission) {
  if (!user) return false;
  if (normalizeRole(user.role) === 'SUPER_ADMIN') return true;
  if (permissionsForRole(user.role).includes(permission)) return true;
  return permissionsFromTabAccess(normalizeTabAccess(user.role, user.tabAccess)).includes(permission);
}

export function assignableRoles(actorRole) {
  const role = normalizeRole(actorRole);
  if (role === 'SUPER_ADMIN') return ['ADMIN', 'MANAGER', 'EMPLOYEE'];
  if (role === 'ADMIN') return ['MANAGER', 'EMPLOYEE'];
  return [];
}

export function canManageRole(actorRole, targetRole) {
  return assignableRoles(actorRole).includes(normalizeRole(targetRole));
}

export function publicUser(user) {
  const role = normalizeRole(user.role);
  const tabAccess = normalizeTabAccess(role, user.tabAccess);
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role,
    permissions: role === 'SUPER_ADMIN' ? ['*'] : [...permissionsForRole(role), ...permissionsFromTabAccess(tabAccess)],
    tabAccess,
    employeeId: user.employeeId || null,
    isActive: user.isActive !== false
  };
}
