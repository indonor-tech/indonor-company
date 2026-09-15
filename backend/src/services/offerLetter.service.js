import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const assetsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/letterhead');
const logoPath = path.join(assetsDir, 'logo.png');
const signaturePath = path.join(assetsDir, 'signature.png');

const NAVY = '#0A2F55';
const ORANGE = '#E87722';
const INK = '#222222';
const MUTED = '#66707A';
const LEFT = 50;
const ROW = '#F7F8FA';

export function sanitizeFileNamePart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function letterDownloadName(documentType, person = {}) {
  const company = sanitizeFileNamePart(COMPANY.brand) || 'IndonorTech';
  const employee = sanitizeFileNamePart([person.firstName, person.lastName].filter(Boolean).join(' ')) || 'Employee';
  const type = sanitizeFileNamePart(documentType) || 'Letter';
  return `${company}-${employee}-${type}.pdf`;
}

export const COMPANY = {
  legalName: 'INDONOR TECHNOLOGIES PRIVATE LIMITED',
  brand: 'IndonorTech',
  tagline: 'Norway–India Technology Consulting',
  cin: 'U62013DL2026PTC468548',
  gstin: '10AAJCI0107J1Z5',
  email: 'info@indonortech.com',
  website: 'www.indonortech.com',
  phones: {
    norway: '(+47) 414 416 28',
    india: '(+91) 78998 76574'
  },
  offices: {
    india: 'India Delivery Center, New Delhi, India 110026',
    norway: 'Norway Office, Oslo Region, Norway'
  },
  signatory: 'Ghulam Shubhani',
  signatoryTitle: 'Director'
};

export const SALARY_TYPES = {
  MONTHLY: 'monthly salary',
  ANNUAL_CTC: 'annual CTC',
  STIPEND: 'monthly stipend',
  UNPAID: 'unpaid internship'
};

export function unpaidInternship(options = {}) {
  return options.salaryType === 'UNPAID'
    || /intern/i.test(options.employmentType || '')
    || /intern/i.test(options.position || options.applyingPosition || '');
}

export function normalizeLetterPay(body = {}) {
  if (unpaidInternship(body)) return { ...body, salary: 0, salaryType: 'UNPAID' };
  return body;
}

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

function longDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function roleLine(position, track) {
  return [position, track].map((value) => String(value || '').trim()).filter(Boolean).join(' · ');
}

