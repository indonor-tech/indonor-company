import mongoose from 'mongoose';
import Employee from '../../employees/employee.model.js';
import User from '../../auth/user.model.js';
import { hasPermission } from '../../auth/roles.js';
import { Task } from '../task.models.js';
import { CLOSED_TASK_STATUSES } from '../task.constants.js';
import { idOf, sameId } from './context.js';
import { isDateLocked } from './workCalendar.service.js';

const teamCache = new WeakMap();

/** User ids of employees whose reporting manager is this user's employee record (Team Lead scope). */
export async function teamUserIds(user) {
  if (!user?.employeeId || !hasPermission(user, 'task:read:team')) return [];
  if (teamCache.has(user)) return teamCache.get(user);
  const reports = await Employee.find({ reportingManager: user.employeeId, isDeleted: false }, '_id').lean();
  const users = reports.length ? await User.find({ employeeId: { $in: reports.map((item) => item._id) } }, '_id').lean() : [];
  const ids = users.map((item) => String(item._id));
  teamCache.set(user, ids);
  return ids;
}

export function canReadAllTasks(user) {
  return hasPermission(user, 'task:read:all');
}

/** MongoDB filter restricting tasks to what the user may see directly. */
export async function taskScopeFilter(user) {
  if (canReadAllTasks(user)) return {};
  const me = new mongoose.Types.ObjectId(String(user._id));
  const or = [
    { owner: me }, { assignee: me }, { createdBy: me }, { assignedBy: me },
    { collaborators: me }, { mentions: me }
  ];
  const team = await teamUserIds(user);
  if (team.length) {
    const teamIds = team.map((id) => new mongoose.Types.ObjectId(id));
    or.push({ owner: { $in: teamIds } }, { assignee: { $in: teamIds } });
  }
  return { $or: or };
}

export function involvement(user, task) {
  const me = idOf(user);
  return {
    isOwner: sameId(task.owner, me),
    isAssignee: sameId(task.assignee, me),
    isCreator: sameId(task.createdBy, me),
    isAssigner: sameId(task.assignedBy, me),
    isCollaborator: (task.collaborators || []).some((id) => sameId(id, me)),
    isMentioned: (task.mentions || []).some((id) => sameId(id, me))
  };
}

async function directlyVisible(user, task) {
  const role = involvement(user, task);
  if (Object.values(role).some(Boolean)) return true;
  const team = await teamUserIds(user);
  return team.includes(idOf(task.owner)) || team.includes(idOf(task.assignee));
}

export async function canViewTask(user, task) {
  if (!task) return false;
  if (canReadAllTasks(user)) return true;
  if (await directlyVisible(user, task)) return true;
  if (task.ancestors?.length) {
    const ancestors = await Task.find({ _id: { $in: task.ancestors } }, 'owner assignee createdBy assignedBy collaborators mentions').lean();
    for (const ancestor of ancestors) {
      if (await directlyVisible(user, ancestor)) return true;
    }
  }
  return false;
}

export async function canAssignTo(user, targetUserId) {
  if (!targetUserId) return true;
  if (sameId(user, targetUserId)) return true;
  if (!hasPermission(user, 'task:assign')) return false;
  if (hasPermission(user, 'task:update:any')) return true;
  return (await teamUserIds(user)).includes(idOf(targetUserId));
}

/**
 * Central permission matrix for a single task. The backend enforces every flag;
 * the same flags are returned to the UI only to hide controls.
 */
export async function taskPermissions(user, task, settings, now = new Date()) {
  const view = await canViewTask(user, task);
  const role = involvement(user, task);
  const manageAny = hasPermission(user, 'task:update:any');
  const team = await teamUserIds(user);
  const leadsOwner = team.includes(idOf(task.owner)) || team.includes(idOf(task.assignee));
  const locked = isDateLocked(task.workDate, settings.timezone, now);
  const closed = CLOSED_TASK_STATUSES.includes(task.corrected?.status || task.status);
  const archived = Boolean(task.isArchived);
  const editor = manageAny || role.isOwner || role.isAssignee || role.isCreator || role.isAssigner || leadsOwner;
  const assignedByOther = task.assignedBy && !sameId(task.assignedBy, user);
  const frozen = locked && closed;
  const reopenRights = manageAny || role.isAssigner || leadsOwner;
  const priorityRights = manageAny || role.isAssigner || leadsOwner || ((role.isOwner || role.isCreator) && !assignedByOther);
  return {
    view,
    locked,
    closed,
    archived,
    editContent: view && editor && !locked && !archived,
    changeStatus: view && (editor || role.isCollaborator) && !archived && (!frozen || reopenRights),
    changePriority: view && priorityRights && !archived && !frozen,
    changeDeadline: view && priorityRights && !archived && !frozen,
    logTime: view && (manageAny || role.isAssignee || role.isOwner) && !archived && !frozen && settings.timeTrackingEnabled,
    assign: view && hasPermission(user, 'task:assign') && (manageAny || role.isOwner || role.isCreator || role.isAssigner || leadsOwner) && !archived && !frozen,
    manageCollaborators: view && editor && !archived && !frozen,
    comment: view && !archived,
    attach: view && (editor || role.isCollaborator) && !archived,
    createSubtask: view && (editor || role.isCollaborator) && !archived && !frozen && (task.depth || 0) + 1 <= settings.maxSubtaskDepth,
    archive: view && (role.isCreator || manageAny) && !locked && !archived,
    requestCorrection: view && locked && (editor || role.isCollaborator),
    ...role
  };
}
