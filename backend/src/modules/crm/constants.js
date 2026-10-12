/** Netbase sales pipeline (primary board columns). */
export const SALES_PIPELINE_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'
];

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

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const LEAD_ACTIVITY_TYPES = [
  'LEAD_CREATED', 'LEAD_ASSIGNED', 'CALL_ADDED', 'CALL_COMPLETED',
  'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_COMPLETED', 'NOTE_ADDED',
  'STATUS_CHANGED', 'PROPOSAL_SENT', 'NEGOTIATION_UPDATED',
  'LEAD_CONVERTED', 'LEAD_LOST', 'LEAD_UPDATED', 'LEAD_ARCHIVED', 'MENTION'
];

export const COMPANY_TYPES = [
  'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'LLP', 'PARTNERSHIP',
  'SOLE_PROPRIETOR', 'STARTUP', 'OTHER'
];

export const DOCUMENT_TYPES = [
  'COMPANY_REGISTRATION', 'GST_CERTIFICATE', 'NDA', 'CONTRACT',
  'AGREEMENT', 'SOW', 'PO', 'BRD', 'FRD', 'UI_DESIGNS',
  'TECHNICAL', 'MEETING_NOTES', 'OTHER'
];

export const PROJECT_TYPES = [
  'WEBSITE', 'MOBILE_APP', 'SAAS', 'CRM', 'ERP', 'ECOMMERCE',
  'API', 'UI_UX', 'MAINTENANCE', 'CUSTOM_SOFTWARE', 'OTHER'
];

export const PROJECT_STATUSES = [
  'DRAFT', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'
];

export const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'CANCELLED'];

export const PROJECT_MEMBER_ROLES = [
  'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'DESIGNER', 'QA', 'DEVOPS', 'OTHER'
];

export const INVOICE_STATUSES = [
  'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'
];

export const PAYMENT_METHODS = [
  'BANK_TRANSFER', 'UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'STRIPE', 'CASH', 'OTHER'
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

export function normalizeLeadStatus(status) {
  return LEAD_STATUS_NORMALIZE[status] || status;
}

export function isWonStatus(status) {
  return status === 'WON' || status === 'CONVERTED';
}
