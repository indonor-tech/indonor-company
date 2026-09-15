import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import GoogleCalendarAccount from '../modules/google/google-calendar.model.js';

const DEFAULT_ORGANIZER = 'ghulam.shubhani9909@gmail.com';
const DEFAULT_DURATION_MINUTES = 45;
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email'
];

export function calendarOrganizerEmail() {
  return env.google.calendarEmail || DEFAULT_ORGANIZER;
}

export function calendarTimeZone() {
  return env.google.calendarTimeZone || 'Asia/Kolkata';
}

function oauthClient() {
  if (!env.google.clientId || !env.google.clientSecret) return null;
  return new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.callbackUrl);
}

export function googleCalendarConfigured() {
  return Boolean(env.google.clientId && env.google.clientSecret);
}

export async function googleCalendarStatus() {
  const account = await GoogleCalendarAccount.findOne({ isActive: true }).select('email connectedAt').lean();
  const hasEnvToken = Boolean(env.google.refreshToken);
  return {
    configured: googleCalendarConfigured(),
    connected: Boolean(account || hasEnvToken),
    email: account?.email || (hasEnvToken ? calendarOrganizerEmail() : ''),
    expectedEmail: calendarOrganizerEmail(),
    connectedAt: account?.connectedAt || null
  };
}

export function googleAuthUrl(userId) {
  const client = oauthClient();
  if (!client) throw new AppError('Add GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in the API .env, then restart the backend.', 503);
  const state = jwt.sign({ sub: String(userId), purpose: 'google-calendar' }, env.accessSecret, { expiresIn: '15m' });
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    login_hint: calendarOrganizerEmail()
  });
}

export function verifyGoogleState(state) {
  try {
    const payload = jwt.verify(state, env.accessSecret);
    if (payload.purpose !== 'google-calendar' || !payload.sub) throw new Error('invalid');
    return payload.sub;
  } catch {
    throw new AppError('Google Calendar connection expired. Start Connect again from Settings.', 401);
  }
}

export async function connectGoogleCalendar(code) {
  const client = oauthClient();
  if (!client) throw new AppError('Google Calendar is not configured.', 503);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new AppError('Google did not return a refresh token. Open Google Account > Security > Third-party access, remove Indonor CRM, then connect again.', 422);
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  const email = String(data.email || calendarOrganizerEmail()).toLowerCase();
  await GoogleCalendarAccount.deleteMany({});
  await GoogleCalendarAccount.create({ email, refreshToken: tokens.refresh_token, connectedAt: new Date(), isActive: true });
  return { email };
}

export async function disconnectGoogleCalendar() {
  await GoogleCalendarAccount.deleteMany({});
}

async function calendarApi() {
  const client = oauthClient();
  if (!client) return null;
  const account = await GoogleCalendarAccount.findOne({ isActive: true }).select('+refreshToken email').lean();
  const refreshToken = account?.refreshToken || env.google.refreshToken;
  if (!refreshToken) return null;
  client.setCredentials({ refresh_token: refreshToken });
  return { calendar: google.calendar({ version: 'v3', auth: client }), email: account?.email || calendarOrganizerEmail() };
}

function formatInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

