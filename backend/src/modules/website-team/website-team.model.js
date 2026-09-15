import mongoose from 'mongoose';

const teamMemberSchema = new mongoose.Schema({
  source: { type: String, enum: ['manual', 'employee'], default: 'manual', index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  role: { type: String, required: true, trim: true, maxlength: 400 },
  roles: { type: [String], default: [] },
  bio: { type: String, trim: true, maxlength: 1200, default: '' },
  photoUrl: { type: String, trim: true, maxlength: 2000, default: '' },
  location: { type: String, trim: true, maxlength: 160, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  linkedinUrl: { type: String, trim: true, maxlength: 500, default: '' },
  displayOrder: { type: Number, default: 0, index: true },
  isPublished: { type: Boolean, default: true, index: true },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'website_team_members' });

teamMemberSchema.index({ isDeleted: 1, isPublished: 1, displayOrder: 1 });
teamMemberSchema.index(
  { employeeId: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: 'objectId' }, isDeleted: false } }
);

export default mongoose.model('WebsiteTeamMember', teamMemberSchema);
