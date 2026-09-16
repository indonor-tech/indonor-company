import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../src/config/env.js';
import WebsiteTeamMember from '../src/modules/website-team/website-team.model.js';

const photoDir = path.resolve('public-files', 'website-team');
const imageName = /\.(jpe?g|png|webp|gif)$/i;

if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
  throw new Error('Cloudinary env vars are required to publish team photos.');
}
if (!env.mongoUri) {
  throw new Error('MONGODB_URI is required to update stored photo URLs.');
}

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true
});

async function uploadFile(filePath) {
  const options = {
    folder: 'indonor/website-team',
    public_id: path.parse(filePath).name,
    overwrite: true,
    resource_type: 'image'
  };
  try {
    return await cloudinary.uploader.upload(filePath, options);
  } catch (error) {
    const message = [
      error?.message,
      error?.cause?.message,
      error?.error?.message,
      error?.code,
      error?.error?.code
    ].filter(Boolean).join(' ');
    if (!/unable to verify|self[- ]signed|UNABLE_TO_VERIFY|UNABLE_TO_VERIFY_LEAF|certificate/i.test(message)) {
      throw error;
    }
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      console.warn(`TLS retry for ${path.basename(filePath)}`);
      return await cloudinary.uploader.upload(filePath, options);
    } finally {
      if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }
}

const files = (await fs.readdir(photoDir)).filter((name) => imageName.test(name));
if (!files.length) {
  throw new Error(`No team photos found in ${photoDir}`);
}

await mongoose.connect(env.mongoUri, { tlsAllowInvalidCertificates: env.mongoTlsAllowInvalidCertificates });
let updated = 0;
for (const file of files) {
  const uploaded = await uploadFile(path.join(photoDir, file));
  const result = await WebsiteTeamMember.updateMany(
    { isDeleted: false, photoUrl: { $regex: file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } },
    { $set: { photoUrl: uploaded.secure_url } }
  );
  updated += result.modifiedCount;
  console.log(`${file} -> ${uploaded.secure_url} (${result.modifiedCount} member${result.modifiedCount === 1 ? '' : 's'})`);
}
await mongoose.disconnect();
console.log(`Published ${files.length} files. Updated ${updated} team records.`);
