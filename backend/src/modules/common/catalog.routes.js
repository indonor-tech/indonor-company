import express from 'express';
import Joi from 'joi';
import { Department, Designation, Technology, Track } from './catalog.model.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { pagination, sendSuccess } from '../../utils/response.js';

const router = express.Router();
const input = Joi.object({ name: Joi.string().trim().min(2).required(), description: Joi.string().allow('') });
const models = { departments: Department, designations: Designation, technologies: Technology, tracks: Track };
const defaultTracks = ['Frontend', 'Backend', 'Full Stack', 'UI/UX', 'Python', 'Java', 'AI/ML', 'Data Science', 'Mobile', 'DevOps', 'QA', 'Cloud', 'Product', 'HR', 'Marketing', 'Sales', 'Operations', 'Content', 'Finance', 'Support'];

async function ensureTracks() {
  await Track.bulkWrite(defaultTracks.map((name) => ({
    updateOne: { filter: { name }, update: { $setOnInsert: { name, isActive: true, isDeleted: false } }, upsert: true }
  })));
}
router.use(authenticate);
router.get('/:type', authorize('catalog:read'), asyncHandler(async (req, res) => {
  const Model = models[req.params.type]; if (!Model) return res.status(404).json({ success: false, message: 'Catalog not found', errors: [] });
  if (req.params.type === 'tracks') await ensureTracks();
  const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const filter = { isDeleted: false, ...(req.query.q && { name: new RegExp(req.query.q, 'i') }) };
  const [data, total] = await Promise.all([Model.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(), Model.countDocuments(filter)]);
  return sendSuccess(res, data, `${req.params.type} fetched`, pagination(page, limit, total));
}));
router.post('/:type', authorize('catalog:create'), validate(input), asyncHandler(async (req, res) => {
  const Model = models[req.params.type]; if (!Model) return res.status(404).json({ success: false, message: 'Catalog not found', errors: [] });
  return sendSuccess(res, await Model.create(req.body), `${req.params.type} created`);
}));
export default router;
