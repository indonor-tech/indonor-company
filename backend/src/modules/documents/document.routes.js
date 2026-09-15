import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Document } from '../common/support.model.js';
import Employee from '../employees/employee.model.js';
import Candidate from '../recruitment/candidate.model.js';
import { getPrivateFileUrl, readPrivateFileBuffer, removeFile, storeFile } from '../../services/fileStorage.service.js';
import { letterDownloadName } from '../../services/offerLetter.service.js';
import { authenticate, isOwnEmployee } from '../../middleware/auth.js';
import { hasPermission, hasTabAccess } from '../auth/roles.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';

function canViewOwnFile(user, ownerType, ownerId) {
  return ownerType === 'Employee' && isOwnEmployee(user, ownerId) && (hasTabAccess(user, 'documents', 'view') || hasTabAccess(user, 'certificates', 'view'));
}

function canEditOwnFile(user, ownerType, ownerId) {
  return ownerType === 'Employee' && isOwnEmployee(user, ownerId) && (hasTabAccess(user, 'documents', 'edit') || hasTabAccess(user, 'certificates', 'edit'));
}

function assertDocumentAccess(user, { ownerType, ownerId }, action) {
  if (action === 'read' && (hasPermission(user, 'documents:read') || canViewOwnFile(user, ownerType, ownerId))) return;
  if (action === 'upload' && (hasPermission(user, 'documents:upload') || canEditOwnFile(user, ownerType, ownerId))) return;
  if (action === 'delete' && (hasPermission(user, 'documents:delete') || (ownerType === 'Employee' && isOwnEmployee(user, ownerId) && hasTabAccess(user, 'documents', 'edit')))) return;
  throw new AppError('You do not have permission for this action', 403);
}

const LETTER_DOWNLOAD_TYPES = {
  OFFER_LETTER: 'Offer-Letter',
  AGREEMENT_LETTER: 'Agreement-Letter',
  RELIEVING_LETTER: 'Relieving-Letter',
  COMPANY_CARD: 'Company-Card'
};

function contentDisposition(fileName) {
  const safe = String(fileName || 'document.pdf').replace(/[\r\n"]/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

async function downloadFileName(document) {
  const letterType = LETTER_DOWNLOAD_TYPES[document.type];
  if (letterType && document.ownerId) {
    const Model = document.ownerType === 'Employee' ? Employee : document.ownerType === 'Candidate' ? Candidate : null;
    const person = Model ? await Model.findById(document.ownerId).select('firstName lastName').lean() : null;
    if (person) return letterDownloadName(letterType, person);
  }
  const name = String(document.name || 'document').replace(/[\r\n"]/g, '_');
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  if ((document.mimeType || '').includes('pdf')) return `${name}.pdf`;
  return name;
}

const router = express.Router();
const allowedMime = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain', 'application/octet-stream'
]);
const allowedName = /\.(pdf|doc|docx|jpg|jpeg|png|webp|gif)$/i;
function isAllowed(file) {
  return allowedMime.has(file.mimetype) || allowedName.test(file.originalname || '');
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, callback) => {
    if (isAllowed(file)) return callback(null, true);
    callback(new AppError('Upload a PDF, Word, or image file. Multi-page PDFs are allowed.', 422));
  }
});
router.use(authenticate);
router.get('/file/:id', asyncHandler(async (req, res) => {
  const document = await Document.findOne({ _id: req.params.id, isDeleted: false });
  if (!document) throw new AppError('Document not found', 404);
  assertDocumentAccess(req.user, document, 'read');
  if (document.externalUrl) return res.redirect(302, document.externalUrl);
  if (!document.storageKey) throw new AppError('Document file is unavailable', 404);
  const fileName = await downloadFileName(document);
  if (document.storageProvider === 'cloudinary') {
    try {
      const buffer = await readPrivateFileBuffer(document);
      res.setHeader('Content-Disposition', contentDisposition(fileName));
      res.type(document.mimeType || 'application/pdf');
      return res.send(buffer);
    } catch {
      throw new AppError('Document file is unavailable', 404);
    }
  }
  const file = await getPrivateFileUrl(document);
  try { await fs.access(file); } catch { throw new AppError('Document file is unavailable', 404); }
  res.setHeader('Content-Disposition', contentDisposition(fileName));
  res.type(document.mimeType || 'application/octet-stream');
  return res.sendFile(file);
}));
router.get('/:ownerType/:ownerId', asyncHandler(async (req, res) => {
  assertDocumentAccess(req.user, req.params, 'read');
  const data = await Document.find({ ownerType: req.params.ownerType, ownerId: req.params.ownerId, isDeleted: false }).populate('uploadedBy', 'name').sort({ createdAt: -1 }).lean();
  return sendSuccess(res, data, 'Documents fetched');
}));
router.post('/:ownerType/:ownerId', upload.any(), asyncHandler(async (req, res) => {
  assertDocumentAccess(req.user, req.params, 'upload');
  const files = (req.files || []).filter((file) => ['file', 'files'].includes(file.fieldname));
  const externalUrl = String(req.body.externalUrl || req.body.url || '').trim();
  const type = req.body.type || 'OTHER';
  const created = [];
  if (externalUrl) {
    created.push(await Document.create({
      ownerType: req.params.ownerType, ownerId: req.params.ownerId, type,
      name: req.body.name || externalUrl, storageProvider: 'external', externalUrl,
      uploadedBy: req.user._id, expiryDate: req.body.expiryDate
    }));
  }
  for (const file of files) {
    let stored;
    try {
      stored = await storeFile(file, req.params.ownerType, req.params.ownerId);
    } catch (error) {
      throw new AppError(error.message || 'Could not store the uploaded file.', 502);
    }
    created.push(await Document.create({
      ownerType: req.params.ownerType, ownerId: req.params.ownerId, type, name: file.originalname,
      ...stored, mimeType: file.mimetype, size: file.size, uploadedBy: req.user._id, expiryDate: req.body.expiryDate
    }));
  }
  if (!created.length) throw new AppError('Upload a PDF, Word, or image, or paste a document URL.', 422);
  return sendSuccess(res, created.length === 1 ? created[0] : created, created.length > 1 ? 'Documents uploaded securely' : 'Document uploaded securely');
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  const document = await Document.findOne({ _id: req.params.id, isDeleted: false });
  if (!document) throw new AppError('Document not found', 404);
  assertDocumentAccess(req.user, document, 'delete');
  if (document.storageProvider !== 'external') await removeFile(document);
  document.isDeleted = true; document.deletedAt = new Date(); await document.save();
  return sendSuccess(res, null, 'Document archived');
}));
export default router;
