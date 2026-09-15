import express from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import Interview from './interview.model.js';
import Candidate from '../recruitment/candidate.model.js';
import Employee from '../employees/employee.model.js';
import User from '../auth/user.model.js';
import { hasPermission, hasTabAccess } from '../auth/roles.js';
import { History } from '../common/support.model.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { nextRegistrationNumber } from '../../utils/ids.js';
import { pagination, sendSuccess } from '../../utils/response.js';
import { removeInterviewCalendar, syncInterviewCalendar } from '../../services/googleCalendar.service.js';

const router = express.Router();
const objectId = Joi.string().hex().length(24);
const interviewInput = Joi.object({
  candidate: objectId.required(), round: Joi.string().valid('HR', 'TECHNICAL', 'MANAGERIAL', 'FINAL', 'CLIENT', 'SCREENING').required(),
  interviewer: objectId.required(), interviewDate: Joi.date().required(), startTime: Joi.string().allow(''), endTime: Joi.string().allow(''),
  interviewType: Joi.string().allow(''), mode: Joi.string().valid('ONLINE', 'OFFLINE', 'PHONE', 'VIDEO'), technology: Joi.string().allow(''),
  position: Joi.string().allow(''), status: Joi.string().valid('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'),
  result: Joi.string().valid('PENDING', 'PASS', 'FAIL'), resultNotes: Joi.string().allow(''),
  nextInterviewDate: Joi.date(), followUpDate: Joi.date()
}).custom((value, helpers) => {
  if (value.startTime && value.endTime && value.endTime < value.startTime) return helpers.error('any.invalid');
  return value;
}).messages({ 'any.invalid': 'Interview end time cannot be before interview start time' });

const scoreFields = {
  technicalScore: Joi.number().min(0).max(10), communicationScore: Joi.number().min(0).max(10),
  problemSolvingScore: Joi.number().min(0).max(10), overallScore: Joi.number().min(0).max(10)
};
const feedbackInput = Joi.object({
  ...scoreFields, feedback: Joi.string().allow(''),
  recommendation: Joi.string().valid('STRONGLY_RECOMMEND', 'RECOMMEND', 'HOLD', 'NOT_RECOMMENDED').required(),
  result: Joi.string().valid('PASS', 'FAIL')
});
const resultInput = Joi.object({
  result: Joi.string().valid('PASS', 'FAIL').required(), notes: Joi.string().allow(''),
  ...scoreFields, recommendation: Joi.string().valid('STRONGLY_RECOMMEND', 'RECOMMEND', 'HOLD', 'NOT_RECOMMENDED')
});

const recommendationFor = (result) => (result === 'PASS' ? 'RECOMMEND' : 'NOT_RECOMMENDED');

async function withMeet(interview) {
  const [candidate, interviewer] = await Promise.all([
    Candidate.findById(interview.candidate).lean(),
    User.findById(interview.interviewer).select('name email').lean()
  ]);
  await syncInterviewCalendar({ interview, candidate, interviewer });
  await interview.save();
  return interview;
}

function scheduleMessage(interview, taken) {
  if (taken) return 'Taken interview saved successfully';
  if (interview.meetUrl) return 'Interview scheduled. Google Meet was added to your calendar.';
  if (interview.meetError) return `Interview scheduled. ${interview.meetError}`;
  return 'Interview scheduled successfully';
}

function applyResult(interview, { result, notes, userId, technicalScore, communicationScore, problemSolvingScore, overallScore, recommendation, feedback }) {
  interview.result = result;
  interview.resultNotes = notes ?? feedback ?? interview.resultNotes;
  interview.resultRecordedAt = new Date();
  interview.resultRecordedBy = userId;
  interview.status = 'COMPLETED';
  const hasFeedback = [notes, feedback, technicalScore, communicationScore, problemSolvingScore, overallScore, recommendation].some((value) => value !== undefined && value !== '');
  if (hasFeedback) {
    interview.feedbackHistory.push({
      technicalScore, communicationScore, problemSolvingScore, overallScore,
      feedback: notes || feedback || '', recommendation: recommendation || recommendationFor(result), submittedBy: userId
    });
  }
}

