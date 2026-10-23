/** Netbase sales pipeline (primary board columns). */
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

/** All persisted lead statuses — includes legacy aliases for backward compatibility. */
export const LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST',
  // Legacy / secondary
  'INTERESTED', 'FOLLOW_UP', 'CONVERTED', 'NOT_INTERESTED', 'ON_HOLD'
];

/** Map legacy statuses onto the Netbase pipeline for Kanban/reporting. */
export const LEAD_STATUS_NORMALIZE = {
  INTERESTED: 'CONTACTED',
  FOLLOW_UP: 'CONTACTED',
  CONVERTED: 'WON',
  NOT_INTERESTED: 'LOST'
};

export const CONVERTIBLE_LEAD_STATUSES = [
  'QUALIFIED', 'MEETING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'CONVERTED'
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

export const FOLLOW_UP_TARGETS = ['LEAD', 'CLIENT', 'PROJECT', 'PAYMENT'];

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const LEAD_ACTIVITY_TYPES = [
  'LEAD_CREATED', 'LEAD_ASSIGNED', 'CALL_ADDED', 'CALL_COMPLETED', 'CALL_LOG',
  'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_COMPLETED', 'NOTE_ADDED',
  'STATUS_CHANGED', 'PROPOSAL_SENT', 'NEGOTIATION_UPDATED',
  'LEAD_CONVERTED', 'LEAD_LOST', 'LEAD_UPDATED', 'LEAD_ARCHIVED', 'MENTION',
  'ATTACHMENT_ADDED'
];

export const COMPANY_TYPES = [
  'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'LLP', 'PARTNERSHIP',
  'SOLE_PROPRIETOR', 'STARTUP', 'OTHER'
];

export const DOCUMENT_TYPES = [
  'COMPANY_REGISTRATION', 'GST_CERTIFICATE', 'NDA', 'CONTRACT',
  'AGREEMENT', 'SOW', 'PO', 'BRD', 'FRD', 'UI_DESIGNS',
  'TECHNICAL', 'MEETING_NOTES', 'PROPOSAL', 'RECEIPT', 'INVOICE', 'SCREENSHOT',
  'PARTNERSHIP_AGREEMENT', 'REVENUE_SHARE_AGREEMENT', 'SCOPE', 'SPECIFICATION',
  'QUOTATION', 'REPORT', 'MILESTONE', 'PAYMENT_RECEIPT', 'EXCEL_SHEET',
  'SIGNED_CONTRACT', 'OTHER'
];

export const CONFIDENTIAL_DOCUMENT_TYPES = [
  'PARTNERSHIP_AGREEMENT', 'REVENUE_SHARE_AGREEMENT', 'INVOICE', 'PAYMENT_RECEIPT',
  'RECEIPT', 'SIGNED_CONTRACT', 'CONTRACT', 'AGREEMENT'
];

export const ENGAGEMENT_TYPES = [
  'OWN', 'CLIENT', 'REFERRAL', 'COMMISSION', 'PARTNERSHIP', 'SUBCONTRACTED'
];

export const SHARE_BASES = ['GROSS_CONTRACT', 'NET_REVENUE', 'NET_PROFIT'];

export const PARTNER_ROLES = ['COMPANY', 'PARTNER', 'REFERRER', 'SUBCONTRACTOR', 'OTHER'];

export const PARTNERSHIP_STATUSES = ['NONE', 'DRAFT', 'ACTIVE', 'COMPLETED', 'TERMINATED'];

export const ADJUSTMENT_TYPES = ['EXPENSE', 'DEDUCTION', 'REFUND', 'TAX', 'ADJUSTMENT'];

export const ALLOCATION_TARGETS = ['UNALLOCATED', 'COMPANY', 'PARTNER'];

export const INVOICE_SCOPES = ['FULL_PROJECT', 'COMPANY_SHARE', 'PARTNER_SHARE'];

export const DUE_DIRECTIONS = ['PAYABLE', 'RECEIVABLE'];
export const DUE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE', 'SETTLED', 'CANCELLED'];
export const DUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const DEFAULT_INVOICE_PREFIX = 'INV';
export const DEFAULT_INVOICE_PAD = 6;

export const PROJECT_TYPES = [
  'WEBSITE', 'MOBILE_APP', 'SAAS', 'CRM', 'ERP', 'ECOMMERCE',
  'API', 'UI_UX', 'MAINTENANCE', 'CUSTOM_SOFTWARE', 'OTHER'
];

/** Canonical project statuses plus legacy aliases kept for existing records. */
export const PROJECT_STATUSES = [
  'NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED',
  'DRAFT', 'PLANNED', 'ACTIVE'
];

export const PROJECT_STATUS_NORMALIZE = {
  DRAFT: 'NOT_STARTED',
  PLANNED: 'NOT_STARTED',
  ACTIVE: 'IN_PROGRESS'
};

export const PROJECT_STATUS_LABELS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DRAFT: 'Not Started',
  PLANNED: 'Not Started',
  ACTIVE: 'In Progress'
};

export const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'CANCELLED'];

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

export const PAYMENT_STATUSES = [
  'PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REFUNDED'
];

export const CREDIT_TYPES = ['CREDIT', 'ADJUSTMENT'];

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'];

export const TECH_STACK = [
  'Java', 'Python', 'Node.js', 'JavaScript', 'TypeScript', 'React', 'Next.js',
  'Angular', 'Vue', 'PHP', 'Laravel', '.NET', 'Go', 'Ruby', 'Flutter',
  'React Native', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'DevOps',
  'MongoDB', 'PostgreSQL', 'MySQL', 'UI/UX', 'QA', 'Other'
];

export const BILLING_CYCLES = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'MILESTONE'];

export const CRM_PAGE_KEYS = [
  'dashboard', 'profile',
  'leads', 'sales_pipeline', 'clients', 'projects',
  'tasks',
  'employees', 'candidates', 'hiring_pipeline', 'interviews',
  'letters_offer', 'letters_agreement', 'letters_relieving', 'letters_company_card',
  'notifications', 'email',
  'contact_submissions', 'website_analytics', 'website_team', 'website_projects', 'catalogs',
  'reports',
  'invoices', 'payments', 'financial_reports',
  'settings', 'users'
];

export const FINANCIAL_PAGE_KEYS = ['invoices', 'payments', 'financial_reports'];

export const REMINDER_PREFERENCES = {
  '15_MINUTES_BEFORE': 15,
  '30_MINUTES_BEFORE': 30,
  '1_HOUR_BEFORE': 60,
  '1_DAY_BEFORE': 1440,
  AT_TIME: 0
};

export const DEFAULT_PAYMENT_REMINDER_DAYS = 3;

export function normalizeLeadStatus(status) {
  return LEAD_STATUS_NORMALIZE[status] || status;
}

export function isWonStatus(status) {
  return status === 'WON' || status === 'CONVERTED';
}

export function normalizeProjectStatus(status) {
  return PROJECT_STATUS_NORMALIZE[status] || status;
}

export function isClosedProjectStatus(status) {
  const normalized = normalizeProjectStatus(status);
  return normalized === 'COMPLETED' || normalized === 'CANCELLED';
}

export function isConfirmedPaymentStatus(status) {
  return !status || status === 'CONFIRMED';
}

export function countsTowardReceived(status) {
  return isConfirmedPaymentStatus(status);
}
