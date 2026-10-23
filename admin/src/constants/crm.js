export const SALES_PIPELINE_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'
];

export const SALES_PIPELINE_LABELS = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  MEETING: 'Meeting Scheduled',
  PROPOSAL_SENT: 'Proposal Sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost'
};

export const LEAD_STATUSES = [
  ...SALES_PIPELINE_STATUSES,
  'INTERESTED', 'FOLLOW_UP', 'CONVERTED', 'NOT_INTERESTED', 'ON_HOLD'
];

export const LEAD_SOURCES = [
  'GOOGLE_ADS', 'SOCIAL_MEDIA', 'LINKEDIN', 'WEBSITE', 'REFERRAL', 'FRIENDS',
  'COLD_EMAIL', 'COLD_CALL', 'UPWORK', 'PARTNERS', 'EVENTS', 'ORGANIC_SEARCH',
  'EMAIL', 'ADVERTISEMENT', 'FREELANCER', 'ADS', 'OTHER'
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
  'NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'
];

export const PROJECT_STATUS_ALL = [
  ...PROJECT_STATUSES, 'DRAFT', 'PLANNED', 'ACTIVE'
];

export const PROJECT_MEMBER_ROLES = [
  'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'DESIGNER', 'QA', 'DEVOPS', 'OTHER'
];

export const INVOICE_STATUSES = [
  'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'
];

export const PAYMENT_METHODS = [
  'UPI', 'BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'NET_BANKING',
  'CARD', 'CREDIT_CARD', 'DEBIT_CARD', 'CHEQUE', 'CASH',
  'PAYPAL', 'STRIPE', 'OTHER'
];

export const PAYMENT_STATUSES = ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REFUNDED'];

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'];

export const TECH_STACK = [
  'Java', 'Python', 'Node.js', 'JavaScript', 'TypeScript', 'React', 'Next.js',
  'Angular', 'Vue', 'PHP', 'Laravel', '.NET', 'Go', 'Ruby', 'Flutter',
  'React Native', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'DevOps',
  'MongoDB', 'PostgreSQL', 'MySQL', 'UI/UX', 'QA', 'Other'
];

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const DOCUMENT_TYPES = [
  'COMPANY_REGISTRATION', 'GST_CERTIFICATE', 'NDA', 'CONTRACT',
  'AGREEMENT', 'SOW', 'PO', 'BRD', 'FRD', 'UI_DESIGNS',
  'TECHNICAL', 'MEETING_NOTES', 'PROPOSAL', 'RECEIPT', 'INVOICE', 'SCREENSHOT',
  'PARTNERSHIP_AGREEMENT', 'REVENUE_SHARE_AGREEMENT', 'SCOPE', 'SPECIFICATION',
  'QUOTATION', 'REPORT', 'MILESTONE', 'PAYMENT_RECEIPT', 'EXCEL_SHEET',
  'SIGNED_CONTRACT', 'OTHER'
];

export const ENGAGEMENT_TYPES = ['OWN', 'CLIENT', 'REFERRAL', 'COMMISSION', 'PARTNERSHIP', 'SUBCONTRACTED'];
export const SHARE_BASES = ['GROSS_CONTRACT', 'NET_REVENUE', 'NET_PROFIT'];
export const PARTNER_ROLES = ['PARTNER', 'REFERRER', 'SUBCONTRACTOR', 'OTHER'];
export const PARTNERSHIP_STATUSES = ['NONE', 'DRAFT', 'ACTIVE', 'COMPLETED', 'TERMINATED'];
export const ADJUSTMENT_TYPES = ['EXPENSE', 'DEDUCTION', 'REFUND', 'TAX', 'ADJUSTMENT'];
export const ALLOCATION_TARGETS = ['UNALLOCATED', 'COMPANY', 'PARTNER'];
export const INVOICE_SCOPES = ['FULL_PROJECT', 'COMPANY_SHARE', 'PARTNER_SHARE'];
export const DUE_DIRECTIONS = ['PAYABLE', 'RECEIVABLE'];
export const DUE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE', 'SETTLED', 'CANCELLED'];
export const DUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

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
  { key: 'invoices', label: 'Invoices (Finance)', section: 'Finance' },
  { key: 'payments', label: 'Payments (Finance)', section: 'Finance' },
  { key: 'financial_reports', label: 'Financial Reports (Finance)', section: 'Finance' },
  { key: 'users', label: 'CRM Users', section: 'Settings' },
  { key: 'settings', label: 'Settings', section: 'Settings' }
];

export function labelize(value) {
  if (SALES_PIPELINE_LABELS[value]) return SALES_PIPELINE_LABELS[value];
  if (value === 'NOT_STARTED' || value === 'DRAFT' || value === 'PLANNED') return 'Not Started';
  if (value === 'IN_PROGRESS' || value === 'ACTIVE') return 'In Progress';
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

export function emptyLead() {
  return {
    leadName: '', companyName: '', contactPersonName: '', designation: '',
    email: '', phone: '', whatsappNumber: '', country: 'India', address: '',
    source: 'OTHER', interestedService: '', expectedProjectType: '',
    projectDescription: '', businessRequirements: '', requirementDescription: '',
    requiredTechnologies: [], estimatedBudget: '', quotedAmount: '', currency: 'INR',
    expectedStartDate: '', estimatedDuration: '', deadline: '',
    priority: 'MEDIUM', status: 'NEW', assignedTo: '',
    nextFollowUpDate: '', nextFollowUpTime: '11:30', notes: ''
  };
}
