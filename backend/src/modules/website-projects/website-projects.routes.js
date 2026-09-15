import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import Joi from 'joi';
import WebsiteProject from './website-projects.model.js';
import { defaultWebsiteProjects } from './default-projects.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import { env } from '../../config/env.js';
import { publicProjectMediaDir, storePublicImage, storePublicVideo } from '../../services/fileStorage.service.js';

const router = express.Router();
const objectId = Joi.string().hex().length(24);
const mediaName = /^[0-9a-f-]{36}\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i;
const projectInput = Joi.object({
  title: Joi.string().trim().min(2).max(160).required(),
  client: Joi.string().trim().min(2).max(120).required(),
  summary: Joi.string().trim().min(2).max(800).required(),
  details: Joi.array().items(Joi.string().trim().max(400).allow('')).max(12),
  url: Joi.string().trim().max(500).allow(''),
  tags: Joi.array().items(Joi.string().trim().max(40).allow('')).max(12),
  coverImageUrl: Joi.string().trim().max(2000).allow(''),
  videoType: Joi.string().valid('', 'file', 'youtube', 'vimeo'),
  videoUrl: Joi.string().trim().max(2000).allow(''),
  videoId: Joi.string().trim().max(80).allow(''),
  featured: Joi.boolean(),
  status: Joi.string().valid('COMPLETED', 'IN_PROGRESS'),
  displayOrder: Joi.number().integer().min(0),
  isPublished: Joi.boolean()
});
const reorderInput = Joi.object({
  ids: Joi.array().items(objectId).min(1).required()
});
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) || /\.(jpe?g|png|webp|gif)$/i.test(file.originalname || '')) {
      return callback(null, true);
    }
    callback(new AppError('Upload a JPG, PNG, WEBP, or GIF cover image.', 422));
  }
});
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (/^video\/(mp4|webm|quicktime)$/.test(file.mimetype) || /\.(mp4|webm|mov)$/i.test(file.originalname || '')) {
      return callback(null, true);
    }
    callback(new AppError('Upload an MP4, WEBM, or MOV demo video.', 422));
  }
});

function cleanList(values = []) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function parseExternalVideo(url) {
  const text = String(url || '').trim();
  const youtube = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/i);
  if (youtube) return { videoType: 'youtube', videoId: youtube[1], videoUrl: text };
  const vimeo = text.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return { videoType: 'vimeo', videoId: vimeo[1], videoUrl: text };
  if (text) return { videoType: 'file', videoId: '', videoUrl: text };
  return { videoType: '', videoId: '', videoUrl: '' };
}

function normalizeProject(body) {
  const details = cleanList(body.details);
  const tags = cleanList(body.tags);
  const parsed = body.videoType === 'file' || body.videoId
    ? { videoType: body.videoType || '', videoId: body.videoId || '', videoUrl: body.videoUrl || '' }
    : parseExternalVideo(body.videoUrl);
  return {
    title: body.title,
    client: body.client,
    summary: body.summary,
    details,
    url: body.url || '',
    tags,
    coverImageUrl: body.coverImageUrl || '',
    videoType: parsed.videoType,
    videoUrl: parsed.videoUrl,
    videoId: parsed.videoId,
    featured: body.featured !== false,
    status: body.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'COMPLETED',
    isPublished: body.isPublished !== false
  };
}

function publicVideo(project) {
  if (project.videoType === 'youtube' && project.videoId) return { type: 'youtube', id: project.videoId };
  if (project.videoType === 'vimeo' && project.videoId) return { type: 'vimeo', id: project.videoId };
  if (project.videoUrl) return { type: 'file', src: project.videoUrl };
  return null;
}

function publicProject(project) {
  return {
    id: project._id,
    title: project.title,
    client: project.client,
    summary: project.summary || '',
    details: project.details || [],
    url: project.url || '',
    tags: project.tags || [],
    coverImage: project.coverImageUrl || '',
    video: publicVideo(project),
    featured: project.featured !== false,
    status: project.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'COMPLETED',
    displayOrder: project.displayOrder ?? 0
  };
}

async function ensureDefaultProjects() {
  const existing = await WebsiteProject.find({ isDeleted: false }).select('title url').lean();
  const titles = new Set(existing.map((project) => String(project.title || '').toLowerCase()));
  const urls = new Set(existing.map((project) => String(project.url || '')));
  const missing = defaultWebsiteProjects.filter((project) => !titles.has(project.title.toLowerCase()) && !(project.url && urls.has(project.url)));
  if (!existing.length) {
    await WebsiteProject.insertMany(defaultWebsiteProjects);
    return;
  }
  if (missing.length) {
    const start = existing.length;
    await WebsiteProject.insertMany(missing.map((project, index) => ({
      ...project,
      displayOrder: project.displayOrder ?? start + index
    })));
  }
}

