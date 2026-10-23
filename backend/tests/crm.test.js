import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';

const { app } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { default: User } = await import('../src/modules/auth/user.model.js');
const {
  CrmClient, CrmInvoice, CrmLead, CrmPayment, CrmProject, FollowUp, PartnerDue, ProjectMember
} = await import('../src/modules/crm/crm.models.js');
const { AuditLog, Notification } = await import('../src/modules/common/support.model.js');
const { processCrmReminders } = await import('../src/jobs/crmReminders.job.js');

let mongo;
const tokens = {};
const users = {};
const api = (method, url, who) => request(app)[method](`/api/v1${url}`).set('Authorization', `Bearer ${tokens[who]}`);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    CrmLead.syncIndexes(),
    CrmClient.syncIndexes(),
    CrmProject.syncIndexes(),
    CrmPayment.syncIndexes(),
    CrmInvoice.syncIndexes(),
    PartnerDue.syncIndexes(),
    FollowUp.syncIndexes(),
    ProjectMember.syncIndexes()
  ]);
  for (const [key, role] of [
    ['admin', 'SUPER_ADMIN'],
    ['bda', 'BDA'],
    ['finance', 'FINANCE'],
    ['pm', 'PROJECT_MANAGER'],
    ['employee', 'EMPLOYEE']
  ]) {
    const user = await User.create({ name: `${key} user`, email: `${key}@indonor.test`, role, passwordHash: 'x' });
    users[key] = user;
    tokens[key] = jwt.sign({ sub: String(user._id), role }, env.accessSecret, { expiresIn: '1h' });
  }
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('CRM access', () => {
  test('unauthenticated CRM routes are rejected', async () => {
    assert.equal((await request(app).get('/api/v1/crm/leads')).status, 401);
    assert.equal((await request(app).get('/api/v1/crm/finance/payments')).status, 401);
  });

  test('employees cannot create leads', async () => {
    const response = await api('post', '/crm/leads', 'employee').send({ leadName: 'Blocked' });
    assert.equal(response.status, 403);
  });

  test('sales cannot read finance ledger', async () => {
    const response = await api('get', '/crm/finance/dashboard', 'bda');
    assert.equal(response.status, 403);
  });

  test('finance staff can read finance', async () => {
    const response = await api('get', '/crm/finance/dashboard', 'finance');
    assert.equal(response.status, 200);
  });
});

describe('lead creation and unique IDs', () => {
  test('creates a lead with generated Lead ID and optional fields', async () => {
    const response = await api('post', '/crm/leads', 'bda').send({
      leadName: 'Acme Opportunity',
      companyName: 'Acme Corp',
      contactPersonName: 'Priya Shah',
      designation: 'CTO',
      email: 'priya@acme.test',
      phone: '9876543210',
      whatsappNumber: '9876543210',
      country: 'India',
      source: 'LINKEDIN',
      interestedService: 'WEB_DEVELOPMENT',
      projectDescription: 'Customer portal',
      businessRequirements: 'SSO and billing',
      requiredTechnologies: ['React', 'Node.js', 'AWS'],
      quotedAmount: 500000,
      currency: 'INR',
      estimatedDuration: '12 weeks',
      priority: 'HIGH',
      status: 'NEW'
    });
    assert.equal(response.status, 201, response.body.message);
    assert.match(response.body.data.leadId, /^LEAD-\d{6}$/);
    assert.equal(response.body.data.quotedAmount, 500000);
    assert.equal(response.body.data.expectedDealValue, 500000);
    assert.deepEqual(response.body.data.requiredTechnologies, ['React', 'Node.js', 'AWS']);
  });

  test('rejects invalid email and missing name', async () => {
    assert.equal((await api('post', '/crm/leads', 'bda').send({ leadName: 'X', email: 'not-an-email' })).status, 422);
    assert.equal((await api('post', '/crm/leads', 'bda').send({ companyName: 'No name' })).status, 422);
  });

  test('prevents duplicate email unless forceCreate is set', async () => {
    const duplicate = await api('post', '/crm/leads', 'admin').send({
      leadName: 'Acme Duplicate',
      email: 'priya@acme.test',
      phone: '111'
    });
    assert.equal(duplicate.status, 409);
    const forced = await api('post', '/crm/leads', 'admin').send({
      leadName: 'Acme Duplicate Forced',
      email: 'priya@acme.test',
      forceCreate: true
    });
    assert.equal(forced.status, 201);
  });

  test('allocates unique sequential lead IDs', async () => {
    const first = await api('post', '/crm/leads', 'admin').send({ leadName: 'ID One', email: 'id-one@test.com' });
    const second = await api('post', '/crm/leads', 'admin').send({ leadName: 'ID Two', email: 'id-two@test.com' });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.data.leadId, second.body.data.leadId);
  });
});

