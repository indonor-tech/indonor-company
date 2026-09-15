import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: [{ type: String, required: true }],
  cc: [String],
  subject: { type: String, required: true },
  attachmentNames: [String],
  sentAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

export default mongoose.model('EmailLog', emailLogSchema);