async function applyCandidateInterviewStatus(candidateId, result) {
  const candidate = await Candidate.findById(candidateId);
  if (!candidate || candidate.convertedEmployeeId) return;
  if (['JOINED', 'REJECTED', 'WITHDRAWN', 'OFFER_REJECTED'].includes(candidate.status)) return;
  candidate.status = result === 'PASS' ? 'SELECTED' : 'INTERVIEWED';
  await candidate.save();
}

async function recordCandidateOutcome(interview, actorId, eventType, title) {
  await applyCandidateInterviewStatus(interview.candidate, interview.result);
  await History.create({
    entityType: 'Candidate', entityId: interview.candidate, eventType, title,
    metadata: { interviewId: interview._id, result: interview.result, round: interview.round }, actor: actorId
  });
}

async function ownCandidateId(user) {
  if (!user?.employeeId) return null;
  const employee = await Employee.findById(user.employeeId).select('candidateId').lean();
  return employee?.candidateId ? String(employee.candidateId) : null;
}

router.use(authenticate);
router.get('/', asyncHandler(async (req, res) => {
  const canReadAll = hasPermission(req.user, 'interview:read');
  if (!canReadAll && !hasTabAccess(req.user, 'interviews', 'view')) throw new AppError('You do not have permission for this action', 403);
  const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = { isDeleted: false };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.result) filter.result = req.query.result;
  if (!canReadAll) {
    const own = await ownCandidateId(req.user);
    if (!own) return sendSuccess(res, [], 'Interviews fetched', pagination(page, limit, 0));
    if (req.query.candidate && String(req.query.candidate) !== own) throw new AppError('You do not have permission for this action', 403);
    filter.candidate = own;
  } else if (req.query.candidate) {
    if (!mongoose.isValidObjectId(req.query.candidate)) throw new AppError('Invalid candidate', 400);
    filter.candidate = req.query.candidate;
  }
  if (req.query.from || req.query.to) filter.interviewDate = { ...(req.query.from && { $gte: new Date(req.query.from) }), ...(req.query.to && { $lte: new Date(req.query.to) }) };
  const [data, total] = await Promise.all([
    Interview.find(filter).populate('candidate', 'firstName lastName email candidateRegistrationNumber convertedEmployeeId status applyingPosition applyingTrack').populate('interviewer resultRecordedBy', 'name email').sort({ interviewDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Interview.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Interviews fetched', pagination(page, limit, total));
}));

router.post('/', authorize('interview:create'), validate(interviewInput), asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.body.candidate, isDeleted: false });
  if (!candidate) throw new AppError('Candidate not found', 404);
  const taken = ['PASS', 'FAIL'].includes(req.body.result);
  const interview = await Interview.create({
    ...req.body,
    interviewId: await nextRegistrationNumber('interview'),
    createdBy: req.user._id,
    status: taken ? 'COMPLETED' : (req.body.status || 'SCHEDULED'),
    result: req.body.result || 'PENDING',
    resultRecordedAt: taken ? new Date() : undefined,
    resultRecordedBy: taken ? req.user._id : undefined,
    feedbackHistory: taken && req.body.resultNotes ? [{ feedback: req.body.resultNotes, recommendation: recommendationFor(req.body.result), submittedBy: req.user._id }] : []
  });
  if (taken) await recordCandidateOutcome(interview, req.user._id, 'INTERVIEW_RESULT', `${interview.round} interview ${interview.result.toLowerCase()}`);
  else {
    await Candidate.findByIdAndUpdate(candidate._id, { status: 'INTERVIEW_SCHEDULED' });
    await History.create({ entityType: 'Candidate', entityId: candidate._id, eventType: 'INTERVIEW_SCHEDULED', title: `${interview.round} interview scheduled`, metadata: { interviewId: interview._id }, actor: req.user._id });
  }
  if (!taken) await withMeet(interview);
  return sendSuccess(res, interview, scheduleMessage(interview, taken));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const interview = await Interview.findOne({ _id: req.params.id, isDeleted: false })
    .populate('candidate interviewer createdBy updatedBy resultRecordedBy', 'name email firstName lastName candidateRegistrationNumber convertedEmployeeId status applyingPosition applyingTrack')
    .populate('feedbackHistory.submittedBy', 'name email');
  if (!interview) throw new AppError('Interview not found', 404);
  if (!hasPermission(req.user, 'interview:read')) {
    if (!hasTabAccess(req.user, 'interviews', 'view')) throw new AppError('You do not have permission for this action', 403);
    const own = await ownCandidateId(req.user);
    const candidateId = interview.candidate?._id || interview.candidate;
    if (!own || String(candidateId) !== own) throw new AppError('You do not have permission for this action', 403);
  }
  return sendSuccess(res, interview, 'Interview fetched');
}));