describe('lead conversion', () => {
  test('blocks conversion of new leads without forceConvert', async () => {
    const lead = await api('post', '/crm/leads', 'admin').send({ leadName: 'Too Early', email: 'early@test.com', status: 'NEW' });
    const response = await api('post', `/crm/leads/${lead.body.data._id}/convert`, 'admin').send({});
    assert.equal(response.status, 400);
  });

  test('converts a qualified lead, preserves Lead ID, and creates Client ID plus project', async () => {
    const lead = await api('post', '/crm/leads', 'admin').send({
      leadName: 'Northwind',
      companyName: 'Northwind Ltd',
      email: 'ops@northwind.test',
      phone: '9000000001',
      status: 'QUALIFIED',
      quotedAmount: 120000,
      requiredTechnologies: ['Python', 'React'],
      projectDescription: 'ERP module'
    });
    assert.equal(lead.status, 201);
    const converted = await api('post', `/crm/leads/${lead.body.data._id}/convert`, 'admin').send({
      conversionNotes: 'Signed proposal'
    });
    assert.equal(converted.status, 200, converted.body.message);
    assert.match(converted.body.data.client.clientId, /^CLT-\d{6}$/);
    assert.equal(converted.body.data.client.sourceLeadCode, lead.body.data.leadId);
    assert.equal(converted.body.data.lead.leadId, lead.body.data.leadId);
    assert.equal(converted.body.data.lead.status, 'WON');
    assert.ok(converted.body.data.project);
    assert.match(converted.body.data.project.projectId, /^PRJ-\d{6}$/);
    assert.equal(converted.body.data.project.contractValue, 120000);
    assert.equal(converted.body.data.project.outstanding, 120000);

    const again = await api('post', `/crm/leads/${lead.body.data._id}/convert`, 'admin').send({});
    assert.equal(again.status, 400);
  });
});

describe('projects, assignments, and progress', () => {
  test('assigns developers, validates progress, and flags overdue projects', async () => {
    const client = await api('post', '/crm/clients', 'admin').send({ clientName: 'Globex', companyEmail: 'globex@test.com' });
    assert.equal(client.status, 201);
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const project = await api('post', '/crm/projects', 'admin').send({
      projectName: 'Globex Portal',
      clientId: client.body.data._id,
      status: 'IN_PROGRESS',
      expectedEndDate: yesterday,
      contractValue: 10000,
      finalAmount: 10000,
      currency: 'INR'
    });
    assert.equal(project.status, 201, project.body.message);
    const bulk = await api('post', `/crm/projects/${project.body.data._id}/members/bulk`, 'admin').send({
      members: [
        { userId: String(users.employee._id), role: 'DEVELOPER' },
        { userId: String(users.pm._id), role: 'PROJECT_MANAGER' }
      ]
    });
    assert.equal(bulk.status, 200);
    assert.equal(bulk.body.data.length, 2);

    const badProgress = await api('patch', `/crm/projects/${project.body.data._id}`, 'admin').send({ progressPercent: 140 });
    assert.equal(badProgress.status, 422);

    const progress = await api('patch', `/crm/projects/${project.body.data._id}`, 'admin').send({ progressPercent: 40 });
    assert.equal(progress.status, 200);
    assert.equal(progress.body.data.progressPercent, 40);

    const detail = await api('get', `/crm/projects/${project.body.data._id}`, 'admin');
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.isOverdue, true);
    assert.equal(detail.body.data.members.length, 2);
  });
});

