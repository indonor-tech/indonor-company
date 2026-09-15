import User from '../modules/auth/user.model.js';

const LEGACY_ROLES = {
  HR_ADMIN: 'ADMIN',
  HR_MANAGER: 'MANAGER',
  RECRUITER: 'MANAGER',
  VIEWER: 'EMPLOYEE'
};

export async function migrateCrmRoles() {
  for (const [from, to] of Object.entries(LEGACY_ROLES)) {
    await User.updateMany({ role: from }, { $set: { role: to } });
  }
}
