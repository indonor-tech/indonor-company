import express from 'express';
import Joi from 'joi';
import Employee from './employee.model.js';
import { SalaryHistory, History, Document } from '../common/support.model.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { nextRegistrationNumber } from '../../utils/ids.js';
import { pagination, sendSuccess } from '../../utils/response.js';
import { hasPermission, hasTabAccess, pickSelfEmployeeFields, sanitizeOwnEmployee } from '../auth/roles.js';
import { authorizeOwnTab, isOwnEmployee } from '../../middleware/auth.js';
import { storeFile } from '../../services/fileStorage.service.js';
import { findProfilePhoto, profilePhotoFilePath, profilePhotoUpload, saveProfilePhoto, sendProfilePhoto } from '../common/profilePhoto.js';
import { generateAgreementLetterPdf, generateCompanyCardPdf, generateOfferLetterPdf, generateRelievingLetterPdf, letterDownloadName, normalizeLetterPay, unpaidInternship } from '../../services/offerLetter.service.js';

const router = express.Router();
const employeeInput = Joi.object({
  firstName: Joi.string().trim().required(), middleName: Joi.string().allow(''), lastName: Joi.string().trim().required(),
  personalEmail: Joi.string().email().allow(''), companyEmail: Joi.string().email().allow(''), phone: Joi.string().pattern(/^[0-9+() -]{7,20}$/).allow(''),
  alternatePhone: Joi.string().allow(''), employeeType: Joi.string().valid('FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY').required(),
  department: Joi.string().allow(''), designation: Joi.string().allow(''), specialization: Joi.string().allow(''), reportingManager: Joi.string().allow(''),
  joiningDate: Joi.date().empty(''), probationPeriod: Joi.number().min(0), probationEndDate: Joi.date().empty(''), employmentStatus: Joi.string(),
  workLocation: Joi.string().allow(''), workMode: Joi.string().valid('ONSITE', 'HYBRID', 'REMOTE'), contractType: Joi.string().allow(''), contractEndDate: Joi.date(),
  noticePeriod: Joi.number().min(0), salary: Joi.object({ current: Joi.number().min(0), currency: Joi.string(), frequency: Joi.string(), base: Joi.number().min(0), allowances: Joi.number().min(0), bonus: Joi.number().min(0), variable: Joi.number().min(0) }),
  address: Joi.string().allow(''), city: Joi.string().allow(''), state: Joi.string().allow(''), country: Joi.string().allow(''), postalCode: Joi.string().allow(''), district: Joi.string().allow(''),
  permanentAddress: Joi.string().allow(''), permanentCity: Joi.string().allow(''), permanentState: Joi.string().allow(''), permanentCountry: Joi.string().allow(''), permanentPostalCode: Joi.string().allow(''), permanentDistrict: Joi.string().allow(''),
  dateOfBirth: Joi.date().empty(''), gender: Joi.string().allow(''), bloodGroup: Joi.string().allow(''),
  maritalStatus: Joi.string().allow(''), nationality: Joi.string().allow(''), fatherName: Joi.string().allow(''), motherName: Joi.string().allow(''),
  panNumber: Joi.string().allow(''), aadhaarNumber: Joi.string().allow(''), passportNumber: Joi.string().allow(''),
  uanNumber: Joi.string().allow(''), pfNumber: Joi.string().allow(''), esiNumber: Joi.string().allow(''),
  emergencyContact: Joi.object({ name: Joi.string().allow(''), phone: Joi.string().allow(''), relation: Joi.string().allow('') }),
  bank: Joi.object({ accountHolder: Joi.string().allow(''), accountNumber: Joi.string().allow(''), ifsc: Joi.string().allow(''), bankName: Joi.string().allow('') }),
  education: Joi.array(), experience: Joi.array(), skills: Joi.array(), certificates: Joi.array(), fresher: Joi.object()
}).unknown(false);