describe('payments, balances, refunds, and uploads', () => {
  let projectId;
  let clientId;

  test('records multiple partial payments and computes outstanding', async () => {
    const client = await api('post', '/crm/clients', 'admin').send({ clientName: 'PayCo', companyEmail: 'pay@co.test' });
    const project = await api('post', '/crm/projects', 'admin').send({
      projectName: 'PayCo App',
      clientId: client.body.data._id,
      contractValue: 10000,
      finalAmount: 10000,
      nextPaymentDueDate: new Date(Date.now() - 86400000).toISOString()
    });
    clientId = client.body.data._id;
    projectId = project.body.data._id;

    const first = await api('post', '/crm/finance/payments', 'admin').send({
      projectId, clientId, amount: 2000, paymentDate: new Date().toISOString(), paymentMethod: 'UPI',
      upiTransactionId: 'UPI123', status: 'CONFIRMED'
    });
    assert.equal(first.status, 201, first.body.message);
    assert.match(first.body.data.payment.paymentId, /^PAY-\d{6}$/);
    assert.equal(first.body.data.payment.installmentNumber, 1);
    assert.equal(first.body.data.ledger.outstanding, 8000);

    const pending = await api('post', '/crm/finance/payments', 'admin').send({
      projectId, clientId, amount: 1500, paymentDate: new Date().toISOString(), status: 'PENDING'
    });
    assert.equal(pending.status, 201);
    assert.equal(pending.body.data.ledger.outstanding, 8000);

    const second = await api('post', '/crm/finance/payments', 'admin').send({
      projectId, clientId, amount: 3000, paymentDate: new Date().toISOString(), paymentMethod: 'NEFT', utr: 'UTR999'
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.data.payment.installmentNumber, 3);
    assert.equal(second.body.data.ledger.confirmedPayments, 5000);
    assert.equal(second.body.data.ledger.outstanding, 5000);
  });

  test('rejects overpayment unless explicitly allowed', async () => {
    const over = await api('post', '/crm/finance/payments', 'admin').send({
      projectId, clientId, amount: 6000, paymentDate: new Date().toISOString(), status: 'CONFIRMED'
    });
    assert.equal(over.status, 400);
    const allowed = await api('post', '/crm/finance/payments', 'admin').send({
      projectId, clientId, amount: 1000, paymentDate: new Date().toISOString(), status: 'CONFIRMED', allowOverpayment: false
    });
    assert.equal(allowed.status, 201);
  });

  test('refunds restore outstanding balance', async () => {
    const payment = await CrmPayment.findOne({ projectId, installmentNumber: 1 });
    const refunded = await api('patch', `/crm/finance/payments/${payment._id}`, 'admin').send({ status: 'REFUNDED' });
    assert.equal(refunded.status, 200, refunded.body.message);
    assert.equal(refunded.body.data.ledger.confirmedPayments, 4000);
    assert.equal(refunded.body.data.ledger.outstanding, 6000);
  });

  test('failed payments do not count as received', async () => {
    const failed = await api('post', '/crm/finance/payments', 'admin').send({
      projectId, clientId, amount: 500, paymentDate: new Date().toISOString(), status: 'FAILED'
    });
    assert.equal(failed.status, 201);
    assert.equal(failed.body.data.ledger.outstanding, 6000);
  });

  test('credits reduce outstanding', async () => {
    const credit = await api('post', '/crm/finance/credits', 'admin').send({
      projectId, amount: 1000, reason: 'Goodwill adjustment'
    });
    assert.equal(credit.status, 201);
    assert.equal(credit.body.data.ledger.creditsTotal, 1000);
    assert.equal(credit.body.data.ledger.outstanding, 5000);
  });

  test('does not store credentials on payment records', async () => {
    const response = await api('post', '/crm/finance/payments', 'admin').send({
      projectId, clientId, amount: 100, paymentDate: new Date().toISOString(),
      status: 'PENDING', password: 'secret', otp: '123456', accountNumber: '123456789012'
    });
    assert.equal(response.status, 201);
    const stored = await CrmPayment.findById(response.body.data.payment._id).lean();
    assert.equal(stored.password, undefined);
    assert.equal(stored.otp, undefined);
    assert.equal(stored.maskedAccountNumber, '****9012');
  });

  test('uploads lead attachments of allowed types and rejects others', async () => {
    const lead = await api('post', '/crm/leads', 'admin').send({ leadName: 'File Lead', email: 'file@test.com' });
    const ok = await api('post', `/crm/leads/${lead.body.data._id}/attachments`, 'admin')
      .attach('files', Buffer.from('%PDF-1.4 test'), 'proposal.pdf');
    assert.equal(ok.status, 200, ok.body.message);
    assert.equal(ok.body.data.length, 1);
    const denied = await api('post', `/crm/leads/${lead.body.data._id}/attachments`, 'admin')
      .attach('files', Buffer.from('echo'), 'malware.exe');
    assert.equal(denied.status, 422);
  });
});

describe('due notifications and follow-ups', () => {
  test('creates overdue payment notifications without duplicates', async () => {
    const client = await api('post', '/crm/clients', 'admin').send({
      clientName: 'Due Client', companyEmail: 'due@test.com', assignedTo: String(users.bda._id)
    });
    const project = await api('post', '/crm/projects', 'admin').send({
      projectName: 'Due Project',
      clientId: client.body.data._id,
      contractValue: 8000,
      finalAmount: 8000,
      nextPaymentDueDate: new Date(Date.now() - 2 * 86400000).toISOString()
    });
    await CrmProject.updateOne({ _id: project.body.data._id }, { $set: { outstanding: 8000 } });
    await processCrmReminders(new Date());
    await processCrmReminders(new Date());
    const notices = await Notification.find({ type: 'PAYMENT_OVERDUE', recipient: users.bda._id }).lean();
    assert.ok(notices.length >= 1);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].readAt, undefined);
  });

  test('sales can schedule a payment follow-up on a client', async () => {
    const client = await CrmClient.findOne({ clientName: 'Due Client' });
    const response = await api('post', `/crm/clients/${client._id}/follow-ups`, 'admin').send({
      nextFollowUpDate: new Date().toISOString(),
      followUpType: 'PAYMENT_DISCUSSION',
      followUpNote: 'Call about overdue invoice'
    });
    assert.equal(response.status, 201, response.body.message);
    assert.equal(response.body.data.target, 'PAYMENT');
  });
});

