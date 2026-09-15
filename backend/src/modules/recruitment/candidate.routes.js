import express from 'express';
import Joi from 'joi';
import multer from 'multer';
import Candidate from './candidate.model.js';
import Employee from '../employees/employee.model.js';
import Interview from '../interviews/interview.model.js';
import { Document, History, Onboarding } from '../common/support.model.js';
import { defaultOnboardingTasks } from '../onboarding/onboarding.routes.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { nextRegistrationNumber } from '../../utils/ids.js';
import { pagination, sendSuccess } from '../../utils/response.js';
import { hasPermission } from '../auth/roles.js';
import { extractResumeText, parseResumeText } from '../../services/resumeParser.service.js';
import { generateOfferLetterPdf, letterDownloadName, normalizeLetterPay, unpaidInternship } from '../../services/offerLetter.service.js';
import { storeFile } from '../../services/fileStorage.service.js';
import { findProfilePhoto, profilePhotoUpload, saveProfilePhoto, sendProfilePhoto } from '../common/profilePhoto.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const candidateInput = Joi.object({
  firstName: Joi.string().trim().required(), lastName: Joi.string().trim().required(), email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[0-9+() -]{7,20}$/).allow(''), dateOfBirth: Joi.date().empty(''), gender: Joi.string().allow(''),
  resumeUrl: Joi.string().uri().allow(''), resumeText: Joi.string().allow(''), linkedin: Joi.string().allow(''),
  github: Joi.string().allow(''), portfolio: Joi.string().allow(''), location: Joi.string().allow(''),
  address: Joi.string().allow(''), city: Joi.string().allow(''), state: Joi.string().allow(''), country: Joi.string().allow(''), postalCode: Joi.string().allow(''), district: Joi.string().allow(''),
  permanentAddress: Joi.string().allow(''), permanentCity: Joi.string().allow(''), permanentState: Joi.string().allow(''), permanentCountry: Joi.string().allow(''), permanentPostalCode: Joi.string().allow(''), permanentDistrict: Joi.string().allow(''),
  education: Joi.array(), experience: Joi.array(), skills: Joi.array(), currentCompany: Joi.string().allow(''),
  currentSalary: Joi.number().min(0), expectedSalary: Joi.number().min(0), noticePeriod: Joi.number().min(0),
  applyingPosition: Joi.string().required(), applyingTrack: Joi.string().allow(''), source: Joi.string().allow(''), recruiter: Joi.string().allow(''),
  status: Joi.string(), followUpDate: Joi.date(), followUpIntervalMonths: Joi.number().min(1), offerExpiryDate: Joi.date(), notes: Joi.string().allow('')
}).unknown(false);
const durationMonths = Joi.number().valid(1, 2, 3, 6, 12).empty('');
const lastWorkingDateOptional = Joi.date().empty('');
const offerLetterInput = Joi.object({
  joiningDate: Joi.date().required(),
  applyingPosition: Joi.string().trim().required(),
  applyingTrack: Joi.string().allow(''),
  salary: Joi.number().min(0).allow(null),
  salaryType: Joi.string().valid('MONTHLY', 'ANNUAL_CTC', 'STIPEND', 'UNPAID'),
  employmentType: Joi.string().valid('FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY').default('FULL_TIME'),
  workMode: Joi.string().valid('ONSITE', 'HYBRID', 'REMOTE').allow(''),
  offerExpiryDate: Joi.date(),
  durationMonths,
  lastWorkingDate: lastWorkingDateOptional,
  weekendOff: Joi.boolean(),
  workingHours: Joi.boolean()
}).custom((value, helpers) => {
  const next = normalizeLetterPay({ ...value, position: value.applyingPosition });
  if (!unpaidInternship(next) && (next.salary == null || next.salary === '')) {
    return helpers.message('Salary is required for paid roles');
  }
  return next;
});
const convertInput = Joi.object({
  employeeType: Joi.string().valid('FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY').default('FULL_TIME'),
  joiningDate: Joi.date(), department: Joi.string().hex().length(24).allow(''), designation: Joi.string().hex().length(24).allow(''),
  specialization: Joi.string().allow(''),
  companyEmail: Joi.string().email().allow(''), workLocation: Joi.string().allow(''), workMode: Joi.string().valid('ONSITE', 'HYBRID', 'REMOTE').allow(''),
  probationPeriod: Joi.number().min(0), fatherName: Joi.string().allow(''), nationality: Joi.string().allow(''), maritalStatus: Joi.string().allow(''),
  address: Joi.string().allow(''), city: Joi.string().allow(''), state: Joi.string().allow(''), country: Joi.string().allow(''), postalCode: Joi.string().allow(''), district: Joi.string().allow(''),
  permanentAddress: Joi.string().allow(''), permanentCity: Joi.string().allow(''), permanentState: Joi.string().allow(''), permanentCountry: Joi.string().allow(''), permanentPostalCode: Joi.string().allow(''), permanentDistrict: Joi.string().allow(''),
  panNumber: Joi.string().allow(''), aadhaarNumber: Joi.string().allow(''),
  emergencyContact: Joi.object({ name: Joi.string().allow(''), phone: Joi.string().allow(''), relation: Joi.string().allow('') }),
  bank: Joi.object({ accountHolder: Joi.string().allow(''), accountNumber: Joi.string().allow(''), ifsc: Joi.string().allow(''), bankName: Joi.string().allow('') }),
  salary: Joi.object({ current: Joi.number().min(0), currency: Joi.string(), frequency: Joi.string(), base: Joi.number().min(0), allowances: Joi.number().min(0), bonus: Joi.number().min(0), variable: Joi.number().min(0) })
});