function prettyLabel(value) {
  return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function durationLabel(months) {
  const n = Number(months);
  if (!n) return '';
  return n === 1 ? '1 month' : `${n} months`;
}

function tenureDetails(options) {
  return [
    durationLabel(options.durationMonths) ? { label: 'Duration', value: durationLabel(options.durationMonths) } : null,
    options.lastWorkingDate ? { label: 'Last working day', value: longDate(options.lastWorkingDate) } : null
  ];
}

function tenureSection(options, intern, offerKind) {
  const duration = durationLabel(options.durationMonths);
  const lastDay = longDate(options.lastWorkingDate);
  if (!duration && !lastDay) return null;
  if (duration && lastDay) {
    return {
      heading: intern ? 'Duration of internship' : 'Duration',
      body: `This ${offerKind} is for a period of ${duration}, commencing on ${longDate(options.joiningDate)} and ending on ${lastDay}, unless extended or ended earlier in writing.`
    };
  }
  if (duration) {
    return {
      heading: intern ? 'Duration of internship' : 'Duration',
      body: `This ${offerKind} is for a period of ${duration} commencing on ${longDate(options.joiningDate)}, unless extended or ended earlier in writing.`
    };
  }
  return {
    heading: 'Last working day',
    body: `Your last working day shall be ${lastDay}, unless extended or ended earlier in writing.`
  };
}

function weekendOffEnabled(options) {
  return options.weekendOff !== false;
}

function workingHoursEnabled(options) {
  return options.workingHours !== false;
}

function weeklyOffDetails(options) {
  return [
    ...(workingHoursEnabled(options) ? [{ label: 'Working hours', value: '8 hours per day' }] : []),
    ...(weekendOffEnabled(options) ? [{ label: 'Weekly off', value: 'Saturday and Sunday' }] : [])
  ];
}

function weeklyOffSection(options, offerKind) {
  const weekend = weekendOffEnabled(options);
  const hours = workingHoursEnabled(options);
  if (!weekend && !hours) return null;
  const parts = [];
  if (hours) parts.push('Normal working hours are 8 hours per working day.');
  if (weekend) {
    parts.push(`The working week for this ${offerKind} is Monday to Friday. Saturday and Sunday are weekly offs.`);
    parts.push('You may occasionally be required to work on a weekly off for business needs, with a compensatory off as per Company policy.');
  }
  return {
    heading: hours && weekend ? 'Working hours and weekly off' : hours ? 'Working hours' : 'Working days and weekly off',
    body: parts.join(' ')
  };
}

function payLine(options) {
  if (unpaidInternship(options)) return 'Unpaid internship';
  const how = options.salaryType === 'ANNUAL_CTC' ? 'Annual CTC' : options.salaryType === 'STIPEND' ? 'Monthly stipend' : 'Monthly salary';
  return `${money(options.salary)} · ${how}`;
}

function compensationSentence(options) {
  if (unpaidInternship(options)) {
    return 'This internship is unpaid. No stipend, salary, or other monetary compensation is payable by the Company. The internship is intended for learning and skill development and does not, by itself, create a right to regular employment.';
  }
  const how = options.salaryType === 'ANNUAL_CTC'
    ? 'as annual cost to company (CTC)'
    : options.salaryType === 'STIPEND'
      ? 'as a monthly stipend'
      : 'as monthly salary';
  return `You will be paid ${money(options.salary)} ${how}. Tax, if applicable, will be deducted as per law.`;
}

export function letterPerson(record = {}) {
  return {
    firstName: record.firstName || '',
    lastName: record.lastName || '',
    email: record.email || record.companyEmail || record.personalEmail || '',
    phone: record.phone || '',
    address: record.address || '',
    city: record.city || '',
    state: record.state || '',
    postalCode: record.postalCode || '',
    country: record.country || '',
    registrationNumber: record.candidateRegistrationNumber || record.employeeRegistrationNumber || 'INDO'
  };
}

function recipientLines(person) {
  return [
    [person.firstName, person.lastName].filter(Boolean).join(' '),
    person.address,
    [person.city, person.state, person.postalCode].filter(Boolean).join(', '),
    person.country
  ].filter(Boolean);
}

function startLine(doc, y = doc.y) {
  doc.x = LEFT;
  doc.y = y;
}

function drawHeader(doc) {
  const pageWidth = doc.page.width;
  const logoWidth = 82;
  let logoBottom = 90;
  if (fs.existsSync(logoPath)) {
    const logo = doc.openImage(logoPath);
    const logoHeight = logoWidth * (logo.height / logo.width);
    doc.image(logo, LEFT, 22, { width: logoWidth, height: logoHeight });
    logoBottom = 22 + logoHeight;
  }

  const textX = LEFT + logoWidth + 18;
  const textW = pageWidth - textX - LEFT;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(COMPANY.legalName, textX, 26, { width: textW, align: 'right', lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8);
  doc.text(COMPANY.offices.india, textX, 42, { width: textW, align: 'right', lineBreak: false });
  doc.text(COMPANY.offices.norway, textX, 54, { width: textW, align: 'right', lineBreak: false });
  doc.text(`${COMPANY.phones.india}  ·  ${COMPANY.phones.norway}`, textX, 66, { width: textW, align: 'right', lineBreak: false });
  doc.text(`${COMPANY.email}  ·  ${COMPANY.website}`, textX, 78, { width: textW, align: 'right', lineBreak: false });

  const ruleY = Math.max(92, logoBottom) + 8;
  doc.save();
  doc.moveTo(LEFT, ruleY).lineTo(pageWidth - LEFT, ruleY).lineWidth(1.2).strokeColor(NAVY).stroke();
  doc.moveTo(LEFT, ruleY + 2.5).lineTo(pageWidth - LEFT, ruleY + 2.5).lineWidth(0.6).strokeColor(ORANGE).stroke();
  doc.restore();
  startLine(doc, ruleY + 18);
}

function drawFooter(doc) {
  if (doc._paintingLetterFooter) return;
  doc._paintingLetterFooter = true;
  const savedX = doc.x;
  const savedY = doc.y;
  const savedMargins = { ...doc.page.margins };
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
  const pageWidth = doc.page.width;
  const y = doc.page.height - 46;
  doc.save();
  doc.moveTo(LEFT, y).lineTo(pageWidth - LEFT, y).lineWidth(0.8).strokeColor(NAVY).stroke();
  doc.restore();
  doc.fillColor(MUTED).font('Helvetica').fontSize(7);
  doc.text(`${COMPANY.offices.india}  ·  ${COMPANY.offices.norway}`, LEFT, y + 8, { width: pageWidth - 100, align: 'center', lineBreak: false });
  doc.text(`CIN ${COMPANY.cin}  ·  GSTIN ${COMPANY.gstin}  ·  ${COMPANY.website}`, LEFT, y + 20, { width: pageWidth - 100, align: 'center', lineBreak: false });
  doc.page.margins = savedMargins;
  doc.x = savedX;
  doc.y = savedY;
  doc._paintingLetterFooter = false;
}

function drawDetails(doc, width, rows) {
  const items = rows.filter((row) => row?.value);
  if (!items.length) return;
  const labelW = 140;
  const startY = doc.y;
  items.forEach((row, index) => {
    const y = startY + index * 26;
    if (index % 2 === 0) {
      doc.save();
      doc.rect(LEFT, y, width, 26).fill(ROW);
      doc.restore();
    }
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(row.label, LEFT + 12, y + 8, { width: labelW - 12, lineBreak: false });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(row.value, LEFT + labelW, y + 7, { width: width - labelW - 12, lineBreak: false });
  });
  doc.save();
  doc.lineWidth(0.6).strokeColor('#E2E6EA').rect(LEFT, startY, width, items.length * 26).stroke();
  doc.restore();
  startLine(doc, startY + items.length * 26 + 16);
}

function writeSections(doc, width, sections) {
  (sections || []).forEach((section) => {
    startLine(doc, doc.y + 4);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5).text(section.heading, LEFT, doc.y, { width });
    startLine(doc, doc.y + 3);
    doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(section.body, LEFT, doc.y, { width, align: 'justify', lineGap: 2 });
    startLine(doc, doc.y + 8);
  });
}

function buildPdf({ person, issuedAt, refCode, title, paragraphs, details, sections, closing, requireReturn }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 24, left: LEFT, right: LEFT, bottom: 64 } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.on('pageAdded', () => drawFooter(doc));

    const width = doc.page.width - LEFT * 2;
    const issued = issuedAt || new Date();
    const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Team member';

    drawHeader(doc);

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text(title, LEFT, doc.y, { width, align: 'center' });
    startLine(doc, doc.y + 10);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(longDate(issued), LEFT, doc.y, { width, align: 'right' });
    startLine(doc, doc.y + 16);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11);
    recipientLines(person).forEach((line, index) => {
      doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(index === 0 ? 11 : 10).fillColor(index === 0 ? INK : MUTED);
      doc.text(line, LEFT, doc.y, { width });
    });

    startLine(doc, doc.y + 14);
    (paragraphs || []).forEach((paragraph) => {
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(paragraph, LEFT, doc.y, { width, align: 'justify', lineGap: 2.2 });
      startLine(doc, doc.y + 10);
    });

    drawDetails(doc, width, details || []);
    writeSections(doc, width, sections);

    if (closing) {
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(closing, LEFT, doc.y, { width, align: 'justify', lineGap: 2.2 });
      startLine(doc, doc.y + 18);
    }

    const col = (width - 36) / 2;
    const signY = doc.y;
    if (fs.existsSync(signaturePath)) {
      doc.image(signaturePath, LEFT, signY, { width: 110 });
    }
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(COMPANY.signatory, LEFT, signY + 44, { width: col });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(`${COMPANY.signatoryTitle}\n${COMPANY.legalName}`, LEFT, signY + 58, { width: col });

    if (requireReturn) {
      const right = LEFT + col + 36;
      doc.save();
      doc.moveTo(right, signY + 36).lineTo(right + col, signY + 36).lineWidth(0.7).strokeColor(NAVY).stroke();
      doc.restore();
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(`Signature of ${fullName}`, right, signY + 42, { width: col });
      doc.fillColor(MUTED).fontSize(8.5).text(`Date ________________`, right, signY + 58, { width: col });
      doc.text(`Please email the signed copy to ${COMPANY.email}`, right, signY + 72, { width: col });
    }

    doc.fillColor('#FFFFFF').fontSize(1).text(refCode, LEFT, doc.page.height - 8, { lineBreak: false });
    drawFooter(doc);
    doc.end();
  });
}

