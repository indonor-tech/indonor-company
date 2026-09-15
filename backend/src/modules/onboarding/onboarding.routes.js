import express from 'express';
import Joi from 'joi';
import Employee from '../employees/employee.model.js';
import { Onboarding } from '../common/support.model.js';
import { authenticate, authorize, authorizeOwnTab } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';

const router = express.Router();
export const defaultOnboardingTasks = [
  'Offer letter', 'Employment agreement', 'Aadhaar / PAN / ID proof', 'Education certificates',
  'Previous employment letters', 'Bank details', 'PF / ESI / UAN', 'Emergency contact',
  'Company email', 'Laptop / device', 'System access', 'Department assignment', 'Manager assignment',
  'Orientation', 'Onboarding completed'
];
const defaultTasks = defaultOnboardingTasks;
router.use(authenticate);
router.get('/:employeeId', authorizeOwnTab('onboarding', 'view', ['employee:read']), asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ _id: req.params.employeeId, isDeleted: false });
  if (!employee) throw new AppError('Employee not found', 404);
  let onboarding = await Onboarding.findOne({ employee: employee._id });
  if (!onboarding) onboarding = await Onboarding.create({ employee: employee._id, tasks: defaultTasks.map((name) => ({ name })) });
  return sendSuccess(res, onboarding, 'Onboarding fetched');
}));
router.patch('/:employeeId/tasks/:taskId', authorizeOwnTab('onboarding', 'edit', ['employee:update']), validate(Joi.object({
  status: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED'),
  notes: Joi.string().allow('')
})), asyncHandler(async (req, res) => {
  const onboarding = await Onboarding.findOne({ employee: req.params.employeeId }); if (!onboarding) throw new AppError('Onboarding not found', 404);
  const task = onboarding.tasks.id(req.params.taskId); if (!task) throw new AppError('Onboarding task not found', 404);
  if (req.body.status) {
    task.status = req.body.status;
    task.completedAt = req.body.status === 'COMPLETED' ? new Date() : undefined;
    task.completedBy = req.user._id;
  }
  if (req.body.notes !== undefined) task.notes = req.body.notes;
  if (onboarding.tasks.length && onboarding.tasks.every((item) => ['COMPLETED', 'NOT_REQUIRED'].includes(item.status))) onboarding.completedAt = new Date();
  else onboarding.completedAt = undefined;
  await onboarding.save(); return sendSuccess(res, onboarding, 'Onboarding task updated');
}));
router.post('/:employeeId/tasks', authorize('employee:update'), validate(Joi.object({ name: Joi.string().trim().min(2).required() })), asyncHandler(async (req, res) => {
  const onboarding = await Onboarding.findOne({ employee: req.params.employeeId });
  if (!onboarding) throw new AppError('Onboarding not found', 404);
  onboarding.tasks.push({ name: req.body.name });
  onboarding.completedAt = undefined;
  await onboarding.save();
  return sendSuccess(res, onboarding, 'Onboarding task added');
}));
export default router;