router.use(authenticate);
router.get('/', authorize('candidate:read'), asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 500);
  const filter = { isDeleted: false };
  if (req.query.q) filter.$text = { $search: req.query.q };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.recruiter) filter.recruiter = req.query.recruiter;
  const [data, total] = await Promise.all([
    Candidate.find(filter).populate('recruiter', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Candidate.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Candidates fetched', pagination(page, limit, total));
}));

router.post('/parse-resume', authorize('candidate:create'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Upload a PDF, Word, text, or image resume.', 422);
  const resumeText = await extractResumeText(req.file);
  if (!resumeText.trim()) throw new AppError('No readable text was found in that file. Enter the details manually.', 422);
  return sendSuccess(res, { ...parseResumeText(resumeText), fileName: req.file.originalname }, 'Resume data extracted. Review and edit before saving.');
}));

router.post('/', authorize('candidate:create'), validate(candidateInput), asyncHandler(async (req, res) => {
  const duplicate = await Candidate.findOne({ isDeleted: false, $or: [{ email: req.body.email }, ...(req.body.phone ? [{ phone: req.body.phone }] : [])] });
  if (duplicate) throw new AppError('An active candidate already uses this email or phone', 409);
  const candidate = await Candidate.create({ ...req.body, recruiter: req.body.recruiter || req.user._id, candidateRegistrationNumber: await nextRegistrationNumber('candidate') });
  await History.create({ entityType: 'Candidate', entityId: candidate._id, eventType: 'CREATED', title: 'Candidate registered', actor: req.user._id });
  return sendSuccess(res, candidate, 'Candidate created successfully');
}));

router.get('/:id', authorize('candidate:read'), asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, isDeleted: false }).populate('recruiter', 'name email');
  if (!candidate) throw new AppError('Candidate not found', 404);
  return sendSuccess(res, candidate, 'Candidate fetched');
}));

router.get('/:id/photo', authorize('candidate:read'), asyncHandler(async (req, res) => {
  const photo = await findProfilePhoto('Candidate', req.params.id);
  return sendProfilePhoto(res, photo);
}));

router.post('/:id/photo', authorize('candidate:update'), profilePhotoUpload.single('photo'), asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, isDeleted: false });
  if (!candidate) throw new AppError('Candidate not found', 404);
  const document = await saveProfilePhoto({ ownerType: 'Candidate', ownerId: candidate._id, file: req.file, userId: req.user._id });
  return sendSuccess(res, { documentId: document._id }, 'Profile photo updated');
}));

router.patch('/:id', authorize('candidate:update'), validate(candidateInput.fork(['firstName', 'lastName', 'email', 'applyingPosition'], (schema) => schema.optional())), asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, isDeleted: false });
  if (!candidate) throw new AppError('Candidate not found', 404);
  const previousStatus = candidate.status;
  Object.assign(candidate, req.body);
  if (req.body.followUpIntervalMonths && !req.body.followUpDate) {
    const date = new Date(); date.setMonth(date.getMonth() + req.body.followUpIntervalMonths); candidate.followUpDate = date;
  }
  await candidate.save();
  if (req.body.status && req.body.status !== previousStatus) await History.create({ entityType: 'Candidate', entityId: candidate._id, eventType: 'STATUS_CHANGED', title: `Moved to ${candidate.status}`, metadata: { from: previousStatus, to: candidate.status }, actor: req.user._id });
  return sendSuccess(res, candidate, 'Candidate updated successfully');
}));