const employmentTypes = ['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR', 'FREELANCER', 'TEMPORARY'];
const salaryTypes = ['MONTHLY', 'ANNUAL_CTC', 'STIPEND', 'UNPAID'];
const durationMonths = Joi.number().valid(1, 2, 3, 6, 12).empty('');
const lastWorkingDateOptional = Joi.date().empty('');
function withLetterPay(schema) {
  return schema.custom((value, helpers) => {
    const next = normalizeLetterPay({ ...value, position: value.applyingPosition });
    if (!unpaidInternship(next) && (next.salary == null || next.salary === '')) {
      return helpers.message('Salary is required for paid roles');
    }
    return next;
  });
}
const offerLetterInput = withLetterPay(Joi.object({
  joiningDate: Joi.date().required(),
  applyingPosition: Joi.string().trim().required(),
  applyingTrack: Joi.string().allow(''),
  salary: Joi.number().min(0).allow(null),
  salaryType: Joi.string().valid(...salaryTypes),
  employmentType: Joi.string().valid(...employmentTypes).default('FULL_TIME'),
  workMode: Joi.string().valid('ONSITE', 'HYBRID', 'REMOTE').allow(''),
  durationMonths,
  lastWorkingDate: lastWorkingDateOptional,
  weekendOff: Joi.boolean(),
  workingHours: Joi.boolean()
}));
const agreementLetterInput = withLetterPay(Joi.object({
  joiningDate: Joi.date().required(),
  applyingPosition: Joi.string().trim().required(),
  applyingTrack: Joi.string().allow(''),
  salary: Joi.number().min(0).allow(null),
  salaryType: Joi.string().valid(...salaryTypes),
  employmentType: Joi.string().valid(...employmentTypes).default('FULL_TIME'),
  workMode: Joi.string().valid('ONSITE', 'HYBRID', 'REMOTE').allow(''),
  noticePeriod: Joi.number().min(0),
  durationMonths,
  lastWorkingDate: lastWorkingDateOptional,
  weekendOff: Joi.boolean(),
  workingHours: Joi.boolean()
}));
const relievingLetterInput = Joi.object({
  lastWorkingDate: Joi.date().required(),
  relievingDate: Joi.date(),
  joiningDate: Joi.date(),
  applyingPosition: Joi.string().trim().required(),
  applyingTrack: Joi.string().allow(''),
  noDues: Joi.boolean()
});
const companyCardInput = Joi.object({
  applyingPosition: Joi.string().trim().allow(''),
  applyingTrack: Joi.string().allow(''),
  bloodGroup: Joi.string().allow(''),
  emergencyName: Joi.string().allow(''),
  emergencyPhone: Joi.string().allow('')
});

async function employeePhotoPath(employeeId) {
  return profilePhotoFilePath('Employee', employeeId);
}

function canViewEmployeePhoto(user, employeeId) {
  if (hasPermission(user, 'employee:read') || hasPermission(user, 'documents:read')) return true;
  return isOwnEmployee(user, employeeId) && (hasTabAccess(user, 'overview', 'view') || hasTabAccess(user, 'documents', 'view'));
}

function canManageEmployeePhoto(user, employeeId) {
  if (hasPermission(user, 'employee:update') || hasPermission(user, 'documents:upload')) return true;
  return isOwnEmployee(user, employeeId) && (hasTabAccess(user, 'overview', 'edit') || hasTabAccess(user, 'documents', 'edit'));
}

async function employeeForLetter(id) {
  const employee = await Employee.findOne({ _id: id, isDeleted: false }).populate('designation department', 'name');
  if (!employee) throw new AppError('Employee not found', 404);
  return employee;
}

function roleAndPayUpdates(employee, body, user) {
  const extra = {
    joiningDate: body.joiningDate || employee.joiningDate,
    specialization: body.applyingTrack ?? employee.specialization,
    employeeType: body.employmentType || employee.employeeType
  };
  if (body.workMode) extra.workMode = body.workMode;
  if (body.durationMonths != null) extra.engagementDurationMonths = body.durationMonths;
  if (body.lastWorkingDate) extra.contractEndDate = body.lastWorkingDate;
  if (body.salary != null && body.salaryType !== 'UNPAID' && hasPermission(user, 'salary:update')) {
    extra.salary = {
      ...(employee.toObject().salary || {}),
      current: body.salary,
      currency: 'INR',
      frequency: body.salaryType === 'ANNUAL_CTC' ? 'ANNUAL' : 'MONTHLY'
    };
  }
  return extra;
}