export function generateOfferLetterPdf(options) {
  const person = letterPerson(options.candidate || options.person || {});
  const issued = options.issuedAt || new Date();
  const intern = unpaidInternship(options);
  const offerKind = intern ? 'internship' : 'employment';
  const role = roleLine(options.position, options.track) || (intern ? 'Intern' : 'Team Member');
  const alreadyJoined = Boolean(options.alreadyJoined);
  const notice = intern ? 7 : 30;
  const mode = prettyLabel(options.workMode);
  const title = intern
    ? (alreadyJoined ? 'Internship Confirmation Letter' : 'Internship Offer Letter')
    : (alreadyJoined ? 'Appointment Letter' : 'Offer Letter');
  const paragraphs = alreadyJoined
    ? [
      `This letter confirms your ${offerKind} with ${COMPANY.legalName} as ${role}. You are already associated with the Company, and this letter is issued on official letterhead for your records.`
    ]
    : [
      `Following your selection after the interview process, we are pleased to offer you ${intern ? 'an internship' : 'employment'} with ${COMPANY.legalName} as ${role}.`
    ];
  return buildPdf({
    person,
    issuedAt: issued,
    refCode: `${person.registrationNumber}/OL/${issued.toISOString().slice(0, 10)}`,
    title,
    paragraphs,
    details: [
      { label: 'Position', value: role },
      { label: intern ? 'Start date' : 'Joining date', value: longDate(options.joiningDate) },
      intern ? null : { label: 'Employment type', value: prettyLabel(options.employmentType) },
      ...tenureDetails(options),
      { label: 'Compensation', value: payLine(options) },
      options.workMode ? { label: 'Work mode', value: prettyLabel(options.workMode) } : null,
      ...weeklyOffDetails(options),
      { label: 'Notice period', value: `${notice} days` },
      alreadyJoined ? null : { label: 'Offer valid until', value: longDate(options.offerExpiryDate || options.joiningDate) }
    ].filter(Boolean),
    sections: [
      {
        heading: 'Designation',
        body: `You ${alreadyJoined ? 'are designated' : 'will be designated'} as ${role}. You shall perform such duties as may be assigned to you from time to time and shall report to the person nominated by the Company.`
      },
      {
        heading: intern ? 'Date of commencement' : 'Date of joining',
        body: alreadyJoined
          ? `Your ${offerKind} commenced / is recorded as having commenced on ${longDate(options.joiningDate)}.`
          : `Your ${offerKind} shall commence on ${longDate(options.joiningDate)}, or on such other date as may be mutually agreed in writing.`
      },
      tenureSection(options, intern, offerKind),
      {
        heading: intern ? 'Nature of internship' : 'Employment',
        body: intern
          ? `This is an internship engagement. ${compensationSentence(options)}`
          : `You will be engaged on a ${prettyLabel(options.employmentType)} basis. ${compensationSentence(options)}`
      },
      options.workMode ? {
        heading: 'Place and mode of work',
        body: `The ${offerKind} shall be ${mode.toLowerCase()}. The Company’s India Delivery Center is at New Delhi, India 110026, and the Norway Office is in the Oslo Region, Norway. You may be required to work from either location, or remotely, as the Company may reasonably direct.`
      } : null,
      weeklyOffSection(options, offerKind),
      {
        heading: 'Confidentiality and conduct',
        body: 'You shall keep confidential all Company, client, and project information that comes to your knowledge during this engagement, and shall continue to do so after it ends. You shall follow Company policies, lawful instructions, and professional standards at all times.'
      },
      {
        heading: 'Termination',
        body: `Either party may end this ${offerKind} by giving ${notice} days’ written notice, or payment in lieu thereof, unless a different period is agreed in writing. The Company may terminate the engagement immediately in case of misconduct, breach of confidentiality, or material breach of these terms.`
      },
      alreadyJoined ? {
        heading: 'Acknowledgement',
        body: `Please sign this letter and email the signed copy to ${COMPANY.email} for our records.`
      } : {
        heading: 'Acceptance',
        body: `This offer is valid until ${longDate(options.offerExpiryDate || options.joiningDate)}. Sign this letter and email the signed copy to ${COMPANY.email} before that date. On receipt of the signed copy, this letter shall constitute the terms of your ${offerKind} with the Company.`
      }
    ].filter(Boolean),
    closing: intern
      ? 'We value your contribution to Indonor Technologies.'
      : alreadyJoined
        ? 'We value your contribution to Indonor Technologies.'
        : 'We look forward to having you with Indonor Technologies.',
    requireReturn: true
  });
}