router.delete('/:id', authorize('candidate:delete'), asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!candidate) throw new AppError('Candidate not found', 404);
  await History.create({ entityType: 'Candidate', entityId: candidate._id, eventType: 'DELETED', title: 'Candidate archived', actor: req.user._id });
  return sendSuccess(res, null, 'Candidate archived successfully');
}));

router.patch('/:id/restore', authorize('candidate:delete'), asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOneAndUpdate({ _id: req.params.id, isDeleted: true }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, deletedBy: 1 } }, { new: true });
  if (!candidate) throw new AppError('Archived candidate not found', 404);
  await History.create({ entityType: 'Candidate', entityId: candidate._id, eventType: 'RESTORED', title: 'Candidate restored', actor: req.user._id });
  return sendSuccess(res, candidate, 'Candidate restored successfully');
}));

router.post('/:id/offer-letter', authorize('candidate:update'), validate(offerLetterInput), asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, isDeleted: false });
  if (!candidate) throw new AppError('Candidate not found', 404);
  const passed = await Interview.exists({ candidate: candidate._id, result: 'PASS', isDeleted: false });
  if (!passed && !['SELECTED', 'OFFER_SENT', 'OFFER_ACCEPTED'].includes(candidate.status)) {
    throw new AppError('Generate an offer letter only after the candidate has passed an interview.', 422);
  }
  const issuedAt = new Date();
  const expiry = req.body.offerExpiryDate || new Date(issuedAt.getTime() + 7 * 86400000);
  const pdf = await generateOfferLetterPdf({
    candidate,
    joiningDate: req.body.joiningDate,
    position: req.body.applyingPosition,
    track: req.body.applyingTrack,
    salary: req.body.salary,
    salaryType: req.body.salaryType,
    employmentType: req.body.employmentType,
    workMode: req.body.workMode,
    offerExpiryDate: expiry,
    durationMonths: req.body.durationMonths,
    lastWorkingDate: req.body.lastWorkingDate,
    weekendOff: req.body.weekendOff !== false,
    workingHours: req.body.workingHours !== false,
    issuedAt
  });
  const fileName = letterDownloadName('Offer-Letter', candidate);
  const stored = await storeFile({ originalname: fileName, buffer: pdf, mimetype: 'application/pdf' }, 'Candidate', candidate._id);
  const document = await Document.create({
    ownerType: 'Candidate', ownerId: candidate._id, type: 'OFFER_LETTER', name: fileName,
    ...stored, mimeType: 'application/pdf', size: pdf.length, uploadedBy: req.user._id
  });
  Object.assign(candidate, {
    applyingPosition: req.body.applyingPosition,
    applyingTrack: req.body.applyingTrack || '',
    expectedSalary: req.body.salary,
    offerJoiningDate: req.body.joiningDate,
    offerSalary: req.body.salary,
    offerSalaryType: req.body.salaryType,
    offerEmploymentType: req.body.employmentType,
    offerWorkMode: req.body.workMode || '',
    offerIssuedAt: issuedAt,
    offerExpiryDate: expiry,
    ...(req.body.durationMonths != null ? { offerDurationMonths: req.body.durationMonths } : {}),
    ...(req.body.lastWorkingDate ? { offerLastWorkingDate: req.body.lastWorkingDate } : {}),
    status: candidate.status === 'JOINED' ? candidate.status : 'OFFER_SENT'
  });
  await candidate.save();
  await History.create({
    entityType: 'Candidate', entityId: candidate._id, eventType: 'OFFER_SENT',
    title: 'Offer letter generated', metadata: { documentId: document._id, joiningDate: req.body.joiningDate, salary: req.body.salary },
    actor: req.user._id
  });
  return sendSuccess(res, { candidate, document }, 'Offer letter generated and saved.');
}));