describe('client form conversion and independent project ledgers', () => {
  test('creates a client from a searchable unconverted lead and blocks duplicate conversion', async () => {
    const lead = await api('post', '/crm/leads', 'admin').send({
      leadName: 'Rel Client',
      companyName: 'Rel Co',
      contactPersonName: 'Anita',
      email: 'anita-rel@test.com',
      phone: '9000000099',
      country: 'India',
      address: 'Pune',
      source: 'WEBSITE',
      status: 'QUALIFIED',
      requiredTechnologies: ['Node.js', 'React'],
      businessRequirements: 'Portal rebuild',
      quotedAmount: 250000
    });
    assert.equal(lead.status, 201);
    const picker = await api('get', '/crm/leads?converted=false&convertible=true&q=Rel%20Co', 'admin');
    assert.equal(picker.status, 200);
    assert.ok(picker.body.data.some((row) => row._id === lead.body.data._id));

    const created = await api('post', '/crm/clients', 'admin').send({
      sourceLeadId: lead.body.data._id,
      clientName: 'Rel Client Edited',
      companyName: 'Rel Co',
      companyEmail: 'billing@rel.test',
      companyPhone: '9000000099',
      country: 'India',
      address: 'Pune HQ',
      technologies: ['Node.js', 'React'],
      notes: 'Converted from client form'
    });
    assert.equal(created.status, 201, created.body.message);
    assert.match(created.body.data.clientId, /^CLT-\d{6}$/);
    assert.equal(created.body.data.sourceLeadCode, lead.body.data.leadId);
    assert.equal(created.body.data.companyEmail, 'billing@rel.test');
    assert.equal(String(created.body.data.sourceLeadId), String(lead.body.data._id));

    const duplicate = await api('post', '/crm/clients', 'admin').send({
      sourceLeadId: lead.body.data._id,
      clientName: 'Should Fail'
    });
    assert.equal(duplicate.status, 400);

    const convertedList = await api('get', '/crm/leads?converted=true&q=Rel%20Client', 'admin');
    assert.equal(convertedList.status, 200);
    const convertedRow = convertedList.body.data.find((row) => row._id === lead.body.data._id);
    assert.ok(convertedRow);
    assert.equal(convertedRow.isConverted, true);
    assert.ok(convertedRow.convertedDate);
  });

  test('Lead → Client → Project A/B → payments on A leave B independent and aggregate client outstanding', async () => {
    const lead = await api('post', '/crm/leads', 'admin').send({
      leadName: 'Multi Project Co',
      companyName: 'Multi Co',
      email: 'multi-proj@test.com',
      status: 'WON',
      quotedAmount: 10000
    });
    const converted = await api('post', `/crm/leads/${lead.body.data._id}/convert`, 'admin').send({
      createProject: false,
      assignedTo: String(users.bda._id),
      conversionNotes: 'Client first, projects later'
    });
    assert.equal(converted.status, 200, converted.body.message);
    const clientId = converted.body.data.client._id;
    assert.equal(converted.body.data.project, null);

    const projectA = await api('post', '/crm/projects', 'admin').send({
      projectName: 'Project A',
      clientId,
      contractValue: 10000,
      finalAmount: 10000,
      currency: 'INR',
      estimatedDuration: '8 weeks',
      nextPaymentDueDate: new Date(Date.now() - 86400000).toISOString()
    });
    const projectB = await api('post', '/crm/projects', 'admin').send({
      projectName: 'Project B',
      clientId,
      contractValue: 4000,
      finalAmount: 4000,
      currency: 'INR',
      estimatedDuration: '4 weeks'
    });
    assert.equal(projectA.status, 201, projectA.body.message);
    assert.equal(projectB.status, 201, projectB.body.message);
    assert.notEqual(projectA.body.data.projectId, projectB.body.data.projectId);
    assert.equal(String(projectA.body.data.clientId), String(clientId));
    assert.equal(String(projectB.body.data.clientId), String(clientId));

    const pay1 = await api('post', '/crm/finance/payments', 'admin').send({
      projectId: projectA.body.data._id,
      clientId,
      amount: 3000,
      paymentDate: new Date().toISOString(),
      status: 'CONFIRMED',
      paymentMethod: 'UPI'
    });
    const pay2 = await api('post', '/crm/finance/payments', 'admin').send({
      projectId: projectA.body.data._id,
      clientId,
      amount: 2000,
      paymentDate: new Date().toISOString(),
      status: 'CONFIRMED',
      paymentMethod: 'NEFT'
    });
    assert.equal(pay1.status, 201, pay1.body.message);
    assert.equal(pay2.status, 201, pay2.body.message);
    assert.equal(pay2.body.data.ledger.outstanding, 5000);
    assert.equal(pay2.body.data.ledger.confirmedPayments, 5000);

    const pendingB = await api('post', '/crm/finance/payments', 'admin').send({
      projectId: projectB.body.data._id,
      clientId,
      amount: 1000,
      paymentDate: new Date().toISOString(),
      status: 'PENDING'
    });
    assert.equal(pendingB.status, 201);
    assert.equal(pendingB.body.data.ledger.outstanding, 4000);

    const detail = await api('get', `/crm/clients/${clientId}`, 'admin');
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.projects.length, 2);
    const a = detail.body.data.projects.find((row) => row.projectName === 'Project A');
    const b = detail.body.data.projects.find((row) => row.projectName === 'Project B');
    assert.equal(a.ledger.outstanding, 5000);
    assert.equal(b.ledger.outstanding, 4000);
    assert.equal(b.ledger.pendingPayments, 1000);
    assert.equal(detail.body.data.ledger.outstanding, 9000);
    assert.equal(detail.body.data.ledger.confirmedPayments, 5000);
    assert.equal(detail.body.data.ledger.contractValue, 14000);
    assert.ok(detail.body.data.dues.some((row) => row.kind === 'OVERDUE' && String(row.projectMongoId) === String(projectA.body.data._id)));

    const sameClient = await CrmClient.countDocuments({ _id: clientId, isDeleted: false });
    assert.equal(sameClient, 1);

    await processCrmReminders(new Date());
    const notices = await Notification.find({
      type: 'PAYMENT_OVERDUE',
      entityId: projectA.body.data._id
    }).lean();
    assert.ok(notices.length >= 1);
  });
});

