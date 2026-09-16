import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/app.js');

test('health endpoint reports service availability', async () => {
  const response = await request(app).get('/health');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
});

test('configured admin origin receives CORS headers', async () => {
  const response = await request(app).get('/health').set('Origin', 'http://localhost:5173');
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
});

test('local Vite fallback origin receives CORS headers', async () => {
  const response = await request(app).get('/health').set('Origin', 'http://localhost:5174');
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5174');
});

test('production Vercel admin origin receives CORS headers', async () => {
  const response = await request(app).get('/health').set('Origin', 'https://indonor-tech.vercel.app');
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'https://indonor-tech.vercel.app');
  assert.equal(response.headers['access-control-allow-credentials'], 'true');
});

test('unknown API routes use the consistent error shape', async () => {
  const response = await request(app).get('/api/v1/does-not-exist');
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.success, false);
  assert.equal(Array.isArray(response.body.errors), true);
});

test('website analytics ingest rejects an empty payload', async () => {
  const response = await request(app).post('/api/v1/website-analytics/events').send({});
  assert.equal(response.statusCode, 422);
});

test('website analytics summary requires authentication', async () => {
  const response = await request(app).get('/api/v1/website-analytics/summary');
  assert.equal(response.statusCode, 401);
});

test('admin website team list requires authentication', async () => {
  const response = await request(app).get('/api/v1/website-team');
  assert.equal(response.statusCode, 401);
});

test('adding website team members from employees requires authentication', async () => {
  const response = await request(app).post('/api/v1/website-team/from-employees').send({ ids: ['000000000000000000000000'] });
  assert.equal(response.statusCode, 401);
});

test('website team photo upload requires authentication', async () => {
  const response = await request(app).post('/api/v1/website-team/photo');
  assert.equal(response.statusCode, 401);
});

test('missing website team photos are public 404s', async () => {
  const response = await request(app).get('/api/v1/website-team/photos/00000000-0000-0000-0000-000000000000.jpg');
  assert.equal(response.statusCode, 404);
});

test('public website team does not require authentication', async () => {
  const response = await request(app).get('/api/v1/website-team/public');
  assert.notEqual(response.statusCode, 401);
  assert.equal(Array.isArray(response.body.data), true);
});

test('invalid website team member photo ids are public 404s', async () => {
  const response = await request(app).get('/api/v1/website-team/member-photos/not-a-photo');
  assert.equal(response.statusCode, 404);
});

test('invalid website team employee photo ids are public 404s', async () => {
  const response = await request(app).get('/api/v1/website-team/employee-photos/not-a-photo');
  assert.equal(response.statusCode, 404);
});

test('admin website projects list requires authentication', async () => {
  const response = await request(app).get('/api/v1/website-projects');
  assert.equal(response.statusCode, 401);
});

test('website project video upload requires authentication', async () => {
  const response = await request(app).post('/api/v1/website-projects/video');
  assert.equal(response.statusCode, 401);
});

test('CRM users list requires authentication', async () => {
  const response = await request(app).get('/api/v1/users');
  assert.equal(response.statusCode, 401);
});

test('employee self profile requires authentication', async () => {
  const response = await request(app).get('/api/v1/employees/me');
  assert.equal(response.statusCode, 401);
});

test('change password requires authentication', async () => {
  const response = await request(app).post('/api/v1/auth/change-password').send({ currentPassword: 'old-password', newPassword: 'new-password' });
  assert.equal(response.statusCode, 401);
});

test('website team photo URLs are stored without a host and resolved to the active API', async () => {
  const { normalizeStoredAssetUrl, resolvePublicAssetUrl } = await import('../src/utils/publicAssetUrl.js');
  const filename = 'a7dfad0a-aade-4b3c-9c1d-1234567890ab.jpg';
  const relative = `/api/v1/website-team/photos/${filename}`;
  assert.equal(normalizeStoredAssetUrl(`http://localhost:5000${relative}`), relative);
  assert.equal(normalizeStoredAssetUrl(`https://indonor-tech.onrender.com${relative}`), relative);
  assert.equal(normalizeStoredAssetUrl('https://res.cloudinary.com/demo/image/upload/photo.jpg'), 'https://res.cloudinary.com/demo/image/upload/photo.jpg');
  assert.match(resolvePublicAssetUrl(relative), new RegExp(`${relative}$`));
  assert.match(resolvePublicAssetUrl(`http://127.0.0.1:5000${relative}`), new RegExp(`${relative}$`));
});

test('user agent parser identifies browsers and bots', async () => {
  const { parseUserAgent } = await import('../src/modules/analytics/parse-user-agent.js');
  const chrome = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  assert.equal(chrome.browser, 'Chrome');
  assert.equal(chrome.os, 'Windows');
  assert.equal(chrome.deviceType, 'desktop');
  assert.equal(parseUserAgent('Googlebot/2.1').isBot, true);
});
