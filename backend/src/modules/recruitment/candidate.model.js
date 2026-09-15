import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema({
  candidateRegistrationNumber: { type: String, unique: true, sparse: true, index: true },
  firstName: { type: String, required: true, trim: true }, lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, index: true }, phone: { type: String, index: true },
  dateOfBirth: Date, gender: String, resumeUrl: String, resumeText: String, linkedin: String, github: String, portfolio: String, location: String,
  address: String, city: String, state: String, country: String, postalCode: String, district: String,
  permanentAddress: String, permanentCity: String, permanentState: String, permanentCountry: String, permanentPostalCode: String, permanentDistrict: String,
  education: [{ degree: String, institution: String, fieldOfStudy: String, startYear: Number, endYear: Number, grade: String }],
  experience: [{ companyName: String, jobTitle: String, employmentType: String, startDate: Date, endDate: Date, yearsOfExperience: Number, technologies: [String], responsibilities: String, location: String, lastSalary: Number }],
  skills: [{ technology: String, skillLevel: String, yearsOfExperience: Number, isPrimary: Boolean }],
  currentCompany: String, currentSalary: Number, expectedSalary: Number, noticePeriod: Number,
  applyingPosition: { type: String, required: true },
  applyingTrack: { type: String, trim: true, default: '' },
  source: String, recruiter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['NEW', 'SCREENING', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED', 'SELECTED', 'REJECTED', 'ON_HOLD', 'OFFER_SENT', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'JOINED', 'WITHDRAWN'], default: 'NEW', index: true },
  followUpDate: { type: Date, index: true }, followUpIntervalMonths: Number, offerExpiryDate: Date, notes: String, convertedEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  offerJoiningDate: Date,
  offerSalary: Number,
  offerSalaryType: { type: String, enum: ['MONTHLY', 'ANNUAL_CTC', 'STIPEND', 'UNPAID'] },
  offerEmploymentType: String,
  offerWorkMode: String,
  offerIssuedAt: Date,
  offerDurationMonths: Number,
  offerLastWorkingDate: Date,
  isDeleted: { type: Boolean, default: false, index: true }, deletedAt: Date, deletedBy: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

candidateSchema.index({ firstName: 'text', lastName: 'text', email: 'text', candidateRegistrationNumber: 'text' });
candidateSchema.index({ applyingPosition: 1, applyingTrack: 1 });
candidateSchema.virtual('fullName').get(function fullName() { return `${this.firstName} ${this.lastName}`; });
candidateSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Candidate', candidateSchema);