describe('partnership, invoices, and sequential numbering', () => {
  async function seedClientProject(name, contractValue) {
    const client = await api('post', '/crm/clients', 'admin').send({
      clientName: name, companyEmail: `${name.replaceAll(' ', '-').toLowerCase()}@test.com`
    });
    const project = await api('post', '/crm/projects', 'admin').send({
      projectName: `${name} Project`,
      clientId: client.body.data._id,
      contractValue,
      finalAmount: contractValue,
      currency: 'INR',
      assignedTo: String(users.bda._id)
    });
    return { clientId: client.body.data._id, projectId: project.body.data._id, project: project.body.data };
  }

  test('60/40 gross split, company receipt, invoice is not a payment, expenses and settlements do not double-count', async () => {
    const { clientId, projectId } = await seedClientProject('Share Co', 1000000);
    const saved = await api('put', `/crm/projects/${projectId}/partnership`, 'admin').send({
      engagementType: 'PARTNERSHIP',
      shareBasis: 'GROSS_CONTRACT',
      companySharePercent: 60,
      referrerName: 'Ravi Referral',
      referralPercent: 0,
      partners: [{ name: 'Apex Partner', companyName: 'Apex LLC', email: 'apex@test.com', phone: '9000000001', role: 'PARTNER', sharePercent: 40 }]
    });
    assert.equal(saved.status, 200, saved.body.message);
    assert.equal(saved.body.data.settlement.company.entitlement, 600000);
    assert.equal(saved.body.data.settlement.partners[0].entitlement, 400000);
    assert.equal(saved.body.data.agreementVersion, 1);
    const partnerId = saved.body.data.partners[0]._id;

    const uneven = await api('put', `/crm/projects/${projectId}/partnership`, 'admin').send({
      engagementType: 'PARTNERSHIP',
      shareBasis: 'GROSS_CONTRACT',
      companySharePercent: 60,
      partners: [{ _id: partnerId, name: 'Apex Partner', sharePercent: 50, role: 'PARTNER' }]
    });
    assert.equal(uneven.status, 422);

    const invoice = await api('post', '/crm/finance/invoices', 'admin').send({
      projectId,
      clientId,
      invoiceDate: new Date().toISOString(),
      dueDate: new Date(Date.now() - 86400000).toISOString(),
      invoiceScope: 'COMPANY_SHARE',
      sharePercent: 60,
      subtotal: 600000,
      totalAmount: 600000,
      status: 'SENT'
    });
    assert.equal(invoice.status, 201, invoice.body.message);
    const afterInvoice = await api('get', `/crm/projects/${projectId}/settlement`, 'admin');
    assert.equal(afterInvoice.body.data.company.invoiced, 600000);
    assert.equal(afterInvoice.body.data.company.received, 0);
    assert.equal(afterInvoice.body.data.company.remaining, 600000);

    const receipt = await api('post', '/crm/finance/payments', 'admin').send({
      projectId, clientId, amount: 200000, paymentDate: new Date().toISOString(),
      status: 'CONFIRMED', paymentMethod: 'NEFT', allocationTarget: 'COMPANY'
    });
    assert.equal(receipt.status, 201, receipt.body.message);
    const afterReceipt = await api('get', `/crm/projects/${projectId}/settlement`, 'admin');
    assert.equal(afterReceipt.body.data.company.received, 200000);
    assert.equal(afterReceipt.body.data.company.remaining, 400000);

    const agreement = await api('post', `/crm/projects/${projectId}/documents`, 'admin')
      .field('documentName', 'Partnership agreement.pdf')
      .field('documentType', 'PARTNERSHIP_AGREEMENT')
      .attach('file', Buffer.from('%PDF-1.4 partnership'), 'partnership.pdf');
    assert.equal(agreement.status, 201, agreement.body.message);
    const documentId = agreement.body.data._id;
    const downloadOk = await api('get', `/crm/files/project/${projectId}/${documentId}`, 'admin');
    assert.equal(downloadOk.status, 200);
    const downloadDenied = await api('get', `/crm/files/project/${projectId}/${documentId}`, 'employee');
    assert.equal(downloadDenied.status, 403);

    const invoicePdf = await api('post', `/crm/finance/invoices/${invoice.body.data._id}/attachments`, 'admin')
      .attach('files', Buffer.from('%PDF-1.4 invoice'), 'invoice.pdf');
    assert.equal(invoicePdf.status, 200, invoicePdf.body.message);
    const generated = await api('get', `/crm/finance/invoices/${invoice.body.data._id}/pdf`, 'admin');
    assert.equal(generated.status, 200);
    assert.match(generated.headers['content-type'], /pdf/);

    const exported = await api('get', '/crm/finance/invoices/export?format=csv', 'admin');
    assert.equal(exported.status, 200);
    assert.match(exported.text, new RegExp(invoice.body.data.invoiceNumber));
    const xlsx = await api('get', `/crm/projects/${projectId}/export?format=xlsx`, 'admin');
    assert.equal(xlsx.status, 200);

    const expense = await api('post', `/crm/projects/${projectId}/adjustments`, 'admin').send({
      type: 'EXPENSE', amount: 50000, notes: 'Contractors'
    });
    assert.equal(expense.status, 201);
    const refund = await api('post', `/crm/projects/${projectId}/adjustments`, 'admin').send({
      type: 'REFUND', amount: 10000, notes: 'Partial refund'
    });
    assert.equal(refund.status, 201);
    const paidPartner = await api('post', '/crm/finance/settlements', 'admin').send({
      projectId, partnerId, amount: 100000, paymentDate: new Date().toISOString(), status: 'CONFIRMED'
    });
    assert.equal(paidPartner.status, 201, paidPartner.body.message);
    const ledger = await api('get', `/crm/projects/${projectId}/settlement`, 'admin');
    assert.equal(ledger.body.data.company.received, 200000);
    assert.equal(ledger.body.data.company.remaining, 400000);
    assert.equal(ledger.body.data.partners[0].paid, 100000);
    assert.equal(ledger.body.data.partners[0].outstanding, 300000);
    assert.equal(ledger.body.data.expenses, 50000);
    assert.equal(ledger.body.data.refunds, 10000);

    const history = await api('get', `/crm/projects/${projectId}/agreements`, 'admin');
    assert.equal(history.status, 200);
    assert.ok(history.body.data.length >= 1);

    const audits = await AuditLog.find({ entityType: 'CrmProject', entityId: projectId, action: 'PARTNERSHIP_UPDATED' }).lean();
    assert.ok(audits.length >= 1);

    await processCrmReminders(new Date());
    const invoiceNotices = await Notification.find({ type: 'INVOICE_OVERDUE', entityId: invoice.body.data._id }).lean();
    assert.ok(invoiceNotices.length >= 1);
  });

  test('independent project balances and sequential invoice numbers continue from inspected max', async () => {
    const first = await seedClientProject('Seq One', 800000);
    const second = await seedClientProject('Seq Two', 250000);
    await api('put', `/crm/projects/${first.projectId}/partnership`, 'admin').send({
      engagementType: 'CLIENT', shareBasis: 'GROSS_CONTRACT', companySharePercent: 100, partners: []
    });
    await api('put', `/crm/projects/${second.projectId}/partnership`, 'admin').send({
      engagementType: 'CLIENT', shareBasis: 'GROSS_CONTRACT', companySharePercent: 100, partners: []
    });
    await api('post', '/crm/finance/payments', 'admin').send({
      projectId: first.projectId, clientId: first.clientId, amount: 50000,
      paymentDate: new Date().toISOString(), status: 'CONFIRMED', allocationTarget: 'COMPANY'
    });
    const a = await api('get', `/crm/projects/${first.projectId}/settlement`, 'admin');
    const b = await api('get', `/crm/projects/${second.projectId}/settlement`, 'admin');
    assert.equal(a.body.data.company.received, 50000);
    assert.equal(b.body.data.company.received, 0);
    assert.equal(b.body.data.contractValue, 250000);

    const sequence = await api('get', '/crm/finance/invoices/next-number', 'admin');
    assert.equal(sequence.status, 200);
    const { prefix, pad, maxSerial, nextNumber } = sequence.body.data;
    const historical = `${prefix}-${String(maxSerial + 3).padStart(pad, '0')}`;
    const imported = await api('post', '/crm/finance/invoices', 'admin').send({
      projectId: first.projectId,
      clientId: first.clientId,
      invoiceDate: new Date().toISOString(),
      invoiceNumber: historical,
      isImported: true,
      subtotal: 1000,
      totalAmount: 1000,
      status: 'SENT'
    });
    assert.equal(imported.status, 201, imported.body.message);
    assert.equal(imported.body.data.invoiceNumber, historical);
    assert.equal(imported.body.data.isImported, true);
    assert.equal(imported.body.data.amountPaid, 0);

    const duplicate = await api('post', '/crm/finance/invoices', 'admin').send({
      projectId: first.projectId,
      clientId: first.clientId,
      invoiceDate: new Date().toISOString(),
      invoiceNumber: historical,
      isImported: true,
      subtotal: 1,
      totalAmount: 1
    });
    assert.equal(duplicate.status, 409);

    const next = await api('get', '/crm/finance/invoices/next-number', 'admin');
    assert.equal(next.body.data.maxSerial, maxSerial + 3);
    assert.equal(next.body.data.nextNumber, `${prefix}-${String(maxSerial + 4).padStart(pad, '0')}`);

    const autoPayload = {
      projectId: second.projectId,
      clientId: second.clientId,
      invoiceDate: new Date().toISOString(),
      subtotal: 250,
      totalAmount: 250,
      status: 'SENT'
    };
    const [one, two] = await Promise.all([
      api('post', '/crm/finance/invoices', 'admin').send(autoPayload),
      api('post', '/crm/finance/invoices', 'admin').send(autoPayload)
    ]);
    assert.equal(one.status, 201, one.body.message);
    assert.equal(two.status, 201, two.body.message);
    assert.notEqual(one.body.data.invoiceNumber, two.body.data.invoiceNumber);
    const numbers = [one.body.data.invoiceNumber, two.body.data.invoiceNumber].sort();
    assert.ok(numbers.includes(`${prefix}-${String(maxSerial + 4).padStart(pad, '0')}`));
    assert.ok(numbers.includes(`${prefix}-${String(maxSerial + 5).padStart(pad, '0')}`));

    const bdaDenied = await api('put', `/crm/projects/${first.projectId}/partnership`, 'bda').send({
      companySharePercent: 100, partners: []
    });
    assert.equal(bdaDenied.status, 403);
  });
});

