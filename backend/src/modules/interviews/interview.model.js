import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  technicalScore: { type: Number, min: 0, max: 10 }, communicationScore: { type: Number, min: 0, max: 10 },
  problemSolvingScore: { type: Number, min: 0, max: 10 }, overallScore: { type: Number, min: 0, max: 10 },
  feedback: String, recommendation: { type: String, enum: ['STRONGLY_RECOMMEND', 'RECOMMEND', 'HOLD', 'NOT_RECOMMENDED'] },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, submittedAt: { type: Date, default: Date.now }
}, { _id: true });

const interviewSchema = new mongoose.Schema({
  interviewId: { type: String, unique: true, index: true }, candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
  round: { type: String, enum: ['HR', 'TECHNICAL', 'MANAGERIAL', 'FINAL', 'CLIENT', 'SCREENING'], required: true },
  interviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, interviewDate: { type: Date, required: true, index: true },
  startTime: String, endTime: String, interviewType: String, mode: { type: String, enum: ['ONLINE', 'OFFLINE', 'PHONE', 'VIDEO'] },
  technology: String, position: String, status: { type: String, enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'], default: 'SCHEDULED', index: true },
  result: { type: String, enum: ['PENDING', 'PASS', 'FAIL'], default: 'PENDING', index: true },
  resultNotes: String, resultRecordedAt: Date, resultRecordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  meetUrl: String, calendarEventId: String, calendarHtmlLink: String, meetError: String,
  feedbackHistory: [feedbackSchema], nextInterviewDate: Date, followUpDate: Date, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, updatedBy: mongoose.Schema.Types.ObjectId,
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true });

interviewSchema.index({ interviewDate: 1, status: 1 });
export default mongoose.model('Interview', interviewSchema);
