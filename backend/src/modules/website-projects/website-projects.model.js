import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  client: { type: String, required: true, trim: true, maxlength: 120 },
  summary: { type: String, required: true, trim: true, maxlength: 800 },
  details: { type: [String], default: [] },
  url: { type: String, trim: true, maxlength: 500, default: '' },
  tags: { type: [String], default: [] },
  coverImageUrl: { type: String, trim: true, maxlength: 2000, default: '' },
  videoType: { type: String, enum: ['', 'file', 'youtube', 'vimeo'], default: '' },
  videoUrl: { type: String, trim: true, maxlength: 2000, default: '' },
  videoId: { type: String, trim: true, maxlength: 80, default: '' },
  videoPublicId: { type: String, trim: true, maxlength: 300, default: '' },
  status: { type: String, enum: ['COMPLETED', 'IN_PROGRESS'], default: 'COMPLETED', index: true },
  featured: { type: Boolean, default: true, index: true },
  displayOrder: { type: Number, default: 0, index: true },
  isPublished: { type: Boolean, default: true, index: true },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'website_projects' });

projectSchema.index({ isDeleted: 1, isPublished: 1, displayOrder: 1 });

export default mongoose.model('WebsiteProject', projectSchema);
