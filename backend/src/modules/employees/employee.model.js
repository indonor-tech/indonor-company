import mongoose from 'mongoose';

const education = new mongoose.Schema({
  degree: String, institution: String, fieldOfStudy: String, startYear: Number, endYear: Number,
  grade: String, certificateDocumentId: mongoose.Schema.Types.ObjectId
}, { _id: true });

const experience = new mongoose.Schema({
  companyName: String, jobTitle: String, employmentType: String, startDate: Date, endDate: Date,
  yearsOfExperience: Number, technologies: [String], responsibilities: String, location: String, lastSalary: Number,
  verificationStatus: { type: String, enum: ['PENDING', 'VERIFIED', 'FAILED'], default: 'PENDING' }
}, { _id: true });

const skill = new mongoose.Schema({
  technology: { type: String, required: true }, skillLevel: String,
  yearsOfExperience: { type: Number, min: 0 }, isPrimary: Boolean, lastUsed: Date, certification: String
}, { _id: true });

const employeeSchema = new mongoose.Schema({
  employeeRegistrationNumber: { type: String, unique: true, sparse: true, index: true },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', index: true },
  firstName: { type: String, required: true, trim: true }, middleName: String, lastName: { type: String, required: true, trim: true },
  fatherName: String, motherName: String, profilePhotoUrl: String, dateOfBirth: Date, gender: String, bloodGroup: String,
  maritalStatus: String, nationality: { type: String, default: 'Indian' },
  personalEmail: { type: String, lowercase: true, index: true }, companyEmail: { type: String, lowercase: true, index: true },
  phone: { type: String, index: true }, alternatePhone: String,
  address: String, city: String, state: String, country: String, postalCode: String, district: String, permanentAddress: String,
  permanentCity: String, permanentState: String, permanentCountry: String, permanentPostalCode: String, permanentDistrict: String,
  panNumber: String, aadhaarNumber: String, passportNumber: String, uanNumber: String, pfNumber: String, esiNumber: String,
  emergencyContact: { name: String, phone: String, relation: String },
  bank: { accountHolder: String, accountNumber: String, ifsc: String, bankName: String },
  employeeType: { type: String, enum: ['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY'], required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
  designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', index: true },
  specialization: { type: String, trim: true, default: '' },
  reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  joiningDate: { type: Date, index: true }, probationPeriod: Number, probationEndDate: Date,
  employmentStatus: { type: String, enum: ['ACTIVE', 'ON_PROBATION', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'INACTIVE', 'COMPLETED'], default: 'ACTIVE', index: true },
  workLocation: String, workMode: { type: String, enum: ['ONSITE', 'HYBRID', 'REMOTE'] }, contractType: String, contractEndDate: { type: Date, index: true }, noticePeriod: Number, engagementDurationMonths: Number,
  salary: { current: Number, currency: { type: String, default: 'INR' }, frequency: String, base: Number, allowances: Number, bonus: Number, variable: Number },
  education: [education], experience: [experience], skills: [skill],
  certificates: [{ name: String, issuer: String, year: Number, credentialId: String, url: String, documentId: mongoose.Schema.Types.ObjectId }],
  fresher: { graduationYear: Number, projects: [String], certifications: [String], internshipExperience: String, training: String, portfolio: String, assessmentScore: Number, interviewScore: Number },
  isDeleted: { type: Boolean, default: false, index: true }, deletedAt: Date, deletedBy: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

employeeSchema.index({ firstName: 'text', lastName: 'text', companyEmail: 'text', employeeRegistrationNumber: 'text' });
employeeSchema.virtual('fullName').get(function fullName() { return [this.firstName, this.middleName, this.lastName].filter(Boolean).join(' '); });
employeeSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Employee', employeeSchema);
