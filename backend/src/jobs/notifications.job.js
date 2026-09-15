import cron from 'node-cron';
import Candidate from '../modules/recruitment/candidate.model.js';
import Employee from '../modules/employees/employee.model.js';
import Interview from '../modules/interviews/interview.model.js';
import User from '../modules/auth/user.model.js';
import { Document, Notification } from '../modules/common/support.model.js';

async function createForUsers(type, title, message, entityType, entityId, dueDate, key) {
  const users = await User.find({ isActive: true }, '_id').lean();
  await Notification.bulkWrite(users.map(({ _id }) => ({
    updateOne: { filter: { recipient: _id, dedupeKey: `${key}:${_id}` }, update: { $setOnInsert: { recipient: _id, type, title, message, entityType, entityId, dueDate, dedupeKey: `${key}:${_id}` } }, upsert: true }
  })));
}

export function startNotificationJobs() {
  cron.schedule('0 8 * * *', async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const interviews = await Interview.find({ interviewDate: { $gte: today, $lt: tomorrow }, status: 'SCHEDULED', isDeleted: false }).lean();
    for (const interview of interviews) await createForUsers('INTERVIEW_TODAY', 'Interview today', 'An interview is scheduled for today.', 'Interview', interview._id, today, `interview:${interview._id}:${today.toISOString().slice(0, 10)}`);
    const followups = await Candidate.find({ followUpDate: { $lte: tomorrow }, isDeleted: false, status: { $nin: ['JOINED', 'WITHDRAWN'] } }).lean();
    for (const candidate of followups) await createForUsers('FOLLOW_UP_DUE', 'Candidate follow-up due', `${candidate.firstName} ${candidate.lastName} requires follow-up.`, 'Candidate', candidate._id, candidate.followUpDate, `followup:${candidate._id}:${candidate.followUpDate?.toISOString()}`);
    const employees = await Employee.find({ probationEndDate: { $gte: today, $lte: new Date(today.getTime() + 30 * 86400000) }, isDeleted: false }).lean();
    for (const employee of employees) await createForUsers('PROBATION_ENDING', 'Probation ending soon', `${employee.firstName} ${employee.lastName}'s probation is ending soon.`, 'Employee', employee._id, employee.probationEndDate, `probation:${employee._id}:${employee.probationEndDate?.toISOString()}`);
    const contracts = await Employee.find({ contractEndDate: { $gte: today, $lte: new Date(today.getTime() + 30 * 86400000) }, isDeleted: false }).lean();
    for (const employee of contracts) await createForUsers('CONTRACT_ENDING', 'Contract ending soon', `${employee.firstName} ${employee.lastName}'s contract is ending soon.`, 'Employee', employee._id, employee.contractEndDate, `contract:${employee._id}:${employee.contractEndDate?.toISOString()}`);
    const documents = await Document.find({ expiryDate: { $gte: today, $lte: new Date(today.getTime() + 30 * 86400000) }, isDeleted: false }).lean();
    for (const document of documents) await createForUsers('DOCUMENT_EXPIRY', 'Document expiring soon', `${document.name} requires attention before expiry.`, document.ownerType, document.ownerId, document.expiryDate, `document:${document._id}:${document.expiryDate?.toISOString()}`);
  });
}
