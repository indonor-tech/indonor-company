import express from 'express';
import Employee from '../employees/employee.model.js';
import Candidate from '../recruitment/candidate.model.js';
import Interview from '../interviews/interview.model.js';
import { websiteAnalyticsSummary } from '../analytics/website-analytics.routes.js';
import { CrmClient, CrmInvoice, CrmLead, CrmPayment, CrmProject, FollowUp } from '../crm/crm.models.js';
import { computePartnershipSettlement } from '../crm/crm.partnership.js';
import { summarizePartnerDues } from '../crm/crm.dues.js';
import { moneyAmount } from '../crm/crm.helpers.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { hasPermission, normalizeRole, SELF_SERVICE_ROLES } from '../auth/roles.js';

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
  if (SELF_SERVICE_ROLES.includes(normalizeRole(req.user.role))) {
    return sendSuccess(res, await employeeHome(req.user), 'Your dashboard fetched');
  }
  if (!hasPermission(req.user, 'reports:read')) throw new AppError('You do not have permission for this action', 403);
  const active = { isDeleted: false };
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const canCrm = hasPermission(req.user, 'crm:leads:read');
  const canFinance = hasPermission(req.user, 'crm:finance:read');
  const [employeeStats, candidateStats, interviewStats, interviewResults, byDepartment, byType, website, crmBundle] = await Promise.all([
    Employee.aggregate([{ $match: active }, { $group: { _id: '$employmentStatus', count: { $sum: 1 } } }]),
    Candidate.aggregate([{ $match: active }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Interview.aggregate([{ $match: active }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Interview.aggregate([{ $match: active }, { $group: { _id: { $ifNull: ['$result', 'PENDING'] }, count: { $sum: 1 } } }]),
    Employee.aggregate([{ $match: active }, { $group: { _id: '$department', count: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } }, { $project: { name: { $ifNull: [{ $first: '$department.name' }, 'Unassigned'] }, count: 1 } }]),
    Employee.aggregate([{ $match: active }, { $group: { _id: '$employeeType', count: { $sum: 1 } } }]),
    websiteAnalyticsSummary({ days: 14 }).catch(() => null),
    canCrm ? Promise.all([
      CrmLead.countDocuments({ isDeleted: false, isArchived: { $ne: true } }),
      CrmLead.countDocuments({ isDeleted: false, status: { $in: ['WON', 'CONVERTED'] } }),
      CrmClient.countDocuments({ isDeleted: false }),
      CrmProject.countDocuments({ isDeleted: false, status: { $in: ['ACTIVE', 'IN_PROGRESS'] } }),
      FollowUp.countDocuments({ isDeleted: false, status: 'PENDING', nextFollowUpDate: { $lt: start } }),
      canFinance ? CrmInvoice.aggregate([
        { $match: { isDeleted: false, status: { $nin: ['CANCELLED', 'DRAFT'] } } },
        { $group: { _id: null, invoiced: { $sum: '$totalAmount' }, paid: { $sum: '$amountPaid' } } }
      ]) : Promise.resolve([]),
      canFinance ? CrmPayment.aggregate([
        { $match: { isDeleted: false, $or: [{ status: 'CONFIRMED' }, { status: { $exists: false } }, { status: null }] } },
        { $group: { _id: null, received: { $sum: '$amount' } } }
      ]) : Promise.resolve([]),
      canFinance ? CrmProject.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, outstanding: { $sum: '$outstanding' }, overdue: { $sum: { $cond: [{ $and: [{ $gt: ['$outstanding', 0] }, { $lt: ['$nextPaymentDueDate', start] }] }, '$outstanding', 0] } } } }
      ]) : Promise.resolve([]),
      canFinance ? CrmProject.find({ isDeleted: false }).lean() : Promise.resolve([])
    ]).then(async ([leads, won, clients, activeProjects, overdueFollowUps, invoiceAgg, paymentAgg, projectAgg, financeProjects]) => {
      const partnership = {
        companyEntitlement: 0, companyInvoiced: 0, companyReceived: 0, companyRemaining: 0,
        partnerOutstanding: 0, referralDue: 0, expenses: 0, profit: 0
      };
      for (const project of financeProjects || []) {
        const row = await computePartnershipSettlement(project);
        partnership.companyEntitlement += row.company.entitlement;
        partnership.companyInvoiced += row.company.invoiced;
        partnership.companyReceived += row.company.received;
        partnership.companyRemaining += row.company.remaining;
        partnership.partnerOutstanding += row.partners.reduce((sum, partner) => sum + partner.outstanding, 0);
        partnership.referralDue += row.referral.outstanding;
        partnership.expenses += row.expenses;
        partnership.profit += row.profit;
      }
      Object.keys(partnership).forEach((key) => { partnership[key] = moneyAmount(partnership[key]); });
      return {
      leads,
      won,
      conversionRate: leads ? Number(((won / leads) * 100).toFixed(1)) : null,
      clients,
      activeProjects,
      overdueFollowUps,
      finance: canFinance ? {
        totalInvoiced: invoiceAgg[0]?.invoiced ?? 0,
        totalPaid: invoiceAgg[0]?.paid ?? paymentAgg[0]?.received ?? 0,
        outstanding: projectAgg[0]?.outstanding ?? Math.max(0, (invoiceAgg[0]?.invoiced ?? 0) - (invoiceAgg[0]?.paid ?? 0)),
        overduePayments: projectAgg[0]?.overdue ?? 0,
        partnership,
        partnerDues: await summarizePartnerDues()
      } : null
    };
    }) : Promise.resolve(null)
  ]);
  const groupToObject = (rows) => Object.fromEntries(rows.map((row) => [row._id || 'UNKNOWN', row.count]));
  return sendSuccess(res, {
    employees: groupToObject(employeeStats), candidates: groupToObject(candidateStats), interviews: groupToObject(interviewStats),
    interviewResults: groupToObject(interviewResults),
    byDepartment, byEmploymentType: byType, website,
    crm: crmBundle,
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
