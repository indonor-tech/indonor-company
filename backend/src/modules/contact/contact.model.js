import mongoose from 'mongoose';

const contactSubmissionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, index: true },
  company: { type: String, trim: true, maxlength: 120, default: '' },
  subject: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  status: { type: String, enum: ['NEW', 'IN_PROGRESS', 'CONTACTED', 'CLOSED'], default: 'NEW', index: true },
  source: { type: String, default: 'indonortech.com' },
  notificationStatus: { type: String, enum: ['NOT_CONFIGURED', 'SENT', 'FAILED'], default: 'NOT_CONFIGURED' },
  notificationError: String
}, { timestamps: true, collection: 'contact_submissions' });

export default mongoose.model('ContactSubmission', contactSubmissionSchema);
