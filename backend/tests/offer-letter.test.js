import test from 'node:test';
import assert from 'node:assert/strict';
import { durationLabel, generateAgreementLetterPdf, generateCompanyCardPdf, generateOfferLetterPdf, generateRelievingLetterPdf, letterDownloadName } from '../src/services/offerLetter.service.js';

test('letter download name is company, employee, and document type', () => {
  assert.equal(
    letterDownloadName('Offer-Letter', { firstName: 'Mohammed', lastName: 'Yaseen' }),
    'IndonorTech-Mohammed-Yaseen-Offer-Letter.pdf'
  );
  assert.equal(
    letterDownloadName('Agreement Letter', { firstName: 'Anusha', lastName: 'Maram' }),
    'IndonorTech-Anusha-Maram-Agreement-Letter.pdf'
  );
});

test('offer letter PDF includes company letterhead and candidate details', async () => {
  const pdf = await generateOfferLetterPdf({
    candidate: {
      firstName: 'Anusha',
      lastName: 'Maram',
      email: 'anusha@example.com',
      phone: '9999999999',
      candidateRegistrationNumber: 'INDO-CAND-000001',
      address: 'New Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      country: 'India'
    },
    joiningDate: new Date('2026-09-20'),
    position: 'Intern',
    track: 'Frontend',
    salaryType: 'UNPAID',
    employmentType: 'INTERN',
    workMode: 'HYBRID',
    offerExpiryDate: new Date('2026-09-18'),
    durationMonths: 6,
    lastWorkingDate: new Date('2027-03-13'),
    issuedAt: new Date('2026-09-11')
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 10000);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('duration label is optional and human readable', () => {
  assert.equal(durationLabel(1), '1 month');
  assert.equal(durationLabel(6), '6 months');
  assert.equal(durationLabel(''), '');
});

const person = {
  firstName: 'Ravi',
  lastName: 'Kumar',
  companyEmail: 'ravi@indonortech.com',
  phone: '8888888888',
  employeeRegistrationNumber: 'INDO-EMP-000010',
  address: 'Patna',
  city: 'Patna',
  state: 'Bihar',
  country: 'India'
};

test('offer letter for existing staff uses appointment confirmation wording', async () => {
  const pdf = await generateOfferLetterPdf({
    person,
    joiningDate: new Date('2026-01-05'),
    position: 'Software Engineer',
    track: 'Frontend',
    salary: 40000,
    salaryType: 'MONTHLY',
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    alreadyJoined: true,
    issuedAt: new Date('2026-09-11')
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 8000);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('agreement letter PDF is generated for an employee', async () => {
  const pdf = await generateAgreementLetterPdf({
    person,
    joiningDate: new Date('2026-01-05'),
    position: 'Software Engineer',
    track: 'Frontend',
    salary: 40000,
    salaryType: 'MONTHLY',
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    noticePeriod: 30,
    issuedAt: new Date('2026-09-11')
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 8000);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('company card PDF is generated for an employee', async () => {
  const pdf = await generateCompanyCardPdf({
    person,
    position: 'Software Engineer',
    track: 'Frontend',
    department: 'Engineering',
    joiningDate: new Date('2026-01-05'),
    bloodGroup: 'B+',
    emergencyName: 'Anita Kumar',
    emergencyPhone: '7777777777',
    issuedAt: new Date('2026-09-11')
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 4000);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('relieving letter PDF is generated for an employee', async () => {
  const pdf = await generateRelievingLetterPdf({
    person,
    joiningDate: new Date('2026-01-05'),
    lastWorkingDate: new Date('2026-09-30'),
    relievingDate: new Date('2026-09-30'),
    position: 'Software Engineer',
    track: 'Frontend',
    noDues: true,
    issuedAt: new Date('2026-09-11')
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 8000);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
