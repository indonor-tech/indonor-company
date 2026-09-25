import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: [{ type: String, required: true }],
  cc: [String],
  bcc: [String],
  subject: { type: String, required: true },
  attachmentNames: [String],
  mode: { type: String, enum: ['TOGETHER', 'SEPARATE', 'TEST'], default: 'TOGETHER' },
  status: { type: String, enum: ['SENT', 'PARTIAL', 'FAILED'], default: 'SENT', index: true },
  sentCount: { type: Number, default: 0 },
  failed: [{ _id: false, email: String, error: String }],
  provider: String,
  sentAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

export default mongoose.model('EmailLog', emailLogSchema);
