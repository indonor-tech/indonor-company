/**
 * Securely ensures a VIEW_ADMIN account exists for view@admin.com.
 * Does NOT hardcode a password. Uses VIEW_ADMIN_BOOTSTRAP_PASSWORD from env
 * only when creating a brand-new account, and forces password reset on first login.
 *
 * Usage (from backend/):
 *   VIEW_ADMIN_BOOTSTRAP_PASSWORD="..." node scripts/ensure-view-admin.js
 */
import crypto from 'node:crypto';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import User from '../src/modules/auth/user.model.js';
import Employee from '../src/modules/employees/employee.model.js';
import { ViewAdminPagePermission } from '../src/modules/crm/crm.models.js';
import { nextRegistrationNumber } from '../src/utils/ids.js';

const EMAIL = 'view@admin.com';
const DEFAULT_PAGES = ['dashboard', 'leads', 'clients', 'projects', 'employees', 'tasks'];

async function main() {
  await connectDatabase();
  let user = await User.findOne({ email: EMAIL });
  if (user) {
    if (user.role !== 'VIEW_ADMIN') {
      user.role = 'VIEW_ADMIN';
      user.permissions = [];
      await user.save();
      console.log(`Updated existing user ${EMAIL} to VIEW_ADMIN (password unchanged).`);
    } else {
      console.log(`VIEW_ADMIN ${EMAIL} already exists (password unchanged).`);
    }
  } else {
    const bootstrap = process.env.VIEW_ADMIN_BOOTSTRAP_PASSWORD;
    if (!bootstrap || bootstrap.length < 12) {
      throw new Error('Set VIEW_ADMIN_BOOTSTRAP_PASSWORD (min 12 chars) to create view@admin.com');
    }
    const employeeId = await nextRegistrationNumber('employee');
    const employee = await Employee.create({
      employeeRegistrationNumber: employeeId,
      firstName: 'View',
      lastName: 'Admin',
      companyEmail: EMAIL,
      personalEmail: EMAIL,
      employmentStatus: 'ACTIVE',
      employeeType: 'FULL_TIME'
    });
    user = await User.create({
      name: 'View Admin',
      email: EMAIL,
      role: 'VIEW_ADMIN',
      permissions: [],
      pageAccess: Object.fromEntries(DEFAULT_PAGES.map((key) => [key, true])),
      employeeId: employee._id,
      isActive: true,
      passwordHash: await User.hashPassword(bootstrap),
      // Force reset on first login via existing reset token flow
      resetTokenHash: crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'),
      resetTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log(`Created VIEW_ADMIN ${EMAIL} linked to employee ${employeeId}.`);
    console.log('Deliver the bootstrap password through a secure channel and require a password change.');
  }

  for (const pageKey of DEFAULT_PAGES) {
    await ViewAdminPagePermission.findOneAndUpdate(
      { userId: user._id, pageKey },
      {
        $set: {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          grantedAt: new Date()
        }
      },
      { upsert: true }
    );
  }
  user.pageAccess = Object.fromEntries(DEFAULT_PAGES.map((key) => [key, true]));
  await user.save();
  console.log(`Granted view pages: ${DEFAULT_PAGES.join(', ')}`);
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error(error.message || error);
  try { await disconnectDatabase(); } catch { /* ignore */ }
  process.exitCode = 1;
});
