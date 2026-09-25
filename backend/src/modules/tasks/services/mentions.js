import mongoose from 'mongoose';
import User from '../../auth/user.model.js';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const collapse = (value) => String(value || '').trim().replace(/\s+/g, ' ');

function mentionPattern(name) {
  return new RegExp(`(^|[^\\w@])@${escapeRegExp(name)}(?![\\w])`, 'i');
}

/**
 * Finds users referenced as @Full Name, @FullName (no spaces) or @FirstName (only when the first name is unique).
 * Pure function so it can be unit-tested without a database.
 */
export function matchMentions(text, users) {
  const body = String(text || '');
  if (!body.includes('@')) return [];
  const firstNameCounts = new Map();
  for (const user of users) {
    const first = collapse(user.name).split(' ')[0]?.toLowerCase();
    if (first) firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);
  }
  const matched = new Set();
  for (const user of users) {
    const full = collapse(user.name);
    if (!full) continue;
    const first = full.split(' ')[0];
    const candidates = [full, full.replace(/\s+/g, '')];
    if (firstNameCounts.get(first.toLowerCase()) === 1) candidates.push(first);
    if (candidates.some((candidate) => mentionPattern(candidate).test(body))) matched.add(String(user._id));
  }
  return [...matched];
}

/** Resolves mentions from free text plus explicitly selected user ids, limited to active users. */
export async function resolveMentions(text, explicitIds = []) {
  const valid = explicitIds.filter((id) => mongoose.isValidObjectId(id)).map(String);
  const hasToken = String(text || '').includes('@');
  if (!hasToken && !valid.length) return [];
  const users = await User.find({ isActive: true }, '_id name').lean();
  const activeIds = new Set(users.map((user) => String(user._id)));
  const fromText = hasToken ? matchMentions(text, users) : [];
  return [...new Set([...fromText, ...valid.filter((id) => activeIds.has(id))])];
}
