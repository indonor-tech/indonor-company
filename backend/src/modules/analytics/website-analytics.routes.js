import express from 'express';
import Joi from 'joi';
import { WebsiteEvent, WebsiteSession } from './website-analytics.model.js';
import { clientCountry, clientIp, parseUserAgent } from './parse-user-agent.js';
import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { pagination, sendSuccess } from '../../utils/response.js';

const router = express.Router();
const TIME_ZONE = 'Asia/Kolkata';
const SESSION_GAP_MS = 10 * 60 * 1000;
const EVENT_TYPES = ['page_view', 'page_leave', 'click', 'scroll', 'heartbeat', 'session_end', 'form_submit'];
const ingestSchema = Joi.object({
  visitorId: Joi.string().trim().min(8).max(80).required(),
  sessionId: Joi.string().trim().min(8).max(80).required(),
  language: Joi.string().trim().max(40).allow(''),
  timezone: Joi.string().trim().max(80).allow(''),
  screenWidth: Joi.number().min(0).max(10000),
  screenHeight: Joi.number().min(0).max(10000),
  pixelRatio: Joi.number().min(0).max(10),
  referrer: Joi.string().trim().max(1000).allow(''),
  landingPage: Joi.string().trim().max(500).allow(''),
  utm: Joi.object({
    source: Joi.string().trim().max(120).allow(''),
    medium: Joi.string().trim().max(120).allow(''),
    campaign: Joi.string().trim().max(120).allow(''),
    term: Joi.string().trim().max(120).allow(''),
    content: Joi.string().trim().max(120).allow('')
  }),
  events: Joi.array().items(Joi.object({
    type: Joi.string().valid(...EVENT_TYPES).required(),
    path: Joi.string().trim().max(500).allow(''),
    title: Joi.string().trim().max(300).allow(''),
    search: Joi.string().trim().max(500).allow(''),
    hash: Joi.string().trim().max(200).allow(''),
    occurredAt: Joi.date(),
    durationMs: Joi.number().min(0).max(24 * 60 * 60 * 1000),
    scrollPercent: Joi.number().min(0).max(100),
    form: Joi.string().trim().max(80).allow(''),
    click: Joi.object({
      tag: Joi.string().trim().max(40).allow(''),
      id: Joi.string().trim().max(120).allow(''),
      className: Joi.string().trim().max(2000).allow(''),
      text: Joi.string().trim().max(120).allow(''),
      href: Joi.string().trim().max(2000).allow(''),
      x: Joi.number().min(0).max(20000),
      y: Joi.number().min(0).max(20000),
      section: Joi.string().trim().max(120).allow('')
    })
  })).min(1).max(50).required()
});

function ingestAuthorized(req) {
  if (!env.analyticsIngestKey) return true;
  const header = req.get('x-analytics-key') || '';
  const bearer = req.get('authorization')?.startsWith('Bearer ') ? req.get('authorization').slice(7) : '';
  return header === env.analyticsIngestKey || bearer === env.analyticsIngestKey;
}

function dayBounds(days = 14, timeZone = TIME_ZONE) {
  const end = new Date();
  const start = new Date(end.getTime() - (Math.max(Number(days) || 14, 1) * 24 * 60 * 60 * 1000));
  return { start, end, timeZone };
}

function todayBounds(timeZone = TIME_ZONE) {
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  const start = new Date(`${todayKey}T00:00:00.000+05:30`);
  return { start, end: now, todayKey, timeZone };
}

export async function websiteAnalyticsSummary({ days = 14 } = {}) {
  const { start, end, timeZone } = dayBounds(days);
  const { start: todayStart } = todayBounds(timeZone);
  const sessionMatch = { isBot: { $ne: true }, startedAt: { $gte: start, $lte: end } };
  const todayMatch = { isBot: { $ne: true }, startedAt: { $gte: todayStart, $lte: end } };
  const pageMatch = { type: 'page_view', occurredAt: { $gte: start, $lte: end } };
  const todayPageMatch = { type: 'page_view', occurredAt: { $gte: todayStart, $lte: end } };
  const [
    visitsToday, uniqueToday, pageViewsToday, avgDuration, daily, topPages, devices
  ] = await Promise.all([
    WebsiteSession.countDocuments(todayMatch),
    WebsiteSession.distinct('visitorId', todayMatch).then((ids) => ids.length),
    WebsiteEvent.countDocuments(todayPageMatch),
    WebsiteSession.aggregate([
      { $match: todayMatch },
      { $group: { _id: null, avg: { $avg: '$durationMs' } } }
    ]),
    WebsiteSession.aggregate([
      { $match: sessionMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: timeZone } }, visits: { $sum: 1 }, uniqueVisitors: { $addToSet: '$visitorId' } } },
      { $project: { date: '$_id', visits: 1, uniqueVisitors: { $size: '$uniqueVisitors' }, _id: 0 } },
      { $sort: { date: 1 } }
    ]),
    WebsiteEvent.aggregate([
      { $match: pageMatch },
      { $group: { _id: '$path', views: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } },
      { $lookup: {
        from: 'website_events',
        let: { path: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$path', '$$path'] }, { $in: ['$type', ['page_leave', 'heartbeat', 'session_end']] }, { $gte: ['$occurredAt', start] }] } } },
          { $group: { _id: null, avgTime: { $avg: '$durationMs' } } }
        ],
        as: 'time'
      } },
      { $project: { path: '$_id', views: 1, uniqueVisitors: { $size: '$visitors' }, avgTimeMs: { $ifNull: [{ $first: '$time.avgTime' }, 0] }, _id: 0 } },
      { $sort: { views: -1 } },
      { $limit: 8 }
    ]),
    WebsiteSession.aggregate([
      { $match: sessionMatch },
      { $group: { _id: { $ifNull: ['$deviceType', 'unknown'] }, count: { $sum: 1 } } },
      { $project: { device: '$_id', count: 1, _id: 0 } }
    ])
  ]);
  return {
    today: {
      visits: visitsToday,
      uniqueVisitors: uniqueToday,
      pageViews: pageViewsToday,
      avgDurationMs: Math.round(avgDuration[0]?.avg || 0)
    },
    daily,
    topPages,
    devices
  };
}

