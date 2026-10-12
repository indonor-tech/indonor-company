export const CRM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'EMPLOYEE', 'BDA', 'PROJECT_MANAGER', 'VIEW_ADMIN'];

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  TEAM_LEAD: 'Team Lead',
  EMPLOYEE: 'Employee',
  BDA: 'BDA / Sales',
  PROJECT_MANAGER: 'Project Manager',
  VIEW_ADMIN: 'View Admin'
};

export const SELF_SERVICE_ROLES = ['EMPLOYEE', 'TEAM_LEAD'];

export const TASK_PERMISSIONS = [
  'task:create', 'task:read', 'task:read:all', 'task:read:team', 'task:assign', 'task:update:any',
  'task:correction:approve', 'task:audit:read', 'task:reports:read', 'task:reports:export',
  'task:projects:manage', 'task:calendar:manage', 'worklog:read:all'
];

const TASK_MANAGER_PERMISSIONS = [
  'task:create', 'task:read', 'task:read:all', 'task:assign', 'task:update:any',
  'task:correction:approve', 'task:audit:read', 'task:reports:read', 'task:reports:export',
  'task:projects:manage', 'worklog:read:all'
];

const TASK_TEAM_LEAD_PERMISSIONS = ['task:create', 'task:read', 'task:read:team', 'task:assign', 'task:audit:read', 'task:reports:read'];

const TASK_EMPLOYEE_PERMISSIONS = ['task:create', 'task:read'];

/** Client & Project Management module — isolated permissions (finance is SUPER_ADMIN only). */
export const CRM_MODULE_PERMISSIONS = [
  'crm:leads:read', 'crm:leads:write', 'crm:leads:assign', 'crm:leads:convert',
  'crm:clients:read', 'crm:clients:write',
  'crm:projects:read', 'crm:projects:write', 'crm:projects:assign',
  'crm:finance:read', 'crm:finance:write',
  'crm:view-admin:manage'
];

const CRM_SALES_PERMISSIONS = [
  'crm:leads:read', 'crm:leads:write', 'crm:leads:assign', 'crm:leads:convert',
  'crm:clients:read', 'crm:clients:write',
  'crm:projects:read'
];

const CRM_PM_PERMISSIONS = [
  'crm:clients:read',
  'crm:projects:read', 'crm:projects:write', 'crm:projects:assign'
];

const CRM_EMPLOYEE_PERMISSIONS = [
  'crm:projects:read'
];

const LEGACY_ROLES = {
  HR_ADMIN: 'ADMIN',
  HR_MANAGER: 'MANAGER',
  RECRUITER: 'MANAGER',
  VIEWER: 'EMPLOYEE',
  SALES_MANAGER: 'MANAGER'
};

const ADMIN_PERMISSIONS = [
  'employee:create', 'employee:read', 'employee:update', 'employee:delete',
  'candidate:create', 'candidate:read', 'candidate:update', 'candidate:delete',
  'interview:create', 'interview:read', 'interview:update', 'interview:delete',
  'salary:read', 'salary:update', 'documents:read', 'documents:upload', 'documents:delete',
  'reports:read', 'analytics:read', 'website:read', 'website:write', 'audit:read',
  'catalog:read', 'catalog:create', 'users:read', 'users:write', 'email:send',
  'contact:read', 'contact:update',
  ...TASK_PERMISSIONS,
  'crm:leads:read', 'crm:leads:write', 'crm:leads:assign', 'crm:leads:convert',
  'crm:clients:read', 'crm:clients:write',
  'crm:projects:read', 'crm:projects:write', 'crm:projects:assign',
  'crm:view-admin:manage'
];

const MANAGER_PERMISSIONS = [
  'employee:create', 'employee:read', 'employee:update',
  'candidate:create', 'candidate:read', 'candidate:update',
  'interview:create', 'interview:read', 'interview:update',
  'documents:read', 'documents:upload',
  'reports:read', 'catalog:read', 'email:send', 'contact:read',
  ...TASK_MANAGER_PERMISSIONS,
  ...CRM_SALES_PERMISSIONS
];

