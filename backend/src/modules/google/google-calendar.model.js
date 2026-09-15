import mongoose from 'mongoose';

const googleCalendarAccountSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  refreshToken: { type: String, required: true, select: false },
  connectedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('GoogleCalendarAccount', googleCalendarAccountSchema, 'google_calendar_accounts');
