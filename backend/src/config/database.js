import mongoose from 'mongoose';
import dns from 'node:dns';
import { env } from './env.js';
import { migrateCrmRoles } from '../database/migrate-roles.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  if (env.mongoDnsServers.length) dns.setServers(env.mongoDnsServers);
  await mongoose.connect(env.mongoUri, { tlsAllowInvalidCertificates: env.mongoTlsAllowInvalidCertificates });
  await migrateCrmRoles();
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