router.patch('/:id', authorize('interview:update'), validate(interviewInput.fork(['candidate', 'round', 'interviewer', 'interviewDate'], (schema) => schema.optional())), asyncHandler(async (req, res) => {
  const interview = await Interview.findOne({ _id: req.params.id, isDeleted: false });
  if (!interview) throw new AppError('Interview not found', 404);
  Object.assign(interview, req.body);
  if (['PASS', 'FAIL'].includes(interview.result) && interview.status === 'SCHEDULED') interview.status = 'COMPLETED';
  interview.updatedBy = req.user._id;
  await withMeet(interview);
  await History.create({ entityType: 'Candidate', entityId: interview.candidate, eventType: 'INTERVIEW_UPDATED', title: 'Interview updated', metadata: { interviewId: interview._id, result: interview.result }, actor: req.user._id });
  if (['PASS', 'FAIL'].includes(interview.result)) await applyCandidateInterviewStatus(interview.candidate, interview.result);
  return sendSuccess(res, interview, interview.meetUrl ? 'Interview updated. Google Meet is on your calendar.' : 'Interview updated successfully');
}));

router.delete('/:id', authorize('interview:delete'), asyncHandler(async (req, res) => {
  const interview = await Interview.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { isDeleted: true, updatedBy: req.user._id }, { new: true });
  if (!interview) throw new AppError('Interview not found', 404);
  await removeInterviewCalendar(interview);
  await History.create({ entityType: 'Candidate', entityId: interview.candidate, eventType: 'INTERVIEW_DELETED', title: `${interview.round} interview archived`, metadata: { interviewId: interview._id }, actor: req.user._id });
  return sendSuccess(res, null, 'Interview archived successfully');
}));

router.post('/:id/meet', authorize('interview:update'), asyncHandler(async (req, res) => {
  const interview = await Interview.findOne({ _id: req.params.id, isDeleted: false });
  if (!interview) throw new AppError('Interview not found', 404);
  await withMeet(interview);
  if (!interview.meetUrl) throw new AppError(interview.meetError || 'Could not create Google Meet for this interview.', 422);
  return sendSuccess(res, interview, 'Google Meet was added to your calendar.');
}));

router.post('/:id/result', authorize('interview:update'), validate(resultInput), asyncHandler(async (req, res) => {
  const interview = await Interview.findOne({ _id: req.params.id, isDeleted: false });
  if (!interview) throw new AppError('Interview not found', 404);
  applyResult(interview, { ...req.body, userId: req.user._id });
  interview.updatedBy = req.user._id;
  await interview.save();
  await recordCandidateOutcome(interview, req.user._id, 'INTERVIEW_RESULT', `${interview.round} interview ${interview.result.toLowerCase()}`);
  return sendSuccess(res, interview, 'Interview result saved');
}));

router.post('/:id/feedback', authorize('interview:update'), validate(feedbackInput), asyncHandler(async (req, res) => {
  const interview = await Interview.findOne({ _id: req.params.id, isDeleted: false });
  if (!interview) throw new AppError('Interview not found', 404);
  const result = req.body.result || (req.body.recommendation === 'NOT_RECOMMENDED' ? 'FAIL' : req.body.recommendation === 'HOLD' ? 'PENDING' : 'PASS');
  if (result === 'PENDING') {
    interview.feedbackHistory.push({ ...req.body, submittedBy: req.user._id });
    interview.status = 'COMPLETED';
    interview.updatedBy = req.user._id;
    await interview.save();
    await applyCandidateInterviewStatus(interview.candidate, interview.result);
  } else {
    applyResult(interview, { ...req.body, userId: req.user._id });
    interview.updatedBy = req.user._id;
    await interview.save();
    await applyCandidateInterviewStatus(interview.candidate, interview.result);
  }
  await History.create({ entityType: 'Candidate', entityId: interview.candidate, eventType: 'FEEDBACK_ADDED', title: `${interview.round} feedback recorded`, metadata: { interviewId: interview._id, score: req.body.overallScore, result: interview.result }, actor: req.user._id });
  return sendSuccess(res, interview, 'Interview feedback added');
}));

export default router;