function letterPayload(employee, document, user) {
  const payload = employee.toJSON ? employee.toJSON() : employee;
  if (!hasPermission(user, 'salary:read') && payload.salary) delete payload.salary;
  return { employee: payload, document };
}

async function saveEmployeeLetter(req, employee, { type, title, fileName, pdf, extra, metadata }) {
  const stored = await storeFile({ originalname: fileName, buffer: pdf, mimetype: 'application/pdf' }, 'Employee', employee._id);
  const document = await Document.create({
    ownerType: 'Employee', ownerId: employee._id, type, name: fileName,
    ...stored, mimeType: 'application/pdf', size: pdf.length, uploadedBy: req.user._id
  });
  if (extra) Object.assign(employee, extra);
  await employee.save();
  await History.create({
    entityType: 'Employee', entityId: employee._id, eventType: type, title,
    metadata: { documentId: document._id, ...metadata }, actor: req.user._id
  });
  return { employee, document };
}

router.use(authenticate);

const selfProfileInput = Joi.object({
  firstName: Joi.string().trim(), lastName: Joi.string().trim(), middleName: Joi.string().allow(''),
  phone: Joi.string().pattern(/^[0-9+() -]{7,20}$/).allow(''),
  alternatePhone: Joi.string().allow(''),
  personalEmail: Joi.string().email().allow(''),
  workLocation: Joi.string().allow(''), workMode: Joi.string().valid('ONSITE', 'HYBRID', 'REMOTE').allow(''),
  address: Joi.string().allow(''), city: Joi.string().allow(''), state: Joi.string().allow(''), country: Joi.string().allow(''),
  postalCode: Joi.string().allow(''), district: Joi.string().allow(''),
  permanentAddress: Joi.string().allow(''), permanentCity: Joi.string().allow(''), permanentState: Joi.string().allow(''),
  permanentCountry: Joi.string().allow(''), permanentPostalCode: Joi.string().allow(''), permanentDistrict: Joi.string().allow(''),
  fatherName: Joi.string().allow(''), motherName: Joi.string().allow(''),
  panNumber: Joi.string().allow(''), aadhaarNumber: Joi.string().allow(''), passportNumber: Joi.string().allow(''),
  uanNumber: Joi.string().allow(''), pfNumber: Joi.string().allow(''), esiNumber: Joi.string().allow(''),
  emergencyContact: Joi.object({ name: Joi.string().allow(''), phone: Joi.string().allow(''), relation: Joi.string().allow('') }),
  bank: Joi.object({ accountHolder: Joi.string().allow(''), accountNumber: Joi.string().allow(''), ifsc: Joi.string().allow(''), bankName: Joi.string().allow('') }),
  education: Joi.array(), experience: Joi.array(), skills: Joi.array(), certificates: Joi.array()
});

async function ownEmployee(user) {
  if (!user.employeeId) throw new AppError('Your CRM login is not linked to an employee profile yet. Ask an admin to link it.', 404);
  const canSeeSalary = hasPermission(user, 'salary:read') || hasTabAccess(user, 'salary', 'view');
  const employee = await Employee.findOne({ _id: user.employeeId, isDeleted: false }).populate('department designation reportingManager', 'name firstName lastName').select(canSeeSalary ? '' : '-salary');
  if (!employee) throw new AppError('Your employee profile was not found.', 404);
  return employee;
}

function presentEmployee(user, employee, isOwn) {
  if (isOwn && !hasPermission(user, 'employee:read')) return sanitizeOwnEmployee(user, employee);
  return employee;
}

router.get('/me', asyncHandler(async (req, res) => {
  const employee = await ownEmployee(req.user);
  return sendSuccess(res, presentEmployee(req.user, employee, true), 'Your profile fetched');
}));

router.patch('/me', validate(selfProfileInput), asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ _id: req.user.employeeId, isDeleted: false });
  if (!employee) throw new AppError('Your CRM login is not linked to an employee profile yet. Ask an admin to link it.', 404);
  Object.assign(employee, pickSelfEmployeeFields(req.user, req.body));
  await employee.save();
  const updated = await ownEmployee(req.user);
  return sendSuccess(res, presentEmployee(req.user, updated, true), 'Your profile was updated');
}));

