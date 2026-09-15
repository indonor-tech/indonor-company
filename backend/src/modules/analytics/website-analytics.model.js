import mongoose from 'mongoose';

const utmSchema = new mongoose.Schema({
  source: String, medium: String, campaign: String, term: String, content: String
}, { _id: false });

const clickSchema = new mongoose.Schema({
  tag: String, id: String, className: String, text: String, href: String, x: Number, y: Number, section: String
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, unique: true, index: true },
  ip: { type: String, index: true },
  userAgent: String,
  language: String,
  timezone: String,
  screenWidth: Number,
  screenHeight: Number,
  pixelRatio: Number,
  deviceType: String,
  browser: String,
  os: String,
  country: String,
  referrer: String,
  landingPage: String,
  utm: utmSchema,
  startedAt: { type: Date, default: Date.now, index: true },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  durationMs: { type: Number, default: 0 },
  pageCount: { type: Number, default: 0 },
  eventCount: { type: Number, default: 0 },
  pages: { type: [String], default: [] },
  isBot: { type: Boolean, default: false, index: true }
}, { timestamps: true });

sessionSchema.index({ startedAt: 1, isBot: 1 });

const eventSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  visitorId: { type: String, required: true, index: true },
  type: { type: String, enum: ['page_view', 'page_leave', 'click', 'scroll', 'heartbeat', 'session_end', 'form_submit'], required: true, index: true },
  path: { type: String, index: true },
  title: String,
  search: String,
  hash: String,
  form: String,
  occurredAt: { type: Date, default: Date.now, index: true },
  durationMs: Number,
  scrollPercent: Number,
  click: clickSchema,
  ip: String
}, { timestamps: true });

eventSchema.index({ path: 1, type: 1, occurredAt: 1 });
eventSchema.index({ visitorId: 1, occurredAt: 1 });

export const WebsiteSession = mongoose.model('WebsiteSession', sessionSchema, 'website_sessions');
export const WebsiteEvent = mongoose.model('WebsiteEvent', eventSchema, 'website_events');
