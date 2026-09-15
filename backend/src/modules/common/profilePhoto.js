import multer from 'multer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document } from './support.model.js';
import { AppError } from '../../utils/errors.js';
import { getPrivateFileUrl, readPrivateFileBuffer, storeFile } from '../../services/fileStorage.service.js';

export const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) || /\.(jpe?g|png|webp|gif)$/i.test(file.originalname || '')) {
      return callback(null, true);
    }
    callback(new AppError('Upload a JPG, PNG, WEBP, or GIF photo.', 422));
  }
});

export function findProfilePhoto(ownerType, ownerId) {
  return Document.findOne({ ownerType, ownerId, type: 'PHOTO', isDeleted: false }).sort({ createdAt: -1 });
}

export async function sendProfilePhoto(res, photo, options = {}) {
  if (!photo) throw new AppError('Profile photo not found', 404);
  if (photo.externalUrl) return res.redirect(302, photo.externalUrl);
  if (!photo.storageKey) throw new AppError('Profile photo not found', 404);
  const mime = photo.mimeType || 'image/jpeg';
  const cacheControl = options.cacheControl || 'private, max-age=60';
  if (photo.storageProvider === 'cloudinary') {
    const buffer = await readPrivateFileBuffer(photo);
    res.setHeader('Cache-Control', cacheControl);
    res.type(mime);
    return res.send(buffer);
  }
  const file = await getPrivateFileUrl(photo);
  try { await fs.access(file); } catch { throw new AppError('Profile photo not found', 404); }
  res.setHeader('Cache-Control', cacheControl);
  res.type(mime);
  return res.sendFile(file);
}

export async function saveProfilePhoto({ ownerType, ownerId, file, userId }) {
  if (!file) throw new AppError('Choose a photo from your computer.', 422);
  const stored = await storeFile(file, ownerType, ownerId);
  const previous = await Document.find({ ownerType, ownerId, type: 'PHOTO', isDeleted: false });
  const document = await Document.create({
    ownerType,
    ownerId,
    type: 'PHOTO',
    name: file.originalname,
    ...stored,
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: userId
  });
  await Promise.all(previous.map((item) => {
    item.isDeleted = true;
    item.deletedAt = new Date();
    return item.save();
  }));
  return document;
}

export async function profilePhotoFilePath(ownerType, ownerId) {
  const photo = await findProfilePhoto(ownerType, ownerId).lean();
  if (!photo?.storageKey && !photo?.externalUrl) return '';
  const looksImage = /\.(jpe?g|png|webp|gif)$/i.test(photo.storageKey || '')
    || /\.(jpe?g|png|webp|gif)$/i.test(photo.name || '')
    || String(photo.mimeType || '').startsWith('image/');
  if (!looksImage && !photo.externalUrl) return '';
  try {
    if (photo.storageProvider === 'cloudinary') {
      const buffer = await readPrivateFileBuffer(photo);
      const extension = path.extname(photo.name || photo.storageKey || '.jpg') || '.jpg';
      const tmp = path.join(os.tmpdir(), `indonor-photo-${ownerId}${extension}`);
      await fs.writeFile(tmp, buffer);
      return tmp;
    }
    if (photo.storageProvider === 'local') return getPrivateFileUrl(photo);
    return '';
  } catch {
    return '';
  }
}