router.post('/:id/convert', authorize('employee:create'), validate(convertInput), asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, isDeleted: false });
  if (!candidate) throw new AppError('Candidate not found', 404);
  const passed = await Interview.exists({ candidate: candidate._id, result: 'PASS', isDeleted: false });
  if (!passed && !['SELECTED', 'OFFER_SENT', 'OFFER_ACCEPTED'].includes(candidate.status)) {
    throw new AppError('Convert only after a passed interview, or when the candidate is selected / offer accepted', 422);
  }
  if (candidate.convertedEmployeeId) throw new AppError('Candidate is already converted', 409);
  const canWriteSalary = hasPermission(req.user, 'salary:update');
  const salaryPayload = req.body.salary || (candidate.offerSalary && candidate.offerSalaryType !== 'UNPAID' ? {
    current: candidate.offerSalary,
    frequency: candidate.offerSalaryType === 'ANNUAL_CTC' ? 'YEARLY' : 'MONTHLY'
  } : null);
  const employee = await Employee.create({
    employeeRegistrationNumber: await nextRegistrationNumber('employee'), candidateId: candidate._id,
    firstName: candidate.firstName, lastName: candidate.lastName, personalEmail: candidate.email, phone: candidate.phone,
    dateOfBirth: candidate.dateOfBirth, gender: candidate.gender,
    address: req.body.address || candidate.address, city: req.body.city || candidate.city, state: req.body.state || candidate.state,
    country: req.body.country || candidate.country, postalCode: req.body.postalCode || candidate.postalCode, district: req.body.district || candidate.district,
    permanentAddress: req.body.permanentAddress || candidate.permanentAddress, permanentCity: req.body.permanentCity || candidate.permanentCity,
    permanentState: req.body.permanentState || candidate.permanentState, permanentCountry: req.body.permanentCountry || candidate.permanentCountry,
    permanentPostalCode: req.body.permanentPostalCode || candidate.permanentPostalCode, permanentDistrict: req.body.permanentDistrict || candidate.permanentDistrict,
    panNumber: req.body.panNumber, aadhaarNumber: req.body.aadhaarNumber,
    fatherName: req.body.fatherName, nationality: req.body.nationality, maritalStatus: req.body.maritalStatus,
    emergencyContact: req.body.emergencyContact, bank: req.body.bank,
    employeeType: req.body.employeeType || candidate.offerEmploymentType || 'FULL_TIME',
    joiningDate: req.body.joiningDate || candidate.offerJoiningDate,
    department: req.body.department || undefined,
    designation: req.body.designation || undefined, specialization: req.body.specialization || candidate.applyingTrack || '',
    companyEmail: req.body.companyEmail, workLocation: req.body.workLocation || candidate.location,
    workMode: req.body.workMode || candidate.offerWorkMode, noticePeriod: candidate.noticePeriod, probationPeriod: req.body.probationPeriod,
    engagementDurationMonths: candidate.offerDurationMonths, contractEndDate: candidate.offerLastWorkingDate,
    skills: candidate.skills, education: candidate.education, experience: candidate.experience,
    ...(canWriteSalary && salaryPayload ? { salary: { currency: 'INR', ...salaryPayload } } : {})
  });
  const resumeDocs = await Document.find({ ownerType: 'Candidate', ownerId: candidate._id, isDeleted: false }).lean();
  if (resumeDocs.length) {
    await Document.insertMany(resumeDocs.map(({ _id, createdAt, updatedAt, __v, ...doc }) => ({ ...doc, ownerType: 'Employee', ownerId: employee._id })));
  }
  await Onboarding.findOneAndUpdate(
    { employee: employee._id },
    { $setOnInsert: { employee: employee._id, tasks: defaultOnboardingTasks.map((name) => ({ name })) } },
    { upsert: true, new: true }
  );
  candidate.convertedEmployeeId = employee._id; candidate.status = 'JOINED'; await candidate.save();
  await History.create({ entityType: 'Candidate', entityId: candidate._id, eventType: 'CONVERTED', title: 'Candidate converted to employee', metadata: { employeeId: employee._id }, actor: req.user._id });
  await History.create({ entityType: 'Employee', entityId: employee._id, eventType: 'JOINED', title: 'Joined from recruitment after interview', metadata: { candidateId: candidate._id }, actor: req.user._id });
  return sendSuccess(res, employee, 'Candidate converted to employee');
}));

router.get('/:id/timeline', authorize('candidate:read'), asyncHandler(async (req, res) => {
  const data = await History.find({ entityType: 'Candidate', entityId: req.params.id }).sort({ occurredAt: -1 }).populate('actor', 'name email').lean();
  return sendSuccess(res, data, 'Candidate timeline fetched');
}));

export default router;