export function generateAgreementLetterPdf(options) {
  const person = letterPerson(options.person || options.candidate || {});
  const issued = options.issuedAt || new Date();
  const intern = unpaidInternship(options);
  const role = roleLine(options.position, options.track) || (intern ? 'Intern' : 'Team Member');
  const notice = options.noticePeriod || (intern ? 7 : 30);
  return buildPdf({
    person,
    issuedAt: issued,
    refCode: `${person.registrationNumber}/AL/${issued.toISOString().slice(0, 10)}`,
    title: intern ? 'Internship Agreement' : 'Employment Agreement',
    paragraphs: [
      `This letter records the terms of your ${intern ? 'internship' : 'employment'} with ${COMPANY.legalName} as ${role}.`
    ],
    details: [
      { label: 'Position', value: role },
      { label: 'Start date', value: longDate(options.joiningDate) },
      ...tenureDetails(options),
      { label: 'Compensation', value: payLine(options) },
      options.workMode ? { label: 'Work mode', value: prettyLabel(options.workMode) } : null,
      ...weeklyOffDetails(options),
      { label: 'Notice period', value: `${notice} days` }
    ].filter(Boolean),
    sections: [
      { heading: 'Role', body: `You shall serve as ${role} and perform duties assigned by the Company.` },
      { heading: 'Commencement', body: `Your ${intern ? 'internship' : 'employment'} commenced / shall commence on ${longDate(options.joiningDate)}.` },
      tenureSection(options, intern, intern ? 'internship' : 'employment'),
      { heading: intern ? 'Compensation' : 'Remuneration', body: compensationSentence(options) },
      options.workMode ? { heading: 'Work arrangement', body: `Work shall be ${prettyLabel(options.workMode).toLowerCase()}, at the Company’s India Delivery Center, New Delhi 110026, and/or the Norway Office, Oslo Region, as required.` } : null,
      weeklyOffSection(options, intern ? 'internship' : 'employment'),
      { heading: 'Notice', body: `Either party may end this arrangement by giving ${notice} days’ written notice, unless a different period is agreed in writing.` },
      { heading: 'Confidentiality', body: 'You shall keep Company, client, and project information confidential during and after this engagement, and shall follow Indonor policies, lawful instructions, and professional standards.' }
    ].filter(Boolean),
    closing: `Please sign this letter and email the signed copy to ${COMPANY.email}.`,
    requireReturn: true
  });
}