router.get('/', authorize('employee:read'), asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 500);
  const filter = { isDeleted: false };
  if (req.query.q) filter.$text = { $search: req.query.q };
  for (const key of ['employeeType', 'employmentStatus', 'department', 'designation', 'workLocation']) if (req.query[key]) filter[key] = req.query[key];
  if (req.query.minExperience) filter['experience.yearsOfExperience'] = { $gte: Number(req.query.minExperience) };
  const sort = ['firstName', 'lastName', 'joiningDate', 'createdAt'].includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
  const direction = req.query.order === 'asc' ? 1 : -1;
  const [data, total] = await Promise.all([
    Employee.find(filter).populate('department designation reportingManager', 'name firstName lastName').select('-salary').sort({ [sort]: direction }).skip((page - 1) * limit).limit(limit).lean(),
    Employee.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Employees fetched', pagination(page, limit, total));
}));

router.post('/:id/letters/offer', authorize('employee:update'), validate(offerLetterInput), asyncHandler(async (req, res) => {
  const employee = await employeeForLetter(req.params.id);
  const issuedAt = new Date();
  const pdf = await generateOfferLetterPdf({
    person: employee,
    joiningDate: req.body.joiningDate,
    position: req.body.applyingPosition,
    track: req.body.applyingTrack,
    salary: req.body.salary,
    salaryType: req.body.salaryType,
    employmentType: req.body.employmentType,
    workMode: req.body.workMode,
    durationMonths: req.body.durationMonths,
    lastWorkingDate: req.body.lastWorkingDate,
    weekendOff: req.body.weekendOff !== false,
    workingHours: req.body.workingHours !== false,
    alreadyJoined: true,
    issuedAt
  });
  const { document } = await saveEmployeeLetter(req, employee, {
    type: 'OFFER_LETTER',
    title: 'Offer letter generated',
    fileName: letterDownloadName('Offer-Letter', employee),
    pdf,
    extra: roleAndPayUpdates(employee, req.body, req.user),
    metadata: { joiningDate: req.body.joiningDate, salary: req.body.salary }
  });
  return sendSuccess(res, letterPayload(employee, document, req.user), 'Offer letter generated and saved.');
}));

router.post('/:id/letters/agreement', authorize('employee:update'), validate(agreementLetterInput), asyncHandler(async (req, res) => {
  const employee = await employeeForLetter(req.params.id);
  const issuedAt = new Date();
  const pdf = await generateAgreementLetterPdf({
    person: employee,
    joiningDate: req.body.joiningDate,
    position: req.body.applyingPosition,
    track: req.body.applyingTrack,
    salary: req.body.salary,
    salaryType: req.body.salaryType,
    employmentType: req.body.employmentType,
    workMode: req.body.workMode,
    noticePeriod: req.body.noticePeriod,
    durationMonths: req.body.durationMonths,
    lastWorkingDate: req.body.lastWorkingDate,
    weekendOff: req.body.weekendOff !== false,
    workingHours: req.body.workingHours !== false,
    issuedAt
  });
  const extra = roleAndPayUpdates(employee, req.body, req.user);
  if (req.body.noticePeriod != null) extra.noticePeriod = req.body.noticePeriod;
  const { document } = await saveEmployeeLetter(req, employee, {
    type: 'AGREEMENT_LETTER',
    title: 'Agreement letter generated',
    fileName: letterDownloadName('Agreement-Letter', employee),
    pdf,
    extra,
    metadata: { joiningDate: req.body.joiningDate }
  });
  return sendSuccess(res, letterPayload(employee, document, req.user), 'Agreement letter generated and saved.');
}));

router.post('/:id/letters/relieving', authorize('employee:update'), validate(relievingLetterInput), asyncHandler(async (req, res) => {
  const employee = await employeeForLetter(req.params.id);
  const issuedAt = new Date();
  const pdf = await generateRelievingLetterPdf({
    person: employee,
    joiningDate: req.body.joiningDate || employee.joiningDate,
    lastWorkingDate: req.body.lastWorkingDate,
    relievingDate: req.body.relievingDate || req.body.lastWorkingDate,
    position: req.body.applyingPosition,
    track: req.body.applyingTrack,
    noDues: req.body.noDues !== false,
    issuedAt
  });
  const { document } = await saveEmployeeLetter(req, employee, {
    type: 'RELIEVING_LETTER',
    title: 'Relieving letter generated',
    fileName: letterDownloadName('Relieving-Letter', employee),
    pdf,
    extra: req.body.applyingTrack != null ? { specialization: req.body.applyingTrack } : undefined,
    metadata: { lastWorkingDate: req.body.lastWorkingDate, relievingDate: req.body.relievingDate || req.body.lastWorkingDate }
  });
  return sendSuccess(res, letterPayload(employee, document, req.user), 'Relieving letter generated and saved.');
}));

