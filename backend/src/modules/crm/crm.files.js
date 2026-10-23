import multer from 'multer';
import { storeFile, readPrivateFileBuffer } from '../../services/fileStorage.service.js';
import { AppError } from '../../utils/errors.js';

const allowedMime = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain', 'application/octet-stream'
]);
const allowedName = /\.(pdf|doc|docx|xls|xlsx|csv|jpg|jpeg|png|webp|gif)$/i;

function isAllowed(file) {
  return allowedMime.has(file.mimetype) || allowedName.test(file.originalname || '');
}

export const crmUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => {
    if (isAllowed(file)) return callback(null, true);
    callback(new AppError('Upload a PDF, Office, or image file.', 422));
  }
});

export async function storeCrmFile(file, ownerType, ownerId) {
  if (!file) throw new AppError('A file is required', 422);
  const stored = await storeFile(file, ownerType, ownerId);
  return {
    name: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    url: '',
    uploadedAt: new Date()
  };
}

export function contentDisposition(fileName) {
  const safe = String(fileName || 'document').replace(/[\r\n"]/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function sendStoredFile(res, document) {
  if (document.externalUrl) {
    res.redirect(302, document.externalUrl);
    return;
  }
  const buffer = await readPrivateFileBuffer(document);
  res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition(document.name || document.documentName || 'document'));
  res.send(buffer);
}