function drawIdPhoto(doc, x, y, size, photoPath, initials) {
  const usable = photoPath && fs.existsSync(photoPath);
  doc.save();
  doc.roundedRect(x, y, size, size, 6).clip();
  if (usable) {
    try {
      doc.image(photoPath, x, y, { fit: [size, size], align: 'center', valign: 'center' });
    } catch {
      doc.rect(x, y, size, size).fill('#E8EEF4');
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text(initials, x, y + size / 2 - 11, { width: size, align: 'center' });
    }
  } else {
    doc.rect(x, y, size, size).fill('#E8EEF4');
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text(initials, x, y + size / 2 - 11, { width: size, align: 'center' });
  }
  doc.restore();
  doc.save();
  doc.roundedRect(x, y, size, size, 6).lineWidth(0.9).strokeColor(NAVY).stroke();
  doc.restore();
}

function drawCardShell(doc, x, y, w, h) {
  doc.save();
  doc.roundedRect(x, y, w, h, 12).lineWidth(1.1).fillAndStroke('#FFFFFF', NAVY);
  doc.restore();
  doc.save();
  doc.roundedRect(x, y, w, 48, 12).fill(NAVY);
  doc.rect(x, y + 24, w, 24).fill(NAVY);
  doc.rect(x, y + 48, w, 4).fill(ORANGE);
  doc.restore();
}