router.post('/:id/letters/company-card', authorize('employee:update'), validate(companyCardInput), asyncHandler(async (req, res) => {
  const employee = await employeeForLetter(req.params.id);
  const issuedAt = new Date();
  const pdf = await generateCompanyCardPdf({
    person: employee,
    position: req.body.applyingPosition || employee.designation?.name,
    track: req.body.applyingTrack ?? employee.specialization,
    department: employee.department?.name,
    joiningDate: employee.joiningDate,
    bloodGroup: req.body.bloodGroup || employee.bloodGroup,
    emergencyName: req.body.emergencyName || employee.emergencyContact?.name,
    emergencyPhone: req.body.emergencyPhone || employee.emergencyContact?.phone,
    photoPath: await employeePhotoPath(employee._id),
    issuedAt
  });
  const extra = {};
  if (req.body.applyingTrack != null) extra.specialization = req.body.applyingTrack;
  if (req.body.bloodGroup) extra.bloodGroup = req.body.bloodGroup;
  if (req.body.emergencyName || req.body.emergencyPhone) {
    extra.emergencyContact = {
      ...(employee.emergencyContact?.toObject?.() || employee.emergencyContact || {}),
      name: req.body.emergencyName || employee.emergencyContact?.name,
      phone: req.body.emergencyPhone || employee.emergencyContact?.phone
    };
  }
  const { document } = await saveEmployeeLetter(req, employee, {
    type: 'COMPANY_CARD',
    title: 'Company card generated',
    fileName: letterDownloadName('Company-Card', employee),
    pdf,
    extra: Object.keys(extra).length ? extra : undefined,
    metadata: { bloodGroup: req.body.bloodGroup }
  });
  return sendSuccess(res, letterPayload(employee, document, req.user), 'Company card generated and saved.');
}));

router.post('/', authorize('employee:create'), validate(employeeInput), asyncHandler(async (req, res) => {
  const identityFilters = [{ companyEmail: req.body.companyEmail }, { personalEmail: req.body.personalEmail }, { phone: req.body.phone }].filter((item) => Object.values(item)[0]);
  const duplicate = identityFilters.length ? await Employee.findOne({ isDeleted: false, $or: identityFilters }) : null;
  if (duplicate) throw new AppError('An active employee already uses this email or phone', 409);
  try {
    const employee = await Employee.create({ ...req.body, employeeRegistrationNumber: await nextRegistrationNumber('employee') });
    await History.create({ entityType: 'Employee', entityId: employee._id, eventType: 'CREATED', title: 'Employee registered', actor: req.user._id });
    return sendSuccess(res, employee, 'Employee created successfully');
  } catch (error) {
    if (error?.code === 11000) throw new AppError('An active employee already uses this email, phone, or registration number', 409);
    throw error;
  }
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const isOwn = isOwnEmployee(req.user, req.params.id);
  if (!hasPermission(req.user, 'employee:read') && !isOwn) throw new AppError('You do not have permission for this action', 403);
  const canReadSalary = hasPermission(req.user, 'salary:read') || (isOwn && hasTabAccess(req.user, 'salary', 'view'));
  const employee = await Employee.findOne({ _id: req.params.id, isDeleted: false }).populate('department designation reportingManager', 'name firstName lastName').select(canReadSalary ? '' : '-salary');
  if (!employee) throw new AppError('Employee not found', 404);
  return sendSuccess(res, presentEmployee(req.user, employee, isOwn), 'Employee fetched');
}));

