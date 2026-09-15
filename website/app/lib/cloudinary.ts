import { v2 as cloudinary } from "cloudinary";
import type { UploadApiResponse } from "cloudinary";

export const INDONOR_TECH_FOLDER = process.env.CLOUDINARY_FOLDER || "indonor-tech";

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export function uploadIndonorTechAsset(buffer: Buffer, publicId: string, resourceType: "image" | "raw" | "video" = "image") {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream({
      folder: INDONOR_TECH_FOLDER,
      public_id: publicId,
      resource_type: resourceType,
      type: "authenticated",
      overwrite: false,
    }, (error, result) => error ? reject(error) : resolve(result as UploadApiResponse));
    upload.end(buffer);
  });
}
