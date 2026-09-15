import Counter from '../modules/common/counter.model.js';
import { env } from '../config/env.js';

export function formatRegistrationNumber(type, value, companyCode = env.companyCode) {
  const prefix = type === 'employee' ? 'EMP' : type === 'candidate' ? 'CAN' : 'INT';
  const org = String(companyCode || 'INDO').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'INDO';
  return `${org}-${prefix}-${String(value).padStart(6, '0')}`;
}

export async function nextRegistrationNumber(type) {
  const counter = await Counter.findOneAndUpdate(
    { name: type },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return formatRegistrationNumber(type, counter.value);
}
