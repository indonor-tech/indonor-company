import { CalendarDay, TaskSettings } from '../task.models.js';
import { DEFAULT_TASK_SETTINGS } from '../task.constants.js';

const SETTINGS_TTL_MS = 30_000;
let settingsCache = null;
let settingsCachedAt = 0;
const formatters = new Map();
const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short'
    }));
  }
  return formatters.get(timeZone);
}

export function zonedParts(date, timeZone) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const pad = (value) => String(value).padStart(2, '0');
  return {
    year, month, day, hour, minute, second,
    weekday: WEEKDAYS[parts.weekday],
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`
  };
}

export function dateKeyInZone(date, timeZone) {
  return zonedParts(date, timeZone).dateKey;
}

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function weekdayOf(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function eachDateKey(from, to) {
  const keys = [];
  for (let key = from; key <= to; key = addDays(key, 1)) keys.push(key);
  return keys;
}

function offsetMs(instant, timeZone) {
  const wholeSecond = Math.floor(instant / 1000) * 1000;
  const parts = zonedParts(new Date(wholeSecond), timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - wholeSecond;
}

export function zonedTimeToUtc(dateKey, hour, minute, timeZone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = offsetMs(guess, timeZone);
  let instant = guess - firstOffset;
  const secondOffset = offsetMs(instant, timeZone);
  if (secondOffset !== firstOffset) instant = guess - secondOffset;
  return new Date(instant);
}

/** First instant (UTC) at which the given working date becomes locked: 00:00:00 of the next day in the company timezone. */
export function lockInstant(dateKey, timeZone) {
  return zonedTimeToUtc(addDays(dateKey, 1), 0, 0, timeZone);
}

export function isDateLocked(dateKey, timeZone, now = new Date()) {
  if (!dateKey) return false;
  return now.getTime() >= lockInstant(dateKey, timeZone).getTime();
}

export function normalizeSettings(stored = {}) {
  const merged = { ...DEFAULT_TASK_SETTINGS };
  for (const key of Object.keys(DEFAULT_TASK_SETTINGS)) {
    if (stored[key] !== undefined && stored[key] !== null) merged[key] = stored[key];
  }
  if (!isValidTimeZone(merged.timezone)) merged.timezone = DEFAULT_TASK_SETTINGS.timezone;
  merged.workingDays = [...new Set((merged.workingDays || []).map(Number).filter((day) => day >= 1 && day <= 7))].sort();
  merged.reminderTimes = [...new Set((merged.reminderTimes || []).filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort();
  return merged;
}

export async function getTaskSettings({ fresh = false } = {}) {
  if (!fresh && settingsCache && Date.now() - settingsCachedAt < SETTINGS_TTL_MS) return settingsCache;
  const stored = await TaskSettings.findOne({ key: 'default' }).lean();
  settingsCache = normalizeSettings(stored || {});
  settingsCachedAt = Date.now();
  return settingsCache;
}

export function invalidateTaskSettings() {
  settingsCache = null;
  settingsCachedAt = 0;
}

export function classifyDay(dateKey, settings, override) {
  const weekday = weekdayOf(dateKey);
  const defaultWorking = settings.workingDays.includes(weekday);
  let dayType = defaultWorking ? 'WORKING' : 'WEEKEND';
  if (override?.type === 'SPECIAL_WORKING_DAY') dayType = 'SPECIAL_WORKING';
  else if (override && ['COMPANY_HOLIDAY', 'PUBLIC_HOLIDAY'].includes(override.type)) dayType = 'HOLIDAY';
  return {
    date: dateKey,
    weekday,
    dayType,
    isWorkingDay: dayType === 'WORKING' || dayType === 'SPECIAL_WORKING',
    calendarDay: override ? { id: override._id, type: override.type, name: override.name, description: override.description } : null
  };
}

export async function getDayInfo(dateKey, settings) {
  const resolved = settings || await getTaskSettings();
  const override = await CalendarDay.findOne({ date: dateKey }).lean();
  return classifyDay(dateKey, resolved, override);
}

export async function getDayInfos(from, to, settings) {
  const resolved = settings || await getTaskSettings();
  const overrides = await CalendarDay.find({ date: { $gte: from, $lte: to } }).lean();
  const byDate = new Map(overrides.map((item) => [item.date, item]));
  return eachDateKey(from, to).map((key) => classifyDay(key, resolved, byDate.get(key)));
}

/** Server-authoritative "today" context. `now` is only overridable from internal callers (jobs/tests), never from HTTP input. */
export async function todayContext(now = new Date()) {
  const settings = await getTaskSettings();
  const parts = zonedParts(now, settings.timezone);
  const day = await getDayInfo(parts.dateKey, settings);
  return {
    now,
    settings,
    timezone: settings.timezone,
    today: parts.dateKey,
    time: parts.time,
    day,
    lockAt: lockInstant(parts.dateKey, settings.timezone)
  };
}
