import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { connectDatabase } from './config/database.js';
import { env, isCorsOriginAllowed } from './config/env.js';
import { AppError } from './utils/errors.js';
import authRoutes from './modules/auth/auth.routes.js';
import employeeRoutes from './modules/employees/employee.routes.js';
import candidateRoutes from './modules/recruitment/candidate.routes.js';
import interviewRoutes from './modules/interviews/interview.routes.js';
import catalogRoutes from './modules/common/catalog.routes.js';
import onboardingRoutes from './modules/onboarding/onboarding.routes.js';
import documentRoutes from './modules/documents/document.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import userRoutes from './modules/users/user.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import emailRoutes from './modules/email/email.routes.js';
import contactRoutes from './modules/contact/contact.routes.js';
import websiteAnalyticsRoutes from './modules/analytics/website-analytics.routes.js';
import websiteTeamRoutes from './modules/website-team/website-team.routes.js';
import websiteProjectRoutes from './modules/website-projects/website-projects.routes.js';
import googleCalendarRoutes from './modules/google/google-calendar.routes.js';
import taskRoutes from './modules/tasks/routes/task.routes.js';
import workLogRoutes from './modules/tasks/routes/workLog.routes.js';
import taskCorrectionRoutes from './modules/tasks/routes/correction.routes.js';
import taskProjectRoutes from './modules/tasks/routes/project.routes.js';
import taskCalendarRoutes from './modules/tasks/routes/calendar.routes.js';
import taskAuditRoutes from './modules/tasks/routes/taskAudit.routes.js';
import taskReportRoutes, { dashboardRouter as taskDashboardRoutes } from './modules/tasks/routes/taskReport.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { startNotificationJobs } from './jobs/notifications.job.js';
import { startTaskJobs } from './jobs/tasks.job.js';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  strictTransportSecurity: false,
  contentSecurityPolicy: false
}));
app.use(cors({
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
  origin(origin, callback) {
    if (isCorsOriginAllowed(origin)) return callback(null, true);
    return callback(new AppError(`CORS origin is not allowed: ${origin}`, 403));
  }
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, validate: { xForwardedForHeader: false, trustProxy: false } }));

const api = '/api/v1';
app.get('/health', (_req, res) => res.json({ success: true, message: 'API is healthy', data: { environment: env.nodeEnv } }));
app.use(`${api}/auth`, authRoutes);
app.use(`${api}/employees`, employeeRoutes);
app.use(`${api}/candidates`, candidateRoutes);
app.use(`${api}/interviews`, interviewRoutes);
app.use(`${api}/catalog`, catalogRoutes);
app.use(`${api}/onboarding`, onboardingRoutes);
app.use(`${api}/documents`, documentRoutes);
app.use(`${api}/notifications`, notificationRoutes);
app.use(`${api}/audit-logs`, auditRoutes);
app.use(`${api}/users`, userRoutes);
app.use(`${api}/dashboard`, dashboardRoutes);
app.use(`${api}/reports`, dashboardRoutes);
app.use(`${api}/email`, emailRoutes);
app.use(`${api}/contact-submissions`, contactRoutes);
app.use(`${api}/website-analytics`, websiteAnalyticsRoutes);
app.use(`${api}/website-team`, websiteTeamRoutes);
app.use(`${api}/website-projects`, websiteProjectRoutes);
app.use(`${api}/google-calendar`, googleCalendarRoutes);
app.use(`${api}/tasks`, taskRoutes);
app.use(`${api}/work-logs`, workLogRoutes);
app.use(`${api}/task-corrections`, taskCorrectionRoutes);
app.use(`${api}/task-projects`, taskProjectRoutes);
app.use(`${api}/task-calendar`, taskCalendarRoutes);
app.use(`${api}/task-audit`, taskAuditRoutes);
app.use(`${api}/task-reports`, taskReportRoutes);
app.use(`${api}/task-dashboard`, taskDashboardRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup({
  openapi: '3.0.0', info: { title: 'Indonor HR CRM API', version: '1.0.0' },
  servers: [{ url: `${env.activeAppUrl}/api/v1` }],
  paths: {
    '/auth/login': { post: { summary: 'Authenticate a CRM user' } },
    '/employees': { get: { summary: 'Search employees' }, post: { summary: 'Create employee' } },
    '/candidates': { get: { summary: 'Search candidates' }, post: { summary: 'Register candidate' } },
    '/interviews': { get: { summary: 'List interviews' }, post: { summary: 'Schedule interview' } },
    '/dashboard': { get: { summary: 'Dashboard analytics' } },
    '/tasks': { get: { summary: 'Search tasks (scoped by role)' }, post: { summary: 'Create task' } },
    '/tasks/{id}': { get: { summary: 'Task details with subtasks, comments, files, links' }, patch: { summary: 'Update task (lock-aware)' }, delete: { summary: 'Remove task created today' } },
    '/tasks/{id}/assign': { post: { summary: 'Assign or reassign task' } },
    '/tasks/{id}/status': { patch: { summary: 'Change status' } },
    '/tasks/{id}/priority': { patch: { summary: 'Change priority' } },
    '/tasks/{id}/subtasks': { get: { summary: 'Subtask tree' }, post: { summary: 'Create subtask' } },
    '/tasks/{id}/comments': { get: { summary: 'List comments' }, post: { summary: 'Add comment (multipart)' } },
    '/tasks/{id}/mentions': { post: { summary: 'Mention employees' } },
    '/tasks/{id}/attachments': { post: { summary: 'Upload files (multipart)' } },
    '/tasks/{id}/urls': { post: { summary: 'Attach URL' } },
    '/tasks/{id}/audit': { get: { summary: 'Task audit timeline' } },
    '/tasks/{id}/corrections': { post: { summary: 'Request correction on a locked task' } },
    '/work-logs/{date}': { get: { summary: 'Daily work log' }, put: { summary: 'Save today\'s log' } },
    '/work-logs/{date}/submit': { post: { summary: 'Submit today\'s log' } },
    '/work-logs/lock/{date}': { post: { summary: 'Finalize a past date' } },
    '/task-corrections': { get: { summary: 'List correction requests' }, post: { summary: 'Request correction' } },
    '/task-corrections/{id}/approve': { post: { summary: 'Approve correction' } },
    '/task-corrections/{id}/reject': { post: { summary: 'Reject correction' } },
    '/task-audit': { get: { summary: 'Append-only task audit history' } },
    '/task-reports/{type}': { get: { summary: 'Task report data' } },
    '/task-reports/{type}/export': { get: { summary: 'Export report (csv, xlsx, pdf)' } }
  }
}));
app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  connectDatabase().then(() => {
    startNotificationJobs();
    startTaskJobs();
    app.listen(env.port, '0.0.0.0', () => {
      process.stdout.write(`HR CRM API listening on ${env.port} (${env.nodeEnv})\n`);
      console.log('[CRM] Backend startup completed');
    });
  }).catch((error) => {
    process.stderr.write(`Database connection failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
