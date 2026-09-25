import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.MAIL_PROVIDER = 'json';

const sent = [];
const failFor = new Set();
nodemailer.createTransport = () => ({
  sendMail: async (message) => {
    if ([].concat(message.to).some((email) => failFor.has(email))) {
      const error = new Error('Mailbox unavailable');
      error.responseCode = 550;
      throw error;
    }
    sent.push(message);
    return { messageId: `<${sent.length}@test>` };
  },
  verify: async () => true
});

const { app } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { default: User } = await import('../src/modules/auth/user.model.js');
const { default: Employee } = await import('../src/modules/employees/employee.model.js');
const { default: EmailLog } = await import('../src/modules/email/email.model.js');
const { Department } = await import('../src/modules/common/catalog.model.js');
const { textToHtml } = await import('../src/services/mailer.service.js');

let mongo;
const tokens = {};
const call = (method, url, who) => request(app)[method](`/api/v1/email${url}`).set('Authorization', `Bearer ${tokens[who]}`);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const engineering = await Department.create({ name: 'Engineering' });
  await Employee.create([
    { firstName: 'Esha', lastName: 'Verma', employeeType: 'FULL_TIME', companyEmail: 'esha@indonor.test', department: engineering._id },
    { firstName: 'Rahul', lastName: 'Sharma', employeeType: 'FULL_TIME', personalEmail: 'rahul@personal.test', employmentStatus: 'RESIGNED' },
    { firstName: 'No', lastName: 'Email', employeeType: 'FULL_TIME' }
  ]);
  for (const [key, role] of [['admin', 'ADMIN'], ['manager', 'MANAGER'], ['employee', 'EMPLOYEE']]) {
    const user = await User.create({ name: `${key} user`, email: `${key}@indonor.test`, role, passwordHash: 'x' });
    tokens[key] = jwt.sign({ sub: String(user._id), role }, env.accessSecret, { expiresIn: '1h' });
  }
  await User.create({ name: 'Esha Login', email: 'esha@indonor.test', role: 'EMPLOYEE', passwordHash: 'x' });
});

beforeEach(() => { sent.length = 0; failFor.clear(); });

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('email access', () => {
  test('employees without email:send are rejected', async () => {
    const response = await call('get', '/status', 'employee');
    assert.equal(response.status, 403);
    assert.equal((await call('post', '/send', 'employee').send({ to: 'esha@indonor.test', subject: 'x', body: 'y' })).status, 403);
  });

  test('status reports a configured transport without exposing the password', async () => {
    const response = await call('get', '/status', 'admin');
    assert.equal(response.status, 200);
    assert.equal(response.body.data.configured, true);
    assert.equal(response.body.data.provider, 'json');
    assert.equal(JSON.stringify(response.body.data).includes('password'), false);
  });

  test('managers can send too', async () => {
    const response = await call('post', '/send', 'manager').field('to', 'esha@indonor.test').field('subject', 'Hello').field('body', 'Hi');
    assert.equal(response.status, 200);
  });
});

describe('recipients', () => {
  test('lists employees with email, department and status, without duplicating CRM users', async () => {
    const response = await call('get', '/recipients', 'admin');
    assert.equal(response.status, 200);
    const esha = response.body.data.filter((item) => item.email === 'esha@indonor.test');
    assert.equal(esha.length, 1);
    assert.equal(esha[0].group, 'Employees');
    assert.equal(esha[0].department, 'Engineering');
    assert.equal(response.body.data.find((item) => item.email === 'rahul@personal.test').employmentStatus, 'RESIGNED');
    assert.equal(response.body.data.some((item) => item.label === 'No Email'), false);
    assert.ok(response.body.data.some((item) => item.email === 'manager@indonor.test' && item.group === 'CRM users'));
  });
});

