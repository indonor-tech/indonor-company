import express from 'express';
import Employee from '../employees/employee.model.js';
import Candidate from '../recruitment/candidate.model.js';
import Interview from '../interviews/interview.model.js';
import { websiteAnalyticsSummary } from '../analytics/website-analytics.routes.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { hasPermission, normalizeRole } from '../auth/roles.js';

const router = express.Router();
const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

async function employeeHome(user) {
  if (!user.employeeId) {
    return { kind: 'employee', linked: false, employee: null };
  }
  const employee = await Employee.findOne({ _id: user.employeeId, isDeleted: false })
    .populate('department designation', 'name')
    .select('firstName lastName companyEmail personalEmail employmentStatus joiningDate workLocation employeeType')
    .lean();
  if (!employee) return { kind: 'employee', linked: false, employee: null };
  return {
    kind: 'employee',
    linked: true,
    employee: {
      id: employee._id,
      name: [employee.firstName, employee.lastName].filter(Boolean).join(' '),
      email: employee.companyEmail || employee.personalEmail || user.email,
      status: employee.employmentStatus,
      type: employee.employeeType,
      department: employee.department?.name || '',
      designation: employee.designation?.name || '',
      joiningDate: employee.joiningDate,
      workLocation: employee.workLocation || ''
    }
  };
}

router.get('/', authenticate, asyncHandler(async (req, res) => {
  if (normalizeRole(req.user.role) === 'EMPLOYEE') {
    return sendSuccess(res, await employeeHome(req.user), 'Your dashboard fetched');
  }
  if (!hasPermission(req.user, 'reports:read')) throw new AppError('You do not have permission for this action', 403);
  const active = { isDeleted: false };
  const [employeeStats, candidateStats, interviewStats, interviewResults, byDepartment, byType, website] = await Promise.all([
    Employee.aggregate([{ $match: active }, { $group: { _id: '$employmentStatus', count: { $sum: 1 } } }]),
    Candidate.aggregate([{ $match: active }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Interview.aggregate([{ $match: active }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Interview.aggregate([{ $match: active }, { $group: { _id: { $ifNull: ['$result', 'PENDING'] }, count: { $sum: 1 } } }]),
    Employee.aggregate([{ $match: active }, { $group: { _id: '$department', count: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } }, { $project: { name: { $ifNull: [{ $first: '$department.name' }, 'Unassigned'] }, count: 1 } }]),
    Employee.aggregate([{ $match: active }, { $group: { _id: '$employeeType', count: { $sum: 1 } } }]),
    websiteAnalyticsSummary({ days: 14 }).catch(() => null)
  ]);
  const groupToObject = (rows) => Object.fromEntries(rows.map((row) => [row._id || 'UNKNOWN', row.count]));
  return sendSuccess(res, {
    employees: groupToObject(employeeStats), candidates: groupToObject(candidateStats), interviews: groupToObject(interviewStats),
    interviewResults: groupToObject(interviewResults),
    byDepartment, byEmploymentType: byType, website,
    totalEmployees: employeeStats.reduce((sum, row) => sum + row.count, 0), totalCandidates: candidateStats.reduce((sum, row) => sum + row.count, 0)
  }, 'Dashboard metrics fetched');
}));
router.get('/exports/:type', authenticate, authorize('reports:read'), asyncHandler(async (req, res) => {
  const query = { isDeleted: false };
  const definitions = {
    employees: { model: Employee, fields: ['employeeRegistrationNumber', 'firstName', 'lastName', 'companyEmail', 'employeeType', 'specialization', 'employmentStatus', 'joiningDate'] },
    candidates: { model: Candidate, fields: ['candidateRegistrationNumber', 'firstName', 'lastName', 'email', 'applyingPosition', 'applyingTrack', 'status', 'source'] },
    interviews: { model: Interview, fields: ['interviewId', 'candidate', 'round', 'interviewDate', 'status', 'result', 'technology'] }
  };
  const definition = definitions[req.params.type];
  if (!definition) return res.status(404).json({ success: false, message: 'Export type not found', errors: [] });
  const rows = await definition.model.find(query).limit(10000).lean();
  const csv = [definition.fields, ...rows.map((row) => definition.fields.map((field) => row[field]))].map((row) => row.map(csvValue).join(',')).join('\n');
  res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${req.params.type}.csv"` });
  return res.send(csv);
}));
export default router;
