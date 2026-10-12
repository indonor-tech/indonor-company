import mongoose from 'mongoose';
import {
  BILLING_CYCLES, COMPANY_TYPES, DOCUMENT_TYPES, FOLLOW_UP_TYPES,
  INVOICE_STATUSES, LEAD_ACTIVITY_TYPES, LEAD_PRIORITIES, LEAD_SOURCES,
  LEAD_STATUSES, MILESTONE_STATUSES, PAYMENT_METHODS, PROJECT_MEMBER_ROLES,
  PROJECT_STATUSES, PROJECT_TYPES, SERVICE_TYPES
} from './constants.js';

const objectId = mongoose.Schema.Types.ObjectId;

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
  expectedProjectType: { type: String, enum: [...PROJECT_TYPES, ''], default: '' },
  expectedStartDate: Date,
  estimatedBudget: { type: Number, min: 0 },
  expectedDealValue: { type: Number, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  urgency: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL', ''], default: '' },
  probability: { type: Number, min: 0, max: 100, default: 0 },
  isDecisionMaker: { type: Boolean, default: false },
  tags: [{ type: String, trim: true, maxlength: 60 }],
  customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  attachments: [{
    name: String, url: String, mimeType: String, size: Number,
    uploadedBy: { type: objectId, ref: 'User' }, uploadedAt: { type: Date, default: Date.now }
  }],
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
  leadId: { type: objectId, ref: 'CrmLead', required: true, index: true },
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
  sourceLeadId: { type: objectId, ref: 'CrmLead', default: null, index: true },
  assignedTo: { type: objectId, ref: 'User', default: null, index: true },
  createdBy: { type: objectId, ref: 'User' },
  updatedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'clients' });

clientSchema.index({ isDeleted: 1, createdAt: -1 });
clientSchema.index({ clientName: 'text', companyName: 'text', companyEmail: 'text' });

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
  projectDescription: { type: String, trim: true, maxlength: 8000, default: '' },
  projectType: { type: String, enum: [...PROJECT_TYPES, ''], default: '' },
  industry: { type: String, trim: true, maxlength: 120, default: '' },
  estimatedStartDate: Date,
  actualStartDate: Date,
  expectedEndDate: Date,
  actualEndDate: Date,
  status: { type: String, enum: PROJECT_STATUSES, default: 'DRAFT', index: true },
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
  // Commercial fields — API layer strips for non-SUPER_ADMIN
  contractValue: { type: Number, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  paymentTerms: { type: String, trim: true, maxlength: 1000, default: '' },
  billingCycle: { type: String, enum: [...BILLING_CYCLES, ''], default: '' },
  tax: { type: Number, min: 0, default: 0 },
  discount: { type: Number, min: 0, default: 0 },
  finalAmount: { type: Number, min: 0 },
  createdBy: { type: objectId, ref: 'User' },
  updatedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'crm_projects' });

projectSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
projectSchema.index({ projectName: 'text', projectCode: 'text' });

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
  startDate: Date,
  dueDate: Date,
  status: { type: String, enum: MILESTONE_STATUSES, default: 'PENDING', index: true },
  assignedTeam: [{ type: objectId, ref: 'User' }],
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'project_milestones' });

const projectDocumentSchema = new mongoose.Schema({
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  documentName: { type: String, required: true, trim: true, maxlength: 200 },
  documentType: { type: String, enum: DOCUMENT_TYPES, default: 'OTHER' },
  storageProvider: { type: String, enum: ['local', 'cloudinary', 'external'], default: 'local' },
  storageKey: String,
  externalUrl: String,
  mimeType: String,
  size: Number,
  version: { type: String, trim: true, maxlength: 40, default: '1' },
  uploadedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'project_documents' });

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
  notes: { type: String, trim: true, maxlength: 4000, default: '' },
  createdBy: { type: objectId, ref: 'User' },
  updatedBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'invoices' });

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, unique: true, index: true },
  invoiceId: { type: objectId, ref: 'CrmInvoice', required: true, index: true },
  clientId: { type: objectId, ref: 'CrmClient', required: true, index: true },
  projectId: { type: objectId, ref: 'CrmProject', required: true, index: true },
  paymentDate: { type: Date, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, trim: true, maxlength: 8, default: 'INR' },
  paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'BANK_TRANSFER' },
  transactionId: { type: String, trim: true, maxlength: 120, default: '' },
  referenceNumber: { type: String, trim: true, maxlength: 120, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  receivedBy: { type: objectId, ref: 'User' },
  createdBy: { type: objectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'payments' });

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
export const CrmInvoice = mongoose.model('CrmInvoice', invoiceSchema);
export const CrmPayment = mongoose.model('CrmPayment', paymentSchema);
export const ViewAdminPagePermission = mongoose.model('ViewAdminPagePermission', viewAdminPagePermissionSchema);
