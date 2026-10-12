export const SALES_PIPELINE_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'
];

export const LEAD_STATUSES = [
  ...SALES_PIPELINE_STATUSES,
  'INTERESTED', 'FOLLOW_UP', 'CONVERTED', 'NOT_INTERESTED', 'ON_HOLD'
];

export const LEAD_SOURCES = [
  'GOOGLE_ADS', 'SOCIAL_MEDIA', 'LINKEDIN', 'WEBSITE', 'REFERRAL', 'FRIENDS',
  'COLD_EMAIL', 'COLD_CALL', 'UPWORK', 'PARTNERS', 'EVENTS', 'ORGANIC_SEARCH',
  'EMAIL', 'ADVERTISEMENT', 'FREELANCER', 'OTHER'
];

export const SERVICE_TYPES = [
  'WEB_DEVELOPMENT', 'MOBILE_APP', 'SAAS_DEVELOPMENT', 'UI_UX', 'CUSTOM_SOFTWARE',
  'ECOMMERCE', 'API_DEVELOPMENT', 'MAINTENANCE', 'CLOUD_DEVOPS', 'OTHER'
];

export const FOLLOW_UP_TYPES = [
  'CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'DEMO',
  'PROPOSAL_FOLLOW_UP', 'PAYMENT_DISCUSSION', 'OTHER'
];

export const PROJECT_TYPES = [
  'WEBSITE', 'MOBILE_APP', 'SAAS', 'CRM', 'ERP', 'ECOMMERCE',
  'API', 'UI_UX', 'MAINTENANCE', 'CUSTOM_SOFTWARE', 'OTHER'
];

export const PROJECT_STATUSES = [
  'DRAFT', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'
];

export const PROJECT_MEMBER_ROLES = [
  'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'DESIGNER', 'QA', 'DEVOPS', 'OTHER'
];

export const INVOICE_STATUSES = [
  'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'
];

export const PAYMENT_METHODS = [
  'BANK_TRANSFER', 'UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'STRIPE', 'CASH', 'OTHER'
];

/** Hierarchical View Admin page catalog (aligns with sidebar modules). */
export const CRM_PAGE_KEYS = [
  { key: 'dashboard', label: 'Dashboard', section: 'Overview' },
  { key: 'profile', label: 'My Profile', section: 'Overview' },
  { key: 'leads', label: 'Leads', section: 'CRM' },
  { key: 'sales_pipeline', label: 'Sales Pipeline', section: 'CRM' },
  { key: 'clients', label: 'Clients', section: 'CRM' },
  { key: 'projects', label: 'Client Projects', section: 'Projects' },
  { key: 'tasks', label: 'Tasks & Follow-ups (all nested)', section: 'Tasks' },
  { key: 'employees', label: 'Employees', section: 'Recruitment' },
  { key: 'candidates', label: 'Candidates', section: 'Recruitment' },
  { key: 'hiring_pipeline', label: 'Hiring Pipeline', section: 'Recruitment' },
  { key: 'interviews', label: 'Interviews', section: 'Recruitment' },
  { key: 'letters_offer', label: 'Offer Letter', section: 'Letters' },
  { key: 'letters_agreement', label: 'Agreement Letter', section: 'Letters' },
  { key: 'letters_relieving', label: 'Relieving Letter', section: 'Letters' },
  { key: 'letters_company_card', label: 'Company Card', section: 'Letters' },
  { key: 'notifications', label: 'Notifications', section: 'Communications' },
  { key: 'email', label: 'Email Directory', section: 'Communications' },
  { key: 'contact_submissions', label: 'Enquiries', section: 'Workspace' },
  { key: 'website_analytics', label: 'Traffic Analytics', section: 'Workspace' },
  { key: 'website_team', label: 'Website Team', section: 'Workspace' },
  { key: 'website_projects', label: 'Website Projects', section: 'Workspace' },
  { key: 'catalogs', label: 'Departments & Skills', section: 'Workspace' },
  { key: 'reports', label: 'Reports & Analytics', section: 'Reports' },
  { key: 'invoices', label: 'Invoices (Super Admin)', section: 'Finance' },
  { key: 'payments', label: 'Payments (Super Admin)', section: 'Finance' },
  { key: 'financial_reports', label: 'Financial Reports (Super Admin)', section: 'Finance' },
  { key: 'users', label: 'CRM Users', section: 'Settings' },
  { key: 'settings', label: 'Settings', section: 'Settings' }
];

export function labelize(value) {
  return String(value || '').replaceAll('_', ' ');
}

export function money(value, currency = 'INR') {
  if (value == null || value === '') return '—';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toLocaleString('en-IN')}`;
  }
}

export function normalizeLeadStatus(status) {
  return ({ INTERESTED: 'CONTACTED', FOLLOW_UP: 'CONTACTED', CONVERTED: 'WON', NOT_INTERESTED: 'LOST' })[status] || status;
}
