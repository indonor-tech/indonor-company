import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'HR_ADMIN', 'HR_MANAGER', 'RECRUITER', 'VIEWER'], default: 'EMPLOYEE' },
    permissions: [{ type: String }],
    tabAccess: { type: mongoose.Schema.Types.Mixed, default: undefined },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    isActive: { type: Boolean, default: true },
    refreshTokenHash: { type: String, select: false },
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: Date,
    lastLoginAt: Date
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = (password) => bcrypt.hash(password, 12);

export default mongoose.model('User', userSchema);
