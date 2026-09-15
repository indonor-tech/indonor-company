import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResumeText, extractResumeText } from '../src/services/resumeParser.service.js';

test('resume parser extracts contact fields and skills', () => {
  const parsed = parseResumeText(`
Priya Sharma
Software Engineer
priya.sharma@example.com
+91 98765 43210
https://linkedin.com/in/priya
Skills
React, Node.js, MongoDB
Education
B.Tech Computer Science, Example University, 2018 2022
Experience
Frontend Engineer
Indonor
Built recruitment screens in React
  `);
  assert.equal(parsed.email, 'priya.sharma@example.com');
  assert.match(parsed.phone, /9876543210/);
  assert.equal(parsed.firstName, 'Priya');
  assert.ok(parsed.skills.some((skill) => /react/i.test(skill.technology)));
});

test('resume extractor reads a plain text CV', async () => {
  const text = await extractResumeText({
    originalname: 'cv.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from('Aisha Khan\nProduct Designer\naisha@example.com\n+91 9988776655\nSkills\nFigma, React')
  });
  assert.match(text, /aisha@example.com/i);
});

test('registration numbers use the company code instead of FXDC', async () => {
  const { formatRegistrationNumber } = await import('../src/utils/ids.js');
  assert.equal(formatRegistrationNumber('employee', 1, 'indo'), 'INDO-EMP-000001');
  assert.equal(formatRegistrationNumber('candidate', 12, 'INDO'), 'INDO-CAN-000012');
});
