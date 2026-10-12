import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env.js';
import { storePublicImage } from '../../services/fileStorage.service.js';
import { normalizeStoredAssetUrl } from '../../utils/publicAssetUrl.js';
import { profilePhotoFilePath } from '../common/profilePhoto.js';
import WebsiteTeamMember from './website-team.model.js';

/** When an employee profile photo changes, refresh linked website team public photos. */
export async function syncWebsiteTeamPhotoFromEmployee(employee) {
  if (!employee?._id) return null;
  const members = await WebsiteTeamMember.find({ employeeId: employee._id, isDeleted: false });
  if (!members.length) return null;
  const filePath = await profilePhotoFilePath('Employee', employee._id);
  if (!filePath) return null;
  try {
    const buffer = await fs.readFile(filePath);
    const stored = await storePublicImage({
      originalname: path.basename(filePath) || 'photo.jpg',
      buffer,
      mimetype: 'image/jpeg'
    }, env.activeAppUrl);
    const photoUrl = normalizeStoredAssetUrl(stored.photoUrl || '');
    if (!photoUrl) return null;
    await WebsiteTeamMember.updateMany(
      { employeeId: employee._id, isDeleted: false },
      { $set: { photoUrl } }
    );
    return photoUrl;
  } catch {
    return null;
  }
}