describe('partner due payments', () => {
  test('itemized payable due, partial payment, settle, receivable split, edit, cancel, and overdue notice', async () => {
    const client = await api('post', '/crm/clients', 'admin').send({
      clientName: 'Due Studio', companyEmail: 'due-studio@test.com', assignedTo: String(users.bda._id)
    });
    const project = await api('post', '/crm/projects', 'admin').send({
      projectName: 'Due Studio Site',
      clientId: client.body.data._id,
      contractValue: 200000,
      finalAmount: 200000,
      assignedSalesperson: String(users.bda._id)
    });
    const projectId = project.body.data._id;
    const clientId = client.body.data._id;

    const created = await api('post', '/crm/finance/partner-dues', 'admin').send({
      direction: 'PAYABLE',
      title: 'Design sprint',
      projectId,
      clientId,
      partnerName: 'Maya Designer',
      partnerCompany: 'Maya Studio',
      partnerEmail: 'maya@test.com',
      assignedTo: String(users.bda._id),
      dueDate: new Date(Date.now() - 86400000).toISOString(),
      lineItems: [
        { description: 'Development', amount: 70000 },
        { description: 'Figma Design', amount: 7500 },
        { description: 'Extra Work', amount: 2000 }
      ]
    });
    assert.equal(created.status, 201, created.body.message);
    assert.match(created.body.data.dueId, /^DUE-\d{6}$/);
    assert.equal(created.body.data.lineItems.map((item) => item.amount).reduce((sum, value) => sum + value, 0), 79500);
    assert.deepEqual(created.body.data.lineItems.map((item) => item.amount), [70000, 7500, 2000]);
    assert.equal(created.body.data.originalAmount, 79500);
    assert.equal(created.body.data.remaining, 79500);
    assert.equal(created.body.data.lineItems.length, 3);
    assert.equal(created.body.data.lineItems.every((item) => item.category == null && item.quantity == null && item.unitPrice == null), true);
    assert.equal(created.body.data.status, 'OVERDUE');

    const firstPay = await api('post', `/crm/finance/partner-dues/${created.body.data._id}/payments`, 'admin').send({
      amount: 20000,
      paymentDate: new Date().toISOString(),
      paymentMethod: 'UPI',
      transactionId: 'TXN-DUE-1',
      status: 'CONFIRMED'
    });
    assert.equal(firstPay.status, 201, firstPay.body.message);
    assert.equal(firstPay.body.data.due.amountPaid, 20000);
    assert.equal(firstPay.body.data.due.remaining, 59500);
    assert.equal(firstPay.body.data.payment.installmentNumber, 1);

    const duplicate = await api('post', `/crm/finance/partner-dues/${created.body.data._id}/payments`, 'admin').send({
      amount: 20000,
      paymentDate: new Date().toISOString(),
      transactionId: 'TXN-DUE-1'
    });
    assert.equal(duplicate.status, 409);

    const blockedDelete = await api('delete', `/crm/finance/partner-dues/${created.body.data._id}`, 'admin');
    assert.equal(blockedDelete.status, 200);
    assert.equal(blockedDelete.body.data.deleted, false);
    assert.equal(blockedDelete.body.data.cancelled, true);
    assert.equal(blockedDelete.body.data.due.status, 'CANCELLED');

    const reopened = await api('post', `/crm/finance/partner-dues/${created.body.data._id}/reopen`, 'admin').send({
      reason: 'Cancelled while testing delete protection'
    });
    assert.equal(reopened.status, 200, reopened.body.message);
    assert.equal(reopened.body.data.remaining, 59500);

    await processCrmReminders(new Date());
    const notices = await Notification.find({ type: 'DUE_OVERDUE', entityId: created.body.data._id }).lean();
    assert.ok(notices.length >= 1);

    const secondPay = await api('post', `/crm/finance/partner-dues/${created.body.data._id}/payments`, 'admin').send({
      amount: 59500,
      paymentDate: new Date().toISOString(),
      paymentMethod: 'NEFT',
      transactionId: 'TXN-DUE-2'
    });
    assert.equal(secondPay.status, 201, secondPay.body.message);
    assert.equal(secondPay.body.data.due.remaining, 0);
    assert.equal(secondPay.body.data.due.status, 'SETTLED');

    const receivable = await api('post', '/crm/finance/partner-dues', 'admin').send({
      direction: 'RECEIVABLE',
      title: 'Partner reimbursement',
      projectId,
      partnerName: 'Apex Partner',
      lineItems: [{ description: 'Pass-through hosting', amount: 8000 }]
    });
    assert.equal(receivable.status, 201, receivable.body.message);
    assert.equal(receivable.body.data.originalAmount, 8000);

    const edited = await api('patch', `/crm/finance/partner-dues/${receivable.body.data._id}`, 'admin').send({
      title: 'Partner reimbursement updated',
      lineItems: [
        { description: 'Pass-through hosting', amount: 8000 },
        { description: 'Domain', amount: 1200 }
      ]
    });
    assert.equal(edited.status, 200, edited.body.message);
    assert.equal(edited.body.data.originalAmount, 9200);
    assert.equal(edited.body.data.remaining, 9200);

    const trimmed = await api('patch', `/crm/finance/partner-dues/${receivable.body.data._id}`, 'admin').send({
      lineItems: [{ description: 'Pass-through hosting', amount: 8000 }]
    });
    assert.equal(trimmed.status, 200, trimmed.body.message);
    assert.equal(trimmed.body.data.lineItems.length, 1);
    assert.equal(trimmed.body.data.originalAmount, 8000);
    assert.equal(trimmed.body.data.remaining, 8000);

    const summary = await api('get', '/crm/finance/partner-dues/summary', 'admin');
    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.payableTotal, 79500);
    assert.equal(summary.body.data.paid, 79500);
    assert.equal(summary.body.data.remainingPayable, 0);
    assert.equal(summary.body.data.receivableTotal, 8000);
    assert.equal(summary.body.data.remainingReceivable, 8000);

    const removed = await api('delete', `/crm/finance/partner-dues/${receivable.body.data._id}`, 'admin');
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.deleted, true);

    const negative = await api('post', '/crm/finance/partner-dues', 'admin').send({
      direction: 'PAYABLE', title: 'Negative', projectId, partnerName: 'X',
      lineItems: [{ description: 'Invalid', amount: -10 }]
    });
    assert.equal(negative.status, 422);

    const stillOpen = await api('get', `/crm/finance/partner-dues/${created.body.data._id}`, 'admin');
    assert.equal(stillOpen.body.data.status, 'SETTLED');

    const denied = await api('post', '/crm/finance/partner-dues', 'bda').send({
      direction: 'PAYABLE', title: 'Nope', projectId, partnerName: 'X',
      lineItems: [{ description: 'X', amount: 1 }]
    });
    assert.equal(denied.status, 403);

    const audits = await AuditLog.find({ entityType: 'PartnerDue', action: 'DUE_CREATED' }).lean();
    assert.ok(audits.length >= 1);
  });
});

describe('error handling', () => {
  test('unknown lead is 404', async () => {
    const response = await api('get', '/crm/leads/000000000000000000000000', 'admin');
    assert.equal(response.status, 404);
  });

  test('VIEW_ADMIN mutations stay forbidden', async () => {
    const view = await User.create({ name: 'Viewer', email: 'view@indonor.test', role: 'VIEW_ADMIN', passwordHash: 'x', pageAccess: { leads: true } });
    const token = jwt.sign({ sub: String(view._id), role: 'VIEW_ADMIN' }, env.accessSecret, { expiresIn: '1h' });
    const response = await request(app).post('/api/v1/crm/leads').set('Authorization', `Bearer ${token}`).send({ leadName: 'Nope' });
    assert.equal(response.status, 403);
  });
});
