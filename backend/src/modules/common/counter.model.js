import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  { name: { type: String, unique: true, index: true }, value: { type: Number, default: 0 } },
  { timestamps: true }
);

export default mongoose.model('Counter', counterSchema);
