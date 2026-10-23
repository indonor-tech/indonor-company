import mongoose from 'mongoose';
import {
  ADJUSTMENT_TYPES, ALLOCATION_TARGETS, BILLING_CYCLES, COMPANY_TYPES, CREDIT_TYPES,
  DOCUMENT_TYPES, DUE_DIRECTIONS, DUE_PRIORITIES, DUE_STATUSES, ENGAGEMENT_TYPES,
  FOLLOW_UP_TARGETS, FOLLOW_UP_TYPES, INVOICE_SCOPES,
  INVOICE_STATUSES, LEAD_ACTIVITY_TYPES, LEAD_PRIORITIES, LEAD_SOURCES, LEAD_STATUSES,
  MILESTONE_STATUSES, PARTNER_ROLES, PARTNERSHIP_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES,
  PROJECT_MEMBER_ROLES, PROJECT_STATUSES, PROJECT_TYPES, SERVICE_TYPES, SHARE_BASES
} from './constants.js';

const objectId = mongoose.Schema.Types.ObjectId;

const attachmentSubSchema = {
  name: String,
  url: String,
  mimeType: String,
  size: Number,
  storageProvider: { type: String, enum: ['local', 'cloudinary', 'external'], default: 'local' },
  storageKey: String,
  documentType: { type: String, enum: [...DOCUMENT_TYPES, ''], default: '' },
  uploadedBy: { type: objectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now }
};

const leadSchema = new mongoose.Schema({
  leadId: { type: String, unique: true, index: true },
  leadName: { type: String, required: true, trim: true, maxlength: 160 },
  companyName: { type: String, trim: true, maxlength: 160, default: '' },
  companyWebsite: { type: String, trim: true, maxlength: 500, default: '' },
  industry: { type: String, trim: true, maxlength: 120, default: '' },
  companySize: { type: String, trim: true, maxlength: 80, default: '' },
  country: { type: String, trim: true, maxlength: 80, default: '' },
  state: { type: String, trim: true, maxlength: 80, default: '' },
  city: { type: String, trim: true, maxlength: 80, default: '' },
  district: { type: String, trim: true, maxlength: 80, default: '' },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  postalCode: { type: String, trim: true, maxlength: 20, default: '' },
  phoneCountryCode: { type: String, trim: true, maxlength: 8, default: '+91' },
  contactPersonName: { type: String, trim: true, maxlength: 160, default: '' },
  designation: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '', index: true },
  phone: { type: String, trim: true, maxlength: 40, default: '', index: true },
  alternatePhone: { type: String, trim: true, maxlength: 40, default: '' },
  whatsappNumber: { type: String, trim: true, maxlength: 40, default: '' },
  linkedInProfile: { type: String, trim: true, maxlength: 500, default: '' },
  otherSocialProfile: { type: String, trim: true, maxlength: 500, default: '' },
  source: { type: String, enum: LEAD_SOURCES, default: 'OTHER', index: true },
  campaign: { type: String, trim: true, maxlength: 160, default: '' },
  referralDetails: { type: String, trim: true, maxlength: 1000, default: '' },
  interestedService: { type: String, enum: [...SERVICE_TYPES, ''], default: '' },
  requirementDescription: { type: String, trim: true, maxlength: 5000, default: '' },
  projectDescription: { type: String, trim: true, maxlength: 8000, default: '' },
  businessRequirements: { type: String, trim: true, maxlength: 8000, default: '' },
  expectedProjectType: { type: String, enum: [...PROJECT_TYPES, ''], default: '' },
  requiredTechnologies: [{ type: String, trim: true, maxlength: 80 }],
  expectedStartDate: Date,
  estimatedDuration: { type: String, trim: true, maxlength: 80, default: '' },
  deadline: Date,
  estimatedBudget: { type: Number, min: 0 },
  expectedDealValue: { type: Number, min: 0 },
  quotedAmount: { type: Number, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  urgency: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL', ''], default: '' },
  probability: { type: Number, min: 0, max: 100, default: 0 },
  isDecisionMaker: { type: Boolean, default: false },
  notes: { type: String, trim: true, maxlength: 8000, default: '' },
  tags: [{ type: String, trim: true, maxlength: 60 }],
  customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  attachments: [attachmentSubSchema],
  lastContactAt: Date,
  timezone: { type: String, trim: true, maxlength: 80, default: 'Asia/Kolkata' },
  priority: { type: String, enum: LEAD_PRIORITIES, default: 'MEDIUM', index: true },
  status: { type: String, enum: LEAD_STATUSES, default: 'NEW', index: true },
  assignedTo: { type: objectId, ref: 'User', default: null, index: true },
  assignedBy: { type: objectId, ref: 'User', default: null },
  assignedDate: Date,
  convertedDate: Date,
  convertedBy: { type: objectId, ref: 'User', default: null },
  clientId: { type: objectId, ref: 'CrmClient', default: null, index: true },
  conversionNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: Date,
  archivedBy: { type: objectId, ref: 'User', default: null },
  createdBy: { type: objectId, ref: 'User' },
  updatedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'leads' });

