import express from 'express';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { sendSuccess } from '../../../utils/response.js';
import { requestContext } from '../services/context.js';
import { recordAudit } from '../services/taskAudit.service.js';
import { adminDashboard, buildReport, employeeDashboard, REPORT_TYPES, reportToCsv, reportToPdf, reportToXlsx } from '../services/taskReports.service.js';
import { contentDisposition, exportLimiter } from './routeUtils.js';

export const dashboardRouter = express.Router();
dashboardRouter.use(authenticate, authorize('task:read'));
dashboardRouter.get('/me', asyncHandler(async (req, res) => sendSuccess(res, await employeeDashboard(requestContext(req)), 'Dashboard fetched')));
dashboardRouter.get('/admin', authorize('task:reports:read'), asyncHandler(async (req, res) => sendSuccess(res, await adminDashboard(requestContext(req), req.query), 'Dashboard fetched')));

const router = express.Router();
router.use(authenticate, authorize('task:reports:read'));

router.get('/', (_req, res) => sendSuccess(res, REPORT_TYPES, 'Report types'));

router.get('/:type', asyncHandler(async (req, res) => {
  const report = await buildReport(requestContext(req), req.params.type, req.query);
  return sendSuccess(res, report, 'Report generated');
}));

const FORMATS = {
  csv: { type: 'text/csv; charset=utf-8', ext: 'csv', render: async (report) => `\uFEFF${reportToCsv(report)}` },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', render: reportToXlsx },
  pdf: { type: 'application/pdf', ext: 'pdf', render: reportToPdf }
};

router.get('/:type/export', authorize('task:reports:export'), exportLimiter, asyncHandler(async (req, res) => {
  const format = FORMATS[String(req.query.format || 'csv').toLowerCase()];
  if (!format) throw new AppError('Choose csv, xlsx or pdf.', 422);
  const ctx = requestContext(req);
  const report = await buildReport(ctx, req.params.type, { ...req.query, export: true });
  const body = await format.render(report);
  await recordAudit(ctx, { action: 'REPORT_EXPORTED', recordType: 'Report', newValue: { type: report.type, format: format.ext, rows: report.rows.length }, meta: { query: req.query } });
  res.setHeader('Content-Type', format.type);
  res.setHeader('Content-Disposition', contentDisposition(`${report.type}-report-${new Date().toISOString().slice(0, 10)}.${format.ext}`));
  return res.send(body);
}));

export default router;
