import path from 'node:path';
import multer from 'multer';
import { AppError } from '../../../utils/errors.js';
import { URL_KINDS } from '../task.constants.js';

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
const startsWith = (buffer, bytes, offset = 0) => buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte);
const isZip = (buffer) => startsWith(buffer, ZIP) || startsWith(buffer, ZIP_EMPTY);
const ascii = (value) => [...value].map((char) => char.charCodeAt(0));
const GENERIC = ['application/octet-stream'];

/** Extension → canonical MIME, accepted client MIME types and a magic-byte signature check. */
export const TASK_FILE_TYPES = {
  '.pdf': { mime: 'application/pdf', accept: ['application/pdf'], signature: (b) => startsWith(b, ascii('%PDF')) },
  '.doc': { mime: 'application/msword', accept: ['application/msword', ...GENERIC], signature: (b) => startsWith(b, OLE) },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', accept: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', ...GENERIC], signature: isZip },
  '.xls': { mime: 'application/vnd.ms-excel', accept: ['application/vnd.ms-excel', ...GENERIC], signature: (b) => startsWith(b, OLE) },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', accept: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', ...GENERIC], signature: isZip },
  '.ppt': { mime: 'application/vnd.ms-powerpoint', accept: ['application/vnd.ms-powerpoint', ...GENERIC], signature: (b) => startsWith(b, OLE) },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', accept: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', ...GENERIC], signature: isZip },
  '.jpg': { mime: 'image/jpeg', accept: ['image/jpeg', 'image/pjpeg'], signature: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  '.jpeg': { mime: 'image/jpeg', accept: ['image/jpeg', 'image/pjpeg'], signature: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  '.png': { mime: 'image/png', accept: ['image/png'], signature: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  '.webp': { mime: 'image/webp', accept: ['image/webp'], signature: (b) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8) },
  '.zip': { mime: 'application/zip', accept: ['application/zip', 'application/x-zip-compressed', 'application/x-zip', ...GENERIC], signature: isZip }
};

export const TASK_UPLOAD_MAX_BYTES = Math.max(1, Number(process.env.TASK_UPLOAD_MAX_MB || 10)) * 1024 * 1024;
export const TASK_UPLOAD_MAX_FILES = 5;

export function safeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_').trim();
  return (base || 'file').slice(0, 200);
}

function checkDeclared(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const type = TASK_FILE_TYPES[extension];
  if (!type) throw new AppError(`File type ${extension || '(none)'} is not allowed. Allowed: ${Object.keys(TASK_FILE_TYPES).join(', ')}`, 422);
  if (!type.accept.includes(String(file.mimetype || '').toLowerCase())) throw new AppError(`The file content type ${file.mimetype || 'unknown'} does not match ${extension}.`, 422);
  return { extension, type };
}

/** Full validation after upload: extension whitelist, declared MIME, size and magic bytes. Returns the canonical MIME. */
export function validateTaskUpload(file) {
  const { extension, type } = checkDeclared(file);
  if (!file.buffer?.length) throw new AppError('The uploaded file is empty.', 422);
  if (file.buffer.length > TASK_UPLOAD_MAX_BYTES) throw new AppError(`Files must be ${Math.round(TASK_UPLOAD_MAX_BYTES / 1024 / 1024)} MB or smaller.`, 422);
  if (!type.signature(file.buffer)) throw new AppError(`The file ${safeFileName(file.originalname)} does not look like a valid ${extension} file.`, 422);
  return { extension, mimeType: type.mime, name: safeFileName(file.originalname) };
}

export const taskUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TASK_UPLOAD_MAX_BYTES, files: TASK_UPLOAD_MAX_FILES, fields: 20 },
  fileFilter: (_req, file, callback) => {
    try {
      checkDeclared(file);
      callback(null, true);
    } catch (error) {
      callback(error);
    }
  }
});

/** Wraps multer so size/count errors surface as 422 validation errors. */
export function taskUploadMiddleware(field = 'files') {
  const handler = taskUpload.array(field, TASK_UPLOAD_MAX_FILES);
  return (req, res, next) => handler(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? `Files must be ${Math.round(TASK_UPLOAD_MAX_BYTES / 1024 / 1024)} MB or smaller.`
        : error.code === 'LIMIT_FILE_COUNT' ? `Upload at most ${TASK_UPLOAD_MAX_FILES} files at a time.` : error.message;
      return next(new AppError(message, 422));
    }
    return next(error);
  });
}

const KIND_HOSTS = [
  ['GITHUB', /(^|\.)github\.com$/],
  ['GITLAB', /(^|\.)gitlab\.(com|io)$/],
  ['JIRA', /(^|\.)(atlassian\.net|jira\.com)$/],
  ['FIGMA', /(^|\.)figma\.com$/],
  ['GOOGLE_DRIVE', /(^|\.)(drive|docs)\.google\.com$/],
  ['DEPLOYMENT', /(^|\.)(vercel\.app|netlify\.app|onrender\.com|herokuapp\.com|pages\.dev|web\.app|firebaseapp\.com)$/]
];

export function detectUrlKind(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return KIND_HOSTS.find(([, pattern]) => pattern.test(host))?.[0] || 'OTHER';
  } catch {
    return 'OTHER';
  }
}

/** Accepts only absolute http(s) URLs with a real host and no embedded credentials. */
export function normalizeTaskUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new AppError('URL is required.', 422);
  if (raw.length > 2048) throw new AppError('URL is too long.', 422);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError(`"${raw.slice(0, 80)}" is not a valid URL.`, 422);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new AppError('Only http:// and https:// links are allowed.', 422);
  if (parsed.username || parsed.password) throw new AppError('Links must not contain usernames or passwords.', 422);
  const host = parsed.hostname.toLowerCase();
  if (!host || (!host.includes('.') && host !== 'localhost')) throw new AppError('Links must include a valid host name.', 422);
  return parsed.toString();
}

export function buildUrlEntry({ url, label, kind }) {
  const normalized = normalizeTaskUrl(url);
  const resolvedKind = URL_KINDS.includes(kind) && kind !== 'OTHER' ? kind : detectUrlKind(normalized);
  return { url: normalized, label: String(label || '').trim().slice(0, 160) || undefined, kind: resolvedKind };
}
