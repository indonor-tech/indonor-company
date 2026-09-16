import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV || 'development';

if (!process.env.SERVER_APP_URL && process.env.RENDER_EXTERNAL_URL) {
  process.env.SERVER_APP_URL = process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
}
if (!process.env.SERVER_APP_URL) {
  process.env.SERVER_APP_URL = 'https://indonor-tech.onrender.com';
}
if (!process.env.SERVER_ADMIN_URL) {
  process.env.SERVER_ADMIN_URL = 'https://indonor-tech.vercel.app';
}

const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
if (nodeEnv !== 'development' && nodeEnv !== 'test') {
  required.push('SERVER_APP_URL', 'SERVER_ADMIN_URL');
  for (const key of required) {
    if (!process.env[key]) throw new Error(`${key} is required in production`);
  }
}

const localAppUrl = process.env.LOCAL_APP_URL || `http://localhost:${process.env.PORT || 5000}`;
const serverAppUrl = process.env.SERVER_APP_URL || '';
const localAdminUrl = process.env.LOCAL_ADMIN_URL || 'http://localhost:5173';
const serverAdminUrl = process.env.SERVER_ADMIN_URL || '';
const useLocalApp = nodeEnv === 'development' || nodeEnv === 'test';
const activeAppUrl = useLocalApp ? localAppUrl : serverAppUrl;
const activeAdminUrl = useLocalApp ? localAdminUrl : serverAdminUrl;
if (nodeEnv !== 'development' && nodeEnv !== 'test' && process.env.MONGODB_TLS_ALLOW_INVALID_CERTS === 'true') {
  console.warn('Ignoring MONGODB_TLS_ALLOW_INVALID_CERTS in production; TLS certificate validation stays enabled.');
}

function originOf(value) {
  try { return new URL(value).origin; } catch { return ''; }
}

function isLocalBrowserOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    return (protocol === 'http:' || protocol === 'https:') && (hostname === 'localhost' || hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

const corsAllowedOrigins = [...new Set([
  process.env.CORS_ALLOWED_ORIGINS,
  process.env.CORS_ORIGIN,
  localAdminUrl,
  serverAdminUrl,
  'https://indonor-tech.vercel.app',
  process.env.LOCAL_SITE_URL || 'http://localhost:3000',
  process.env.SERVER_SITE_URL || 'https://indonortech.com'
].flatMap((value) => (value || '').split(',').map((origin) => originOf(origin.trim())).filter(Boolean)))];

function isVercelAdminOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    return (protocol === 'https:') && hostname === 'indonor-tech.vercel.app';
  } catch {
    return false;
  }
}

export function isCorsOriginAllowed(origin) {
  if (!origin) return true;
  if (corsAllowedOrigins.includes(origin)) return true;
  if (isVercelAdminOrigin(origin)) return true;
  return (nodeEnv === 'development' || nodeEnv === 'test') && isLocalBrowserOrigin(origin);
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 5000),
  localAppUrl,
  serverAppUrl,
  localAdminUrl,
  serverAdminUrl,
  activeAppUrl,
  activeAdminUrl,
  corsAllowedOrigins,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/indonor_hr',
  mongoDnsServers: (process.env.MONGODB_DNS_SERVERS || '').split(',').map((server) => server.trim()).filter(Boolean),
  mongoTlsAllowInvalidCertificates: (nodeEnv === 'development' || nodeEnv === 'test') && process.env.MONGODB_TLS_ALLOW_INVALID_CERTS === 'true',
  accessSecret: process.env.JWT_ACCESS_SECRET || 'development-access-secret',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'development-refresh-secret',
  accessExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '1h',
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || ''
  },
  storageProvider: process.env.FILE_STORAGE_PROVIDER || 'local',
  companyCode: (process.env.COMPANY_CODE || 'INDO').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'INDO',
  analyticsIngestKey: process.env.WEBSITE_ANALYTICS_INGEST_KEY || '',
  localSiteUrl: process.env.LOCAL_SITE_URL || 'http://localhost:3000',
  serverSiteUrl: process.env.SERVER_SITE_URL || 'https://indonortech.com',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || ''
  },
  google: {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || '',
    calendarEmail: process.env.GOOGLE_CALENDAR_EMAIL || 'ghulam.shubhani9909@gmail.com',
    calendarTimeZone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Kolkata',
    callbackUrl: process.env.GOOGLE_CALENDAR_CALLBACK_URL || `${activeAppUrl}/api/v1/google-calendar/callback`
  }
};