export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [...ADMIN_PERMISSIONS, 'crm:finance:read', 'crm:finance:write'],
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  TEAM_LEAD: [...TASK_TEAM_LEAD_PERMISSIONS, ...CRM_EMPLOYEE_PERMISSIONS],
  EMPLOYEE: [...TASK_EMPLOYEE_PERMISSIONS, ...CRM_EMPLOYEE_PERMISSIONS],
  BDA: CRM_SALES_PERMISSIONS,
  PROJECT_MANAGER: CRM_PM_PERMISSIONS,
  VIEW_ADMIN: []
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
  if (!SELF_SERVICE_ROLES.includes(normalizeRole(role))) return null;
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

/**
 * Maps read permissions → View Admin page keys (denied by default).
 * Parent keys (e.g. tasks, leads) also satisfy related child reads.
 */
export const VIEW_ADMIN_READ_PAGES = {
  'crm:leads:read': ['leads', 'sales_pipeline'],
  'crm:clients:read': ['clients'],
  'crm:projects:read': ['projects'],
  'employee:read': ['employees', 'letters_offer', 'letters_agreement', 'letters_relieving', 'letters_company_card'],
  'candidate:read': ['candidates', 'hiring_pipeline', 'letters_offer'],
  'interview:read': ['interviews'],
  'task:read': ['tasks'],
  'task:read:all': ['tasks'],
  'task:read:team': ['tasks'],
  'task:reports:read': ['tasks'],
  'task:audit:read': ['tasks'],
  'contact:read': ['contact_submissions'],
  'analytics:read': ['website_analytics'],
  'website:read': ['website_team', 'website_projects'],
  'catalog:read': ['catalogs'],
  'reports:read': ['reports', 'dashboard'],
  'email:send': ['email'],
  'users:read': ['users']
};

function viewAdminHasPage(user, pageKeys = []) {
  const access = user?.pageAccess || {};
  return pageKeys.some((key) => (
    access[key]
    || (key === 'sales_pipeline' && access.leads)
    || (key === 'hiring_pipeline' && access.candidates)
    || (String(key).startsWith('tasks') && access.tasks)
  ));
}

function isMutatingPermission(permission = '') {
  return permission.includes(':write')
    || permission.includes(':create')
    || permission.includes(':update')
    || permission.includes(':delete')
    || permission.includes(':assign')
    || permission.includes(':convert')
    || permission.includes(':manage')
    || permission.includes('finance')
    || permission.includes(':upload');
}

export function hasPermission(user, permission) {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'VIEW_ADMIN') {
    // Strictly read-only; page grants are stored on user.pageAccess as { [pageKey]: true }.
    if (isMutatingPermission(permission)) return false;
    const pageKeys = VIEW_ADMIN_READ_PAGES[permission];
    if (!pageKeys) return false;
    return viewAdminHasPage(user, pageKeys);
  }
  if (permissionsForRole(user.role).includes(permission)) return true;
  return permissionsFromTabAccess(normalizeTabAccess(user.role, user.tabAccess)).includes(permission);
}

export function assignableRoles(actorRole) {
  const role = normalizeRole(actorRole);
  if (role === 'SUPER_ADMIN') return ['ADMIN', 'MANAGER', 'TEAM_LEAD', 'EMPLOYEE', 'BDA', 'PROJECT_MANAGER', 'VIEW_ADMIN'];
  if (role === 'ADMIN') return ['MANAGER', 'TEAM_LEAD', 'EMPLOYEE', 'BDA', 'PROJECT_MANAGER', 'VIEW_ADMIN'];
  return [];
}

export function canManageRole(actorRole, targetRole) {
  return assignableRoles(actorRole).includes(normalizeRole(targetRole));
}

export function publicUser(user, extras = {}) {
  const role = normalizeRole(user.role);
  const tabAccess = normalizeTabAccess(role, user.tabAccess);
  const pageAccess = extras.pageAccess || user.pageAccess || null;
  let permissions;
  if (role === 'SUPER_ADMIN') permissions = ['*'];
  else if (role === 'VIEW_ADMIN') {
    permissions = Object.entries(VIEW_ADMIN_READ_PAGES)
      .filter(([, pageKeys]) => viewAdminHasPage({ pageAccess }, pageKeys))
      .map(([permission]) => permission);
  } else {
    permissions = [...permissionsForRole(role), ...permissionsFromTabAccess(tabAccess)];
  }
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role,
    permissions,
    tabAccess,
    pageAccess,
    employeeId: user.employeeId || null,
    isActive: user.isActive !== false
  };
}
