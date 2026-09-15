import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  ownerType: { type: String, enum: ['Employee', 'Candidate'], required: true }, ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  type: String, name: String, storageProvider: { type: String, enum: ['local', 'cloudinary', 'external'], default: 'local' },
  storageKey: String, externalUrl: String, resourceType: String, extension: String, mimeType: String, size: Number, pageCount: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, expiryDate: Date,
  verificationStatus: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
  isDeleted: { type: Boolean, default: false }, deletedAt: Date
}, { timestamps: true });

const salarySchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true }, effectiveDate: Date, previousSalary: Number, newSalary: Number,
  currency: String, baseSalary: Number, allowances: Number, bonus: Number, variableCompensation: Number, reason: String,
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const onboardingSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', unique: true }, completedAt: Date,
  tasks: [{ name: String, notes: String, status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED'], default: 'PENDING' }, completedAt: Date, completedBy: mongoose.Schema.Types.ObjectId }]
}, { timestamps: true });

const historySchema = new mongoose.Schema({
  entityType: String, entityId: { type: mongoose.Schema.Types.ObjectId, index: true }, eventType: String, title: String, description: String,
  metadata: mongoose.Schema.Types.Mixed, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

const auditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: { type: String, index: true }, entityType: String, entityId: mongoose.Schema.Types.ObjectId,
  changes: mongoose.Schema.Types.Mixed, ipAddress: String, userAgent: String, occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, type: String, title: String, message: String,
  entityType: String, entityId: mongoose.Schema.Types.ObjectId, dueDate: Date, dedupeKey: { type: String, unique: true, sparse: true }, readAt: Date
}, { timestamps: true });

export const Document = mongoose.model('Document', documentSchema);
export const SalaryHistory = mongoose.model('SalaryHistory', salarySchema);
export const Onboarding = mongoose.model('Onboarding', onboardingSchema);
export const History = mongoose.model('History', historySchema);
export const AuditLog = mongoose.model('AuditLog', auditSchema);
export const Notification = mongoose.model('Notification', notificationSchema);
const loginHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, enum: ['LOGIN', 'LOGOUT', 'FAILED_LOGIN'] }, ipAddress: String, userAgent: String, occurredAt: { type: Date, default: Date.now }
});
export const LoginHistory = mongoose.model('LoginHistory', loginHistorySchema);
