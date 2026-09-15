import mongoose from 'mongoose';

const catalogSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: String, isActive: { type: Boolean, default: true }, isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

export const Department = mongoose.model('Department', catalogSchema, 'departments');
export const Designation = mongoose.model('Designation', catalogSchema, 'designations');
export const Technology = mongoose.model('Technology', catalogSchema, 'technologies');
export const Track = mongoose.model('Track', catalogSchema, 'tracks');