leadSchema.index({ isDeleted: 1, isArchived: 1, status: 1, createdAt: -1 });
leadSchema.index({ leadName: 'text', companyName: 'text', email: 'text', contactPersonName: 'text' });
leadSchema.index({ email: 1, phone: 1, isDeleted: 1 });

const leadActivitySchema = new mongoose.Schema({
  leadId: { type: objectId, ref: 'CrmLead', required: true, index: true },
  type: { type: String, enum: LEAD_ACTIVITY_TYPES, required: true },
  title: { type: String, trim: true, maxlength: 200, required: true },
  description: { type: String, trim: true, maxlength: 4000, default: '' },
  result: { type: String, trim: true, maxlength: 500, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed },
  actor: { type: objectId, ref: 'User' },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true, collection: 'lead_activities' });

const followUpSchema = new mongoose.Schema({
  leadId: { type: objectId, ref: 'CrmLead', default: null, index: true },
  clientId: { type: objectId, ref: 'CrmClient', default: null, index: true },
  projectId: { type: objectId, ref: 'CrmProject', default: null, index: true },
  target: { type: String, enum: FOLLOW_UP_TARGETS, default: 'LEAD', index: true },
  nextFollowUpDate: { type: Date, required: true, index: true },
  nextFollowUpTime: { type: String, trim: true, maxlength: 20, default: '' },
  timezone: { type: String, trim: true, maxlength: 80, default: 'Asia/Kolkata' },
  followUpType: { type: String, enum: FOLLOW_UP_TYPES, default: 'CALL' },
  nextAction: { type: String, trim: true, maxlength: 500, default: '' },
  followUpNote: { type: String, trim: true, maxlength: 4000, default: '' },
  priority: { type: String, enum: LEAD_PRIORITIES, default: 'MEDIUM' },
  assignedSalesPerson: { type: objectId, ref: 'User', index: true },
  reminderDateTime: { type: Date, index: true },
  reminderPreference: { type: String, trim: true, maxlength: 80, default: '30_MINUTES_BEFORE' },
  status: { type: String, enum: ['PENDING', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'], default: 'PENDING', index: true },
  completedAt: Date,
  completedNote: { type: String, trim: true, maxlength: 2000, default: '' },
  reminderSentAt: Date,
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'follow_ups' });

followUpSchema.index({
  target: 1, clientId: 1, projectId: 1, assignedSalesPerson: 1, nextFollowUpDate: 1, status: 1, isDeleted: 1
});

const clientSchema = new mongoose.Schema({
  clientId: { type: String, unique: true, index: true },
  clientName: { type: String, required: true, trim: true, maxlength: 160 },
  companyName: { type: String, trim: true, maxlength: 160, default: '' },
  legalCompanyName: { type: String, trim: true, maxlength: 200, default: '' },
  companyType: { type: String, enum: [...COMPANY_TYPES, ''], default: '' },
  industry: { type: String, trim: true, maxlength: 120, default: '' },
  companyWebsite: { type: String, trim: true, maxlength: 500, default: '' },
  companyEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  companyPhone: { type: String, trim: true, maxlength: 40, default: '' },
  country: { type: String, trim: true, maxlength: 80, default: '' },
  state: { type: String, trim: true, maxlength: 80, default: '' },
  city: { type: String, trim: true, maxlength: 80, default: '' },
  district: { type: String, trim: true, maxlength: 80, default: '' },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  postalCode: { type: String, trim: true, maxlength: 20, default: '' },
  timezone: { type: String, trim: true, maxlength: 80, default: '' },
  businessDescription: { type: String, trim: true, maxlength: 5000, default: '' },
  companySize: { type: String, trim: true, maxlength: 80, default: '' },
  numberOfEmployees: { type: Number, min: 0 },
  annualTurnover: { type: Number, min: 0 },
  gstVatNumber: { type: String, trim: true, maxlength: 80, default: '' },
  taxId: { type: String, trim: true, maxlength: 80, default: '' },
  registrationNumber: { type: String, trim: true, maxlength: 80, default: '' },
  billingAddress: { type: String, trim: true, maxlength: 500, default: '' },
  shippingAddress: { type: String, trim: true, maxlength: 500, default: '' },
  sourceLeadId: { type: objectId, ref: 'CrmLead', default: null },
  sourceLeadCode: { type: String, trim: true, maxlength: 40, default: '' },
  technologies: [{ type: String, trim: true, maxlength: 80 }],
  contractValue: { type: Number, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  startDate: Date,
  endDate: Date,
  duration: { type: String, trim: true, maxlength: 80, default: '' },
  paymentTerms: { type: String, trim: true, maxlength: 1000, default: '' },
  notes: { type: String, trim: true, maxlength: 8000, default: '' },
  assignedTo: { type: objectId, ref: 'User', default: null, index: true },
  createdBy: { type: objectId, ref: 'User' },
  updatedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'clients' });

clientSchema.index({ isDeleted: 1, createdAt: -1 });
clientSchema.index({ clientName: 'text', companyName: 'text', companyEmail: 'text' });
clientSchema.index(
  { sourceLeadId: 1 },
  { unique: true, partialFilterExpression: { sourceLeadId: { $type: 'objectId' }, isDeleted: false } }
);

const clientContactSchema = new mongoose.Schema({
  clientId: { type: objectId, ref: 'CrmClient', required: true, index: true },
  contactName: { type: String, required: true, trim: true, maxlength: 160 },
  designation: { type: String, trim: true, maxlength: 120, default: '' },
  department: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  whatsapp: { type: String, trim: true, maxlength: 40, default: '' },
  linkedIn: { type: String, trim: true, maxlength: 500, default: '' },
  isPrimary: { type: Boolean, default: false },
  isBillingContact: { type: Boolean, default: false },
  isTechnicalContact: { type: Boolean, default: false },
  isDecisionMaker: { type: Boolean, default: false },
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'client_contacts' });

const clientDocumentSchema = new mongoose.Schema({
  clientId: { type: objectId, ref: 'CrmClient', required: true, index: true },
  documentName: { type: String, required: true, trim: true, maxlength: 200 },
  documentType: { type: String, enum: DOCUMENT_TYPES, default: 'OTHER' },
  storageProvider: { type: String, enum: ['local', 'cloudinary', 'external'], default: 'local' },
  storageKey: String,
  externalUrl: String,
  mimeType: String,
  size: Number,
  version: { type: String, trim: true, maxlength: 40, default: '1' },
  expiryDate: Date,
  uploadedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'client_documents' });

const clientActivitySchema = new mongoose.Schema({
  clientId: { type: objectId, ref: 'CrmClient', required: true, index: true },
  type: { type: String, required: true, trim: true, maxlength: 80 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 4000, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed },
  actor: { type: objectId, ref: 'User' },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true, collection: 'client_activities' });

const projectSchema = new mongoose.Schema({
  projectId: { type: String, unique: true, index: true },
  projectName: { type: String, required: true, trim: true, maxlength: 200 },
  projectCode: { type: String, trim: true, maxlength: 40, default: '', index: true },
  clientId: { type: objectId, ref: 'CrmClient', required: true, index: true },
  sourceLeadId: { type: objectId, ref: 'CrmLead', default: null, index: true },
  projectDescription: { type: String, trim: true, maxlength: 8000, default: '' },
  projectType: { type: String, enum: [...PROJECT_TYPES, ''], default: '' },
  industry: { type: String, trim: true, maxlength: 120, default: '' },
  estimatedStartDate: Date,
  actualStartDate: Date,
  expectedEndDate: Date,
  actualEndDate: Date,
  estimatedDuration: { type: String, trim: true, maxlength: 80, default: '' },
  status: { type: String, enum: PROJECT_STATUSES, default: 'NOT_STARTED', index: true },
  progressPercent: { type: Number, min: 0, max: 100, default: 0 },
  progressUpdatedAt: Date,
  projectManager: { type: objectId, ref: 'User', default: null, index: true },
  notes: { type: String, trim: true, maxlength: 8000, default: '' },
  scope: { type: String, trim: true, maxlength: 8000, default: '' },
  requirements: { type: String, trim: true, maxlength: 8000, default: '' },
  features: { type: String, trim: true, maxlength: 8000, default: '' },
  technologyStack: [{ type: String, trim: true, maxlength: 80 }],
  thirdPartyIntegrations: { type: String, trim: true, maxlength: 2000, default: '' },
  hostingRequirements: { type: String, trim: true, maxlength: 2000, default: '' },
  domain: { type: String, trim: true, maxlength: 200, default: '' },
  repository: { type: String, trim: true, maxlength: 500, default: '' },
  deploymentDetails: { type: String, trim: true, maxlength: 4000, default: '' },
  environmentDetails: { type: String, trim: true, maxlength: 4000, default: '' },
  specialInstructions: { type: String, trim: true, maxlength: 4000, default: '' },
  contractValue: { type: Number, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  paymentTerms: { type: String, trim: true, maxlength: 1000, default: '' },
  billingCycle: { type: String, enum: [...BILLING_CYCLES, ''], default: '' },
  tax: { type: Number, min: 0, default: 0 },
  discount: { type: Number, min: 0, default: 0 },
  finalAmount: { type: Number, min: 0 },
  nextPaymentDueDate: Date,
  paymentReminderDays: { type: Number, min: 0, max: 90, default: 3 },
  confirmedReceived: { type: Number, min: 0, default: 0 },
  creditsTotal: { type: Number, min: 0, default: 0 },
  outstanding: { type: Number, min: 0, default: 0 },
  ledgerVersion: { type: Number, min: 0, default: 0 },
  engagementType: { type: String, enum: [...ENGAGEMENT_TYPES, ''], default: 'CLIENT', index: true },
  projectOwner: { type: objectId, ref: 'User', default: null },
  assignedSalesperson: { type: objectId, ref: 'User', default: null, index: true },
  partnershipStatus: { type: String, enum: PARTNERSHIP_STATUSES, default: 'NONE' },
  partnershipNotes: { type: String, trim: true, maxlength: 4000, default: '' },
  shareBasis: { type: String, enum: SHARE_BASES, default: 'GROSS_CONTRACT' },
  companySharePercent: { type: Number, min: 0, max: 100, default: 100 },
  allowUnevenPercent: { type: Boolean, default: false },
  referrerName: { type: String, trim: true, maxlength: 160, default: '' },
  referrerCompany: { type: String, trim: true, maxlength: 160, default: '' },
  referrerEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  referrerPhone: { type: String, trim: true, maxlength: 40, default: '' },
  referralCommission: { type: Number, min: 0, default: 0 },
  referralPercent: { type: Number, min: 0, max: 100, default: 0 },
  referralNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  createdBy: { type: objectId, ref: 'User' },
  updatedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'crm_projects' });

projectSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
projectSchema.index({ clientId: 1, isDeleted: 1, createdAt: -1 });
projectSchema.index({ projectName: 'text', projectCode: 'text' });
projectSchema.index({ nextPaymentDueDate: 1, isDeleted: 1 });

const projectMemberSchema = new mongoose.Schema({
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  userId: { type: objectId, ref: 'User', required: true, index: true },
  employeeId: { type: objectId, ref: 'Employee', default: null },
  role: { type: String, enum: PROJECT_MEMBER_ROLES, default: 'OTHER' },
  assignedBy: { type: objectId, ref: 'User' },
  assignedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, collection: 'project_members' });

projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

const projectMilestoneSchema = new mongoose.Schema({
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  milestoneName: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 4000, default: '' },
  deliverable: { type: String, trim: true, maxlength: 2000, default: '' },
  startDate: Date,
  dueDate: Date,
  status: { type: String, enum: MILESTONE_STATUSES, default: 'PENDING', index: true },
  assignedTeam: [{ type: objectId, ref: 'User' }],
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'project_milestones' });

const projectDocumentSchema = new mongoose.Schema({
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  partnerId: { type: objectId, ref: 'CrmProjectPartner', default: null },
  documentName: { type: String, required: true, trim: true, maxlength: 200 },
  documentType: { type: String, enum: DOCUMENT_TYPES, default: 'OTHER' },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  storageProvider: { type: String, enum: ['local', 'cloudinary', 'external'], default: 'local' },
  storageKey: String,
  externalUrl: String,
  mimeType: String,
  size: Number,
  version: { type: String, trim: true, maxlength: 40, default: '1' },
  versionNumber: { type: Number, min: 1, default: 1 },
  previousVersionId: { type: objectId, ref: 'ProjectDocument', default: null },
  uploadedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'project_documents' });

const projectActivitySchema = new mongoose.Schema({
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  type: { type: String, required: true, trim: true, maxlength: 80 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 4000, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed },
  actor: { type: objectId, ref: 'User' },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true, collection: 'project_activities' });

const invoiceLineItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true, maxlength: 500 },
  quantity: { type: Number, required: true, min: 0, default: 1 },
  rate: { type: Number, required: true, min: 0, default: 0 },
  discount: { type: Number, min: 0, default: 0 },
  taxRate: { type: Number, min: 0, max: 100, default: 0 },
  amount: { type: Number, required: true, min: 0, default: 0 }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true, index: true },
  invoiceDate: { type: Date, required: true, index: true },
  dueDate: { type: Date, index: true },
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  clientId: { type: objectId, ref: 'CrmClient', required: true, index: true },
  partnerId: { type: objectId, ref: 'CrmProjectPartner', default: null, index: true },
  issuerName: { type: String, trim: true, maxlength: 200, default: '' },
  recipientName: { type: String, trim: true, maxlength: 200, default: '' },
  invoiceScope: { type: String, enum: INVOICE_SCOPES, default: 'FULL_PROJECT' },
  sharePercent: { type: Number, min: 0, max: 100 },
  isImported: { type: Boolean, default: false },
  isManualNumber: { type: Boolean, default: false },
  description: { type: String, trim: true, maxlength: 4000, default: '' },
  lineItems: { type: [invoiceLineItemSchema], default: [] },
  subtotal: { type: Number, required: true, min: 0 },
  tax: { type: Number, min: 0, default: 0 },
  taxRate: { type: Number, min: 0, max: 100, default: 0 },
  discount: { type: Number, min: 0, default: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, min: 0, default: 0 },
  balanceDue: { type: Number, min: 0, default: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  status: { type: String, enum: INVOICE_STATUSES, default: 'DRAFT', index: true },
  paymentTerms: { type: String, trim: true, maxlength: 1000, default: '' },
  notes: { type: String, trim: true, maxlength: 4000, default: '' },
  attachments: [attachmentSubSchema],
  createdBy: { type: objectId, ref: 'User' },
  updatedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'invoices' });

