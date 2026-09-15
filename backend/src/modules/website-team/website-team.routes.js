import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import Joi from 'joi';
import mongoose from 'mongoose';
import WebsiteTeamMember from './website-team.model.js';
import Employee from '../employees/employee.model.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import { env } from '../../config/env.js';
import { publicTeamPhotoDir, storePublicImage } from '../../services/fileStorage.service.js';
import { findProfilePhoto, profilePhotoFilePath, sendProfilePhoto } from '../common/profilePhoto.js';

const router = express.Router();
const objectId = Joi.string().hex().length(24);
const publicFields = 'name role roles bio photoUrl location linkedinUrl displayOrder employeeId';
const currentEmployeeStatuses = ['ACTIVE'];
const employeePhotoPath = /\/api\/v1\/employees\/[a-f0-9]{24}\/photo/i;
const photoName = /^[0-9a-f-]{36}\.(jpe?g|png|webp|gif)$/i;
const memberInput = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  role: Joi.string().trim().max(400).allow(''),
  roles: Joi.array().items(Joi.string().trim().max(160).allow('')).max(8),
  bio: Joi.string().trim().max(1200).allow(''),
  photoUrl: Joi.string().trim().max(2000).allow(''),
  location: Joi.string().trim().max(160).allow(''),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).allow(''),
  linkedinUrl: Joi.string().trim().max(500).allow(''),
  displayOrder: Joi.number().integer().min(0),
  isPublished: Joi.boolean()
});
const reorderInput = Joi.object({
  ids: Joi.array().items(objectId).min(1).required()
});
const fromEmployeesInput = Joi.object({
  ids: Joi.array().items(objectId).min(1).required()
});
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) || /\.(jpe?g|png|webp|gif)$/i.test(file.originalname || '')) {
      return callback(null, true);
    }
    callback(new AppError('Upload a JPG, PNG, WEBP, or GIF photo.', 422));
  }
});

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ').trim();
}

function employeeRole(employee) {
  const type = String(employee.employeeType || '').replaceAll('_', ' ');
  const spec = String(employee.specialization || '').trim();
  if (type && spec) return `${type} - ${spec}`;
  return employee.designation?.name || employee.department?.name || type || 'Team member';
}

function cleanRoles(roles, role) {
  const fromRoles = Array.isArray(roles) ? roles : [];
  const fromRole = String(role || '').split(/\s*(?:,|;|\/|·|•|\band\b)\s*/i);
  return [...new Set([...fromRoles, ...fromRole].map((item) => String(item || '').trim()).filter((item) => item.length >= 2))].slice(0, 8);
}

function withRoles(body, fallback = {}) {
  const hasRoles = body.roles !== undefined || body.role !== undefined;
  if (!hasRoles) return { ...body };
  const roles = cleanRoles(body.roles ?? fallback.roles, body.role ?? fallback.role);
  if (!roles.length) throw new AppError('Add at least one role or title.', 422);
  return { ...body, roles, role: roles.join(' · ') };
}

function employeeLocation(employee) {
  return employee.workLocation || [employee.city, employee.country].filter(Boolean).join(', ');
}

function selectableEmployee(employee) {
  return {
    id: employee._id,
    name: employeeName(employee) || 'Employee',
    role: employeeRole(employee),
    photoUrl: employee.profilePhotoUrl || '',
    location: employeeLocation(employee) || '',
    email: employee.companyEmail || employee.personalEmail || ''
  };
}

function memberFromEmployee(employee, displayOrder) {
  const mapped = selectableEmployee(employee);
  const roles = cleanRoles([], mapped.role);
  return {
    source: 'employee',
    employeeId: employee._id,
    name: mapped.name,
    role: roles.join(' · ') || 'Team member',
    roles: roles.length ? roles : ['Team member'],
    photoUrl: mapped.photoUrl,
    location: mapped.location,
    email: mapped.email,
    bio: '',
    linkedinUrl: '',
    displayOrder,
    isPublished: true
  };
}

async function nextDisplayOrder() {
  const highest = await WebsiteTeamMember.findOne({ isDeleted: false }).sort({ displayOrder: -1 }).select('displayOrder').lean();
  return (highest?.displayOrder ?? -1) + 1;
}

function linkedEmployee(member) {
  const value = member?.employeeId;
  if (!value || typeof value !== 'object' || value.employmentStatus === undefined) return null;
  return value;
}

function isActiveLinkedEmployee(member) {
  const employee = linkedEmployee(member);
  if (!member?.employeeId) return true;
  return Boolean(employee) && !employee.isDeleted && employee.employmentStatus === 'ACTIVE';
}

