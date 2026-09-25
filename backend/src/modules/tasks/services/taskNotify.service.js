import User from '../../auth/user.model.js';
import { Notification } from '../../common/support.model.js';
import { hasPermission } from '../../auth/roles.js';
import { idOf, uniqueIds } from './context.js';

/**
 * Sends in-app notifications through the existing Notification collection.
 * The acting user never notifies themselves; inactive users are skipped; `dedupeKey` makes jobs idempotent.
 */
export async function notify(recipients, payload, actor) {
  const actorId = idOf(actor);
  const ids = uniqueIds(recipients).filter((id) => id !== actorId);
  if (!ids.length) return 0;
  const active = await User.find({ _id: { $in: ids }, isActive: true }, '_id').lean();
  if (!active.length) return 0;
  const base = {
    type: payload.type,
    title: payload.title,
    message: payload.message,
    entityType: payload.entityType,
    entityId: payload.entityId,
    link: payload.link,
    dueDate: payload.dueDate,
    actor: actorId || undefined
  };
  if (payload.dedupeKey) {
    const result = await Notification.bulkWrite(active.map(({ _id }) => {
      const dedupeKey = `${payload.dedupeKey}:${_id}`;
      return { updateOne: { filter: { dedupeKey }, update: { $setOnInsert: { ...base, recipient: _id, dedupeKey } }, upsert: true } };
    }));
    return result.upsertedCount || 0;
  }
  await Notification.insertMany(active.map(({ _id }) => ({ ...base, recipient: _id })));
  return active.length;
}

export async function usersWithPermission(permission) {
  const users = await User.find({ isActive: true }).lean();
  return users.filter((user) => hasPermission(user, permission)).map((user) => user._id);
}

export const taskLink = (task) => `/tasks/${idOf(task)}`;
export const taskLabel = (task) => `${task.taskKey ? `${task.taskKey} · ` : ''}${task.title}`;