invoiceSchema.pre('validate', function uppercaseInvoiceNumber() {
  if (this.invoiceNumber) this.invoiceNumber = String(this.invoiceNumber).trim().toUpperCase();
});

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, unique: true, index: true },
  invoiceId: { type: objectId, ref: 'CrmInvoice', default: null, index: true },
  clientId: { type: objectId, ref: 'CrmClient', required: true, index: true },
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  installmentNumber: { type: Number, min: 1, default: 1 },
  paymentDate: { type: Date, required: true, index: true },
  recordedDate: { type: Date, default: Date.now },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  status: { type: String, enum: PAYMENT_STATUSES, default: 'PENDING', index: true },
  confirmedAt: Date,
  confirmedBy: { type: objectId, ref: 'User', default: null },
  paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'BANK_TRANSFER' },
  transactionId: { type: String, trim: true, maxlength: 120, default: '' },
  referenceNumber: { type: String, trim: true, maxlength: 120, default: '' },
  upiTransactionId: { type: String, trim: true, maxlength: 120, default: '' },
  utr: { type: String, trim: true, maxlength: 120, default: '' },
  chequeNumber: { type: String, trim: true, maxlength: 80, default: '' },
  payerName: { type: String, trim: true, maxlength: 160, default: '' },
  bankName: { type: String, trim: true, maxlength: 160, default: '' },
  accountHolder: { type: String, trim: true, maxlength: 160, default: '' },
  maskedAccountNumber: { type: String, trim: true, maxlength: 40, default: '' },
  invoiceNumber: { type: String, trim: true, maxlength: 80, default: '' },
  receiptNumber: { type: String, trim: true, maxlength: 80, default: '' },
  invoiceDate: Date,
  dueDate: Date,
  paymentTerms: { type: String, trim: true, maxlength: 1000, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  allocationTarget: { type: String, enum: ALLOCATION_TARGETS, default: 'UNALLOCATED', index: true },
  partnerId: { type: objectId, ref: 'CrmProjectPartner', default: null, index: true },
  attachments: [attachmentSubSchema],
  receivedBy: { type: objectId, ref: 'User' },
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'payments' });