function isPublicPhotoUrl(url) {
  const value = String(url || '').trim();
  if (!value || employeePhotoPath.test(value)) return false;
  return /^https?:\/\//i.test(value) || value.includes('/website-team/photos/');
}

function employeeIdFromPhotoUrl(url) {
  return String(url || '').match(/\/employees\/([a-f0-9]{24})\/photo/i)?.[1] || '';
}

function memberPhotoUrl(member) {
  if (isPublicPhotoUrl(member.photoUrl)) return member.photoUrl;
  const employee = linkedEmployee(member);
  if (employee?.profilePhotoUrl || employeePhotoPath.test(member.photoUrl || '')) {
    return `${String(env.activeAppUrl).replace(/\/$/, '')}/api/v1/website-team/member-photos/${member._id}`;
  }
  return '';
}

function publicMember(member) {
  const roles = cleanRoles(member.roles, member.role);
  return {
    id: member._id,
    name: member.name,
    role: roles.join(' · '),
    roles,
    bio: member.bio || '',
    photoUrl: memberPhotoUrl(member),
    location: member.location || '',
    linkedinUrl: member.linkedinUrl || '',
    displayOrder: member.displayOrder ?? 0
  };
}

async function copyEmployeePhotoToPublic(employee) {
  const filePath = await profilePhotoFilePath('Employee', employee._id);
  if (!filePath) return '';
  try {
    const buffer = await fs.readFile(filePath);
    const stored = await storePublicImage({
      originalname: path.basename(filePath) || 'photo.jpg',
      buffer,
      mimetype: 'image/jpeg'
    }, env.activeAppUrl);
    return stored.photoUrl || '';
  } catch {
    return '';
  }
}

function publicEmployee(employee, displayOrder) {
  const mapped = selectableEmployee(employee);
  const roles = cleanRoles([], mapped.role);
  const origin = String(env.activeAppUrl).replace(/\/$/, '');
  return {
    id: String(employee._id),
    name: mapped.name,
    role: roles.join(' · ') || 'Team member',
    roles: roles.length ? roles : ['Team member'],
    bio: '',
    photoUrl: employee.profilePhotoUrl ? `${origin}/api/v1/website-team/employee-photos/${employee._id}` : '',
    location: mapped.location,
    linkedinUrl: '',
    displayOrder
  };
}

router.get('/public', asyncHandler(async (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendSuccess(res, [], 'Team fetched');
  }
  const employees = await Employee.find({ isDeleted: false, employmentStatus: 'ACTIVE' })
    .populate('department designation', 'name')
    .select('firstName middleName lastName profilePhotoUrl workLocation city country employeeType specialization')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  return sendSuccess(res, employees.map((employee, index) => publicEmployee(employee, index)), 'Team fetched');
}));

router.get('/employee-photos/:id', asyncHandler(async (req, res) => {
  if (objectId.validate(req.params.id).error) throw new AppError('Photo not found', 404);
  const employee = await Employee.findOne({ _id: req.params.id, isDeleted: false, employmentStatus: 'ACTIVE' }).select('_id');
  if (!employee) throw new AppError('Photo not found', 404);
  const photo = await findProfilePhoto('Employee', employee._id);
  return sendProfilePhoto(res, photo, { cacheControl: 'public, max-age=300' });
}));

router.get('/photos/:filename', asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename || '');
  if (!photoName.test(filename)) throw new AppError('Photo not found', 404);
  const filePath = path.join(publicTeamPhotoDir, filename);
  try { await fs.access(filePath); } catch { throw new AppError('Photo not found', 404); }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type(path.extname(filename));
  return res.sendFile(filePath);
}));

router.get('/member-photos/:id', asyncHandler(async (req, res) => {
  if (objectId.validate(req.params.id).error) throw new AppError('Photo not found', 404);
  const member = await WebsiteTeamMember.findOne({ _id: req.params.id, isDeleted: false, isPublished: true })
    .populate('employeeId', 'employmentStatus isDeleted');
  if (!member || !isActiveLinkedEmployee(member)) {
    throw new AppError('Photo not found', 404);
  }
  const employeeId = linkedEmployee(member)?._id || employeeIdFromPhotoUrl(member.photoUrl);
  if (!employeeId) throw new AppError('Photo not found', 404);
  if (!linkedEmployee(member)) {
    const employee = await Employee.findOne({ _id: employeeId, isDeleted: false, employmentStatus: 'ACTIVE' }).select('_id');
    if (!employee) throw new AppError('Photo not found', 404);
  }
  const photo = await findProfilePhoto('Employee', employeeId);
  return sendProfilePhoto(res, photo, { cacheControl: 'public, max-age=300' });
}));