router.patch('/:id', validate(employeeInput.fork(['firstName', 'lastName', 'employeeType'], (schema) => schema.optional())), asyncHandler(async (req, res) => {
  const isOwn = isOwnEmployee(req.user, req.params.id);
  if (!hasPermission(req.user, 'employee:update') && !isOwn) throw new AppError('You do not have permission for this action', 403);
  if (isOwn && !hasPermission(req.user, 'employee:update')) req.body = pickSelfEmployeeFields(req.user, req.body);
  const employee = await Employee.findOne({ _id: req.params.id, isDeleted: false }).select('+salary');
  if (!employee) throw new AppError('Employee not found', 404);
  const beforeStatus = employee.employmentStatus;
  const beforeSalary = employee.salary?.current;
  Object.assign(employee, req.body);
  await employee.save();
  if (req.body.employmentStatus && beforeStatus !== employee.employmentStatus) {
    await History.create({ entityType: 'Employee', entityId: employee._id, eventType: 'STATUS_CHANGED', title: `Status changed to ${employee.employmentStatus}`, metadata: { from: beforeStatus, to: employee.employmentStatus }, actor: req.user._id });
  }
  if (req.body.salary?.current !== undefined && req.body.salary.current !== beforeSalary) {
    await SalaryHistory.create({ employee: employee._id, effectiveDate: new Date(), previousSalary: beforeSalary, newSalary: req.body.salary.current, currency: req.body.salary.currency, changedBy: req.user._id, reason: req.body.salary.reason });
    await History.create({ entityType: 'Employee', entityId: employee._id, eventType: 'SALARY_CHANGED', title: 'Salary updated', actor: req.user._id });
  }
  return sendSuccess(res, employee, 'Employee updated successfully');
}));

router.delete('/:id', authorize('employee:delete'), asyncHandler(async (req, res) => {
  const employee = await Employee.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!employee) throw new AppError('Employee not found', 404);
  await History.create({ entityType: 'Employee', entityId: employee._id, eventType: 'DELETED', title: 'Employee archived', actor: req.user._id });
  return sendSuccess(res, null, 'Employee archived successfully');
}));

router.patch('/:id/restore', authorize('employee:delete'), asyncHandler(async (req, res) => {
  const employee = await Employee.findOneAndUpdate({ _id: req.params.id, isDeleted: true }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, deletedBy: 1 } }, { new: true });
  if (!employee) throw new AppError('Archived employee not found', 404);
  await History.create({ entityType: 'Employee', entityId: employee._id, eventType: 'RESTORED', title: 'Employee restored', actor: req.user._id });
  return sendSuccess(res, employee, 'Employee restored successfully');
}));

router.get('/:id/salary', authorizeOwnTab('salary', 'view', ['salary:read']), asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id).select('salary');
  const history = await SalaryHistory.find({ employee: req.params.id }).sort({ effectiveDate: -1 }).lean();
  return sendSuccess(res, { current: employee?.salary || {}, history }, 'Salary history fetched');
}));

router.get('/:id/timeline', authorizeOwnTab('timeline', 'view', ['employee:read']), asyncHandler(async (req, res) => {
  const data = await History.find({ entityType: 'Employee', entityId: req.params.id }).sort({ occurredAt: -1 }).populate('actor', 'name email').lean();
  return sendSuccess(res, data, 'Employee timeline fetched');
}));

router.get('/:id/photo', asyncHandler(async (req, res) => {
  if (!canViewEmployeePhoto(req.user, req.params.id)) throw new AppError('You do not have permission for this action', 403);
  const photo = await findProfilePhoto('Employee', req.params.id);
  return sendProfilePhoto(res, photo);
}));

router.post('/:id/photo', profilePhotoUpload.single('photo'), asyncHandler(async (req, res) => {
  if (!canManageEmployeePhoto(req.user, req.params.id)) throw new AppError('You do not have permission for this action', 403);
  const employee = await Employee.findOne({ _id: req.params.id, isDeleted: false });
  if (!employee) throw new AppError('Employee not found', 404);
  const document = await saveProfilePhoto({ ownerType: 'Employee', ownerId: employee._id, file: req.file, userId: req.user._id });
  employee.profilePhotoUrl = `/api/v1/employees/${employee._id}/photo`;
  await employee.save();
  return sendSuccess(res, { documentId: document._id }, 'Profile photo updated');
}));

export default router;
