import express from 'express';
import nodemailer from 'nodemailer';
import Joi from 'joi';
import ContactSubmission from './contact.model.js';
import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { pagination, sendSuccess } from '../../utils/response.js';

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const contactSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  email: Joi.string().trim().lowercase().email().max(254).required(),
  company: Joi.string().trim().max(120).allow('').default(''),
  subject: Joi.string().trim().min(1).max(160).required(),
  message: Joi.string().trim().min(10).max(4000).required(),
  website: Joi.string().max(200).allow('').optional()
});
const statusSchema = Joi.object({
  status: Joi.string().valid('NEW', 'IN_PROGRESS', 'CONTACTED', 'CLOSED').required()
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function sendNotification(submission) {
  if (!env.mail.host || !env.mail.user || !env.mail.password || !env.mail.from) {
    return { status: 'NOT_CONFIGURED' };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.port === 465,
      auth: { user: env.mail.user, pass: env.mail.password }
    });
    await transporter.sendMail({
      from: env.mail.from,
      to: env.mail.user,
      replyTo: submission.email,
      subject: `[Website contact] ${submission.subject}`,
      text: [
        `Name: ${submission.name}`,
        `Email: ${submission.email}`,
        `Company: ${submission.company || 'Not provided'}`,
        `Subject: ${submission.subject}`,
        '',
        submission.message
      ].join('\n')
    });
    return { status: 'SENT' };
  } catch (error) {
    return { status: 'FAILED', error: error.message };
  }
}

// Public website endpoint. The honeypot is acknowledged without creating a record.
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = contactSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError('Please complete all required fields', 422, error.details);
  if (value.website) return sendSuccess(res, null, 'Message received');
  if (!emailPattern.test(value.email)) throw new AppError('Please enter a valid email address', 422);

  const submission = await ContactSubmission.create({
    name: value.name,
    email: value.email,
    company: value.company,
    subject: value.subject,
    message: value.message
  });
  const notification = await sendNotification(submission);
  submission.notificationStatus = notification.status;
  if (notification.error) submission.notificationError = notification.error;
  await submission.save();
  return sendSuccess(res, { id: submission._id }, 'Thanks — your message was received.');
}));

router.use(authenticate, authorize('contact:read'));

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = {};
  if (['NEW', 'IN_PROGRESS', 'CONTACTED', 'CLOSED'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.q) {
    const search = escapeRegex(String(req.query.q).trim());
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } },
      { subject: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } }
    ];
  }
  const [data, total] = await Promise.all([
    ContactSubmission.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ContactSubmission.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Contact submissions fetched', pagination(page, limit, total));
}));

router.patch('/:id/status', authorize('contact:update'), asyncHandler(async (req, res) => {
  const { error, value } = statusSchema.validate(req.body);
  if (error) throw new AppError('A valid contact status is required', 422, error.details);
  const submission = await ContactSubmission.findByIdAndUpdate(req.params.id, { status: value.status }, { new: true, runValidators: true }).lean();
  if (!submission) throw new AppError('Contact submission not found', 404);
  return sendSuccess(res, submission, 'Contact status updated');
}));

export default router;