export function generateCompanyCardPdf(options) {
  const person = letterPerson(options.person || {});
  const issued = options.issuedAt || new Date();
  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Team member';
  const role = roleLine(options.position, options.track) || 'Team Member';
  const initials = `${(person.firstName || 'I').slice(0, 1)}${(person.lastName || '').slice(0, 1)}`.toUpperCase();
  const employeeId = person.registrationNumber || 'INDO';
  const department = String(options.department || '').trim();
  const bloodGroup = String(options.bloodGroup || '').trim();
  const emergency = [options.emergencyName, options.emergencyPhone].filter(Boolean).join('  ·  ');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, right: 40, bottom: 40 } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const cardW = 360;
    const cardH = 226;
    const x = (pageW - cardW) / 2;
    let y = 72;

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text('Employee company card', 40, 36, { width: pageW - 80, align: 'center' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Print, laminate, and cut along the card edges.', 40, 56, { width: pageW - 80, align: 'center' });

    drawCardShell(doc, x, y, cardW, cardH);
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, x + 16, y + 10, { height: 28 });
    }
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(COMPANY.brand, x + 108, y + 12, { width: cardW - 124, align: 'right' });
    doc.font('Helvetica').fontSize(7.5).text('EMPLOYEE IDENTITY CARD', x + 108, y + 28, { width: cardW - 124, align: 'right' });

    const photoSize = 86;
    const photoX = x + 18;
    const photoY = y + 68;
    drawIdPhoto(doc, photoX, photoY, photoSize, options.photoPath, initials);

    const textX = photoX + photoSize + 16;
    const textW = cardW - photoSize - 50;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(fullName, textX, y + 68, { width: textW });
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text(role, textX, doc.y + 2, { width: textW });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8);
    doc.text(`ID  ${employeeId}`, textX, y + 118, { width: textW });
    if (department) doc.text(`Dept  ${department}`, textX, y + 132, { width: textW });
    if (options.joiningDate) doc.text(`Joined  ${longDate(options.joiningDate)}`, textX, y + 146, { width: textW });
    if (bloodGroup) doc.text(`Blood  ${bloodGroup}`, textX, y + 160, { width: textW });

    doc.fillColor(NAVY).font('Helvetica').fontSize(7.5);
    doc.text(person.email || COMPANY.email, x + 18, y + cardH - 28, { width: cardW - 36, lineBreak: false });
    doc.text(COMPANY.website, x + 18, y + cardH - 16, { width: cardW - 36, align: 'right', lineBreak: false });

    y += cardH + 28;
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('BACK', 40, y - 16, { width: pageW - 80, align: 'center' });
    drawCardShell(doc, x, y, cardW, cardH);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text(COMPANY.legalName, x + 18, y + 14, { width: cardW - 36, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).text(COMPANY.tagline, x + 18, y + 30, { width: cardW - 36, align: 'center' });

    doc.fillColor(INK).font('Helvetica').fontSize(8.5);
    doc.text(COMPANY.offices.india, x + 22, y + 68, { width: cardW - 44, align: 'center' });
    doc.text(COMPANY.offices.norway, x + 22, y + 82, { width: cardW - 44, align: 'center' });
    doc.fillColor(MUTED).fontSize(8);
    doc.text(`${COMPANY.phones.india}  ·  ${COMPANY.phones.norway}`, x + 22, y + 100, { width: cardW - 44, align: 'center' });
    doc.text(`${COMPANY.email}  ·  ${COMPANY.website}`, x + 22, y + 114, { width: cardW - 44, align: 'center' });

    if (emergency) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8).text('Emergency contact', x + 22, y + 138, { width: cardW - 44, align: 'center' });
      doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(emergency, x + 22, y + 152, { width: cardW - 44, align: 'center' });
    }

    doc.fillColor(MUTED).font('Helvetica').fontSize(7);
    doc.text('This card remains the property of the Company. If found, please return to Indonor Technologies.', x + 22, y + cardH - 42, { width: cardW - 44, align: 'center' });
    doc.text(`CIN ${COMPANY.cin}  ·  GSTIN ${COMPANY.gstin}`, x + 22, y + cardH - 22, { width: cardW - 44, align: 'center' });

    doc.fillColor('#FFFFFF').fontSize(1).text(`${employeeId}/CC/${issued.toISOString().slice(0, 10)}`, 40, doc.page.height - 12, { lineBreak: false });
    doc.end();
  });
}

export function generateRelievingLetterPdf(options) {
  const person = letterPerson(options.person || {});
  const issued = options.issuedAt || new Date();
  const role = roleLine(options.position, options.track) || 'Team Member';
  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'the employee';
  return buildPdf({
    person,
    issuedAt: issued,
    refCode: `${person.registrationNumber}/RL/${issued.toISOString().slice(0, 10)}`,
    title: 'Relieving Letter',
    paragraphs: [
      `This is to confirm that ${fullName} worked with ${COMPANY.legalName} as ${role}.`,
      options.noDues === false
        ? 'Clearance of dues, if any, will be handled as per company records.'
        : 'As per our records, there are no known dues pending in this regard. We wish them success ahead.'
    ],
    details: [
      { label: 'Position', value: role },
      options.joiningDate ? { label: 'Date of joining', value: longDate(options.joiningDate) } : null,
      { label: 'Last working day', value: longDate(options.lastWorkingDate) },
      { label: 'Relieved from', value: longDate(options.relievingDate || options.lastWorkingDate) }
    ].filter(Boolean),
    closing: '',
    requireReturn: false
  });
}