describe('sending', () => {
  test('separate mode sends one personalised message per recipient with reply-to set to the sender', async () => {
    const response = await call('post', '/send', 'admin')
      .field('to', 'esha@indonor.test, rahul@personal.test, outside@example.org')
      .field('separate', 'true')
      .field('cc', 'ignored@indonor.test')
      .field('subject', 'Update for {{firstName}}')
      .field('body', 'Hi {{firstName}},\n\nWelcome {{name}} & team <b>.');
    assert.equal(response.status, 200, response.body.message);
    assert.equal(sent.length, 3);
    const esha = sent.find((message) => message.to === 'esha@indonor.test');
    assert.equal(esha.subject, 'Update for Esha');
    assert.match(esha.text, /^Hi Esha,\n\nWelcome Esha Verma/);
    assert.equal(esha.replyTo, 'admin@indonor.test');
    assert.equal(esha.cc, undefined);
    assert.match(esha.html, /&lt;b&gt;/);
    assert.match(sent.find((message) => message.to === 'outside@example.org').text, /^Hi there,/);
    const log = await EmailLog.findById(response.body.data._id).lean();
    assert.equal(log.mode, 'SEPARATE');
    assert.equal(log.status, 'SENT');
    assert.equal(log.sentCount, 3);
    assert.deepEqual(log.cc, []);
  });

  test('together mode sends a single message with CC and BCC', async () => {
    const response = await call('post', '/send', 'admin')
      .field('to', 'esha@indonor.test,rahul@personal.test')
      .field('cc', 'manager@indonor.test')
      .field('bcc', 'audit@indonor.test')
      .field('subject', 'All hands')
      .field('body', 'Hello {{name}}')
      .attach('attachments', Buffer.from('%PDF-1.4\n'), { filename: 'agenda.pdf', contentType: 'application/pdf' });
    assert.equal(response.status, 200, response.body.message);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ['esha@indonor.test', 'rahul@personal.test']);
    assert.deepEqual(sent[0].bcc, ['audit@indonor.test']);
    assert.equal(sent[0].text, 'Hello Team');
    assert.equal(sent[0].attachments[0].filename, 'agenda.pdf');
    assert.equal(response.body.data.mode, 'TOGETHER');
  });

  test('partial failures are logged and reported', async () => {
    failFor.add('rahul@personal.test');
    const response = await call('post', '/send', 'admin').field('to', 'esha@indonor.test,rahul@personal.test').field('separate', 'true').field('subject', 'S').field('body', 'B');
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'PARTIAL');
    assert.equal(response.body.data.failed[0].email, 'rahul@personal.test');
    assert.match(response.body.message, /1 of 2/);
  });

  test('a fully failed send returns 502 and is still logged', async () => {
    failFor.add('esha@indonor.test');
    const response = await call('post', '/send', 'admin').field('to', 'esha@indonor.test').field('subject', 'Failing').field('body', 'B');
    assert.equal(response.status, 502);
    assert.match(response.body.message, /rejected/);
    const log = await EmailLog.findOne({ subject: 'Failing' }).lean();
    assert.equal(log.status, 'FAILED');
  });

  test('validates addresses, recipient limits and attachment types', async () => {
    assert.equal((await call('post', '/send', 'admin').field('to', 'not-an-email').field('subject', 'S').field('body', 'B')).status, 422);
    const many = Array.from({ length: 101 }, (_value, index) => `user${index}@indonor.test`).join(',');
    assert.equal((await call('post', '/send', 'admin').field('to', many).field('subject', 'S').field('body', 'B')).status, 422);
    const badFile = await call('post', '/send', 'admin').field('to', 'esha@indonor.test').field('subject', 'S').field('body', 'B')
      .attach('attachments', Buffer.from('MZ'), { filename: 'run.exe', contentType: 'application/x-msdownload' });
    assert.equal(badFile.status, 422);
    assert.equal(sent.length, 0);
  });

  test('test email goes to the signed-in user and appears in history', async () => {
    const response = await call('post', '/test', 'admin');
    assert.equal(response.status, 200);
    assert.equal(sent[0].to, 'admin@indonor.test');
    const history = await call('get', '/history?limit=50', 'admin');
    assert.equal(history.status, 200);
    assert.ok(history.body.data.some((row) => row.mode === 'TEST' && row.sender?.email === 'admin@indonor.test'));
  });
});

test('textToHtml escapes markup and keeps line breaks', () => {
  assert.equal(textToHtml('a<b>\nc\n\nd').includes('a&lt;b&gt;<br>c</p><p style="margin:0 0 14px">d'), true);
});
