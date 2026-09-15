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
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { startNotificationJobs } from './jobs/notifications.job.js';

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
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup({
  openapi: '3.0.0', info: { title: 'Indonor HR CRM API', version: '1.0.0' },
  servers: [{ url: `${env.activeAppUrl}/api/v1` }],
  paths: {
    '/auth/login': { post: { summary: 'Authenticate a CRM user' } },
    '/employees': { get: { summary: 'Search employees' }, post: { summary: 'Create employee' } },
    '/candidates': { get: { summary: 'Search candidates' }, post: { summary: 'Register candidate' } },
    '/interviews': { get: { summary: 'List interviews' }, post: { summary: 'Schedule interview' } },
    '/dashboard': { get: { summary: 'Dashboard analytics' } }
  }
}));
app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  connectDatabase().then(() => {
    startNotificationJobs();
    app.listen(env.port, '0.0.0.0', () => {
      process.stdout.write(`HR CRM API listening on ${env.port} (${env.nodeEnv})\n`);
      console.log('[CRM] Backend startup completed');
    });
  }).catch((error) => {
    process.stderr.write(`Database connection failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
