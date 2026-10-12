import mongoose from 'mongoose';
import dns from 'node:dns';
import { env } from './env.js';
import { migrateCrmRoles } from '../database/migrate-roles.js';
import { migrateCrmLeadStatuses } from '../database/migrate-crm-leads.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  if (env.mongoDnsServers.length) dns.setServers(env.mongoDnsServers);
  await mongoose.connect(env.mongoUri, { tlsAllowInvalidCertificates: env.mongoTlsAllowInvalidCertificates });
  await migrateCrmRoles();
  await migrateCrmLeadStatuses().catch((error) => {
    process.stderr.write(`[CRM] Lead status migration skipped: ${error.message}\n`);
  });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