router.use(authenticate, authorize('website:read', 'catalog:read'));

router.get('/', asyncHandler(async (_req, res) => {
  const members = await WebsiteTeamMember.find({ isDeleted: false }).sort({ displayOrder: 1, createdAt: 1 }).lean();
  return sendSuccess(res, members, 'Website team fetched');
}));

router.get('/employees', asyncHandler(async (_req, res) => {
  const linked = await WebsiteTeamMember.find({ isDeleted: false, employeeId: { $ne: null } }).distinct('employeeId');
  const employees = await Employee.find({
    isDeleted: false,
    employmentStatus: { $in: currentEmployeeStatuses },
    _id: { $nin: linked }
  })
    .populate('department designation', 'name')
    .select('firstName middleName lastName profilePhotoUrl companyEmail personalEmail workLocation city country employeeType specialization')
    .sort({ firstName: 1, lastName: 1 })
    .limit(200)
    .lean();
  return sendSuccess(res, employees.map(selectableEmployee), 'Employees available for the website team');
}));

router.post('/photo', authorize('website:write', 'catalog:create'), photoUpload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Choose a photo from your computer.', 422);
  try {
    const stored = await storePublicImage(req.file, env.activeAppUrl);
    return sendSuccess(res, { photoUrl: stored.photoUrl }, 'Photo uploaded');
  } catch (error) {
    throw new AppError(error.message || 'Could not upload this photo.', 502);
  }
}));

router.post('/', authorize('website:write', 'catalog:create'), validate(memberInput), asyncHandler(async (req, res) => {
  const displayOrder = req.body.displayOrder ?? await nextDisplayOrder();
  const member = await WebsiteTeamMember.create({ ...withRoles(req.body), source: 'manual', employeeId: null, displayOrder });
  return sendSuccess(res, member, 'Team member added');
}));

router.post('/from-employees', authorize('website:write', 'catalog:create'), validate(fromEmployeesInput), asyncHandler(async (req, res) => {
  const linked = new Set((await WebsiteTeamMember.find({ isDeleted: false, employeeId: { $in: req.body.ids } }).distinct('employeeId')).map(String));
  const employees = await Employee.find({
    _id: { $in: req.body.ids },
    isDeleted: false,
    employmentStatus: { $in: currentEmployeeStatuses }
  }).populate('department designation', 'name').lean();
  const toAdd = employees.filter((employee) => !linked.has(String(employee._id)));
  if (!toAdd.length) throw new AppError('Those employees are already on the website team, or are not current staff.', 409);
  let displayOrder = await nextDisplayOrder();
  const payloads = [];
  for (const employee of toAdd) {
    const payload = memberFromEmployee(employee, displayOrder++);
    payload.photoUrl = await copyEmployeePhotoToPublic(employee);
    payloads.push(payload);
  }
  const members = await WebsiteTeamMember.insertMany(payloads);
  return sendSuccess(res, members, toAdd.length === 1 ? 'Employee added to the website team' : 'Employees added to the website team');
}));

router.patch('/reorder', authorize('website:write', 'catalog:create'), validate(reorderInput), asyncHandler(async (req, res) => {
  await Promise.all(req.body.ids.map((id, index) => WebsiteTeamMember.updateOne(
    { _id: id, isDeleted: false },
    { $set: { displayOrder: index } }
  )));
  const members = await WebsiteTeamMember.find({ isDeleted: false }).sort({ displayOrder: 1, createdAt: 1 }).lean();
  return sendSuccess(res, members, 'Team order updated');
}));

router.patch('/:id', authorize('website:write', 'catalog:create'), validate(memberInput.fork(['name', 'role'], (schema) => schema.optional())), asyncHandler(async (req, res) => {
  const current = await WebsiteTeamMember.findOne({ _id: req.params.id, isDeleted: false });
  if (!current) throw new AppError('Team member not found', 404);
  Object.assign(current, withRoles(req.body, current));
  await current.save();
  return sendSuccess(res, current, 'Team member updated');
}));

router.delete('/:id', authorize('website:write', 'catalog:create'), asyncHandler(async (req, res) => {
  const member = await WebsiteTeamMember.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: { isDeleted: true, isPublished: false } },
    { new: true }
  );
  if (!member) throw new AppError('Team member not found', 404);
  return sendSuccess(res, null, 'Team member removed');
}));

export default router;
