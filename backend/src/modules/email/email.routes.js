import express from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import Joi from 'joi';
import Employee from '../employees/employee.model.js';
import User from '../auth/user.model.js';
import EmailLog from './email.model.js';
import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { pagination, sendSuccess } from '../../utils/response.js';

const router = express.Router();
const allowedAttachments = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_request, file, callback) => callback(null, allowedAttachments.has(file.mimetype))
});
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const recipients = (value) => (Array.isArray(value) ? value : String(value || '').split(',')).map((item) => item.trim().toLowerCase()).filter(Boolean);
const sendSchema = Joi.object({
  to: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).required(),
  cc: Joi.alternatives().try(Joi.string().allow(''), Joi.array().items(Joi.string())).optional(),
  subject: Joi.string().trim().min(1).max(200).required(),
  body: Joi.string().trim().min(1).max(100000).required()
});

router.use(authenticate, authorize('email:send'));

router.get('/recipients', asyncHandler(async (_req, res) => {
  const [employees, users] = await Promise.all([
    Employee.find({ isDeleted: false, $or: [{ companyEmail: { $exists: true, $ne: '' } }, { personalEmail: { $exists: true, $ne: '' } }] }).select('firstName lastName companyEmail personalEmail employeeRegistrationNumber').sort({ firstName: 1 }).lean(),
    User.find({ isActive: true }).select('name email role').sort({ name: 1 }).lean()
  ]);
  const employeeRecipients = employees.map((employee) => ({ id: employee._id, label: `${employee.firstName} ${employee.lastName}`, email: employee.companyEmail || employee.personalEmail, group: 'Employees', registrationNumber: employee.employeeRegistrationNumber }));
  const userRecipients = users.map((user) => ({ id: user._id, label: user.name, email: user.email, group: 'CRM users', role: user.role }));
  return sendSuccess(res, [...employeeRecipients, ...userRecipients], 'Email recipients fetched');
}));

router.get('/history', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const [data, total] = await Promise.all([
    EmailLog.find({}).populate('sender', 'name email').sort({ sentAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    EmailLog.countDocuments({})
  ]);
  return sendSuccess(res, data, 'Email history fetched', pagination(page, limit, total));
}));

router.post('/send', upload.array('attachments', 5), asyncHandler(async (req, res) => {
  const { error, value } = sendSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError('Validation failed', 422, error.details);
  const to = recipients(value.to);
  const cc = recipients(value.cc);
  if (!to.length || to.some((email) => !emailPattern.test(email)) || cc.some((email) => !emailPattern.test(email))) {
    throw new AppError('Please provide valid To and CC email addresses', 422);
  }
  if (to.length + cc.length > 50) throw new AppError('A message cannot have more than 50 recipients', 422);
  const files = req.files || [];
  if (files.some((file) => !allowedAttachments.has(file.mimetype))) throw new AppError('Only PDF and image attachments are allowed', 422);
  if (!env.mail.host || !env.mail.user || !env.mail.password || !env.mail.from) throw new AppError('SMTP mail service is not configured', 503);
  const transporter = nodemailer.createTransport({ host: env.mail.host, port: env.mail.port, secure: env.mail.port === 465, auth: { user: env.mail.user, pass: env.mail.password } });
  await transporter.sendMail({
    from: env.mail.from,
    to,
    cc,
    subject: value.subject,
    text: value.body,
    attachments: files.map((file) => ({ filename: file.originalname, content: file.buffer, contentType: file.mimetype }))
  });
  const log = await EmailLog.create({ sender: req.user._id, to, cc, subject: value.subject, attachmentNames: files.map((file) => file.originalname) });
  return sendSuccess(res, log, 'Email sent successfully');
}));

export default router;