paymentSchema.index({ projectId: 1, installmentNumber: 1, isDeleted: 1 });
paymentSchema.index({ clientId: 1, status: 1, isDeleted: 1 });

const paymentCreditSchema = new mongoose.Schema({
  creditId: { type: String, unique: true, index: true },
  clientId: { type: objectId, ref: 'CrmClient', required: true, index: true },
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  type: { type: String, enum: CREDIT_TYPES, default: 'CREDIT' },
  reason: { type: String, trim: true, maxlength: 2000, default: '' },
  appliedAt: { type: Date, default: Date.now },
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'payment_credits' });

const viewAdminPagePermissionSchema = new mongoose.Schema({
  userId: { type: objectId, ref: 'User', required: true, index: true },
  pageKey: { type: String, required: true, index: true },
  canView: { type: Boolean, default: false },
  canCreate: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  grantedBy: { type: objectId, ref: 'User' },
  grantedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'view_admin_page_permissions' });

viewAdminPagePermissionSchema.index({ userId: 1, pageKey: 1 }, { unique: true });

const projectPartnerSchema = new mongoose.Schema({
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  companyName: { type: String, trim: true, maxlength: 160, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  role: { type: String, enum: PARTNER_ROLES, default: 'PARTNER' },
  sharePercent: { type: Number, min: 0, max: 100, default: 0 },
  fixedCommission: { type: Number, min: 0, default: 0 },
  isCompany: { type: Boolean, default: false },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'project_partners' });

projectPartnerSchema.index({ projectId: 1, isDeleted: 1, isActive: 1 });

const partnershipAgreementSchema = new mongoose.Schema({
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  version: { type: Number, min: 1, required: true },
  effectiveFrom: { type: Date, default: Date.now },
  shareBasis: { type: String, enum: SHARE_BASES, default: 'GROSS_CONTRACT' },
  companySharePercent: { type: Number, min: 0, max: 100, default: 100 },
  allowUnevenPercent: { type: Boolean, default: false },
  partnershipStatus: { type: String, enum: PARTNERSHIP_STATUSES, default: 'ACTIVE' },
  notes: { type: String, trim: true, maxlength: 4000, default: '' },
  partners: { type: mongoose.Schema.Types.Mixed, default: [] },
  createdBy: { type: objectId, ref: 'User' }
}, { timestamps: true, collection: 'partnership_agreements' });

partnershipAgreementSchema.index({ projectId: 1, version: -1 });

const projectAdjustmentSchema = new mongoose.Schema({
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  type: { type: String, enum: ADJUSTMENT_TYPES, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  appliedAt: { type: Date, default: Date.now },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'project_adjustments' });

const partnerSettlementSchema = new mongoose.Schema({
  settlementId: { type: String, unique: true, index: true },
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  partnerId: { type: objectId, ref: 'CrmProjectPartner', required: true, index: true },
  paymentDate: { type: Date, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  status: { type: String, enum: PAYMENT_STATUSES, default: 'CONFIRMED', index: true },
  paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'BANK_TRANSFER' },
  transactionId: { type: String, trim: true, maxlength: 120, default: '' },
  referenceNumber: { type: String, trim: true, maxlength: 120, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  dueDate: Date,
  attachments: [attachmentSubSchema],
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'partner_settlements' });

partnerSettlementSchema.index({ projectId: 1, partnerId: 1, isDeleted: 1 });

const invoiceSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'default' },
  prefix: { type: String, trim: true, uppercase: true, maxlength: 12, default: 'INV' },
  padWidth: { type: Number, min: 1, max: 10, default: 6 },
  updatedBy: { type: objectId, ref: 'User' }
}, { timestamps: true, collection: 'invoice_settings' });

const dueLineItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true, maxlength: 500 },
  amount: { type: Number, min: 0, required: true, default: 0 }
}, { _id: true });

const partnerDueSchema = new mongoose.Schema({
  dueId: { type: String, unique: true, index: true },
  direction: { type: String, enum: DUE_DIRECTIONS, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 4000, default: '' },
  notes: { type: String, trim: true, maxlength: 4000, default: '' },
  priority: { type: String, enum: DUE_PRIORITIES, default: 'MEDIUM', index: true },
  status: { type: String, enum: DUE_STATUSES, default: 'PENDING', index: true },
  dueDate: { type: Date, index: true },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  lineItems: { type: [dueLineItemSchema], default: [] },
  originalAmount: { type: Number, min: 0, default: 0 },
  amountPaid: { type: Number, min: 0, default: 0 },
  adjustmentTotal: { type: Number, min: 0, default: 0 },
  remaining: { type: Number, min: 0, default: 0 },
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  clientId: { type: objectId, ref: 'CrmClient', required: true, index: true },
  partnerId: { type: objectId, ref: 'CrmProjectPartner', default: null, index: true },
  partnerName: { type: String, required: true, trim: true, maxlength: 160 },
  partnerCompany: { type: String, trim: true, maxlength: 160, default: '' },
  partnerEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  partnerPhone: { type: String, trim: true, maxlength: 40, default: '' },
  assignedTo: { type: objectId, ref: 'User', default: null, index: true },
  attachments: [attachmentSubSchema],
  adjustmentNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  settledAt: Date,
  settledBy: { type: objectId, ref: 'User', default: null },
  reopenReason: { type: String, trim: true, maxlength: 2000, default: '' },
  reopenedAt: Date,
  reopenedBy: { type: objectId, ref: 'User', default: null },
  createdBy: { type: objectId, ref: 'User' },
  updatedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'partner_dues' });

