import express from 'express';
import multer from 'multer';
import Joi from 'joi';
import Employee from '../employees/employee.model.js';
import User from '../auth/user.model.js';
import EmailLog from './email.model.js';
import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { pagination, sendSuccess } from '../../utils/response.js';
import { friendlyMailError, mailStatus, sendMail, textToHtml, verifyMailConnection } from '../../services/mailer.service.js';

const router = express.Router();
const MAX_RECIPIENTS = 100;
const MAX_ATTACHMENT_MB = 10;
const allowedAttachments = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_MB * 1024 * 1024, files: 5 },
  fileFilter: (_request, file, callback) => (allowedAttachments.has(file.mimetype)
    ? callback(null, true)
    : callback(new AppError('Only PDF and image attachments are allowed', 422)))
});
const uploadAttachments = (req, res, next) => upload.array('attachments', 5)(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? `Attachments must be ${MAX_ATTACHMENT_MB} MB or smaller.`
      : error.code === 'LIMIT_FILE_COUNT' ? 'Attach at most 5 files.' : error.message;
    return next(new AppError(message, 422));
  }
  return next(error);
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const recipients = (value) => [...new Set((Array.isArray(value) ? value : String(value || '').split(','))
  .map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
const listField = Joi.alternatives().try(Joi.string().allow(''), Joi.array().items(Joi.string()));
const sendSchema = Joi.object({
  to: listField.required(),
  cc: listField.optional(),
  bcc: listField.optional(),
  subject: Joi.string().trim().min(1).max(200).required(),
  body: Joi.string().trim().min(1).max(100000).required(),
  separate: Joi.boolean().default(false)
});

const employeeEmail = (employee) => employee.companyEmail || employee.personalEmail || '';
const fullName = (employee) => [employee.firstName, employee.lastName].filter(Boolean).join(' ');

function personalize(text, person) {
  const name = person?.name || 'there';
  const firstName = person?.firstName || name.split(' ')[0];
  return text.replace(/\{\{\s*name\s*\}\}/gi, name).replace(/\{\{\s*first_?name\s*\}\}/gi, firstName);
}

async function peopleByEmail(emails) {
  const [employees, users] = await Promise.all([
    Employee.find({ isDeleted: false, $or: [{ companyEmail: { $in: emails } }, { personalEmail: { $in: emails } }] }).select('firstName lastName companyEmail personalEmail').lean(),
    User.find({ email: { $in: emails } }).select('name email').lean()
  ]);
  const map = new Map();
  for (const user of users) map.set(user.email, { name: user.name, firstName: String(user.name || '').split(' ')[0] });
  for (const employee of employees) {
    for (const email of [employee.companyEmail, employee.personalEmail].filter(Boolean)) map.set(email, { name: fullName(employee), firstName: employee.firstName });
  }
  return map;
}

function mailError(error) {
  if (error.code === 'NOT_CONFIGURED') return new AppError(error.message, 503);
  return new AppError(friendlyMailError(error), 502);
}

router.use(authenticate, authorize('email:send'));

router.get('/status', asyncHandler(async (_req, res) => sendSuccess(res, mailStatus(), 'Email status fetched')));

router.post('/verify', asyncHandler(async (_req, res) => {
  try {
    await verifyMailConnection();
  } catch (error) {
    throw mailError(error);
  }
  return sendSuccess(res, mailStatus(), 'Mail server connection verified');
}));

router.post('/test', asyncHandler(async (req, res) => {
  const to = String(req.user.email || '').toLowerCase();
  if (!emailPattern.test(to)) throw new AppError('Your CRM account has no valid email address to send a test to', 422);
  const subject = 'Test email from Indonor CRM';
  const body = `Hi ${req.user.name || 'there'},\n\nThis is a test email from the Indonor CRM. If you can read this, email sending is working.\n\nSent through ${env.mail.provider === 'gmail' ? 'Gmail' : env.mail.host}.`;
  try {
    await sendMail({ to, subject, text: body, html: textToHtml(body) });
  } catch (error) {
    await EmailLog.create({ sender: req.user._id, to: [to], subject, mode: 'TEST', status: 'FAILED', failed: [{ email: to, error: friendlyMailError(error) }], provider: env.mail.provider });
    throw mailError(error);
  }
  const log = await EmailLog.create({ sender: req.user._id, to: [to], subject, mode: 'TEST', status: 'SENT', sentCount: 1, provider: env.mail.provider });
  return sendSuccess(res, log, `Test email sent to ${to}`);
}));

router.get('/recipients', asyncHandler(async (_req, res) => {
  const [employees, users] = await Promise.all([
    Employee.find({ isDeleted: false, $or: [{ companyEmail: { $exists: true, $ne: '' } }, { personalEmail: { $exists: true, $ne: '' } }] })
      .select('firstName lastName companyEmail personalEmail employeeRegistrationNumber employmentStatus department')
      .populate('department', 'name')
      .sort({ firstName: 1 }).lean(),
    User.find({ isActive: true }).select('name email role').sort({ name: 1 }).lean()
  ]);
  const employeeRecipients = employees.filter((employee) => employeeEmail(employee)).map((employee) => ({
    id: employee._id,
    label: fullName(employee),
    email: employeeEmail(employee).toLowerCase(),
    group: 'Employees',
    registrationNumber: employee.employeeRegistrationNumber,
    employmentStatus: employee.employmentStatus,
    department: employee.department?.name || ''
  }));
  const seen = new Set(employeeRecipients.map((recipient) => recipient.email));
  const userRecipients = users.filter((user) => user.email && !seen.has(user.email.toLowerCase())).map((user) => ({ id: user._id, label: user.name, email: user.email.toLowerCase(), group: 'CRM users', role: user.role }));
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

router.post('/send', uploadAttachments, asyncHandler(async (req, res) => {
  const { error, value } = sendSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError('Validation failed', 422, error.details);
  const to = recipients(value.to);
  const cc = value.separate ? [] : recipients(value.cc);
  const bcc = value.separate ? [] : recipients(value.bcc);
  const all = [...to, ...cc, ...bcc];
  if (!to.length || all.some((email) => !emailPattern.test(email))) throw new AppError('Please provide valid To, CC and BCC email addresses', 422);
  if (all.length > MAX_RECIPIENTS) throw new AppError(`A message cannot have more than ${MAX_RECIPIENTS} recipients`, 422);

  const files = req.files || [];
  const attachments = files.map((file) => ({ filename: file.originalname, content: file.buffer, contentType: file.mimetype }));
  const replyTo = emailPattern.test(String(req.user.email || '')) ? req.user.email : undefined;
  const base = { sender: req.user._id, to, cc, bcc, subject: value.subject, attachmentNames: files.map((file) => file.originalname), provider: env.mail.provider };

  const failed = [];
  let sentCount = 0;
  let lastError = null;
  if (value.separate) {
    const people = await peopleByEmail(to);
    for (const email of to) {
      const person = people.get(email);
      const text = personalize(value.body, person);
      try {
        await sendMail({ to: email, replyTo, subject: personalize(value.subject, person), text, html: textToHtml(text), attachments });
        sentCount += 1;
      } catch (sendError) {
        if (sendError.code === 'NOT_CONFIGURED') throw mailError(sendError);
        lastError = sendError;
        failed.push({ email, error: friendlyMailError(sendError) });
      }
    }
  } else {
    const text = personalize(value.body, to.length === 1 ? (await peopleByEmail(to)).get(to[0]) : { name: 'Team', firstName: 'Team' });
    try {
      await sendMail({ to, cc, bcc, replyTo, subject: value.subject, text, html: textToHtml(text), attachments });
      sentCount = all.length;
    } catch (sendError) {
      if (sendError.code === 'NOT_CONFIGURED') throw mailError(sendError);
      lastError = sendError;
      failed.push(...all.map((email) => ({ email, error: friendlyMailError(sendError) })));
    }
  }

  const status = failed.length === 0 ? 'SENT' : sentCount > 0 ? 'PARTIAL' : 'FAILED';
  const log = await EmailLog.create({ ...base, mode: value.separate ? 'SEPARATE' : 'TOGETHER', status, sentCount, failed });
  if (status === 'FAILED') throw mailError(lastError);
  const message = status === 'SENT'
    ? (value.separate ? `Email sent to ${sentCount} recipient${sentCount === 1 ? '' : 's'}` : 'Email sent successfully')
    : `Email sent to ${sentCount} of ${to.length} recipients. ${failed.length} failed.`;
  return sendSuccess(res, log, message);
}));

export default router;
