import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import cloudinary, { cloudinaryEnabled } from '../config/cloudinary.js';

const privateDir = path.resolve('private-files');
export const publicTeamPhotoDir = path.resolve('public-files', 'website-team');
export const publicProjectMediaDir = path.resolve('public-files', 'website-projects');
const publicImageName = /\.(jpe?g|png|webp|gif)$/i;
const publicVideoName = /\.(mp4|webm|mov)$/i;

function isTlsError(error) {
  const message = [
    error?.message,
    error?.cause?.message,
    error?.error?.message,
    error?.code,
    error?.error?.code,
    error?.cause?.code
  ].filter(Boolean).join(' ');
  return /unable to verify|self[- ]signed|CERT_HAS_EXPIRED|UNABLE_TO_GET_ISSUER|UNABLE_TO_VERIFY|UNABLE_TO_VERIFY_LEAF|certificate/i.test(message);
}

async function withDevTlsRetry(task) {
  try {
    return await task();
  } catch (error) {
    if (!(isTlsError(error) && env.nodeEnv !== 'production')) throw error;
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      console.warn('[storage] Retrying Cloudinary upload without TLS verification (development only).');
      return await task();
    } finally {
      if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }
}

function uploadPublicCloudinary(file, options) {
  return withDevTlsRetry(() => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => error ? reject(error) : resolve(result));
    stream.end(file.buffer);
  }));
}

async function storeLocally(file, baseName) {
  const extension = path.extname(file.originalname).toLowerCase();
  await fs.mkdir(privateDir, { recursive: true });
  await fs.writeFile(path.join(privateDir, baseName), file.buffer);
  return { storageProvider: 'local', storageKey: baseName, resourceType: 'local', extension };
}

export async function storeFile(file, ownerType, ownerId) {
  const extension = path.extname(file.originalname).toLowerCase();
  const baseName = `${crypto.randomUUID()}${extension}`;
  if (env.storageProvider !== 'cloudinary') return storeLocally(file, baseName);
  if (!cloudinaryEnabled) {
    console.warn('[storage] Cloudinary is not configured; saving the file on this server.');
    return storeLocally(file, baseName);
  }
  try {
    const publicId = `indonor/hr/${ownerType.toLowerCase()}/${ownerId}/${path.basename(baseName, extension)}`;
    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        public_id: publicId,
        resource_type: 'raw',
        type: 'authenticated',
        overwrite: false,
        use_filename: false
      }, (error, result) => error ? reject(error) : resolve(result));
      stream.end(file.buffer);
    });
    return { storageProvider: 'cloudinary', storageKey: uploaded.public_id, resourceType: 'raw', extension };
  } catch (error) {
    if (isTlsError(error) || env.nodeEnv !== 'production') {
      console.warn('[storage] Cloudinary upload failed; saving the file on this server.', error.message);
      return storeLocally(file, baseName);
    }
    throw error;
  }
}

export async function getPrivateFileUrl(document) {
  if (document.storageProvider === 'cloudinary') {
    return cloudinary.utils.private_download_url(document.storageKey, document.extension?.replace('.', '') || 'bin', {
      resource_type: document.resourceType || 'raw',
      type: 'authenticated',
      attachment: true
    });
  }
  return path.join(privateDir, document.storageKey);
}

function signedCloudinaryUrls(document) {
  const format = String(document.extension || 'pdf').replace('.', '');
  const options = {
    resource_type: document.resourceType || 'raw',
    type: 'authenticated',
    sign_url: true,
    secure: true
  };
  return [
    cloudinary.url(document.storageKey, { ...options, format, flags: 'attachment' }),
    cloudinary.url(document.storageKey, { ...options, format }),
    cloudinary.utils.private_download_url(document.storageKey, format, {
      resource_type: document.resourceType || 'raw',
      type: 'authenticated',
      attachment: true
    })
  ];
}

export async function readPrivateFileBuffer(document) {
  if (document.storageProvider !== 'cloudinary') {
    return fs.readFile(path.join(privateDir, document.storageKey));
  }
  let lastError;
  for (const url of signedCloudinaryUrls(document)) {
    try {
      const response = await fetch(url);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      lastError = new Error(`Cloudinary responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Document file is unavailable');
}

export async function removeFile(document) {
  if (!document?.storageKey || document.storageProvider === 'external') return;
  if (document.storageProvider === 'cloudinary') {
    await cloudinary.uploader.destroy(document.storageKey, { resource_type: document.resourceType || 'raw', type: 'authenticated', invalidate: true });
    return;
  }
  await fs.rm(path.join(privateDir, document.storageKey), { force: true });
}

export async function storePublicImage(file, _publicBaseUrl, options = {}) {
  const extension = publicImageName.test(file.originalname) ? path.extname(file.originalname).toLowerCase() : '.jpg';
  const baseName = `${crypto.randomUUID()}${extension === '.jpeg' ? '.jpg' : extension}`;
  const folder = options.folder || 'indonor/website-team';
  const localDir = options.localDir || publicTeamPhotoDir;
  const urlPath = options.urlPath || '/api/v1/website-team/photos';
  if (cloudinaryEnabled) {
    try {
      const uploaded = await uploadPublicCloudinary(file, {
        folder,
        resource_type: 'image',
        type: 'upload',
        overwrite: false
      });
      if (uploaded?.secure_url) return { photoUrl: uploaded.secure_url };
    } catch (error) {
      if (!(isTlsError(error) || env.nodeEnv !== 'production')) throw error;
      console.warn('[storage] Cloudinary public image upload failed; saving the file on this server.', error.message);
    }
  }
  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(path.join(localDir, baseName), file.buffer);
  return { photoUrl: `${urlPath}/${baseName}` };
}

export async function storePublicVideo(file, _publicBaseUrl) {
  const extension = publicVideoName.test(file.originalname) ? path.extname(file.originalname).toLowerCase() : '.mp4';
  const baseName = `${crypto.randomUUID()}${extension}`;
  if (cloudinaryEnabled) {
    try {
      const uploaded = await uploadPublicCloudinary(file, {
        folder: 'indonor/website-projects',
        resource_type: 'video',
        type: 'upload',
        overwrite: false
      });
      if (uploaded?.secure_url) return { videoUrl: uploaded.secure_url, videoPublicId: uploaded.public_id || '' };
    } catch (error) {
      if (!(isTlsError(error) || env.nodeEnv !== 'production')) throw error;
      console.warn('[storage] Cloudinary video upload failed; saving the file on this server.', error.message);
    }
  }
  await fs.mkdir(publicProjectMediaDir, { recursive: true });
  await fs.writeFile(path.join(publicProjectMediaDir, baseName), file.buffer);
  return { videoUrl: `/api/v1/website-projects/media/${baseName}`, videoPublicId: '' };
}