function summarizePages(events = []) {
  const pages = new Map();
  for (const event of events) {
    const path = event.path || '/';
    const row = pages.get(path) || { path, views: 0, timeMs: 0, clicks: 0, formSubmitted: false };
    if (event.type === 'page_view') row.views += 1;
    if (event.type === 'page_leave' || event.type === 'session_end') row.timeMs += Number(event.durationMs || 0);
    if (event.type === 'heartbeat') row.timeMs = Math.max(row.timeMs, Number(event.durationMs || 0));
    if (event.type === 'click') row.clicks += 1;
    if (event.type === 'form_submit') row.formSubmitted = true;
    pages.set(path, row);
  }
  return [...pages.values()];
}

async function activeSessionFor(visitorId, now) {
  return WebsiteSession.findOne({
    visitorId,
    isBot: { $ne: true },
    lastSeenAt: { $gte: new Date(now.getTime() - SESSION_GAP_MS) }
  }).sort({ lastSeenAt: -1 });
}

router.post('/events', asyncHandler(async (req, res) => {
  if (!ingestAuthorized(req)) throw new AppError('Analytics ingest is not authorized', 401);
  const { error, value } = ingestSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError('Invalid analytics payload', 422, error.details);
  const ip = clientIp(req);
  const userAgent = req.get('user-agent') || '';
  const parsed = parseUserAgent(userAgent);
  if (parsed.isBot) return sendSuccess(res, { stored: 0 }, 'Ignored');
  const now = new Date();
  const active = await activeSessionFor(value.visitorId, now);
  const sessionId = active?.sessionId || value.sessionId;
  const landingPage = active?.landingPage || value.landingPage || value.events.find((event) => event.path)?.path || '/';
  const pagePaths = [...new Set(value.events.filter((event) => event.path).map((event) => event.path))];
  const update = {
    $set: {
      visitorId: value.visitorId,
      ip,
      userAgent,
      language: value.language,
      timezone: value.timezone,
      screenWidth: value.screenWidth,
      screenHeight: value.screenHeight,
      pixelRatio: value.pixelRatio,
      deviceType: parsed.deviceType,
      browser: parsed.browser,
      os: parsed.os,
      country: clientCountry(req) || undefined,
      referrer: value.referrer || active?.referrer,
      utm: value.utm || active?.utm,
      lastSeenAt: now,
      isBot: false
    },
    $setOnInsert: { sessionId, landingPage, startedAt: now },
    $inc: { eventCount: value.events.length }
  };
  if (pagePaths.length) update.$addToSet = { pages: { $each: pagePaths } };
  const session = await WebsiteSession.findOneAndUpdate({ sessionId }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  session.pageCount = (session.pages || []).length;
  session.durationMs = Math.max(0, now.getTime() - new Date(session.startedAt).getTime());
  await session.save();
  await WebsiteEvent.insertMany(value.events.map((event) => ({
    ...event,
    sessionId,
    visitorId: value.visitorId,
    occurredAt: event.occurredAt ? new Date(event.occurredAt) : now,
    ip
  })));
  return sendSuccess(res, { stored: value.events.length, sessionId }, 'Analytics stored');
}));

router.use(authenticate, authorize('analytics:read', 'reports:read'));

router.get('/summary', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  return sendSuccess(res, await websiteAnalyticsSummary({ days }), 'Website analytics fetched');
}));

router.get('/sessions', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const { start } = dayBounds(Number(req.query.days) || 14);
  const filter = { isBot: { $ne: true }, lastSeenAt: { $gte: start } };
  if (req.query.q) {
    const search = String(req.query.q).trim();
    filter.$or = [
      { ip: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { landingPage: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { pages: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { visitorId: search },
      { sessionId: search }
    ];
  }
  const [data, total] = await Promise.all([
    WebsiteSession.find(filter).sort({ lastSeenAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WebsiteSession.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Website sessions fetched', pagination(page, limit, total));
}));

router.get('/sessions/:sessionId', asyncHandler(async (req, res) => {
  const session = await WebsiteSession.findOne({ sessionId: req.params.sessionId }).lean();
  if (!session) throw new AppError('Session not found', 404);
  const events = await WebsiteEvent.find({ sessionId: req.params.sessionId }).sort({ occurredAt: 1 }).lean();
  return sendSuccess(res, { session, pages: summarizePages(events), events }, 'Website session fetched');
}));

export default router;