async function nextDisplayOrder() {
  const highest = await WebsiteProject.findOne({ isDeleted: false }).sort({ displayOrder: -1 }).select('displayOrder').lean();
  return (highest?.displayOrder ?? -1) + 1;
}

router.get('/public', asyncHandler(async (_req, res) => {
  await ensureDefaultProjects();
  const projects = await WebsiteProject.find({ isDeleted: false, isPublished: true })
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean();
  return sendSuccess(res, projects.map(publicProject), 'Projects fetched');
}));

router.get('/media/:filename', asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename || '');
  if (!mediaName.test(filename)) throw new AppError('File not found', 404);
  const filePath = path.join(publicProjectMediaDir, filename);
  try { await fs.access(filePath); } catch { throw new AppError('File not found', 404); }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type(path.extname(filename));
  return res.sendFile(filePath);
}));

router.use(authenticate, authorize('website:read', 'catalog:read'));

router.get('/', asyncHandler(async (_req, res) => {
  await ensureDefaultProjects();
  const projects = await WebsiteProject.find({ isDeleted: false }).sort({ displayOrder: 1, createdAt: 1 }).lean();
  return sendSuccess(res, projects, 'Website projects fetched');
}));

router.post('/cover', authorize('website:write', 'catalog:create'), imageUpload.single('cover'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Choose a cover image from your computer.', 422);
  try {
    const stored = await storePublicImage(req.file, env.activeAppUrl, {
      folder: 'indonor/website-projects',
      localDir: publicProjectMediaDir,
      urlPath: '/api/v1/website-projects/media'
    });
    return sendSuccess(res, { coverImageUrl: stored.photoUrl }, 'Cover uploaded');
  } catch (error) {
    throw new AppError(error.message || 'Could not upload this cover image.', 502);
  }
}));

router.post('/video', authorize('website:write', 'catalog:create'), videoUpload.single('video'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Choose a demo video from your computer.', 422);
  try {
    const stored = await storePublicVideo(req.file, env.activeAppUrl);
    return sendSuccess(res, { videoUrl: stored.videoUrl, videoPublicId: stored.videoPublicId, videoType: 'file' }, 'Video uploaded');
  } catch (error) {
    throw new AppError(error.message || 'Could not upload this video to Cloudinary.', 502);
  }
}));

router.post('/', authorize('website:write', 'catalog:create'), validate(projectInput), asyncHandler(async (req, res) => {
  const displayOrder = req.body.displayOrder ?? await nextDisplayOrder();
  const project = await WebsiteProject.create({ ...normalizeProject(req.body), displayOrder });
  return sendSuccess(res, project, 'Project added');
}));

router.patch('/reorder', authorize('website:write', 'catalog:create'), validate(reorderInput), asyncHandler(async (req, res) => {
  await Promise.all(req.body.ids.map((id, index) => WebsiteProject.updateOne(
    { _id: id, isDeleted: false },
    { $set: { displayOrder: index } }
  )));
  const projects = await WebsiteProject.find({ isDeleted: false }).sort({ displayOrder: 1, createdAt: 1 }).lean();
  return sendSuccess(res, projects, 'Project order updated');
}));

router.patch('/:id', authorize('website:write', 'catalog:create'), validate(projectInput.fork(['title', 'client', 'summary'], (schema) => schema.optional())), asyncHandler(async (req, res) => {
  const current = await WebsiteProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!current) throw new AppError('Project not found', 404);
  const merged = {
    title: req.body.title ?? current.title,
    client: req.body.client ?? current.client,
    summary: req.body.summary ?? current.summary,
    details: req.body.details ?? current.details,
    url: req.body.url ?? current.url,
    tags: req.body.tags ?? current.tags,
    coverImageUrl: req.body.coverImageUrl ?? current.coverImageUrl,
    videoType: req.body.videoType ?? current.videoType,
    videoUrl: req.body.videoUrl ?? current.videoUrl,
    videoId: req.body.videoId ?? current.videoId,
    featured: req.body.featured ?? current.featured,
    status: req.body.status ?? current.status,
    isPublished: req.body.isPublished ?? current.isPublished
  };
  Object.assign(current, normalizeProject(merged));
  await current.save();
  return sendSuccess(res, current, 'Project updated');
}));

router.delete('/:id', authorize('website:write', 'catalog:create'), asyncHandler(async (req, res) => {
  const project = await WebsiteProject.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: { isDeleted: true, isPublished: false } },
    { new: true }
  );
  if (!project) throw new AppError('Project not found', 404);
  return sendSuccess(res, null, 'Project removed');
}));

export default router;