function datePartOf(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function clock(value) {
  const match = String(value || '').match(/^(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

export function interviewScheduleRange(interview) {
  const timeZone = calendarTimeZone();
  const datePart = datePartOf(interview.interviewDate);
  const startTime = clock(interview.startTime);
  if (!datePart || !startTime) return null;
  const endTime = clock(interview.endTime);
  const start = `${datePart}T${startTime}:00`;
  if (endTime && endTime > startTime) return { start, end: `${datePart}T${endTime}:00`, timeZone };
  const offset = timeZone === 'Asia/Kolkata' ? '+05:30' : '+00:00';
  const startMs = Date.parse(`${start}${offset}`);
  if (Number.isNaN(startMs)) return null;
  return { start, end: formatInZone(new Date(startMs + DEFAULT_DURATION_MINUTES * 60000), timeZone), timeZone };
}

function uniqueEmails(values) {
  return [...new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
}

function wantsCalendar(interview) {
  if (!interview?.startTime) return false;
  if (interview.status === 'CANCELLED' || interview.status === 'NO_SHOW') return false;
  if (interview.isDeleted) return false;
  if (interview.status === 'COMPLETED' && ['PASS', 'FAIL'].includes(interview.result) && !interview.calendarEventId) return false;
  return true;
}

function wantsMeet(interview) {
  return wantsCalendar(interview) && !['OFFLINE', 'PHONE'].includes(interview.mode);
}

function eventPayload(interview, candidate, interviewer, { withMeet }) {
  const range = interviewScheduleRange(interview);
  if (!range) return null;
  const candidateName = [candidate?.firstName, candidate?.lastName].filter(Boolean).join(' ') || 'Candidate';
  const role = [candidate?.applyingPosition, candidate?.applyingTrack, interview.technology, interview.position].filter(Boolean).join(' · ');
  const attendees = uniqueEmails([
    calendarOrganizerEmail(),
    candidate?.email,
    interviewer?.email
  ]).map((email) => ({ email }));
  const request = {
    summary: `Indonor interview · ${interview.round} · ${candidateName}`,
    description: [
      `Candidate: ${candidateName}`,
      candidate?.email ? `Email: ${candidate.email}` : '',
      role ? `Role: ${role}` : '',
      `Round: ${interview.round}`,
      interviewer?.name ? `Interviewer: ${interviewer.name}` : '',
      'Created from Indonor CRM.'
    ].filter(Boolean).join('\n'),
    start: { dateTime: range.start, timeZone: range.timeZone },
    end: { dateTime: range.end, timeZone: range.timeZone },
    attendees,
    guestsCanModify: false,
    reminders: { useDefault: true }
  };
  if (withMeet) {
    request.conferenceData = {
      createRequest: {
        requestId: `${interview._id || randomUUID()}-${Date.now()}`.slice(0, 64),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    };
  }
  return request;
}

function meetFromEvent(event = {}) {
  const entry = event.conferenceData?.entryPoints?.find((item) => item.entryPointType === 'video') || event.conferenceData?.entryPoints?.[0];
  return {
    meetUrl: event.hangoutLink || entry?.uri || '',
    calendarEventId: event.id || '',
    calendarHtmlLink: event.htmlLink || '',
    meetError: ''
  };
}

export async function syncInterviewCalendar({ interview, candidate, interviewer }) {
  const api = await calendarApi();
  if (!wantsCalendar(interview)) {
    if (api && interview.calendarEventId) {
      try { await api.calendar.events.delete({ calendarId: 'primary', eventId: interview.calendarEventId, sendUpdates: 'all' }); } catch { /* already removed */ }
    }
    Object.assign(interview, { meetUrl: '', calendarEventId: '', calendarHtmlLink: '', meetError: '' });
    return interview;
  }
  if (!api) {
    interview.meetError = 'Connect Google Calendar in Settings to create a Meet link and calendar event.';
    return interview;
  }
  try {
    const withMeet = wantsMeet(interview) && !interview.meetUrl;
    const body = eventPayload(interview, candidate, interviewer, { withMeet: withMeet || (wantsMeet(interview) && !interview.calendarEventId) });
    if (!body) {
      interview.meetError = 'Add a start time to create Google Meet.';
      return interview;
    }
    if (interview.calendarEventId) {
      const { data } = await api.calendar.events.patch({
        calendarId: 'primary',
        eventId: interview.calendarEventId,
        conferenceDataVersion: withMeet ? 1 : 0,
        sendUpdates: 'all',
        requestBody: body
      });
      Object.assign(interview, meetFromEvent(data));
      return interview;
    }
    const { data } = await api.calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: wantsMeet(interview) ? 1 : 0,
      sendUpdates: 'all',
      requestBody: eventPayload(interview, candidate, interviewer, { withMeet: wantsMeet(interview) })
    });
    Object.assign(interview, meetFromEvent(data));
    return interview;
  } catch (error) {
    const detail = error?.response?.data?.error?.message || error.message || 'Google Calendar request failed';
    interview.meetError = detail;
    return interview;
  }
}

export async function removeInterviewCalendar(interview) {
  if (!interview?.calendarEventId) return;
  const api = await calendarApi();
  if (!api) return;
  try {
    await api.calendar.events.delete({ calendarId: 'primary', eventId: interview.calendarEventId, sendUpdates: 'all' });
  } catch {
    /* event may already be gone */
  }
}