partnerDueSchema.index({ projectId: 1, direction: 1, status: 1, isDeleted: 1 });
partnerDueSchema.index({ partnerName: 'text', title: 'text', dueId: 'text' });

const partnerDuePaymentSchema = new mongoose.Schema({
  paymentId: { type: String, unique: true, index: true },
  dueId: { type: objectId, ref: 'PartnerDue', required: true, index: true },
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  installmentNumber: { type: Number, min: 1, default: 1 },
  paymentDate: { type: Date, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  status: { type: String, enum: PAYMENT_STATUSES, default: 'CONFIRMED', index: true },
  paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'BANK_TRANSFER' },
  transactionId: { type: String, trim: true, maxlength: 120, default: '' },
  referenceNumber: { type: String, trim: true, maxlength: 120, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  attachments: [attachmentSubSchema],
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'partner_due_payments' });

partnerDuePaymentSchema.index({ dueId: 1, transactionId: 1, isDeleted: 1 });

export const CrmLead = mongoose.model('CrmLead', leadSchema);
export const LeadActivity = mongoose.model('LeadActivity', leadActivitySchema);
export const FollowUp = mongoose.model('FollowUp', followUpSchema);
export const CrmClient = mongoose.model('CrmClient', clientSchema);
export const ClientContact = mongoose.model('ClientContact', clientContactSchema);
export const ClientDocument = mongoose.model('ClientDocument', clientDocumentSchema);
export const ClientActivity = mongoose.model('ClientActivity', clientActivitySchema);
export const CrmProject = mongoose.model('CrmProject', projectSchema);
export const ProjectMember = mongoose.model('ProjectMember', projectMemberSchema);
export const ProjectMilestone = mongoose.model('ProjectMilestone', projectMilestoneSchema);
export const ProjectDocument = mongoose.model('ProjectDocument', projectDocumentSchema);
export const ProjectActivity = mongoose.model('ProjectActivity', projectActivitySchema);
export const CrmInvoice = mongoose.model('CrmInvoice', invoiceSchema);
export const CrmPayment = mongoose.model('CrmPayment', paymentSchema);
export const PaymentCredit = mongoose.model('PaymentCredit', paymentCreditSchema);
export const ViewAdminPagePermission = mongoose.model('ViewAdminPagePermission', viewAdminPagePermissionSchema);
export const CrmProjectPartner = mongoose.model('CrmProjectPartner', projectPartnerSchema);
export const PartnershipAgreement = mongoose.model('PartnershipAgreement', partnershipAgreementSchema);
export const ProjectAdjustment = mongoose.model('ProjectAdjustment', projectAdjustmentSchema);
export const PartnerSettlement = mongoose.model('PartnerSettlement', partnerSettlementSchema);
export const InvoiceSettings = mongoose.model('InvoiceSettings', invoiceSettingsSchema);
export const PartnerDue = mongoose.model('PartnerDue', partnerDueSchema);
export const PartnerDuePayment = mongoose.model('PartnerDuePayment', partnerDuePaymentSchema);
